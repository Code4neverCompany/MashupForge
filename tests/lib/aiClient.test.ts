import { describe, it, expect } from 'vitest';
import { extractJsonArrayFromLLM, extractJsonObjectFromLLM } from '@/lib/aiClient';

describe('extractJsonArrayFromLLM', () => {
  it('parses a clean JSON array', () => {
    expect(extractJsonArrayFromLLM('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('strips ```json fences', () => {
    const raw = '```json\n[{"a":1},{"a":2}]\n```';
    expect(extractJsonArrayFromLLM(raw)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('strips bare ``` fences', () => {
    expect(extractJsonArrayFromLLM('```\n[]\n```')).toEqual([]);
  });

  it('slices commentary before and after the array', () => {
    const raw = 'Sure! Here you go:\n[1, 2]\nLet me know if you need more.';
    expect(extractJsonArrayFromLLM(raw)).toEqual([1, 2]);
  });

  it('returns [] for empty input', () => {
    expect(extractJsonArrayFromLLM('')).toEqual([]);
    expect(extractJsonArrayFromLLM('   ')).toEqual([]);
  });

  it('returns [] when the LLM returns an object instead of an array', () => {
    expect(extractJsonArrayFromLLM('{"foo":"bar"}')).toEqual([]);
  });

  it('returns [] when the LLM returns malformed JSON', () => {
    expect(extractJsonArrayFromLLM('not json at all')).toEqual([]);
  });

  it('handles nested arrays inside the slice', () => {
    expect(extractJsonArrayFromLLM('[[1,2],[3,4]]')).toEqual([[1, 2], [3, 4]]);
  });

  it('preserves object items inside the array as plain unknown values', () => {
    const result = extractJsonArrayFromLLM('[{"prompt":"x","tags":["a"]}]');
    expect(result).toEqual([{ prompt: 'x', tags: ['a'] }]);
  });
});

describe('extractJsonObjectFromLLM', () => {
  it('parses a clean JSON object', () => {
    expect(extractJsonObjectFromLLM('{"a":1,"b":"two"}')).toEqual({ a: 1, b: 'two' });
  });

  it('strips ```json fences', () => {
    expect(extractJsonObjectFromLLM('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('slices commentary before and after the object', () => {
    const raw = 'Here is the result:\n{"score": 42}\nHope that helps.';
    expect(extractJsonObjectFromLLM(raw)).toEqual({ score: 42 });
  });

  it('returns {} for empty input', () => {
    expect(extractJsonObjectFromLLM('')).toEqual({});
  });

  it('returns {} when the LLM returns an array instead of an object', () => {
    expect(extractJsonObjectFromLLM('[1,2,3]')).toEqual({});
  });

  it('returns {} when the LLM returns malformed JSON', () => {
    expect(extractJsonObjectFromLLM('totally broken')).toEqual({});
  });

  it('returns {} when the LLM returns a JSON literal null', () => {
    expect(extractJsonObjectFromLLM('null')).toEqual({});
  });

  it('handles nested objects', () => {
    const raw = '{"outer":{"inner":{"deep":1}}}';
    expect(extractJsonObjectFromLLM(raw)).toEqual({ outer: { inner: { deep: 1 } } });
  });
});
