// V040-HOTFIX-002: degrade-guard for carousel approval rejects.

import { describe, it, expect } from 'vitest';
import {
  CAROUSEL_MIN_IMAGES,
  canRejectMoreInCarousel,
} from '@/lib/carousel-degrade-guard';

describe('carousel-degrade-guard', () => {
  it('exposes the carousel minimum as 2 (Instagram + Pinterest carousel floor)', () => {
    expect(CAROUSEL_MIN_IMAGES).toBe(2);
  });

  it('allows reject when there is room above the minimum (3 → 2)', () => {
    expect(canRejectMoreInCarousel(3)).toBe(true);
  });

  it('allows reject for any healthy carousel above the minimum', () => {
    expect(canRejectMoreInCarousel(4)).toBe(true);
    expect(canRejectMoreInCarousel(10)).toBe(true);
  });

  it('blocks reject at the minimum — rejecting one would drop to 1 and degrade', () => {
    expect(canRejectMoreInCarousel(2)).toBe(false);
  });

  it('blocks reject below the minimum (defensive — should not normally be reached)', () => {
    expect(canRejectMoreInCarousel(1)).toBe(false);
    expect(canRejectMoreInCarousel(0)).toBe(false);
  });
});
