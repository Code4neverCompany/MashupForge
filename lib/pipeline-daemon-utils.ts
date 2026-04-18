import type { ScheduledPost, UserSettings } from '../types/mashup';

type AutoApproveMap = UserSettings['pipelineAutoApprove'];
type PlatformKey = 'instagram' | 'pinterest' | 'twitter' | 'discord';

/**
 * V040-008: per-platform approval defaults. Instagram defaults to
 * requiring manual approval because its Graph API most often flags
 * content / rate-limits unpredictably; auto-posting there without a
 * human pause tends to produce surprising outcomes. Other platforms
 * default to auto-approval to preserve the pre-V040-008 behavior for
 * users who never open the new setting.
 */
const DEFAULT_AUTO_APPROVE: Record<PlatformKey, boolean> = {
  instagram: false,
  pinterest: true,
  twitter: true,
  discord: true,
};

const isKnownPlatform = (p: string): p is PlatformKey =>
  p === 'instagram' || p === 'pinterest' || p === 'twitter' || p === 'discord';

/**
 * Returns `true` when a given platform is auto-approved (post lands
 * as `scheduled`) and `false` when it requires manual approval
 * (post lands as `pending_approval`). Unknown platforms default to
 * manual approval — unrecognized channels shouldn't silently publish.
 */
export function isPlatformAutoApproved(
  platform: string,
  config: AutoApproveMap | undefined,
): boolean {
  if (!isKnownPlatform(platform)) return false;
  const explicit = config?.[platform];
  if (typeof explicit === 'boolean') return explicit;
  return DEFAULT_AUTO_APPROVE[platform];
}

/**
 * Resolves the initial status of a pipeline-produced post based on
 * its platform set + the user's per-platform auto-approve config.
 *
 * Logic: a post lands as `scheduled` only when ALL of its platforms
 * are auto-approved. If any one platform requires manual review, the
 * entire post gates through the approval queue. This is deliberately
 * strict — a carousel that fans out to Instagram (manual) + Twitter
 * (auto) is still one mistake away from a misfire, so the manual
 * gate applies to the whole post. Users who want per-channel
 * granularity can schedule single-platform posts.
 *
 * An empty platforms array falls back to `pending_approval` (nothing
 * is auto-approvable if there's nothing to approve against).
 */
export function resolvePipelinePostStatus(
  platforms: string[],
  config: AutoApproveMap | undefined,
): 'scheduled' | 'pending_approval' {
  if (platforms.length === 0) return 'pending_approval';
  const allAuto = platforms.every((p) => isPlatformAutoApproved(p, config));
  return allAuto ? 'scheduled' : 'pending_approval';
}


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
