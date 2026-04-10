import { prompt as piPrompt, start as piStart, isRunning } from '@/lib/pi-client';

/**
 * POST /api/pi/prompt
 *   { message, mode?, systemPrompt? }
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
 */

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
    'You are a helpful chat assistant for the Multiverse Mashup Studio. Be concise, vivid, and creative.',
  generate:
    'You are a content generator. Follow the requested output format exactly. No preamble, no commentary.',
  idea:
    'Generate unique crossover concepts (Star Wars, Marvel, DC, Warhammer 40k). Avoid overused characters. Return ONLY the requested format.',
  enhance:
    'Enhance the given prompt for cinematic visual impact and specificity. Return ONLY the enhanced prompt as a single string.',
  caption:
    'You are a social-media caption writer. Return ONLY a valid JSON object matching the requested schema.',
  tag:
    'You are a tag generator. Return ONLY a JSON array of short tag strings.',
  'negative-prompt':
    'You are a negative-prompt generator for AI image generation. Return ONLY the negative prompt text, nothing else.',
  'collection-info':
    'You are a collection-info generator. Return ONLY a valid JSON object matching the requested schema.',
};

function directiveFor(mode: unknown): string | null {
  if (typeof mode !== 'string') return null;
  return (MODE_DIRECTIVES as Record<string, string>)[mode] || null;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, mode, systemPrompt } = body || {};
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
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'pi not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const directive = directiveFor(mode);
  const composedSystem = [directive, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of piPrompt(message, { systemPrompt: composedSystem })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`)
          );
        }
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err?.message || 'pi stream error' })}\n\n`
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
