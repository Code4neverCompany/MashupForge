// BUG-CRIT-007 / BUG-DES-001: pin the badge-derivation contract for
// the Post Ready carousel card. Mirrors the inline logic at
// components/MainContent.tsx:3546-3556 (carousel) and :3814-3824
// (single-image, used here as the parity reference).
//
// Bug: pre-fix, the carousel branch only read anchor.postedAt /
// anchor.postError — i.e. the manual Post Now path. The auto-poster
// writes status to ScheduledPost.status, which the carousel branch
// never inspected. So an auto-posted carousel showed no badge after
// reload, even though the data was sitting in settings.scheduledPosts
// with status: 'posted'.
//
// Fix: carousel branch now also reads latestScheduleFor(anchor.id)?.status,
// matching the single-image card. Both UI surfaces now contribute to
// the badge.

import { describe, it, expect } from 'vitest';
import type { GeneratedImage, ScheduledPost } from '@/types/mashup';

type Badge = { text: string; color: string } | null;

// Mirror of components/MainContent.tsx:3546-3556 (carousel branch).
function deriveCarouselBadge(
  anchor: GeneratedImage,
  carouselScheduled: ScheduledPost | undefined,
  formatTimeShort: (t: string) => string = (t) => t,
): Badge {
  if (anchor.postedAt) {
    return {
      text: `Posted${anchor.postedTo?.length ? ` to ${anchor.postedTo.join(', ')}` : ''}`,
      color: 'bg-emerald-600',
    };
  }
  if (anchor.postError) {
    return { text: 'Failed', color: 'bg-red-600' };
  }
  if (carouselScheduled?.status === 'posted') {
    return { text: 'Posted', color: 'bg-emerald-600' };
  }
  if (carouselScheduled?.status === 'failed') {
    return { text: 'Failed', color: 'bg-red-600' };
  }
  if (carouselScheduled?.status === 'scheduled') {
    return {
      text: `Scheduled ${carouselScheduled.date} ${formatTimeShort(carouselScheduled.time)}`,
      color: 'bg-amber-600',
    };
  }
  return null;
}

const mkAnchor = (overrides: Partial<GeneratedImage> = {}): GeneratedImage => ({
  id: 'anchor-1',
  prompt: 'p',
  url: 'https://example.test/a.png',
  ...overrides,
});

const mkPost = (overrides: Partial<ScheduledPost> = {}): ScheduledPost => ({
  id: 'post-1',
  imageId: 'anchor-1',
  date: '2026-04-25',
  time: '18:00',
  platforms: ['instagram'],
  caption: 'cap',
  status: 'scheduled',
  ...overrides,
});

describe('BUG-CRIT-007 — carousel badge derivation', () => {
  describe('manual Post Now path (anchor.postedAt / postError) — wins over schedule', () => {
    it('renders Posted with platforms when anchor.postedAt is set', () => {
      const badge = deriveCarouselBadge(
        mkAnchor({ postedAt: 1234, postedTo: ['instagram', 'discord'] }),
        undefined,
      );
      expect(badge).toEqual({ text: 'Posted to instagram, discord', color: 'bg-emerald-600' });
    });

    it('renders Posted (no platforms) when postedTo is empty', () => {
      const badge = deriveCarouselBadge(mkAnchor({ postedAt: 1234 }), undefined);
      expect(badge).toEqual({ text: 'Posted', color: 'bg-emerald-600' });
    });

    it('renders Failed when anchor.postError is set', () => {
      const badge = deriveCarouselBadge(
        mkAnchor({ postError: 'Token expired' }),
        undefined,
      );
      expect(badge).toEqual({ text: 'Failed', color: 'bg-red-600' });
    });

    it('manual postedAt wins over a scheduled post still pending', () => {
      const badge = deriveCarouselBadge(
        mkAnchor({ postedAt: 1234, postedTo: ['twitter'] }),
        mkPost({ status: 'scheduled' }),
      );
      expect(badge!.text).toBe('Posted to twitter');
    });
  });

  describe('auto-poster path (ScheduledPost.status) — the BUG-CRIT-007 regression coverage', () => {
    it('renders Posted when ScheduledPost.status is posted (no anchor.postedAt)', () => {
      const badge = deriveCarouselBadge(mkAnchor(), mkPost({ status: 'posted' }));
      expect(badge).toEqual({ text: 'Posted', color: 'bg-emerald-600' });
    });

    it('renders Failed when ScheduledPost.status is failed (no anchor.postError)', () => {
      const badge = deriveCarouselBadge(mkAnchor(), mkPost({ status: 'failed' }));
      expect(badge).toEqual({ text: 'Failed', color: 'bg-red-600' });
    });

    it('renders Scheduled with date/time when status is scheduled', () => {
      const badge = deriveCarouselBadge(
        mkAnchor(),
        mkPost({ status: 'scheduled', date: '2026-05-01', time: '14:30' }),
      );
      expect(badge).toEqual({
        text: 'Scheduled 2026-05-01 14:30',
        color: 'bg-amber-600',
      });
    });

    it('uses formatTimeShort for the scheduled time', () => {
      const badge = deriveCarouselBadge(
        mkAnchor(),
        mkPost({ status: 'scheduled', time: '14:30' }),
        (t) => t.replace(':30', ':30 PM'),
      );
      expect(badge!.text).toContain('14:30 PM');
    });
  });

  describe('default — null (no badge)', () => {
    it('returns null when there is no manual state and no schedule', () => {
      const badge = deriveCarouselBadge(mkAnchor(), undefined);
      expect(badge).toBeNull();
    });

    it('returns null when scheduled post is in pending_approval (not yet active)', () => {
      const badge = deriveCarouselBadge(
        mkAnchor(),
        mkPost({ status: 'pending_approval' }),
      );
      expect(badge).toBeNull();
    });

    it('returns null when scheduled post is rejected (terminal but not visible as a badge)', () => {
      const badge = deriveCarouselBadge(mkAnchor(), mkPost({ status: 'rejected' }));
      expect(badge).toBeNull();
    });
  });
});
