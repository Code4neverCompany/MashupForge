import type { ScheduledPost } from '../types/mashup';

/**
 * Counts future scheduled posts within a lookahead window.
 * Excludes posted/failed entries; counts pending_approval, scheduled, and
 * status-undefined posts whose datetime falls in [now, now+daysAhead].
 */
export function countFutureScheduledPosts(
  posts: ScheduledPost[] | undefined,
  daysAhead: number,
): number {
  if (!posts || posts.length === 0) return 0;
  const now = Date.now();
  const horizon = now + daysAhead * 24 * 60 * 60 * 1000;
  return posts.filter(p => {
    if (p.status === 'posted' || p.status === 'failed') return false;
    const t = new Date(`${p.date}T${p.time}:00`).getTime();
    return t >= now && t <= horizon;
  }).length;
}

/** Hard timeout error thrown by the per-idea race in usePipelineDaemon. */
export class IdeaTimeoutError extends Error {
  readonly kind = 'timeout' as const;
  constructor() {
    super('__IDEA_TIMEOUT__');
    this.name = 'IdeaTimeoutError';
  }
}
