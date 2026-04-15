/**
 * Smart scheduler — picks optimal posting times based on:
 *   1. Instagram Graph API insights (engagement by hour/day from past posts)
 *   2. Falls back to research-backed optimal times for DACH / EU timezone
 *
 * Engagement data is cached in localStorage with a 24h TTL.
 */

interface IgMediaPost {
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export interface SlotScore {
  date: string;
  time: string;
  /** 0-100 score, higher = better */
  score: number;
  /** Why this slot was chosen */
  reason: string;
}

export interface EngagementHour {
  hour: number;
  /** Relative engagement weight (0-1) */
  weight: number;
}

export interface EngagementDay {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  multiplier: number;
}

/** Research-backed optimal posting times for Instagram (EU timezone, adjusted for DACH).
 *  Sources: Hootsuite 2025, Sprout Social, Later.com aggregate data. */
const DEFAULT_HOUR_WEIGHTS: EngagementHour[] = [
  { hour: 6,  weight: 0.3 },
  { hour: 7,  weight: 0.6 },
  { hour: 8,  weight: 0.8 },  // Morning commute peak
  { hour: 9,  weight: 0.65 },
  { hour: 10, weight: 0.5 },
  { hour: 11, weight: 0.55 },
  { hour: 12, weight: 0.75 }, // Lunch break
  { hour: 13, weight: 0.7 },
  { hour: 14, weight: 0.5 },
  { hour: 15, weight: 0.4 },
  { hour: 16, weight: 0.45 },
  { hour: 17, weight: 0.7 },  // After-work ramp
  { hour: 18, weight: 0.85 }, // After-work peak
  { hour: 19, weight: 0.9 },  // Prime time
  { hour: 20, weight: 0.95 }, // Highest engagement window
  { hour: 21, weight: 0.85 },
  { hour: 22, weight: 0.6 },
  { hour: 23, weight: 0.3 },
];

const DEFAULT_DAY_MULTIPLIERS: EngagementDay[] = [
  { day: 0, multiplier: 0.9 },  // Sunday — high evening engagement
  { day: 1, multiplier: 0.7 },  // Monday
  { day: 2, multiplier: 0.75 }, // Tuesday
  { day: 3, multiplier: 0.8 },  // Wednesday
  { day: 4, multiplier: 0.85 }, // Thursday
  { day: 5, multiplier: 0.95 }, // Friday — high engagement
  { day: 6, multiplier: 1.0 },  // Saturday — best day
];

const CACHE_KEY = 'mashup_engagement_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedEngagement {
  hours: EngagementHour[];
  days: EngagementDay[];
  fetchedAt: number;
  source: 'instagram' | 'default';
}

export function loadEngagementData(): CachedEngagement {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedEngagement = JSON.parse(raw);
      if (Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached;
      }
    }
  } catch { /* ignore */ }
  return {
    hours: DEFAULT_HOUR_WEIGHTS,
    days: DEFAULT_DAY_MULTIPLIERS,
    fetchedAt: Date.now(),
    source: 'default',
  };
}

export function saveEngagementData(data: CachedEngagement): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Fetch Instagram insights for past posts to learn best posting times.
 * Returns engagement-weighted hours. Non-blocking — returns defaults on failure.
 */
