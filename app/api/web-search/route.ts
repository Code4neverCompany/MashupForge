import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { webSearch, validateQuery, clampCount } from '@/lib/web-search';

export const runtime = 'nodejs';

/**
 * Free web search via DuckDuckGo HTML scrape. Desktop-only — the sidecar
 * binds to 127.0.0.1 inside the Tauri shell, so there's no public attack
 * surface in practice, but we still guard explicitly against serverless
 * deployments so a misconfigured Vercel preview can't turn this into an
 * open DDG proxy.
 *
 * Rate limit: 2 req/s (token bucket, process-wide). DDG will serve a
 * CAPTCHA page if we hammer it, and the single-user desktop app has no
 * legitimate reason to exceed this.
 *
 * Inputs: { query: string (≤200 chars), count?: number (1–20, default 5) }.
 * Output: { results: [{ title, url, snippet }, ...] }.
 * On upstream failure, returns 200 with an empty results array — this
 * endpoint feeds optional AI enrichment, not a user-visible search UI.
 */

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );
}

// Token bucket: capacity 2, refill 2/sec → steady-state 2 req/s with a
// 2-request burst tolerance. State lives in module scope, which in Next's
// nodejs runtime means per-process — fine for the single-user desktop shell.
const BUCKET_CAPACITY = 2;
const REFILL_PER_SEC = 2;
let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();

function takeToken(): boolean {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  if (elapsed > 0) {
    tokens = Math.min(BUCKET_CAPACITY, tokens + elapsed * REFILL_PER_SEC);
    lastRefill = now;
  }
  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  if (isServerless()) {
    return NextResponse.json(
      { error: 'Web search is desktop-only.' },
      { status: 503 },
    );
  }

  if (!takeToken()) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a moment.' },
      { status: 429 },
    );
  }

  let body: { query?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const query = validateQuery(body.query);
  if (!query) {
    return NextResponse.json(
      { error: 'query must be a non-empty string ≤200 chars.' },
      { status: 400 },
    );
  }

  const count = clampCount(typeof body.count === 'number' ? body.count : undefined);

  try {
    const results = await webSearch(query, count);
    return NextResponse.json({ results });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
