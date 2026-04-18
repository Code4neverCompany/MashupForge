// V030-004: weekly-fill helper tests.
//
// Pure math, no React / IDB / fetch — just needs a pinned `now` for
// determinism. Covers the per-day breakdown, terminal-status filtering,
// and the `filled` / `percent` aggregates.

import { describe, it, expect } from 'vitest';
import { computeWeekFillStatus } from '@/lib/weekly-fill';
import type { ScheduledPost } from '@/types/mashup';

function post(
  date: string,
  time: string,
  status: ScheduledPost['status'] = 'scheduled',
): ScheduledPost {
  return {
    id: `${date}-${time}`,
    imageId: 'img-1',
    date,
    time,
    platforms: ['instagram'],
    caption: '',
    status,
  };
}

// Monday 2026-04-20 at noon local — stable anchor for all cases.
const NOW = new Date(2026, 3, 20, 12, 0, 0);

describe('computeWeekFillStatus', () => {
  it('empty schedule → 0%, 7 days, all gaps = postsPerDay', () => {
    const s = computeWeekFillStatus([], 7, 2, NOW);
    expect(s.targetDays).toBe(7);
    expect(s.targetTotal).toBe(14);
    expect(s.scheduledTotal).toBe(0);
    expect(s.filled).toBe(false);
    expect(s.percent).toBe(0);
    expect(s.days).toHaveLength(7);
    expect(s.days[0].date).toBe('2026-04-20');
    expect(s.days[0].dayLabel).toBe('Mon');
    expect(s.days.every(d => d.gap === 2)).toBe(true);
    expect(s.days[6].dayLabel).toBe('Sun');
  });

  it('counts scheduled + pending_approval, ignores posted + failed', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-20', '18:00', 'scheduled'),
      post('2026-04-20', '20:00', 'pending_approval'),
      post('2026-04-20', '22:00', 'posted'),    // excluded
      post('2026-04-21', '10:00', 'failed'),    // excluded
      post('2026-04-22', '09:00', 'scheduled'),
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(2);
    expect(s.days[1].scheduledCount).toBe(0);
    expect(s.days[2].scheduledCount).toBe(1);
    expect(s.scheduledTotal).toBe(3);
  });

  it('posts before now are excluded even on today', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-20', '09:00', 'scheduled'),  // before NOW (12:00) → drop
      post('2026-04-20', '14:00', 'scheduled'),  // after NOW → keep
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(1);
  });

  it('posts outside the target window are ignored', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-26', '12:00'),   // day 6 (within 7)
      post('2026-04-27', '12:00'),   // day 7 (outside 7)
      post('2026-05-05', '12:00'),   // far future
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(1);
    expect(s.days[6].scheduledCount).toBe(1);
  });

  it('filled=true and percent=100 when target is met exactly', () => {
    // 7 days * 2/day = 14 posts. Place 2 on each day.
    const posts: ScheduledPost[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(NOW);
      d.setDate(NOW.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      posts.push(post(ds, '14:00'));
      posts.push(post(ds, '20:00'));
    }
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.filled).toBe(true);
    expect(s.percent).toBe(100);
    expect(s.days.every(d => d.gap === 0)).toBe(true);
  });

  it('over-target total still reports filled; percent caps at 100', () => {
    // Fill the full week (14), then add 3 extras on day 0 → 17 total.
    const posts: ScheduledPost[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(NOW);
      d.setDate(NOW.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      posts.push(post(ds, '14:00'));
      posts.push(post(ds, '20:00'));
    }
    posts.push(post('2026-04-20', '15:00'));
    posts.push(post('2026-04-20', '16:00'));
    posts.push(post('2026-04-20', '17:00'));
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(17);
    expect(s.filled).toBe(true);
    expect(s.percent).toBe(100);
    expect(s.days[0].scheduledCount).toBe(5);
    expect(s.days[0].gap).toBe(0);
  });

  it('respects a non-default postsPerDay', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-20', '14:00'),
      post('2026-04-20', '20:00'),
      post('2026-04-20', '22:00'),
    ];
    const s = computeWeekFillStatus(posts, 7, 4, NOW);
    expect(s.targetTotal).toBe(28);
    expect(s.days[0].target).toBe(4);
    expect(s.days[0].gap).toBe(1);
    expect(s.filled).toBe(false);
  });

  it('malformed date string on a post is skipped rather than throwing', () => {
    const posts: ScheduledPost[] = [
      post('not-a-date', '14:00'),
      post('2026-04-20', '14:00'),
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(1);
  });

  it('targetDays=0 produces an empty status without dividing by zero', () => {
    const s = computeWeekFillStatus([], 0, 2, NOW);
    expect(s.days).toEqual([]);
    expect(s.targetTotal).toBe(0);
    expect(s.percent).toBe(0);
    expect(s.filled).toBe(true); // 0 >= 0
  });

  it('undefined posts is treated the same as an empty array', () => {
    const s = computeWeekFillStatus(undefined, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(0);
    expect(s.days).toHaveLength(7);
    expect(s.filled).toBe(false);
  });

  it('post with timestamp exactly equal to now is counted (boundary: ts < now is false)', () => {
    // ts === now.getTime() → ts < now.getTime() is false → should be kept
    const posts: ScheduledPost[] = [post('2026-04-20', '12:00', 'scheduled')];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(1);
  });
});