export async function fetchInstagramEngagement(
  accessToken?: string,
  igAccountId?: string,
): Promise<CachedEngagement> {
  if (!accessToken || !igAccountId) {
    return loadEngagementData();
  }

  try {
    // Fetch recent media with timestamp and like counts
    const hostUrl = accessToken.startsWith('IGAA') ? 'graph.instagram.com' : 'graph.facebook.com';
    const url = `https://${hostUrl}/${igAccountId}/media?fields=timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      return loadEngagementData();
    }

    const data = await res.json() as { data?: IgMediaPost[] };
    const posts: IgMediaPost[] = data.data ?? [];

    if (posts.length < 5) {
      return loadEngagementData();
    }

    // Build hour → total engagement map
    const hourEngagement: Record<number, number> = {};
    const dayEngagement: Record<number, number> = {};

    for (const post of posts) {
      if (!post.timestamp) continue;
      const date = new Date(post.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      const engagement = (post.like_count || 0) + (post.comments_count || 0) * 3;

      hourEngagement[hour] = (hourEngagement[hour] || 0) + engagement;
      dayEngagement[day] = (dayEngagement[day] || 0) + engagement;
    }

    // Normalize to 0-1 weights
    const maxHour = Math.max(...Object.values(hourEngagement), 1);
    const hours: EngagementHour[] = DEFAULT_HOUR_WEIGHTS.map(h => ({
      hour: h.hour,
      weight: hourEngagement[h.hour]
        ? Math.max(0.1, (hourEngagement[h.hour] / maxHour))
        : h.weight * 0.5, // Blend: 50% default for hours with no data
    }));

    const maxDay = Math.max(...Object.values(dayEngagement), 1);
    const days: EngagementDay[] = DEFAULT_DAY_MULTIPLIERS.map(d => ({
      day: d.day,
      multiplier: dayEngagement[d.day]
        ? Math.max(0.5, (dayEngagement[d.day] / maxDay))
        : d.multiplier * 0.5,
    }));

    const result: CachedEngagement = {
      hours,
      days,
      fetchedAt: Date.now(),
      source: 'instagram',
    };

    saveEngagementData(result);
    return result;
  } catch {
    return loadEngagementData();
  }
}

/**
 * Score a time slot based on engagement data.
 */
function scoreSlot(
  date: Date,
  hour: number,
  engagement: CachedEngagement,
): number {
  const dayMult = engagement.days.find(d => d.day === date.getDay())?.multiplier || 0.7;
  const hourWeight = engagement.hours.find(h => h.hour === hour)?.weight || 0.3;

  // Weekend evening bonus
  const day = date.getDay();
  const isWeekend = day === 0 || day === 5 || day === 6;
  const eveningBonus = (isWeekend && hour >= 19 && hour <= 21) ? 0.15 : 0;

  return (dayMult * hourWeight) + eveningBonus;
}

/** Richer post shape used for cap-aware scheduling. All fields optional
 *  so legacy callers passing `{ date, time }` still type-check. */
export interface ExistingPost {
  date: string;
  time: string;
  platforms?: string[];
  status?: 'pending_approval' | 'scheduled' | 'posted' | 'failed';
}

/** Per-platform daily caps. Missing entry = no cap for that platform. */
export type DailyCaps = Partial<Record<string, number>>;

/**
 * Build a `${date}|${platform}` → count map of posts that count
 * toward today's cap. Per user spec, `posted` and `failed` are
 * excluded — only future inventory (scheduled / pending_approval /
 * undefined-status) counts, so historical successful posts can't
 * permanently lock a day out.
 */
function buildPerDayPlatformCounts(posts: ExistingPost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of posts) {
    if (p.status === 'posted' || p.status === 'failed') continue;
    const platforms = p.platforms || [];
    for (const plat of platforms) {
      const key = `${p.date}|${plat}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Find the N best upcoming slots.
 * Skips already-taken slots, picks optimal times based on engagement.
 *
 * If `caps` and `platforms` are supplied, also skips any day where any
 * of the requested platforms has already hit its cap.
 */
export function findBestSlots(
  existingPosts: ExistingPost[],
  count: number = 1,
  engagement?: CachedEngagement,
  options?: {
    /** Platforms the new post is going to publish to. */
    platforms?: string[];
    /** Per-platform daily caps. Missing entry = no cap. */
    caps?: DailyCaps;
  },
): SlotScore[] {
  const eng = engagement || loadEngagementData();
  const taken = new Set(existingPosts.map(p => `${p.date}T${p.time}`));
  const platforms = options?.platforms || [];
  const caps = options?.caps || {};
  const dayCounts = buildPerDayPlatformCounts(existingPosts);

  // Helper — would adding one more post to `dateStr` for any of the
  // target platforms blow past that platform's cap?
  const dayWouldExceedCap = (dateStr: string): boolean => {
    if (platforms.length === 0) return false;
    for (const plat of platforms) {
      const cap = caps[plat];
      if (cap == null) continue; // no cap → fine
      const current = dayCounts[`${dateStr}|${plat}`] || 0;
      if (current >= cap) return true;
    }
    return false;
  };

  const candidates: SlotScore[] = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 1);

  // Generate candidates for next 14 days
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];

    // Skip whole day if any target platform is at cap.
    if (dayWouldExceedCap(dateStr)) continue;

    // Only consider hours with significant engagement weight
    for (const { hour } of eng.hours) {
      if (hour < 6 || hour > 23) continue;

      const time = `${String(hour).padStart(2, '0')}:00`;
      if (taken.has(`${dateStr}T${time}`)) continue;

      const score = scoreSlot(checkDate, hour, eng);
      const hourEng = eng.hours.find(h => h.hour === hour);
      const dayEng = eng.days.find(d => d.day === checkDate.getDay());
      const reason = `${hourEng?.weight || 0}h weight, ${dayEng?.multiplier || 0}x day${eng.source === 'instagram' ? ' (IG data)' : ' (research)'}`;

      candidates.push({ date: dateStr, time, score, reason });
    }
  }

  // Sort by score descending, pick top N
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, count);
}

/**
 * Single best slot — drop-in replacement for old findNextAvailableSlot.
 *
 * `options.platforms` + `options.caps` enable per-platform daily caps.
 */
export function findBestSlot(
  existingPosts: ExistingPost[],
  engagement?: CachedEngagement,
  options?: {
    platforms?: string[];
    caps?: DailyCaps;
  },
): { date: string; time: string } {
  const slots = findBestSlots(existingPosts, 1, engagement, options);
  if (slots.length > 0) return { date: slots[0].date, time: slots[0].time };
  // Absolute fallback
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: tomorrow.toISOString().split('T')[0], time: '19:00' };
}
