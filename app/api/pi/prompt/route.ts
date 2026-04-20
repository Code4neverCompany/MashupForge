import { prompt as piPrompt, start as piStart, isRunning } from '@/lib/pi-client';
import { getErrorMessage } from '@/lib/errors';
import { coerceMemory, formatMemoryForPrompt } from '@/lib/pipeline-memory';
import { webSearch, type WebSearchResult } from '@/lib/web-search';

/**
 * POST /api/pi/prompt
 *   { message, mode?, systemPrompt?, memory? }
 *
 * Returns text/event-stream:
 *   data: {"text":"<delta>"}\n\n
 *   ...
 *   data: {"error":"..."}\n\n   (on failure)
 *   data: [DONE]\n\n
 *
 * `mode` maps to a mode-specific system directive that is prepended to
 * the user message (pi ignores the RPC `system` field, so per-request
 * customization has to go into the prompt body itself).
 *
 * `systemPrompt` is an additional freeform system instruction from the
 * caller (typically the user's Settings-panel system prompt). It's
 * layered after the mode directive.
 *
 * `memory` is the client's PipelineMemory snapshot (localStorage-backed).
 * It's only consulted for `idea` and `generate` modes — other modes don't
 * benefit from cross-call coherence and we'd rather keep their prompts
 * tight. For `idea`, we additionally fire a best-effort DuckDuckGo search
 * for current trends. Both are injected BEFORE the mode directive so the
 * LLM reads them as standing context.
 */

const TRENDING_SEARCH_QUERY = 'crossover fan art trending 2026';
const TRENDING_RESULT_COUNT = 3;
const TRENDING_MAX_CHARS = 900; // ≈ 150 words
const TRENDING_SNIPPET_CHARS = 220;

function formatTrendingContext(results: WebSearchResult[]): string {
  if (!results || results.length === 0) return '';
  const lines = ['[TRENDING CONTEXT]', `(from a live web search; treat as signal, not ground truth)`];
  for (const r of results) {
    const title = r.title.trim();
    const snippet = r.snippet.trim().slice(0, TRENDING_SNIPPET_CHARS);
    if (!title) continue;
    lines.push(snippet ? `- ${title} — ${snippet}` : `- ${title}`);
  }
  const joined = lines.join('\n');
  return joined.length > TRENDING_MAX_CHARS ? joined.slice(0, TRENDING_MAX_CHARS) + '…' : joined;
}

export type PiMode =
  | 'chat'
  | 'generate'
  | 'idea'
  | 'enhance'
  | 'caption'
  | 'tag'
  | 'negative-prompt'
  | 'collection-info';

const MODE_DIRECTIVES: Record<PiMode, string> = {
  chat:
    'You are an elite creative AI assistant. Be vivid, direct, and spectacular. No hedging.',
  generate:
    'You are a world-class prompt engineer. Every prompt you write must be visually breathtaking. Follow the output format exactly. No preamble.',
  idea:
    'You are a creative genius generating crossover concepts that break the internet. Marvel, DC, Star Wars, Warhammer 40k, anime, games — the wildest, most visually spectacular mashups imaginable. Avoid overused characters. Return ONLY the requested format.',
  enhance:
    'You are an elite prompt enhancer. Transform the input into the most visually stunning, cinematic prompt possible. Maximize drama, detail, and visual impact. Return ONLY the enhanced prompt.',
  caption:
    'You are a viral social-media copywriter. Captions that stop thumbs and drive engagement. Return ONLY valid JSON.',
  tag:
    'You are a hashtag and tag strategist for maximum reach. Return ONLY a JSON array of tag strings.',
  'negative-prompt':
    'Generate the most effective negative prompt to eliminate visual artifacts and low-quality output. Return ONLY the negative prompt text.',
  'collection-info':
    'Generate rich collection metadata. Return ONLY valid JSON.',
};

function directiveFor(mode: unknown): string | null {
  if (typeof mode !== 'string') return null;
  return (MODE_DIRECTIVES as Record<string, string>)[mode] || null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, mode, systemPrompt, memory } = body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ensure pi is running — start it lazily on first prompt.
  try {
    if (!isRunning()) {
      await piStart();
    }
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: getErrorMessage(e) || 'pi not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const directive = directiveFor(mode);

  // Memory + trending enrichment — only for modes that generate net-new
  // concepts. Both are best-effort: a web-search failure, a corrupt
  // memory blob, or an empty memory all degrade to the pre-enrichment
  // prompt, never to an error.
  const enrichBlocks: string[] = [];
  if (mode === 'idea' || mode === 'generate') {
    const memBlock = formatMemoryForPrompt(coerceMemory(memory));
    if (memBlock) enrichBlocks.push(memBlock);
  }
  if (mode === 'idea') {
    try {
      const results = await webSearch(TRENDING_SEARCH_QUERY, TRENDING_RESULT_COUNT);
      const trending = formatTrendingContext(results);
      if (trending) enrichBlocks.push(trending);
    } catch {
      /* silent — trending is optional enrichment */
    }
  }

  const composedSystem =
    [...enrichBlocks, directive, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of piPrompt(message, { systemPrompt: composedSystem })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`)
          );
        }
      } catch (e: unknown) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: getErrorMessage(e) || 'pi stream error' })}\n\n`
          )
        );
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
