import { describe, it, expect } from 'vitest';
import { buildMmxImagePrompt } from '@/lib/mmx-prompt-builder';

describe('buildMmxImagePrompt', () => {
  it('returns the original prompt unchanged when no spec/style is given', () => {
    const r = buildMmxImagePrompt('a cat on a sofa');
    expect(r.prompt).toBe('a cat on a sofa');
    expect(r.mmxOptions).toEqual({});
    expect(r.appliedHints).toEqual([]);
  });

  it('appends style + aspect ratio hints from a known spec', () => {
    const r = buildMmxImagePrompt('a sky', {
      modelId: 'nano-banana-2',
      styleName: 'Dynamic',
    });
    expect(r.prompt).toMatch(/^a sky\. /);
    expect(r.appliedHints).toContain('style: Dynamic');
    // First aspect ratio in nano-banana-2 spec is "1:1".
    expect(r.mmxOptions.aspectRatio).toBe('1:1');
    expect(r.appliedHints).toContain('aspect ratio: 1:1');
  });

  it('matches style names case-insensitively against the spec', () => {
    const r = buildMmxImagePrompt('p', {
      modelId: 'nano-banana-2',
      styleName: 'dynamic',
    });
    // Returns the canonical-cased name from the spec.
    expect(r.appliedHints).toContain('style: Dynamic');
  });

  it('does not inject a style that is not in the spec', () => {
    const r = buildMmxImagePrompt('p', {
      modelId: 'nano-banana-2',
      styleName: 'NotARealStyle',
    });
    expect(r.appliedHints.find((h) => h.startsWith('style:'))).toBeUndefined();
  });

  it('respects an explicit aspect ratio override', () => {
    const r = buildMmxImagePrompt('p', {
      modelId: 'nano-banana-2',
      aspectRatio: '16:9',
    });
    expect(r.mmxOptions.aspectRatio).toBe('16:9');
    expect(r.appliedHints).toContain('aspect ratio: 16:9');
  });

  it('passes count through to mmxOptions.n', () => {
    const r = buildMmxImagePrompt('p', { count: 3 });
    expect(r.mmxOptions.n).toBe(3);
  });

  it('reads quality + mode + prompt_enhance from gpt-image-1.5 spec', () => {
    const r = buildMmxImagePrompt('a cat', { modelId: 'gpt-image-1.5' });
    expect(r.appliedHints).toContain('quality: HIGH');
    expect(r.appliedHints).toContain('mode: ULTRA');
    expect(r.mmxOptions.promptOptimizer).toBe(true);
  });

  it('does not inject params for unknown modelId', () => {
    const r = buildMmxImagePrompt('a cat', { modelId: 'nonexistent-model' });
    expect(r.appliedHints).toEqual([]);
    expect(r.mmxOptions).toEqual({});
    expect(r.prompt).toBe('a cat');
  });

  it('appends caller-supplied qualityHint after spec-derived hints', () => {
    const r = buildMmxImagePrompt('p', {
      qualityHint: 'cinematic lighting, hyperdetailed',
    });
    expect(r.prompt).toBe('p. cinematic lighting, hyperdetailed');
    expect(r.appliedHints).toContain('cinematic lighting, hyperdetailed');
  });

  it('combines spec + qualityHint in a stable order', () => {
    const r = buildMmxImagePrompt('a cat', {
      modelId: 'gpt-image-1.5',
      styleName: undefined,
      qualityHint: 'warm dramatic',
    });
    // qualityHint comes after the spec-derived hints.
    const hintIdx = r.appliedHints.indexOf('warm dramatic');
    const qualIdx = r.appliedHints.indexOf('quality: HIGH');
    expect(hintIdx).toBeGreaterThan(qualIdx);
  });
});
