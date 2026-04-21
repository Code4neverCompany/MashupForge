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

export type WebSearchProvider = 'brave' | 'ddg';

export interface WebSearchOptions {
  /**
   * Preferred provider. `'brave'` uses Brave Search API when
   * `braveApiKey` is supplied; on any failure (missing key, non-2xx,
   * network error, empty result set) it transparently falls back to
   * DDG. `'ddg'` (or omitted) uses DDG directly.
   */
  provider?: WebSearchProvider;
  /** Brave Search subscription token. Required for `provider: 'brave'`. */
  braveApiKey?: string;
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

interface BraveResultItem {
  title?: unknown;
  url?: unknown;
  description?: unknown;
}

/**
 * Map the Brave Search JSON payload to our uniform result shape. Pure —
 * exported for unit tests. Skips entries missing a title or http(s) URL.
 */
export function parseBraveJson(payload: unknown, count: number): WebSearchResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const web = (payload as Record<string, unknown>).web;
  if (!web || typeof web !== 'object') return [];
  const items = (web as Record<string, unknown>).results;
  if (!Array.isArray(items)) return [];

  const out: WebSearchResult[] = [];
  for (const raw of items as BraveResultItem[]) {
    if (out.length >= count) break;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description : '';
    if (!title || !/^https?:\/\//i.test(url)) continue;
    out.push({
      title: stripTags(title),
      url,
      snippet: stripTags(description),
    });
  }
  return out;
}

/**
 * Brave Search API client. Returns [] on any failure (missing key,
 * non-2xx, network, parse). Never throws.
 */
export async function webSearchBrave(
  query: string,
  count: number = DEFAULT_COUNT,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const q = validateQuery(query);
  if (!q) return [];
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) return [];

  const n = clampCount(count);

  try {
    const url = `${BRAVE_ENDPOINT}?${new URLSearchParams({ q, count: String(n) }).toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': apiKey.trim(),
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
      signal: signal ?? AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    return parseBraveJson(json, n);
  } catch {
    return [];
  }
}

/**
 * Fetch DDG HTML and parse. Returns [] on any failure. Never throws.
 * Exported for callers that want to force the DDG path (e.g. the route
 * that tracks which provider actually served the response).
 */
export async function webSearchDdg(
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

/**
 * Provider-agnostic entry point. If caller requests Brave AND supplies a
 * key, try Brave first — on empty result (failure or genuinely 0 hits)
 * we fall back to DDG so enrichment never silently drops to nothing just
 * because Brave's quota was exhausted. Otherwise use DDG directly.
 *
 * Returns [] only when both providers yield nothing. Never throws.
 */
export async function webSearch(
  query: string,
  count: number = DEFAULT_COUNT,
  signal?: AbortSignal,
  options?: WebSearchOptions,
): Promise<WebSearchResult[]> {
  if (options?.provider === 'brave' && options.braveApiKey) {
    const brave = await webSearchBrave(query, count, options.braveApiKey, signal);
    if (brave.length > 0) return brave;
    return webSearchDdg(query, count, signal);
  }
  return webSearchDdg(query, count, signal);
}

/**
 * Heuristic tag extraction from a batch of search results. Pulls:
 *   - explicit hashtags (`#foo`, `#star-wars`) as-written
 *   - Title-Case franchise / character phrases (`Star Wars`, `Warhammer 40k`,
 *     `Darth Vader`) — 1–3 consecutive Capitalized tokens, optional trailing
 *     lowercase/digit suffix like `40k`
 *
 * Not a content taxonomy — there's no allowlist of "real" franchises. The
 * goal is a light signal the LLM can notice in the trending block, not
 * ground truth. Returns a deduped list in first-seen order, lower-cased
 * for the dedup key so `Star Wars` and `star wars` collapse; the original
 * casing of the first occurrence is preserved in the returned string.
 */
export function extractTrendingTags(results: WebSearchResult[]): string[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  const HASHTAG = /#[A-Za-z][\w-]{1,40}/g;
  const TITLE_PHRASE = /\b[A-Z][a-zA-Z]+(?:\s+(?:of|the|and|&)\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+){0,2}(?:\s+\d+[a-z]*)?\b/g;

  const STOPWORDS = new Set([
    'The', 'This', 'That', 'These', 'Those',
    'Our', 'Your', 'Their', 'His', 'Her',
    'New', 'Latest', 'Best', 'Top', 'Free',
    'Trending', 'Popular',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ]);

  for (const r of results) {
    const haystack = `${r.title ?? ''} ${r.snippet ?? ''}`;

    let m: RegExpExecArray | null;
    HASHTAG.lastIndex = 0;
    while ((m = HASHTAG.exec(haystack)) !== null) push(m[0]);

    TITLE_PHRASE.lastIndex = 0;
    while ((m = TITLE_PHRASE.exec(haystack)) !== null) {
      const phrase = m[0];
      const first = phrase.split(/\s+/)[0];
      if (STOPWORDS.has(first)) continue;
      if (phrase.length < 3) continue;
      push(phrase);
    }
  }

  return out;
}

export const __test__ = {
  MAX_QUERY_LEN,
  DEFAULT_COUNT,
  MIN_COUNT,
  MAX_COUNT,
  BRAVE_ENDPOINT,
};
