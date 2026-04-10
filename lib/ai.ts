/**
 * Shared AI client for the Mashup Studio.
 *
 * Primary path: Hermes AI Bridge at http://127.0.0.1:8090. The bridge owns
 * provider selection (Ollama fast-path ~3s, ZAI smart-path ~15-30s),
 * prompt enrichment, caching, and cross-provider fallback.
 *
 * Fallback path: direct ZAI /chat/completions. If the bridge is
 * unreachable (connection refused, timeout, 5xx), we fall through to
 * calling ZAI directly so the app keeps working in degraded mode. The
 * fallback still uses SSE for true token-by-token streaming.
 *
 * The bridge itself is non-streaming, so callAIStream's "happy path"
 * emits the full bridge response as a single ReadableStream chunk.
 * Route handlers wrap it with toSSEResponse to satisfy the browser-side
 * SSE contract (data: {text} events + [DONE] sentinel).
 */

import { NextResponse } from 'next/server';

// ── Config ───────────────────────────────────────────────────────────
const BRIDGE_URL = process.env.HERMES_BRIDGE_URL || 'http://127.0.0.1:8090';

// ZAI direct-call fallback (used when the bridge is unreachable)
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';
const AI_MODEL = process.env.AI_MODEL || 'glm-5.1';

// ── Types ────────────────────────────────────────────────────────────
export type AIMode = 'chat' | 'enhance' | 'generate' | 'idea';
export type AIProvider = 'ollama' | 'zai';

export interface CallAIOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  /** Auto-routes to /chat (ollama) or /generate (zai) on the bridge. */
  mode?: AIMode;
  /** Force a specific provider, overriding the mode-based auto-route. */
  provider?: AIProvider;
  /** Ignored by the bridge; only consumed by the direct-ZAI fallback. */
  temperature?: number;
  signal?: AbortSignal;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Helpers ──────────────────────────────────────────────────────────
function endpointFor(mode: AIMode | undefined): '/chat' | '/generate' {
  if (mode === 'chat' || mode === 'enhance') return '/chat';
  return '/generate';
}

/**
 * Classify an error from the bridge path as "bridge is down, try ZAI
 * directly" (recoverable) vs "bridge is up but the request was rejected"
 * (not recoverable — surface it).
 */
function isBridgeDownError(err: any, status?: number): boolean {
  if (status !== undefined && status >= 500) return true;
  const msg = String(err?.message || err?.cause?.message || err || '').toLowerCase();
  return /econnrefused|fetch failed|network|unreachable|timeout|enetunreach|socket hang up/.test(
    msg
  );
}

// ── Bridge calls ─────────────────────────────────────────────────────
async function callBridge(options: CallAIOptions): Promise<string> {
  const url = `${BRIDGE_URL}${endpointFor(options.mode)}`;

  const body = JSON.stringify({
    prompt: options.userPrompt,
    systemPrompt: options.systemPrompt,
    maxTokens: options.maxTokens,
    mode: options.mode,
    provider: options.provider,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: options.signal,
    });
  } catch (err: any) {
    throw new Error(
      `Hermes bridge unreachable at ${BRIDGE_URL}: ${err?.message || err}`
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const e: any = new Error(
      `Hermes bridge error (${res.status}): ${errText.slice(0, 300)}`
    );
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const text = typeof data.text === 'string' ? data.text : '';

  // The bridge has no retry for GLM-5.1's "reasoning consumed all tokens"
  // edge case — it just returns { text: "" }. Treat empty bridge responses
  // as a recoverable failure so the caller falls through to the direct-ZAI
  // path, which does have the reasoning_content retry.
  if (text.length === 0) {
    const e: any = new Error('Hermes bridge returned empty text');
    e.status = 502;
    throw e;
  }
  return text;
}

// ── Direct ZAI fallback (non-streaming) ──────────────────────────────
async function callZAIDirect(options: CallAIOptions): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Hermes bridge unreachable and ZAI_API_KEY not configured for fallback.'
    );
  }

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.userPrompt });

  const body: any = {
    model: AI_MODEL,
    messages,
    max_tokens: options.maxTokens ?? 1000,
    temperature: options.temperature ?? 0.3,
  };

  const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ZAI fallback error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  let content = message?.content || '';
  const reasoning = message?.reasoning_content || '';

  // GLM-5.1's reasoning phase can consume the whole budget and leave
  // content empty. Retry once with a bigger budget before giving up.
  if (!content && reasoning) {
    body.max_tokens = options.maxTokens ? options.maxTokens * 2 : 1500;
    const retryRes = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (retryRes.ok) {
      const retryData = await retryRes.json();
      content = retryData.choices?.[0]?.message?.content || '';
    }
  }

  if (!content) throw new Error('ZAI fallback returned empty content.');
  return content;
}

