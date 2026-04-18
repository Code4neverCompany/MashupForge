// V030-007: suggestParameters is pure and deterministic.
// V030-008: AI variant via dependency-injected aiCall.
// V030-008-per-model: parameters are now produced PER MODEL.

import { describe, it, expect } from 'vitest';
import {
  suggestParameters,
  suggestParametersAI,
  buildAIPromptPayload,
  buildPerModelPromptPayload,
} from '@/lib/param-suggest';
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
  { name: 'Pro Color Photography', uuid: '7c3f932b-a572-47cb-9b9b-f20211e63b5b' },
  { name: 'Portrait Cinematic', uuid: 'u4' },
  { name: 'Pro B&W Photography', uuid: 'u5' },
  { name: 'Fashion', uuid: 'u6' },
];

describe('suggestParameters', () => {
  it('emits a perModel entry for each shortlisted model', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.modelIds.length).toBeGreaterThan(0);
    for (const id of s.modelIds) {
      expect(s.perModel[id]).toBeDefined();
      expect(s.perModel[id].modelId).toBe(id);
    }
  });

  it('per-model image entry carries width/height/imageSize/promptEnhance', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: [makeModel('gpt-image-1.5')],
      modelGuides: { 'gpt-image-1.5': 'photorealistic mountains' },
      availableStyles: styles,
      savedImages: [],
    });
    const entry = s.perModel['gpt-image-1.5'];
    expect(entry.type).toBe('image');
    if (entry.type !== 'image') return;
    expect(entry.width).toBe(1024);
    expect(entry.height).toBe(1024);
    expect(entry.imageSize).toBe('1K');
    expect(entry.promptEnhance).toBe('ON');
    expect(entry.quality).toBe('MEDIUM');
  });

  it('per-model image entry bumps to 2K + HIGH quality on detail keywords', () => {
    const s = suggestParameters({
      prompt: 'ultra detailed 8k photorealistic spaceship',
      availableModels: [makeModel('gpt-image-1.5')],
      modelGuides: { 'gpt-image-1.5': 'photorealistic detailed' },
      availableStyles: styles,
      savedImages: [],
    });
    const entry = s.perModel['gpt-image-1.5'];
    if (entry.type !== 'image') throw new Error('expected image');
    expect(entry.imageSize).toBe('2K');
    expect(entry.quality).toBe('HIGH');
  });

  it('per-model image entry omits quality when model lacks the knob', () => {
    const s = suggestParameters({
      prompt: 'anime scene',
      availableModels: [makeModel('nano-banana-2')],
      modelGuides: { 'nano-banana-2': 'illustration anime' },
      availableStyles: styles,
      savedImages: [],
    });
    const entry = s.perModel['nano-banana-2'];
    if (entry.type !== 'image') throw new Error('expected image');
    expect(entry.quality).toBeUndefined();
  });

  it('per-model image entry only sets style when model supports style_ids', () => {
    const s = suggestParameters({
      prompt: 'anime scene',
      availableModels: [makeModel('nano-banana-2'), makeModel('gpt-image-1.5')],
      modelGuides: {
        'nano-banana-2': 'illustration anime',
        'gpt-image-1.5': 'illustration anime',
      },
      availableStyles: styles,
      savedImages: [],
      topN: 2,
    });
    const nano = s.perModel['nano-banana-2'];
    const gpt = s.perModel['gpt-image-1.5'];
    if (nano.type !== 'image' || gpt.type !== 'image') throw new Error('expected image');
    expect(nano.style).toBe('Illustration'); // nano-banana-2 supports style_ids
    expect(gpt.style).toBeUndefined();        // gpt-image-1.5 does not
  });

  it('clamps aspect ratio to 1:1 when model only supports 1024x1024', () => {
    const s = suggestParameters({
      prompt: 'sweeping cityscape panorama 16:9',
      availableModels: [makeModel('gpt-image-1.5')],
      modelGuides: { 'gpt-image-1.5': 'cityscape panorama' },
      availableStyles: styles,
      savedImages: [],
    });
    const entry = s.perModel['gpt-image-1.5'];
    if (entry.type !== 'image') throw new Error('expected image');
    expect(entry.aspectRatio).toBe('1:1');
  });

  it('excludes nano-banana legacy from the shortlist by default', () => {
    const s = suggestParameters({
      prompt: 'anything',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.modelIds).not.toContain('nano-banana');
    expect(s.perModel['nano-banana']).toBeUndefined();
  });

  it('honors a custom topN', () => {
    const s = suggestParameters({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
      topN: 3,
    });
    expect(s.modelIds.length).toBe(3);
    expect(Object.keys(s.perModel).length).toBe(3);
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
  });

  it('carries over a negative prompt from prior winner into per-model entries', () => {
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
    const entry = s.perModel[s.modelIds[0]];
    if (entry.type !== 'image') throw new Error('expected image');
    expect(entry.negativePrompt).toBe('blurry, low-res, watermark');
  });

  it('handles empty prompts without throwing', () => {
    const s = suggestParameters({
      prompt: '',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(s.modelIds.length).toBeGreaterThan(0);
    expect(Object.keys(s.perModel).length).toBeGreaterThan(0);
  });

  it('produces a video per-model entry when a video model is in the shortlist', () => {
    const s = suggestParameters({
      prompt: 'a vertical reel of a dancer',
      availableModels: [makeModel('kling-3.0', { supportsStyleIds: false })],
      modelGuides: { 'kling-3.0': 'video reel motion dancer' },
      availableStyles: styles,
      savedImages: [],
    });
    const entry = s.perModel['kling-3.0'];
    expect(entry.type).toBe('video');
    if (entry.type !== 'video') return;
    expect(entry.aspectRatio).toBe('9:16');
    expect(entry.width).toBe(1080);
    expect(entry.height).toBe(1920);
    expect(entry.duration).toBeGreaterThan(0);
    expect(entry.mode).toMatch(/RESOLUTION_/);
  });
});

describe('suggestParametersAI', () => {
  const baseInput = {
    prompt: 'photorealistic mountains at dawn',
    availableModels: models,
    modelGuides: guides,
    availableStyles: styles,
    savedImages: [] as GeneratedImage[],
  };

  it('tags overall source as "ai" when every per-model pi call returns valid JSON', async () => {
    const aiCall = async (prompt: string) => {
      // Distinguish per-model prompts by which model id appears.
      if (prompt.includes('gpt-image-1.5')) {
        return JSON.stringify({
          aspectRatio: '1:1',
          imageSize: '1K',
          quality: 'HIGH',
          promptEnhance: 'ON',
          reason: 'gpt photo-real choice',
        });
      }
      if (prompt.includes('nano-banana-pro')) {
        return JSON.stringify({
          aspectRatio: '1:1',
          imageSize: '1K',
          promptEnhance: 'ON',
          style: 'Pro Color Photography',
          reason: 'nano pro photo-real',
        });
      }
      return JSON.stringify({
        aspectRatio: '1:1',
        imageSize: '1K',
        promptEnhance: 'ON',
        reason: 'fallback',
      });
    };

    const s = await suggestParametersAI(baseInput, { aiCall });
    expect(s.source).toBe('ai');
    for (const id of s.modelIds) {
      expect(s.perModel[id].source).toBe('ai');
    }
  });

  it('per-model failure falls back to rules for that model only', async () => {
    const aiCall = async (prompt: string) => {
      if (prompt.includes('gpt-image-1.5')) {
        throw new Error('pi unreachable for gpt');
      }
      return JSON.stringify({
        aspectRatio: '1:1',
        imageSize: '1K',
        promptEnhance: 'ON',
        reason: 'pi answered',
      });
    };
    const s = await suggestParametersAI(baseInput, { aiCall });
    // Mixed → ai+rules at the top level.
    expect(s.source).toBe('ai+rules');
    expect(s.perModel['gpt-image-1.5'].source).toBe('rules');
  });

  it('falls back entirely to rules when every pi call throws', async () => {
    const s = await suggestParametersAI(baseInput, {
      aiCall: async () => {
        throw new Error('pi unreachable');
      },
    });
    expect(s.source).toBe('rules');
  });

  it('translates a UUID accidentally returned by pi back to the canonical name', async () => {
    const aiCall = async (prompt: string) => {
      if (prompt.includes('nano-banana-pro')) {
        return JSON.stringify({
          aspectRatio: '1:1',
          imageSize: '1K',
          promptEnhance: 'ON',
          // pi misbehaving — returning a UUID instead of a name.
          style: '7c3f932b-a572-47cb-9b9b-f20211e63b5b',
          reason: 'oops, returned a UUID',
        });
      }
      return JSON.stringify({
        aspectRatio: '1:1',
        imageSize: '1K',
        promptEnhance: 'ON',
        reason: 'ok',
      });
    };
    const s = await suggestParametersAI(baseInput, { aiCall });
    const nano = s.perModel['nano-banana-pro'];
    if (!nano || nano.type !== 'image') throw new Error('expected nano-banana-pro image entry');
    // UUID was resolved back to the canonical name.
    expect(nano.style).toBe('Pro Color Photography');
  });

  it('drops a style name pi invents that is not in availableStyles', async () => {
    const aiCall = async () =>
      JSON.stringify({
        aspectRatio: '1:1',
        imageSize: '1K',
        promptEnhance: 'ON',
        style: 'Totally Made Up Style',
        reason: 'bad style',
      });
    const s = await suggestParametersAI(baseInput, { aiCall });
    for (const id of s.modelIds) {
      const e = s.perModel[id];
      if (e.type === 'image') {
        expect(e.style).not.toBe('Totally Made Up Style');
      }
    }
  });
});

describe('buildPerModelPromptPayload', () => {
  it('contains the model id, API doc slice, and style-name contract for an image model', () => {
    const body = buildPerModelPromptPayload({
      prompt: 'photorealistic mountains',
      modelId: 'gpt-image-1.5',
      apiName: 'gpt-image-1.5',
      spec: {
        type: 'image',
        width: 1024,
        height: 1024,
        supported_sizes: ['1024x1024'],
        quality: ['LOW', 'MEDIUM', 'HIGH'],
        prompt_enhance: 'ON',
        supports_image_reference: true,
      },
      apiDocSlice: '## Parameters\n- quality (LOW | MEDIUM | HIGH)',
      availableStyles: styles,
      priorWinnersOnThisModel: [],
    });
    expect(body).toContain('gpt-image-1.5');
    expect(body).toContain('quality (LOW | MEDIUM | HIGH)');
    expect(body).toContain('AVAILABLE STYLE NAMES');
    expect(body).toContain('Do NOT return a UUID');
    expect(body).toContain('photorealistic mountains');
  });

  it('omits style guidance for video models', () => {
    const body = buildPerModelPromptPayload({
      prompt: 'a vertical reel of a dancer',
      modelId: 'kling-3.0',
      apiName: 'kling-3.0',
      spec: {
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 5,
        mode: 'RESOLUTION_1080',
        motion_has_audio: true,
        supports_start_frame: true,
        supports_end_frame: false,
      },
      apiDocSlice: '## Parameters\n- duration: 3-15s',
      availableStyles: styles,
      priorWinnersOnThisModel: [],
    });
    expect(body).toContain('kling-3.0');
    expect(body).toContain('STYLES: not applicable to video models');
    expect(body).toContain('duration: 3-15s');
  });
});

describe('buildAIPromptPayload (legacy holistic prompt)', () => {
  it('still includes the model database and eligibility', () => {
    const body = buildAIPromptPayload({
      prompt: 'photorealistic mountains',
      availableModels: models,
      modelGuides: guides,
      availableStyles: styles,
      savedImages: [],
    });
    expect(body).toContain('MODEL DATABASE');
    expect(body).toContain('IN-APP ELIGIBILITY');
    expect(body).toContain('photorealistic mountains');
  });
});
