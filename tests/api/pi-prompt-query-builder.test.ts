import { describe, it, expect } from 'vitest';
import { buildTrendingQuery, dedupeByUrl } from '@/app/api/pi/prompt/route';
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
