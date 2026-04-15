/**
 * Retry a fetch on transient failure (network error or 5xx status).
 *
 * Used at hot pipeline call sites where a single network blip used to
 * abort the whole run. NOT used for non-idempotent calls like
 * /api/social/post — those would risk double-posting.
 *
 * Defaults: 3 attempts total, exponential backoff 250ms → 500ms → 1000ms.
 * 4xx responses are returned as-is (the server is telling us "don't
 * retry, your input is wrong").
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      if (res.status >= 500 && i < attempts - 1) {
        await sleep(baseDelayMs * 2 ** i);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await sleep(baseDelayMs * 2 ** i);
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error('fetchWithRetry: exhausted attempts');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
