/**
 * V060-001 — single source of truth for the Post Ready card status pill.
 *
 * Both PostReadyCard (single image) and PostReadyCarouselCard derive
 * their pill+border colour from this helper. Manual Post Now state
 * (img.postedAt / img.postError) wins; otherwise the latest scheduled
 * post drives the result; otherwise default 'ready'.
 *
 * Pinned by tests/lib/post-ready-status.test.ts.
 */

import type { GeneratedImage, ScheduledPost } from '@/types/mashup';
import { formatTimeShort } from '@/components/TimePicker24';

export type PostReadyStatusKind = 'ready' | 'scheduled' | 'posted' | 'failed';

export interface PostReadyStatus {
  kind: PostReadyStatusKind;
  label: string;
}

export function derivePostReadyStatus(
  img: GeneratedImage,
  scheduled: ScheduledPost | undefined,
): PostReadyStatus {
  if (img.postedAt) {
    const where = img.postedTo?.length ? ` to ${img.postedTo.join(', ')}` : '';
    return { kind: 'posted', label: `Posted${where}` };
  }
  if (img.postError) return { kind: 'failed', label: `Failed: ${img.postError}` };
  if (scheduled?.status === 'posted') return { kind: 'posted', label: 'Posted' };
  if (scheduled?.status === 'failed') return { kind: 'failed', label: 'Failed' };
  if (scheduled?.status === 'scheduled') {
    return {
      kind: 'scheduled',
      label: `Scheduled ${scheduled.date} · ${formatTimeShort(scheduled.time)}`,
    };
  }
  if (scheduled?.status === 'pending_approval') {
    return {
      kind: 'scheduled',
      label: `Pending approval · ${scheduled.date} ${formatTimeShort(scheduled.time)}`,
    };
  }
  return { kind: 'ready', label: 'Ready' };
}
