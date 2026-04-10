/**
 * Module-level selected AI provider/model. Set by the Settings UI via
 * setClientAIModel so every streamAI call automatically includes the
 * user's preference in the request body. The server routes forward these
 * to the Hermes bridge, which resolves them against pi-ai.
 */
let clientAIProvider: string | undefined;
let clientAIModel: string | undefined;

export function setClientAIModel(provider?: string, model?: string) {
  clientAIProvider = provider || undefined;
  clientAIModel = model || undefined;
}

export function getClientAIModel(): { provider?: string; model?: string } {
  return { provider: clientAIProvider, model: clientAIModel };
}

/**
 * Client-side helper for consuming the SSE streams produced by
 * /api/ai/chat and /api/ai/generate. The server emits:
 *
 *   data: {"text":"<delta>"}\n\n
 *   ...
 *   data: {"error":"..."}\n\n   (optional, on upstream failure)
 *   data: [DONE]\n\n
 *
 * streamAI yields each text delta as it arrives; the caller decides whether
 * to render it progressively or buffer into a final string.
 */
export async function* streamAI(
  url: string,
  body: Record<string, any>,
  signal?: AbortSignal
): AsyncGenerator<string, void, void> {
  // Layer in the user's selected provider/model (if any) without
  // clobbering an explicit per-call override.
  const mergedBody = {
    provider: clientAIProvider,
    model: clientAIModel,
    ...body,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(mergedBody),
    signal,
  });

  if (!res.ok || !res.body) {
    let errMsg = `AI request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error) errMsg = err.error;
    } catch (_) {}
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
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (typeof parsed.text === 'string' && parsed.text.length > 0) {
            yield parsed.text;
          }
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) {
            throw e;
          }
          // Malformed JSON lines are ignored — the server may emit keepalives
          // or partial frames on chunk boundaries.
        }
      }
    }
  }
}

/**
 * Convenience: consume the whole stream and return the concatenated text.
 * Use this for background callers (JSON-parsing hooks) that only need the
 * final result and don't care about progressive rendering.
 */
export async function streamAIToString(
  url: string,
  body: Record<string, any>,
  signal?: AbortSignal
): Promise<string> {
  let out = '';
  for await (const delta of streamAI(url, body, signal)) {
    out += delta;
  }
  return out;
}
