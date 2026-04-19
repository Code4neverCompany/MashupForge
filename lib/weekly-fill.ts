// V030-004: weekly fill strategy.
//
// The pipeline's main aim is to fill the entire current N-day window
// (default 7) with scheduled posts before moving on. The daemon already
// had a "target met" check baked into the continuous-mode sleep block,
// but the logic was inline and the per-day target was hardcoded at 2.
// Pulling it out to a pure helper lets:
//   1. the daemon and the UI agree on what "filled" means
//   2. tests exercise the math without spinning up React
//   3. a future change to the target formula (e.g. variable by day of
//      week) lands in one place
//
// Deliberately pure — no Date.now() reads inside; the caller passes
// `now` so tests can pin it.

import type { ScheduledPost } from '../types/mashup';

export interface DayFill {
  /** YYYY-MM-DD in the caller's local timezone. */
  date: string;
  /** Weekday short name: 'Mon' | 'Tue' | … | 'Sun'. */
  dayLabel: string;
  /** Count of non-terminal scheduled posts on this day. */
  scheduledCount: number;
  /** Per-day target (currently uniform, may vary per day in future). */
  target: number;
  /** target minus scheduledCount, floored at 0. */
  gap: number;
}

export interface WeekFillStatus {
  /** N-day horizon the status was computed for. */
  targetDays: number;
  /** Per-day target used for the math. */
  postsPerDay: number;
  /**
   * Sum of `min(day.scheduledCount, day.target)` per day. Each day
   * contributes at most `postsPerDay` slots so the aggregate is a
   * "filled slots" measure, not a raw post count, and is guaranteed
   * to satisfy `scheduledTotal <= targetTotal`. Use a per-day
   * `scheduledCount` if you need the raw number on a single day.
   */
  scheduledTotal: number;
  /** targetDays * postsPerDay. */
  targetTotal: number;
  /** true iff scheduledTotal >= targetTotal. */
  filled: boolean;
  /** Percentage 0..100, rounded to the nearest int for UI use. */
  percent: number;
  /** Ordered from today forward (days.length === targetDays). */
  days: DayFill[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build a per-day breakdown of how many non-terminal (`pending_approval`
 * or `scheduled`) posts live in each of the next `targetDays` days,
 * starting from `now`'s calendar day. Posts in the past (even same day)
 * count if their datetime is >= now.
 *
 * Terminal statuses (`posted`, `failed`) are excluded — they don't
 * contribute to "still to be published" capacity planning.
 */
export function computeWeekFillStatus(
  posts: ScheduledPost[] | undefined,
  targetDays: number,
  postsPerDay: number,
  now: Date = new Date(),
): WeekFillStatus {
  const days: DayFill[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const counts = new Map<string, number>();
  if (posts && posts.length > 0) {
    for (const p of posts) {
      if (p.status === 'posted' || p.status === 'failed' || p.status === 'rejected') continue;
      // Treat malformed date/time strings as "skip" rather than throwing —
      // callers include user-edited settings that may be half-filled.
      const ts = new Date(`${p.date}T${p.time}:00`).getTime();
      if (!Number.isFinite(ts)) continue;
      if (ts < now.getTime()) continue;
      counts.set(p.date, (counts.get(p.date) ?? 0) + 1);
    }
  }

  for (let i = 0; i < targetDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = formatDate(d);
    const scheduledCount = counts.get(dateStr) ?? 0;
    days.push({
      date: dateStr,
      dayLabel: DAY_LABELS[d.getDay()],
      scheduledCount,
      target: postsPerDay,
      gap: Math.max(0, postsPerDay - scheduledCount),
    });
  }

  // Cap each day's contribution at its target so the aggregate is
  // bounded by targetTotal — over-scheduling on one day must not
  // make the week look "120%" full when other days are still empty.
  // Per-day `scheduledCount` remains the raw count for tooltips.
  const scheduledTotal = days.reduce(
    (sum, d) => sum + Math.min(d.scheduledCount, d.target),
    0,
  );
  const targetTotal = targetDays * postsPerDay;
  const percent = targetTotal === 0
    ? 0
    : Math.min(100, Math.round((scheduledTotal / targetTotal) * 100));

  return {
    targetDays,
    postsPerDay,
    scheduledTotal,
    targetTotal,
    filled: scheduledTotal >= targetTotal,
    percent,
    days,
  };
}
