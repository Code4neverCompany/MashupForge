// V040-HOTFIX-007: approval-time finalization helpers.

import { describe, it, expect, vi } from 'vitest';
import {
  collectFinalizeTargets,
  finalizePipelineImage,
} from '@/lib/pipeline-finalize';
import type { GeneratedImage, ScheduledPost, WatermarkSettings } from '@/types/mashup';

function mkImg(overrides: Partial<GeneratedImage>): GeneratedImage {
  return {
    id: 'img',
    prompt: 'x',
    url: 'https://cdn.example.com/x.jpg',
    ...overrides,
  };
}

describe('collectFinalizeTargets', () => {
  it('returns only pipelinePending images that match the post.imageId', () => {
    const images: GeneratedImage[] = [
      mkImg({ id: 'a', pipelinePending: true }),
      mkImg({ id: 'b', pipelinePending: true }),
      mkImg({ id: 'c' }),
    ];
    const post: Pick<ScheduledPost, 'imageId' | 'carouselGroupId'> = { imageId: 'a' };
    const out = collectFinalizeTargets(post, images);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('returns all pipelinePending images in the same carousel group', () => {
    const images: GeneratedImage[] = [
      mkImg({ id: 'a', pipelinePending: true, carouselGroupId: 'g1' }),
      mkImg({ id: 'b', pipelinePending: true, carouselGroupId: 'g1' }),
      mkImg({ id: 'c', pipelinePending: true, carouselGroupId: 'g2' }),
      mkImg({ id: 'd', carouselGroupId: 'g1' }), // already finalized
    ];
    const post = { imageId: 'a', carouselGroupId: 'g1' };
    const out = collectFinalizeTargets(post, images);
    expect(new Set(out.map((i) => i.id))).toEqual(new Set(['a', 'b']));
  });

  it('skips images whose pipelinePending is false/undefined', () => {
    const images: GeneratedImage[] = [
      mkImg({ id: 'a', pipelinePending: false }),
      mkImg({ id: 'b' }),
    ];
    const post = { imageId: 'a' };
    expect(collectFinalizeTargets(post, images)).toEqual([]);
  });
});

describe('finalizePipelineImage', () => {
  const enabledWm: WatermarkSettings = {
    enabled: true,
    image: null,
    position: 'bottom-right',
    opacity: 0.8,
    scale: 0.05,
  };

  it('clears pipelinePending and applies watermark when enabled', async () => {
    const wm = vi.fn().mockResolvedValue('https://cdn.example.com/wm.png');
    const img = mkImg({
      id: 'a',
      pipelinePending: true,
      url: 'https://cdn.example.com/raw.jpg',
    });
    const out = await finalizePipelineImage(img, enabledWm, 'chan', wm);
    expect(wm).toHaveBeenCalledWith('https://cdn.example.com/raw.jpg', enabledWm, 'chan');
    expect(out.pipelinePending).toBe(false);
    expect(out.url).toBe('https://cdn.example.com/wm.png');
  });

  it('skips watermark but still clears pipelinePending when watermark disabled', async () => {
    const wm = vi.fn();
    const img = mkImg({ id: 'a', pipelinePending: true });
    const out = await finalizePipelineImage(img, { ...enabledWm, enabled: false }, 'chan', wm);
    expect(wm).not.toHaveBeenCalled();
    expect(out.pipelinePending).toBe(false);
    expect(out.url).toBe(img.url);
  });

  it('skips watermark when watermark settings is undefined', async () => {
    const wm = vi.fn();
    const img = mkImg({ id: 'a', pipelinePending: true });
    const out = await finalizePipelineImage(img, undefined, undefined, wm);
    expect(wm).not.toHaveBeenCalled();
    expect(out.pipelinePending).toBe(false);
  });

  it('swallows watermark errors and keeps the original URL', async () => {
    const wm = vi.fn().mockRejectedValue(new Error('canvas blew up'));
    const img = mkImg({
      id: 'a',
      pipelinePending: true,
      url: 'https://cdn.example.com/raw.jpg',
    });
    const out = await finalizePipelineImage(img, enabledWm, 'chan', wm);
    // Approval must not be blocked by a watermark failure.
    expect(out.pipelinePending).toBe(false);
    expect(out.url).toBe('https://cdn.example.com/raw.jpg');
  });
});
