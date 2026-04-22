// V060-004: fill-week-first slot picker.
//
// The pipeline used to call findBestSlot with the default 14-day window
// for every new post, so the engagement-best slot from week 2 (often
// Saturday evening) could outrank lower-engagement slots in the current
// week — leaving holes in this week while next week filled up first.
//
// pickFillWeekSlot caps the candidate horizon at 7 days while the
// current week still has gaps (per `computeWeekFillStatus`), then
// extends to 14 days once week 1 is filled. The engagement-based
// scoring inside findBestSlot is unchanged — this helper only narrows
// the window.
//
// Pure: pass `now` so tests can pin the clock.

import { findBestSlot, type CachedEngagement } from './smartScheduler';
import { computeWeekFillStatus } from './weekly-fill';
import type { ScheduledPost, UserSettings } from '../types/mashup';

export interface PickFillWeekSlotOptions {
  posts: ScheduledPost[];
  engagement: CachedEngagement;
  postsPerDay: number;
  platforms?: string[];
  caps?: UserSettings['pipelineDailyCaps'];
  now?: Date;
}

export interface FillWeekSlotResult {
  date: string;
  time: string;
  /** Which week the slot landed in — 1 = current 7-day window, 2 = days 8-14. */
  week: 1 | 2;
}

/**
 * Pick the next slot, prioritising the current week.
 *
 * - When week 1 (next 7 days) has gaps → confine the candidate window
 *   to 7 days so the engagement-best slot lands here, not in week 2.
 * - When week 1 is already filled → extend to a 14-day window so the
 *   pipeline pre-schedules week 2 at the engagement-best times.
 */
export function pickFillWeekSlot(opts: PickFillWeekSlotOptions): FillWeekSlotResult {
  const { posts, engagement, postsPerDay, platforms, caps, now } = opts;
  const week1 = computeWeekFillStatus(posts, 7, postsPerDay, now ?? new Date());
  const horizonDays = week1.filled ? 14 : 7;
  const slot = findBestSlot(posts, engagement, { platforms, caps, horizonDays });

  // Week classification: both `findBestSlots` and `computeWeekFillStatus`
  // anchor on TOMORROW (today is excluded — we never schedule into it),
  // so week 1 = [tomorrow, tomorrow+7) = [today+1, today+8). Anything at
  // today+8 or later is week 2.
  const today = new Date(now ?? new Date());
  today.setHours(0, 0, 0, 0);
  const week2Start = new Date(today);
  week2Start.setDate(today.getDate() + 8);
  const slotDate = new Date(`${slot.date}T00:00:00`);
  const week: 1 | 2 = slotDate.getTime() >= week2Start.getTime() ? 2 : 1;

  return { date: slot.date, time: slot.time, week };
}
