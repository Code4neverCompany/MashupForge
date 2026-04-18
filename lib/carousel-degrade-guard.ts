/**
 * V040-HOTFIX-002: degrade-guard for the carousel approval card.
 *
 * Carousels must hold at least two images to remain a carousel; the
 * auto-poster rejects a one-image "carousel" outright. This helper
 * answers "may the user reject one more image right now?" so the UI
 * can disable per-image reject controls before the user paints
 * themselves into a one-image corner.
 *
 * The whole-carousel reject path is intentionally NOT gated by this
 * helper — that's an explicit "kill the whole group" action, not an
 * accidental degrade.
 */

export const CAROUSEL_MIN_IMAGES = 2;

/**
 * Returns true when one more per-image reject is allowed without
 * dropping the carousel below the minimum image count.
 *
 * `nonRejectedCount` is the number of images currently in `pending`
 * or `approved` state (i.e. images still part of the carousel).
 */
export function canRejectMoreInCarousel(nonRejectedCount: number): boolean {
  return nonRejectedCount > CAROUSEL_MIN_IMAGES;
}
