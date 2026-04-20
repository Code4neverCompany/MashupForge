import { describe, it, expect } from 'vitest';
import { parseDdgHtml, validateQuery, clampCount } from '@/lib/web-search';

const SAMPLE_HTML = `
<html><body>
<div class="result results_links results_links_deep web-result">
  <div class="links_main">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=abc">Example <b>One</b></a>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">First snippet &amp; more</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main">
    <a class="result__a" href="https://direct.example.org/b">Direct Link</a>
    <a class="result__snippet">Second snippet text</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.net%2Fc">Third &#x27;quoted&#x27;</a>
  </div>
</div>
</body></html>
`;

describe('parseDdgHtml', () => {
  it('extracts title, url, snippet from DDG redirector wrapper', () => {
    const results = parseDdgHtml(SAMPLE_HTML, 5);
    expect(results.length).toBe(3);
    expect(results[0]).toEqual({
      title: 'Example One',
      url: 'https://example.com/a',
      snippet: 'First snippet & more',
    });
  });

  it('passes through already-absolute hrefs unchanged', () => {
    const results = parseDdgHtml(SAMPLE_HTML, 5);
    expect(results[1].url).toBe('https://direct.example.org/b');
    expect(results[1].title).toBe('Direct Link');
  });

  it('decodes html entities in titles', () => {
    const results = parseDdgHtml(SAMPLE_HTML, 5);
    expect(results[2].title).toBe("Third 'quoted'");
  });

  it('tolerates missing snippet', () => {
    const results = parseDdgHtml(SAMPLE_HTML, 5);
    expect(results[2].snippet).toBe('');
  });

  it('honours count cap', () => {
    const results = parseDdgHtml(SAMPLE_HTML, 2);
    expect(results.length).toBe(2);
  });

  it('returns [] for unrelated html', () => {
    expect(parseDdgHtml('<html><body>nothing here</body></html>', 5)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(parseDdgHtml('', 5)).toEqual([]);
  });

  it('rejects non-http(s) redirect targets', () => {
    const bad = `
      <div class="result results_links results_links_deep web-result">
        <a class="result__a" href="javascript:alert(1)">Bad</a>
      </div>`;
    expect(parseDdgHtml(bad, 5)).toEqual([]);
  });
});

describe('validateQuery', () => {
  it('accepts a normal string', () => {
    expect(validateQuery('star wars warhammer')).toBe('star wars warhammer');
  });

  it('trims whitespace', () => {
    expect(validateQuery('  hello  ')).toBe('hello');
  });

  it('rejects non-string', () => {
    expect(validateQuery(42)).toBe(null);
    expect(validateQuery(null)).toBe(null);
    expect(validateQuery(undefined)).toBe(null);
    expect(validateQuery({ q: 'x' })).toBe(null);
  });

  it('rejects empty / whitespace-only', () => {
    expect(validateQuery('')).toBe(null);
    expect(validateQuery('    ')).toBe(null);
  });

  it('rejects > 200 chars', () => {
    expect(validateQuery('a'.repeat(201))).toBe(null);
    expect(validateQuery('a'.repeat(200))).toBe('a'.repeat(200));
  });
});

describe('clampCount', () => {
  it('defaults to 5 for undefined / non-finite', () => {
    expect(clampCount(undefined)).toBe(5);
    expect(clampCount(NaN)).toBe(5);
    expect(clampCount(Infinity)).toBe(5);
  });

  it('clamps to 1..20', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-3)).toBe(1);
    expect(clampCount(21)).toBe(20);
    expect(clampCount(1000)).toBe(20);
  });

  it('floors fractional counts', () => {
    expect(clampCount(7.8)).toBe(7);
  });

  it('passes valid counts through', () => {
    expect(clampCount(10)).toBe(10);
  });
});
