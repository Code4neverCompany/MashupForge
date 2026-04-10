/**
 * Shared AI client for the Mashup Studio.
 *
 * Primary path: Hermes AI Bridge v4 at http://127.0.0.1:8090, which wraps
 * @mariozechner/pi-ai and exposes an SSE-streaming surface:
 *   POST /chat      data: {"text":"<delta>"}\n\n ... data: [DONE]\n\n
 *   POST /generate  (same format)
 *
 * The bridge owns provider selection, model metadata, and the actual
 * upstream call (zai, google, anthropic, groq, openai, ...). This module
 * just forwards prompts + the caller's preferred provider/model and
 * converts the bridge's SSE back into a ReadableStream<string> of deltas.
 *
 * Fallback: if the bridge is unreachable (connection refused, 5xx,
 * timeout), both callAI and callAIStream fall through to calling ZAI
 * directly with true SSE streaming, so the app keeps working in degraded
 * mode.
 */

import { NextResponse } from 'next/server';

// ── Config ───────────────────────────────────────────────────────────
const BRIDGE_URL = process.env.HERMES_BRIDGE_URL || 'http://127.0.0.1:8090';

// ZAI direct-call fallback (used only when the bridge is unreachable)
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';
const AI_MODEL = process.env.AI_MODEL || 'glm-5.1';

// ── Types ────────────────────────────────────────────────────────────
export type AIMode = 'chat' | 'enhance' | 'generate' | 'idea';

export interface CallAIOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  /** Hermes mode — shapes the default system prompt on the bridge side. */
  mode?: AIMode;
  /** Override the bridge's default provider (e.g. 'zai', 'google', 'groq'). */
  provider?: string;
  /** Override the bridge's default model id for the chosen provider. */
  model?: string;
  /** Ignored by the bridge; only consumed by the direct-ZAI fallback. */
  temperature?: number;
  signal?: AbortSignal;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Helpers ──────────────────────────────────────────────────────────
function bridgeEndpointFor(mode: AIMode | undefined): '/chat' | '/generate' {
  if (mode === 'chat' || mode === 'enhance') return '/chat';
  return '/generate';
}

function isBridgeDownError(err: any, status?: number): boolean {
  if (status !== undefined && status >= 500) return true;
  const msg = String(err?.message || err?.cause?.message || err || '').toLowerCase();
  return /econnrefused|fetch failed|network|unreachable|timeout|enetunreach|socket hang up/.test(
    msg
  );
}

// ── Bridge streaming call ────────────────────────────────────────────
/**
 * Open an SSE connection to the bridge and return a ReadableStream of
 * content deltas. Errors the stream if the bridge is unreachable or
 * returns a non-2xx status.
 */
function callBridgeStream(options: CallAIOptions): ReadableStream<string> {
  const url = `${BRIDGE_URL}${bridgeEndpointFor(options.mode)}`;

  const body = JSON.stringify({
    prompt: options.userPrompt,
    systemPrompt: options.systemPrompt,
    maxTokens: options.maxTokens,
    mode: options.mode,
    provider: options.provider,
    model: options.model,
  });

  return new ReadableStream<string>({
    async start(controller) {
      let upstream: Response;
      try {
        upstream = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body,
          signal: options.signal,
        });
      } catch (err: any) {
        const wrapped: any = new Error(
          `Hermes bridge unreachable at ${BRIDGE_URL}: ${err?.message || err}`
        );
        wrapped.bridgeDown = true;
        controller.error(wrapped);
        return;
      }

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        const wrapped: any = new Error(
          `Hermes bridge error (${upstream.status}): ${errText.slice(0, 300)}`
        );
        wrapped.status = upstream.status;
        controller.error(wrapped);
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
                if (parsed.error) throw new Error(parsed.error);
                if (typeof parsed.text === 'string' && parsed.text.length > 0) {
                  controller.enqueue(parsed.text);
                }
              } catch (err: any) {
                // A JSON.parse error on a malformed line is ignored
                // (providers occasionally emit keepalives). A real error
                // payload that we threw above has a Message type.
                if (err instanceof Error && !err.message.startsWith('Unexpected')) {
                  controller.error(err);
                  return;
                }
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

  // GLM-5.1's reasoning phase can consume the whole budget and leave content
  // empty. Retry once with a bigger budget before giving up.
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
                // Ignore malformed keepalive lines.
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
 * Streaming call: goes through the Hermes bridge first (true token-by-token
 * via pi-ai's streamSimple), falls through to direct ZAI streaming if the
 * bridge is unreachable. Returns a ReadableStream of text deltas.
 */
export function callAIStream(options: CallAIOptions): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      const bridgeStream = callBridgeStream(options);
      const bridgeReader = bridgeStream.getReader();
      let sawAny = false;

      try {
        while (true) {
          const { done, value } = await bridgeReader.read();
          if (done) break;
          if (value && value.length > 0) {
            sawAny = true;
            controller.enqueue(value);
          }
        }
        controller.close();
        return;
      } catch (bridgeErr: any) {
        // If we already emitted deltas before the error, surface it — we
        // can't safely restart mid-stream. Only fall back when the bridge
        // was never reachable in the first place.
        if (sawAny || !(bridgeErr?.bridgeDown || isBridgeDownError(bridgeErr, bridgeErr?.status))) {
          controller.error(bridgeErr);
          return;
        }
        console.warn('[ai] Hermes bridge unreachable — streaming direct from ZAI');
      }

      const fallback = callZAIDirectStream(options);
      const fallbackReader = fallback.getReader();
      try {
        while (true) {
          const { done, value } = await fallbackReader.read();
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
 * Non-streaming convenience: awaits the full bridge stream and returns the
 * concatenated text. Falls through to direct-ZAI on bridge-down.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
  try {
    const stream = callBridgeStream(options);
    const reader = stream.getReader();
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) out += value;
    }
    if (!out) throw new Error('Hermes bridge returned empty text');
    return out;
  } catch (err: any) {
    if (err?.bridgeDown || isBridgeDownError(err, err?.status)) {
      console.warn('[ai] Hermes bridge unreachable — falling back to direct ZAI');
      return callZAIDirect(options);
    }
    throw err;
  }
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
