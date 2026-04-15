import { describe, it, expect } from 'vitest';
import { enhancePromptForModel } from '@/lib/modelOptimizer';

describe('enhancePromptForModel', () => {
  it('returns the base prompt unchanged', async () => {
    const result = await enhancePromptForModel('a knight on a hill', 'nano-banana');
    expect(result.prompt).toBe('a knight on a hill');
  });

  it('strips negativePrompt for gpt-image-1.5 even when caller supplies one', async () => {
    const result = await enhancePromptForModel('x', 'gpt-image-1.5', {
      negativePrompt: 'blurry',
    });
    expect(result.negativePrompt).toBeUndefined();
  });

  it('passes through negativePrompt for models that support it', async () => {
    const result = await enhancePromptForModel('x', 'nano-banana', {
      negativePrompt: 'blurry, low-res',
    });
    expect(result.negativePrompt).toBe('blurry, low-res');
  });

  it('passes through caller-supplied style', async () => {
    const result = await enhancePromptForModel('x', 'nano-banana', { style: 'Cinematic' });
    expect(result.style).toBe('Cinematic');
  });

  it('uses caller aspectRatio when provided', async () => {
    const result = await enhancePromptForModel('x', 'nano-banana', { aspectRatio: '16:9' });
    expect(result.aspectRatio).toBe('16:9');
  });

  it('falls back to model default aspectRatio when caller omits it', async () => {
    const result = await enhancePromptForModel('x', 'nano-banana');
    // First entry in nano-banana aspectRatios is 1:1.
    expect(result.aspectRatio).toBe('1:1');
  });

  it('returns aspectRatio undefined for an unknown model with no caller hint', async () => {
    const result = await enhancePromptForModel('x', 'definitely-not-a-real-model');
    expect(result.aspectRatio).toBeUndefined();
  });

  it('omits style when caller provides none (no synthetic default injected)', async () => {
    const result = await enhancePromptForModel('x', 'nano-banana');
    expect(result.style).toBeUndefined();
  });
});
