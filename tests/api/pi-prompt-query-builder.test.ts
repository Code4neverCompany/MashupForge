import { describe, it, expect } from 'vitest';
import { buildTrendingQuery, dedupeByUrl, pickFromPool } from '@/app/api/pi/prompt/route';
import type { WebSearchResult } from '@/lib/web-search';

// Deterministic RNG → rng close to 1 forces `j = i` each Fisher-Yates
// iteration (since `Math.floor(0.9999 * (i+1)) = i`), so the list stays
// in its original order. That gives us predictable test expectations
// without coupling them to Math.random's output.
const rngStable = () => 0.9999;

describe('buildTrendingQuery', () => {
  it('uses default niches when none supplied', () => {
    const q = buildTrendingQuery(undefined, undefined, rngStable);
    expect(q).toContain('Star Wars x Marvel');
    expect(q).toContain('crossover fan art');
    expect(q).toContain('trending 2026');
  });

  it('honours supplied niches', () => {
    const q = buildTrendingQuery(['Dune', 'Bloodborne', 'Akira'], undefined, rngStable);
    expect(q).toContain('Dune x Bloodborne');
  });

  it('prepends genre hint when provided', () => {
    const q = buildTrendingQuery(['Dune'], ['grimdark'], rngStable);
    expect(q).toContain('Dune');
    expect(q).toContain('grimdark');
    expect(q).toContain('crossover fan art');
  });

  it('drops empty / whitespace niche entries', () => {
    const q = buildTrendingQuery(['', '  ', 'Dune', 'Halo'], undefined, rngStable);
    expect(q).toContain('Dune x Halo');
  });

  it('falls back to defaults when niches array is all-empty', () => {
    const q = buildTrendingQuery(['', '  '], undefined, rngStable);
    expect(q).toContain('Star Wars x Marvel');
  });

  it('picks up to 2 even when only 1 niche supplied', () => {
    const q = buildTrendingQuery(['Dune'], undefined, rngStable);
    expect(q).toContain('Dune');
    expect(q).not.toContain(' x ');
  });

  it('ignores non-array inputs', () => {
    // @ts-expect-error — runtime guard coverage
    const q = buildTrendingQuery('not-an-array', undefined, rngStable);
    expect(q).toContain('Star Wars x Marvel');
  });

  it('collapses multi-space artefacts', () => {
    const q = buildTrendingQuery(['Dune'], [''], rngStable);
    expect(q).not.toMatch(/ {2,}/);
  });

  it('actually diversifies across calls (Math.random)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(buildTrendingQuery(['A', 'B', 'C', 'D', 'E']));
    }
    // With 5 niches → 20 distinct ordered pairs; after 20 draws we should
    // see at least 2 distinct results with overwhelming probability.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('buildTrendingQuery — freshness + genre rotation', () => {
  it('honours a custom freshness suffix', () => {
    const q = buildTrendingQuery(['Dune'], undefined, rngStable, 'viral this month');
    expect(q).toContain('viral this month');
    expect(q).not.toContain('trending 2026');
  });

  it('defaults freshness to "trending 2026" when omitted (back-compat)', () => {
    const q = buildTrendingQuery(['Dune'], undefined, rngStable);
    expect(q).toContain('trending 2026');
  });

  it('rotates genre across calls when multiple genres are configured', () => {
    const genres = ['grimdark', 'cyberpunk', 'cozy'];
    const q0 = buildTrendingQuery(['Dune'], genres, rngStable, 'trending 2026', 0);
    const q1 = buildTrendingQuery(['Dune'], genres, rngStable, 'trending 2026', 1);
    const q2 = buildTrendingQuery(['Dune'], genres, rngStable, 'trending 2026', 2);
    expect(q0).toContain('grimdark');
    expect(q1).toContain('cyberpunk');
    expect(q2).toContain('cozy');
  });

  it('wraps genre index modulo length', () => {
    const genres = ['grimdark', 'cyberpunk'];
    const q4 = buildTrendingQuery(['Dune'], genres, rngStable, 'trending 2026', 4);
    expect(q4).toContain('grimdark'); // 4 % 2 = 0
  });
});

describe('pickFromPool', () => {
  it('returns a stable element for a given (offset, bucket)', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(pickFromPool(pool, 0, 0)).toBe('a');
    expect(pickFromPool(pool, 0, 1)).toBe('b');
    expect(pickFromPool(pool, 1, 0)).toBe('b');
    expect(pickFromPool(pool, 0, 4)).toBe('a'); // wraps
  });

  it('different offsets with same bucket can pick different entries', () => {
    const pool = ['a', 'b', 'c', 'd'];
    const bucket = 7;
    const picks = new Set([
      pickFromPool(pool, 0, bucket),
      pickFromPool(pool, 1, bucket),
      pickFromPool(pool, 2, bucket),
      pickFromPool(pool, 3, bucket),
    ]);
    expect(picks.size).toBe(4);
  });

  it('throws on empty pool', () => {
    expect(() => pickFromPool([], 0, 0)).toThrow();
  });
});

describe('dedupeByUrl', () => {
  const mk = (url: string, title = url): WebSearchResult => ({ url, title, snippet: '' });

  it('preserves first-seen order', () => {
    const out = dedupeByUrl([mk('https://a/'), mk('https://b/'), mk('https://c/')]);
    expect(out.map((r) => r.url)).toEqual(['https://a/', 'https://b/', 'https://c/']);
  });

  it('drops duplicate URLs', () => {
    const out = dedupeByUrl([
      mk('https://a/', 'first'),
      mk('https://b/'),
      mk('https://a/', 'dup-should-drop'),
      mk('https://c/'),
      mk('https://b/', 'dup-should-drop'),
    ]);
    expect(out.map((r) => r.url)).toEqual(['https://a/', 'https://b/', 'https://c/']);
    expect(out[0].title).toBe('first');
  });

  it('drops entries with empty url', () => {
    const out = dedupeByUrl([mk(''), mk('https://a/')]);
    expect(out.map((r) => r.url)).toEqual(['https://a/']);
  });

  it('returns [] for empty input', () => {
    expect(dedupeByUrl([])).toEqual([]);
  });
});
