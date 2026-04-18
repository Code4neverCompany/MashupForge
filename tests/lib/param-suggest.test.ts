// V030-007: suggestParameters is pure and deterministic. Tests cover
// aspect-ratio heuristics, style heuristics, image-size tier, prior-
// success boost, negative-prompt carry-over, and the excluded-model
// + topN guards.

import { describe, it, expect } from 'vitest';
import { suggestParameters } from '@/lib/param-suggest';
import type { GeneratedImage, LeonardoModelConfig } from '@/types/mashup';

function makeModel(id: string, overrides?: Partial<LeonardoModelConfig>): LeonardoModelConfig {
  return {
    id,
    name: id,
    apiModelId: id,
    version: 'v2',
    supportsStyleIds: true,
    supportsQuality: false,
    supportsGuidance: true,
    maxQuantity: 4,
    aspectRatios: [{ label: '1:1', width: 1024, height: 1024 }],
    ...overrides,
  };
}

function makeSaved(
  prompt: string,
  modelId: string,
  overrides?: Partial<GeneratedImage>,
): GeneratedImage {
  return {
    id: `saved-${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    url: 'https://cdn/x.jpg',
    status: 'ready',
    winner: true,
    modelInfo: { provider: 'leonardo', modelId, modelName: modelId },
    ...overrides,
  };
}

const models = [
  makeModel('nano-banana'),
  makeModel('nano-banana-2'),
  makeModel('nano-banana-pro'),
  makeModel('gpt-image-1.5'),
];

const guides: Record<string, string> = {
  'nano-banana': 'concise vivid illustration concept art',
  'nano-banana-2': 'concise vivid illustration concept art',
  'nano-banana-pro': 'photorealistic ultra detailed sharp focus 8k',
  'gpt-image-1.5': 'photorealistic text rendering complex composition',
};

const styles = [
  { name: 'Illustration', uuid: 'u1' },
  { name: '3D Render', uuid: 'u2' },
  { name: 'Pro Color Photography', uuid: 'u3' },
  { name: 'Portrait Cinematic', uuid: 'u4' },
  { name: 'Pro B&W Photography', uuid: 'u5' },
  { name: 'Fashion', uuid: 'u6' },
];

describe('suggestParameters', () => {
  // Keyword-heuristic tests pass modelParams: {} so the per-model spec
  // constraint doesn't override the ratio. The spec-constraint behavior
  // is exercised separately in the "per-model spec constraints" block.
  it('suggests 2:3 portrait ratio for prompts mentioning a character', () => {
    const s = suggestParameters({
      prompt: 'portrait of a cyberpunk hacker',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      modelParams: {},
    });
    expect(s.aspectRatio).toBe('2:3');
    expect(s.reasons.aspectRatio).toContain('portrait');
  });

  it('suggests 16:9 for landscape / panorama prompts', () => {
    const s = suggestParameters({
      prompt: 'sweeping cyberpunk cityscape at night',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      modelParams: {},
    });
    expect(s.aspectRatio).toBe('16:9');
    expect(s.reasons.aspectRatio).toContain('cityscape');
  });

  it('suggests 9:16 for mobile / reel prompts (before portrait rule)', () => {
    const s = suggestParameters({
      prompt: 'a vertical reel of a dancer',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      modelParams: {},
    });
    expect(s.aspectRatio).toBe('9:16');
  });

  it('defaults to 1:1 and explains the fallback', () => {
    const s = suggestParameters({
      prompt: 'an apple on a table',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.aspectRatio).toBe('1:1');
    expect(s.reasons.aspectRatio).toMatch(/default|square/);
  });

  it('maps illustration / anime keywords to Illustration style', () => {
    const s = suggestParameters({
      prompt: 'anime scene with neon colors',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.style).toBe('Illustration');
    expect(s.reasons.style).toBeDefined();
  });

  it('maps monochrome keywords to B&W Photography style', () => {
    const s = suggestParameters({
      prompt: 'black and white portrait of a boxer',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.style).toBe('Pro B&W Photography');
  });

  it('skips style suggestion entirely when no keyword matches', () => {
    const s = suggestParameters({
      prompt: 'a red car',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.style).toBeUndefined();
    expect(s.reasons.style).toBeUndefined();
  });

  it('skips style suggestion when the matched name is not in availableStyles', () => {
    const s = suggestParameters({
      prompt: 'anime scene',
      availableModels: models,
      modelGuides: guides,
      availableStyles: [{ name: '3D Render', uuid: 'u2' }], // no Illustration
      savedImages: [],
    });
    expect(s.style).toBeUndefined();
  });

  it('bumps image-size to 2K when detail keywords are present', () => {
    const s = suggestParameters({
      prompt: 'ultra detailed spaceship 8k',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.imageSize).toBe('2K');
    expect(s.reasons.imageSize).toContain('2K');
  });

  it('keeps image-size at 1K by default', () => {
    const s = suggestParameters({
      prompt: 'a coffee cup',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.imageSize).toBe('1K');
  });

  it('excludes nano-banana from model ranking by default', () => {
    const s = suggestParameters({
      prompt: 'anything goes',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.modelIds).not.toContain('nano-banana');
  });

  it('returns topN models (default 2)', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.modelIds).toHaveLength(2);
  });

  it('honours a custom topN', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      topN: 3,
    });
    expect(s.modelIds).toHaveLength(3);
  });

  it('boosts models that won on similar prior prompts', () => {
    const saved = [
      makeSaved('photorealistic mountains at golden hour', 'gpt-image-1.5'),
      makeSaved('photorealistic mountains at golden hour', 'gpt-image-1.5'),
      makeSaved('photorealistic mountains at golden hour', 'gpt-image-1.5'),
    ];
    const s = suggestParameters({
      prompt: 'photorealistic mountains at sunrise',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: saved,
    });
    expect(s.modelIds[0]).toBe('gpt-image-1.5');
    expect(s.priorMatchCount).toBeGreaterThan(0);
    expect(s.reasons.models).toMatch(/prior winner/);
  });

  it('carries over a negative prompt from the closest prior winner', () => {
    const saved = [
      makeSaved('photorealistic mountains', 'gpt-image-1.5', {
        negativePrompt: 'blurry, low-res, watermark',
      }),
    ];
    const s = suggestParameters({
      prompt: 'photorealistic mountains at dawn',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: saved,
    });
    expect(s.negativePrompt).toBe('blurry, low-res, watermark');
    expect(s.reasons.negativePrompt).toMatch(/prior winner/);
  });

  it('ignores saved images that are not winners / approved / post-ready', () => {
    const saved = [
      makeSaved('photorealistic mountains', 'gpt-image-1.5', {
        winner: false,
        approved: false,
        isPostReady: false,
        negativePrompt: 'ignored',
      }),
    ];
    const s = suggestParameters({
      prompt: 'photorealistic mountains at dawn',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: saved,
    });
    expect(s.negativePrompt).toBeUndefined();
    expect(s.priorMatchCount).toBe(0);
  });

  it('respects an explicit excludedModelIds list', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      excludedModelIds: ['gpt-image-1.5', 'nano-banana'],
    });
    expect(s.modelIds).not.toContain('gpt-image-1.5');
    expect(s.modelIds).not.toContain('nano-banana');
  });

  it('handles an empty prompt without throwing (returns defaults)', () => {
    const s = suggestParameters({
      prompt: '',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.aspectRatio).toBe('1:1');
    expect(s.imageSize).toBe('1K');
    expect(s.style).toBeUndefined();
    expect(s.modelIds.length).toBeGreaterThan(0);
  });

  // V030-007 follow-up: the param-suggest engine must respect the
  // per-model API spec in LEONARDO_MODEL_PARAMS. Image models that only
  // accept 1024x1024 should force a 1:1 suggestion regardless of what
  // the prompt keywords hint at. gpt-image-1.5 should also pick a
  // quality level driven by detail keywords.
  describe('per-model spec constraints', () => {
    const imageOnly1k: any = {
      type: 'image',
      width: 1024,
      height: 1024,
      supported_sizes: ['1024x1024'],
      prompt_enhance: 'OFF',
      supports_image_reference: false,
    };

    it('forces 1:1 when every selected model only supports 1024x1024', () => {
      const s = suggestParameters({
        prompt: 'sweeping cityscape panorama 16:9',
        availableModels: models,
        modelGuides: guides,
        availableStyles: styles,
        savedImages: [],
        modelParams: {
          'nano-banana-pro': imageOnly1k,
          'nano-banana-2': imageOnly1k,
          'gpt-image-1.5': imageOnly1k,
        },
      });
      expect(s.aspectRatio).toBe('1:1');
      expect(s.reasons.aspectRatio).toMatch(/1024/);
    });

    it('suggests HIGH quality when detail keywords are present and a top model supports quality', () => {
      const s = suggestParameters({
        prompt: 'ultra detailed 8k photorealistic spaceship',
        availableModels: models,
        modelGuides: {
          'gpt-image-1.5': 'photorealistic detailed',
          'nano-banana-pro': 'unrelated',
          'nano-banana-2': 'unrelated',
        },
        availableStyles: styles,
        savedImages: [],
        modelParams: {
          'gpt-image-1.5': {
            ...imageOnly1k,
            quality: ['LOW', 'MEDIUM', 'HIGH'] as const,
          } as any,
        },
      });
      expect(s.modelIds).toContain('gpt-image-1.5');
      expect(s.quality).toBe('HIGH');
      expect(s.reasons.quality).toMatch(/HIGH/);
    });

    it('suggests MEDIUM quality by default when gpt-image-1.5 is selected without detail keywords', () => {
      const s = suggestParameters({
        prompt: 'a simple apple on a table',
        availableModels: [makeModel('gpt-image-1.5')],
        modelGuides: { 'gpt-image-1.5': 'photorealistic apple table' },
        availableStyles: styles,
        savedImages: [],
        modelParams: {
          'gpt-image-1.5': {
            ...imageOnly1k,
            quality: ['LOW', 'MEDIUM', 'HIGH'] as const,
          } as any,
        },
      });
      expect(s.quality).toBe('MEDIUM');
    });

    it('omits quality when no selected model supports it', () => {
      const s = suggestParameters({
        prompt: 'anime scene',
        availableModels: [makeModel('nano-banana-2')],
        modelGuides: { 'nano-banana-2': 'illustration anime' },
        availableStyles: styles,
        savedImages: [],
        modelParams: {
          'nano-banana-2': imageOnly1k,
        },
      });
      expect(s.quality).toBeUndefined();
      expect(s.reasons.quality).toBeUndefined();
    });
  });
});
