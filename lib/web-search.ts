/**
 * DuckDuckGo HTML-scrape web search. Free, no API key.
 *
 * Scope: enrichment for AI text (captions, ideas, trending). Not a general
 * search backend. The route that exposes this (`/api/web-search`) is
 * desktop-only and rate-limited; see that route for the network guard.
 *
 * Fragility: DDG's HTML layout can change without notice. `parseDdgHtml`
 * targets the current `html.duckduckgo.com/html/` markup (result__a /
 * result__snippet classes). If the parser stops matching, it returns an
 * empty array rather than throwing — callers treat empty as "no results".
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const DDG_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_QUERY_LEN = 200;
const DEFAULT_COUNT = 5;
const MIN_COUNT = 1;
const MAX_COUNT = 20;

export function clampCount(count: number | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) return DEFAULT_COUNT;
  const n = Math.floor(count);
  if (n < MIN_COUNT) return MIN_COUNT;
  if (n > MAX_COUNT) return MAX_COUNT;
  return n;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * DDG wraps outbound links in a redirector: `//duckduckgo.com/l/?uddg=<encoded>`.
 * Unwrap to the real target URL. If the href is already absolute or we can't
 * find a `uddg` param, return it unchanged (still usable for the caller).
 */
function unwrapDdgRedirect(href: string): string {
  if (!href) return href;
  let decoded = href.trim();
  if (decoded.startsWith('//')) decoded = 'https:' + decoded;
  try {
    const u = new URL(decoded);
    if (u.hostname.endsWith('duckduckgo.com') && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return u.toString();
  } catch {
    return href;
  }
}

/**
 * Parse DDG HTML into typed results. Pure function — no network, no throws.
 * Exported for unit testing.
 */
export function parseDdgHtml(html: string, count: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const resultBlock = /<div class="result\s+results_links[^"]*"[\s\S]*?(?=<div class="result\s+results_links|<div id="ads"|$)/g;

  let match: RegExpExecArray | null;
  while ((match = resultBlock.exec(html)) !== null) {
    if (results.length >= count) break;
    const block = match[0];

    const linkMatch = /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!linkMatch) continue;

    const rawHref = decodeEntities(linkMatch[1]);
    const url = unwrapDdgRedirect(rawHref);
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const title = decodeEntities(stripTags(linkMatch[2]));
    if (!title) continue;

    let snippet = '';
    const snippetMatch =
      /<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block) ||
      /<td[^>]*class="[^"]*\bresult-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(block);
    if (snippetMatch) {
      snippet = decodeEntities(stripTags(snippetMatch[1]));
    }

    results.push({ title, url, snippet });
  }

  return results;
}

export function validateQuery(query: unknown): string | null {
  if (typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_QUERY_LEN) return null;
  return trimmed;
}

/**
 * Fetch search results from DDG. Returns [] on any failure (network error,
 * non-2xx, parse failure, invalid input). Never throws — callers rely on
 * this for optional enrichment and shouldn't need to wrap in try/catch.
 */
export async function webSearch(
  query: string,
  count: number = DEFAULT_COUNT,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const q = validateQuery(query);
  if (!q) return [];

  const n = clampCount(count);

  try {
    const body = new URLSearchParams({ q, kl: 'us-en' }).toString();
    const res = await fetch(DDG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DDG_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body,
      signal: signal ?? AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseDdgHtml(html, n);
  } catch {
    return [];
  }
}

export const __test__ = {
  MAX_QUERY_LEN,
  DEFAULT_COUNT,
  MIN_COUNT,
  MAX_COUNT,
};
