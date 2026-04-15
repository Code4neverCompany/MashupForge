/**
 * Client-side helpers for talking to /api/pi/prompt. The server returns
 * text/event-stream:
 *
 *   data: {"text":"<delta>"}\n\n
 *   ...
 *   data: {"error":"..."}\n\n   (on failure)
 *   data: [DONE]\n\n
 *
 * All AI text in the studio flows through pi.dev via /api/pi/prompt. The
 * legacy /api/ai/* routes were removed — provider / model selection now
 * lives inside pi itself and is configured via `pi config` in the terminal.
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

export interface StreamAIOptions {
  mode?: PiMode;
  systemPrompt?: string;
  signal?: AbortSignal;
}

/**
 * Stream text deltas from /api/pi/prompt. Yields each token/chunk as it
 * arrives so callers can render progressively. The generator ends when
 * the server emits `[DONE]`.
 *
 * The per-request `systemPrompt` (e.g. `settings.agentPrompt`) is
 * forwarded verbatim and layered on top of the mode directive on the
 * server side. There is no longer a separate "global" client-side
 * system prompt — callers pass the single `agentPrompt` when they need
 * one.
 */
export async function* streamAI(
  message: string,
  options?: StreamAIOptions
): AsyncGenerator<string, void, void> {
  const res = await fetch('/api/pi/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      message,
      mode: options?.mode,
      systemPrompt: options?.systemPrompt,
    }),
    signal: options?.signal,
  });

  if (!res.ok || !res.body) {
    let errMsg = `pi request failed (${res.status})`;
    try {
      const err = await res.json() as Record<string, unknown>;
      if (typeof err?.error === 'string') errMsg = err.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed.error) throw new Error(String(parsed.error));
          if (typeof parsed.text === 'string' && parsed.text.length > 0) {
            yield parsed.text;
          }
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) {
            throw e;
          }
          // Ignore malformed lines — keepalives or partial frames.
        }
      }
    }
  }
}

/**
 * Convenience: consume the whole stream and return the concatenated text.
 * Use this for callers that parse JSON output and don't need progressive
 * rendering.
 */
export async function streamAIToString(
  message: string,
  options?: StreamAIOptions
): Promise<string> {
  let out = '';
  for await (const delta of streamAI(message, options)) {
    out += delta;
  }
  return out;
}

/**
 * Robust JSON extraction from an LLM response.
 *
 * Reasoning models (GLM-5.1 et al.) frequently wrap their output in
 * markdown code fences AND append explanatory commentary after the
 * closing bracket. JSON.parse rejects anything after the top-level
 * value, so this helper strips fences, then slices from the first
 * `[` to the last `]` (or `{` / `}` for objects) before parsing.
 * Falls back to an empty array / object on empty input.
 */
function parseJsonFromLLM(raw: string, kind: 'array' | 'object'): unknown {
  let text = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  if (!text) return kind === 'array' ? [] : {};
  const open = kind === 'array' ? '[' : '{';
  const close = kind === 'array' ? ']' : '}';
  const first = text.indexOf(open);
  const last = text.lastIndexOf(close);
  if (first !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  return JSON.parse(text);
}

/**
 * Typed entry points for LLM JSON parsing. Each helper enforces the
 * top-level shape at runtime — callers get an empty array / object
 * (not a cast lie) if the LLM returns the wrong kind.
 */
export function extractJsonArrayFromLLM(raw: string): unknown[] {
  const parsed = parseJsonFromLLM(raw, 'array');
  return Array.isArray(parsed) ? parsed : [];
}

export function extractJsonObjectFromLLM(raw: string): Record<string, unknown> {
  const parsed = parseJsonFromLLM(raw, 'object');
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
