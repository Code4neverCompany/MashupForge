import type { ScheduledPost, UserSettings } from '../types/mashup';

type AutoApproveMap = UserSettings['pipelineAutoApprove'];
type PlatformKey = 'instagram' | 'pinterest' | 'twitter' | 'discord';

/**
 * V040-008 + V040-HOTFIX-001: per-platform approval defaults.
 *
 * All platforms default to auto-approval. The original V040-008 shipped
 * with `instagram: false` for safety reasons (the Graph API is the most
 * failure-prone integration), but that silently flipped behavior for
 * existing 0.3.x users on upgrade — Instagram posts started piling up
 * in the approval queue with no in-app explanation. The hotfix flips
 * the default back to auto so upgrades are non-breaking; users who
 * want manual gating must opt in via the PipelinePanel checkboxes.
 *
 * `applyV040AutoApproveMigration` (below) writes the explicit
 * auto-everywhere config into a legacy user's saved settings on first
 * post-upgrade load, so their state shows up in the settings UI rather
 * than relying on an undefined-fallback that could shift again later.
 */
const DEFAULT_AUTO_APPROVE: Record<PlatformKey, boolean> = {
  instagram: true,
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
 * BUG-CRIT-001: pipeline-produced posts ALWAYS land as
 * `pending_approval`. Two reasons:
 *
 *   1. Safety. Auto-scheduling without a human review step means
 *      AI-generated content can hit live channels with zero gating.
 *      A bad caption, mis-tagged image, or model hallucination
 *      goes straight to the audience.
 *   2. Watermark. The watermark pass is performed inside
 *      MashupContext.approveScheduledPost (via
 *      finalizePipelineImagesForPosts). Posts that bypass approval
 *      ALSO bypass the watermark. The fastest way to guarantee
 *      every published image is watermarked is to require every
 *      published post to pass through approval.
 *
 * The `platforms` and `config` parameters are accepted for
 * backwards compatibility with existing call sites; the previous
 * `pipelineAutoApprove` per-platform fast-path is no longer
 * consulted. The setting is kept on `UserSettings` for now (the
 * PipelinePanel UI still renders the checkboxes) so saved user
 * configurations don't get blown away — wiring will be cleaned up
 * in a follow-up. Any platforms array — empty or not — returns
 * `'pending_approval'`.
 */
export function resolvePipelinePostStatus(
  _platforms: string[],
  _config: AutoApproveMap | undefined,
): 'scheduled' | 'pending_approval' {
  return 'pending_approval';
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

/**
 * V040-HOTFIX-001: legacy-user migration shim.
 *
 * Applied once on settings load. If `pipelineAutoApprove` is absent
 * from the saved payload (the case for every 0.3.x user on first
 * upgrade), persist an explicit auto-everywhere map. This:
 *   1. Locks in the user's pre-upgrade behavior — every platform stays
 *      auto-approved even if the future shifts the runtime default.
 *   2. Makes the user's choices visible in the PipelinePanel checkbox
 *      grid instead of hiding them behind undefined-fallback semantics.
 *
 * Idempotent: returns the input unchanged when `pipelineAutoApprove`
 * is already an object (the user has either explicitly configured it
 * or has already been migrated). Safe to run on every load.
 *
 * Returns the input reference unchanged when no migration is needed,
 * so consumers can use referential equality to skip re-renders.
 */
export function applyV040AutoApproveMigration<T extends { pipelineAutoApprove?: AutoApproveMap }>(
  settings: T,
): T {
  if (settings.pipelineAutoApprove !== undefined) return settings;
  return {
    ...settings,
    pipelineAutoApprove: {
      instagram: true,
      pinterest: true,
      twitter: true,
      discord: true,
    },
  };
}

/** Hard timeout error thrown by the per-idea race in usePipelineDaemon. */
export class IdeaTimeoutError extends Error {
  readonly kind = 'timeout' as const;
  constructor() {
    super('__IDEA_TIMEOUT__');
    this.name = 'IdeaTimeoutError';
  }
}