// ── Direct ZAI fallback (streaming) ──────────────────────────────────
function callZAIDirectStream(options: CallAIOptions): ReadableStream<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return new ReadableStream<string>({
      start(controller) {
        controller.error(
          new Error(
            'Hermes bridge unreachable and ZAI_API_KEY not configured for fallback.'
          )
        );
      },
    });
  }

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.userPrompt });

  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: options.maxTokens ?? 1000,
    temperature: options.temperature ?? 0.3,
    stream: true,
  };

  return new ReadableStream<string>({
    async start(controller) {
      let upstream: Response;
      try {
        upstream = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (err) {
        controller.error(err);
        return;
      }

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        controller.error(
          new Error(`ZAI fallback error (${upstream.status}): ${errText}`)
        );
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIndex: number;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            for (const line of rawEvent.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              if (data === '[DONE]') {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  controller.enqueue(delta);
                }
              } catch (_) {
                // Ignore malformed lines — some providers emit keepalives.
              }
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ── Public API ───────────────────────────────────────────────────────
/**
 * Call the AI provider via the Hermes bridge (primary) with direct-ZAI
 * fallback. Returns the full text response.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
  try {
    return await callBridge(options);
  } catch (err: any) {
    if (isBridgeDownError(err, err?.status)) {
      console.warn('[ai] Hermes bridge unreachable — falling back to direct ZAI');
      return callZAIDirect(options);
    }
    throw err;
  }
}

/**
 * Streaming variant. Tries the bridge first (single-chunk emission since
 * the bridge is non-streaming). If the bridge is unreachable, falls
 * through to direct ZAI streaming for true token-by-token output.
 */
export function callAIStream(options: CallAIOptions): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const text = await callBridge(options);
        if (text.length > 0) controller.enqueue(text);
        controller.close();
        return;
      } catch (bridgeErr: any) {
        if (!isBridgeDownError(bridgeErr, bridgeErr?.status)) {
          controller.error(bridgeErr);
          return;
        }
        console.warn(
          '[ai] Hermes bridge unreachable — streaming directly from ZAI'
        );
      }

      // Fallback path: pipe direct-ZAI SSE tokens into this controller.
      const fallback = callZAIDirectStream(options);
      const reader = fallback.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Wrap a ReadableStream<string> (content deltas from callAIStream) as an
 * SSE-encoded ReadableStream<Uint8Array> suitable for returning from a
 * Next.js route handler. Emits `data: {"text":"<delta>"}\n\n` per token
 * and a final `data: [DONE]\n\n` sentinel. Errors are surfaced as
 * `data: {"error":"..."}\n\n` before [DONE] so clients don't hang.
 */
export function toSSEResponse(textStream: ReadableStream<string>): Response {
  const encoder = new TextEncoder();
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = textStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`)
          );
        }
      } catch (err: any) {
        const msg = err?.message || 'stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Parse JSON from AI response, handling markdown code blocks.
 */
export function parseJSONResponse(text: string): any {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Standard error response helper
 */
export function errorResponse(error: any) {
  console.error('AI API error:', error);
  return NextResponse.json(
    { error: error.message || 'Internal Server Error' },
    { status: 500 }
  );
}
