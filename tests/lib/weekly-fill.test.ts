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
// The window starts TOMORROW (today is excluded — matches findBestSlots
// in smartScheduler.ts which also schedules from tomorrow), so for a
// 7-day target the days are 2026-04-21 .. 2026-04-27.
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
    // First day is TOMORROW (today is excluded from the window).
    expect(s.days[0].date).toBe('2026-04-21');
    expect(s.days[0].dayLabel).toBe('Tue');
    expect(s.days.every(d => d.gap === 2)).toBe(true);
    // Last day is tomorrow + 6 = Mon 2026-04-27.
    expect(s.days[6].date).toBe('2026-04-27');
    expect(s.days[6].dayLabel).toBe('Mon');
  });

  it('counts only scheduled, tracks pending_approval separately, ignores posted + failed', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-21', '18:00', 'scheduled'),
      post('2026-04-21', '20:00', 'pending_approval'),
      post('2026-04-21', '22:00', 'posted'),    // excluded entirely
      post('2026-04-22', '10:00', 'failed'),    // excluded entirely
      post('2026-04-23', '09:00', 'scheduled'),
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    // scheduledCount is now scheduled-only — pending_approval is split off
    expect(s.days[0].scheduledCount).toBe(1);
    expect(s.days[0].pendingApprovalCount).toBe(1);
    expect(s.days[1].scheduledCount).toBe(0);
    expect(s.days[1].pendingApprovalCount).toBe(0);
    expect(s.days[2].scheduledCount).toBe(1);
    expect(s.days[2].pendingApprovalCount).toBe(0);
    expect(s.scheduledTotal).toBe(2);
    expect(s.pendingApprovalTotal).toBe(1);
  });

  it('pending_approval posts do not satisfy fill — daemon must keep generating', () => {
    // 7 days * 2/day = 14 slots. Place 14 pending_approval posts → filled
    // must stay false because none are scheduled (publishable) yet.
    const tomorrow = new Date(NOW);
    tomorrow.setDate(NOW.getDate() + 1);
    const posts: ScheduledPost[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(tomorrow);
      d.setDate(tomorrow.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      posts.push(post(ds, '14:00', 'pending_approval'));
      posts.push(post(ds, '20:00', 'pending_approval'));
    }
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(0);
    expect(s.filled).toBe(false);
    expect(s.percent).toBe(0);
    expect(s.pendingApprovalTotal).toBe(14);
    // Per-day pending count is preserved for the indicator UI.
    expect(s.days.every((d) => d.pendingApprovalCount === 2)).toBe(true);
  });

  it('mixed scheduled + pending_approval: only scheduled count toward fill', () => {
    // Tomorrow has 2 scheduled (filled), day after has 2 pending_approval (not filled).
    const posts: ScheduledPost[] = [
      post('2026-04-21', '14:00', 'scheduled'),
      post('2026-04-21', '20:00', 'scheduled'),
      post('2026-04-22', '14:00', 'pending_approval'),
      post('2026-04-22', '20:00', 'pending_approval'),
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(2);
    expect(s.days[0].gap).toBe(0);
    expect(s.days[0].pendingApprovalCount).toBe(0);
    expect(s.days[1].scheduledCount).toBe(0);
    expect(s.days[1].gap).toBe(2); // gap is computed from scheduledCount, not pending
    expect(s.days[1].pendingApprovalCount).toBe(2);
    expect(s.scheduledTotal).toBe(2);
    expect(s.pendingApprovalTotal).toBe(2);
    expect(s.filled).toBe(false);
  });

  it('pendingApprovalTotal sums across days; terminal statuses excluded from both buckets', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-21', '14:00', 'pending_approval'),
      post('2026-04-22', '14:00', 'pending_approval'),
      post('2026-04-23', '14:00', 'pending_approval'),
      post('2026-04-21', '15:00', 'posted'),     // terminal, excluded
      post('2026-04-21', '16:00', 'failed'),     // terminal, excluded
      post('2026-04-21', '17:00', 'rejected'),   // terminal, excluded
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.pendingApprovalTotal).toBe(3);
    expect(s.scheduledTotal).toBe(0);
  });

  it('pending_approval posts outside the horizon are ignored from pendingApprovalTotal', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-21', '14:00', 'pending_approval'),  // day 1 — counted
      post('2026-04-27', '14:00', 'pending_approval'),  // day 7 (last day) — counted
      post('2026-04-28', '14:00', 'pending_approval'),  // day 8 — outside horizon
      post('2026-05-15', '14:00', 'pending_approval'),  // far future — outside
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.pendingApprovalTotal).toBe(2);
    expect(s.days[0].pendingApprovalCount).toBe(1);
    expect(s.days[6].pendingApprovalCount).toBe(1);
  });

  it('over-scheduled day with pending_approval still bounds scheduledTotal at target', () => {
    // 4 scheduled (over the 2/day target) + 3 pending_approval on day 0.
    // scheduledCount=4, pendingApprovalCount=3 — but capped contribution=2.
    // Other days remain empty → not filled.
    const posts: ScheduledPost[] = [
      post('2026-04-21', '10:00', 'scheduled'),
      post('2026-04-21', '12:00', 'scheduled'),
      post('2026-04-21', '14:00', 'scheduled'),
      post('2026-04-21', '16:00', 'scheduled'),
      post('2026-04-21', '18:00', 'pending_approval'),
      post('2026-04-21', '20:00', 'pending_approval'),
      post('2026-04-21', '22:00', 'pending_approval'),
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(4);
    expect(s.days[0].pendingApprovalCount).toBe(3);
    expect(s.scheduledTotal).toBe(2); // capped at day-0's target
    expect(s.pendingApprovalTotal).toBe(3);
    expect(s.filled).toBe(false);
  });

  it('posts dated today are off-window (today is excluded — scheduler starts tomorrow)', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-20', '14:00', 'scheduled'), // today → off-window
      post('2026-04-20', '23:00', 'scheduled'), // today → off-window
      post('2026-04-21', '09:00', 'scheduled'), // tomorrow → counted
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    // Today's posts don't appear in any day bucket.
    expect(s.days[0].date).toBe('2026-04-21');
    expect(s.days[0].scheduledCount).toBe(1);
    expect(s.scheduledTotal).toBe(1);
  });

  it('posts outside the target window are ignored', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-27', '12:00'),   // day 6 of window (within 7)
      post('2026-04-28', '12:00'),   // day 7 (outside 7)
      post('2026-05-05', '12:00'),   // far future
    ];
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.scheduledTotal).toBe(1);
    expect(s.days[6].scheduledCount).toBe(1);
  });

  it('filled=true and percent=100 when target is met exactly', () => {
    // 7 days * 2/day = 14 posts. Place 2 on each day starting tomorrow.
    const tomorrow = new Date(NOW);
    tomorrow.setDate(NOW.getDate() + 1);
    const posts: ScheduledPost[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(tomorrow);
      d.setDate(tomorrow.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      posts.push(post(ds, '14:00'));
      posts.push(post(ds, '20:00'));
    }
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.filled).toBe(true);
    expect(s.percent).toBe(100);
    expect(s.days.every(d => d.gap === 0)).toBe(true);
  });

  it('over-target total caps each day at postsPerDay; raw per-day count preserved', () => {
    // Fill the full week (14), then add 3 extras on day 0 (raw=17, capped=14).
    const tomorrow = new Date(NOW);
    tomorrow.setDate(NOW.getDate() + 1);
    const posts: ScheduledPost[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(tomorrow);
      d.setDate(tomorrow.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      posts.push(post(ds, '14:00'));
      posts.push(post(ds, '20:00'));
    }
    posts.push(post('2026-04-21', '15:00'));
    posts.push(post('2026-04-21', '16:00'));
    posts.push(post('2026-04-21', '17:00'));
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    // Aggregate is capped at targetTotal — no overflow counting.
    expect(s.scheduledTotal).toBe(14);
    expect(s.scheduledTotal).toBeLessThanOrEqual(s.targetTotal);
    expect(s.filled).toBe(true);
    expect(s.percent).toBe(100);
    // Day-level raw count is preserved for tooltip / per-day display.
    expect(s.days[0].scheduledCount).toBe(5);
    expect(s.days[0].gap).toBe(0);
  });

  it('uneven over-scheduling on one day does not mask gaps elsewhere', () => {
    // 8 posts on day 0 (tomorrow), 0 elsewhere → raw=8, capped=2.
    // Was the bug shape: previously this would have summed to 8 toward the
    // 14-target, making the meter look 57% full when the week is mostly empty.
    const posts: ScheduledPost[] = Array.from({ length: 8 }, (_, k) =>
      post('2026-04-21', `${String(13 + k).padStart(2, '0')}:00`),
    );
    const s = computeWeekFillStatus(posts, 7, 2, NOW);
    expect(s.days[0].scheduledCount).toBe(8);
    expect(s.scheduledTotal).toBe(2); // only day-0's 2 slots count
    expect(s.targetTotal).toBe(14);
    expect(s.filled).toBe(false);
    expect(s.percent).toBe(Math.round((2 / 14) * 100));
  });

  it('respects a non-default postsPerDay', () => {
    const posts: ScheduledPost[] = [
      post('2026-04-21', '14:00'),
      post('2026-04-21', '20:00'),
      post('2026-04-21', '22:00'),
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
      post('2026-04-21', '14:00'),
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

  // BUG-PIPELINE-001 regression: start-of-window must remain tomorrow at
  // any hour of the day. The original bug fired specifically when the
  // pipeline ran late in the evening (>23:00) — at that hour, the older
  // "start from today" code summed `targetPerDay` slots that the
  // scheduler (which always picks from tomorrow) could never fill, so the
  // continuous-mode loop never converged. Pinning `NOW` at 23:30 here
  // proves the helper agrees with `findBestSlots` regardless of clock.
  it('BUG-PIPELINE-001: window starts from tomorrow even when called at 23:30', () => {
    const lateNight = new Date(2026, 3, 20, 23, 30, 0); // Mon 23:30 local
    const s = computeWeekFillStatus([], 7, 2, lateNight);
    expect(s.days[0].date).toBe('2026-04-21');
    expect(s.days[0].dayLabel).toBe('Tue');
    expect(s.days[6].date).toBe('2026-04-27');
    // A post placed in today's last hour must NOT count toward the
    // window — the scheduler can't put new posts there anyway.
    const todaysLatePost = computeWeekFillStatus(
      [post('2026-04-20', '23:45', 'scheduled')],
      7,
      2,
      lateNight,
    );
    expect(todaysLatePost.scheduledTotal).toBe(0);
    expect(todaysLatePost.days.find(d => d.date === '2026-04-20')).toBeUndefined();
  });
});
