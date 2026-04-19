# BUG-CRIT-013 — Scheduled content not appearing in Post Ready tab

**Severity:** CRITICAL
**Status:** fixed
**Date:** 2026-04-20

## Summary

After scheduling content — either by approving a pipeline-produced
post or by scheduling directly from a calendar slot — the
`ScheduledPost` was created correctly with `status: 'scheduled'`, but
the underlying `GeneratedImage` was not surfaced in the Post Ready
tab. Users had no way to see their scheduled content in the Post
Ready view, even though the auto-poster would eventually publish it.

## Root cause

The Post Ready filter in `components/MainContent.tsx:1391` is:

```ts
const postReadyImages = useMemo(
  () => savedImages.filter((i) => i.isPostReady === true),
  [savedImages],
);
```

It depends entirely on the `isPostReady` flag, which used to be set
in only three places:

- The "Mark all ready" button in the captioning view
  (`MainContent.tsx:2540`).
- The "Mark Ready" button on a single captioned card
  (`MainContent.tsx:2685`).
- A direct `saveImage({ ...img, isPostReady: true })` in
  `GalleryCard.tsx:362`.

Three scheduling paths bypassed all of them:

1. **`scheduleImage`** (MainContent.tsx:495) — creates a ScheduledPost
   with `status: 'scheduled'` but never touches `isPostReady`.
   Reachable from a calendar slot's inline form when the source image
   is not already in Post Ready.
2. **`scheduleCarousel`** (MainContent.tsx:660) — same shape, for the
   whole-carousel path.
3. **`approveScheduledPost`** (MashupContext.tsx) — flips a pipeline
   post from `pending_approval` to `scheduled` and finalizes the
   pipeline-pending image (clears `pipelinePending`, applies
   watermark) — but does not flip `isPostReady`. So the freshly
   approved image lands in Gallery but not Post Ready, even though
   the user just said "yes, schedule this."

## Fix

### `lib/pipeline-finalize.ts`

`finalizePipelineImage` now accepts a `markPostReady = false`
parameter. When `true`, the returned image carries
`isPostReady: true` alongside the existing `pipelinePending: false`
and the watermarked URL.

### `components/MashupContext.tsx`

`finalizePipelineImagesForPosts(posts, markPostReady)` propagates the
flag both to its synchronous `saveImage` step and to the background
watermark pass. The four call sites are updated:

- `approveScheduledPost` → `markPostReady = true`
- `bulkApproveScheduledPosts` → `markPostReady = true`
- `rejectScheduledPost` → `markPostReady = false` (rejected images
  land in Gallery only — never Post Ready)
- `bulkRejectScheduledPosts` → `markPostReady = false`

This preserves the BUG-DEV-003 contract that rejected pipeline images
still get released from `pipelinePending: true` (so they're not
orphaned in Gallery), while keeping them out of the Post Ready
queue — rejection means "don't post this," and Post Ready is the
"about to post" stage.

### `components/MainContent.tsx`

`scheduleImage` and `scheduleCarousel` now call
`patchImage(img, { isPostReady: true })` for any newly-scheduled
image (skipped for edits, since edits implicitly mean the image is
already in Post Ready). This covers the calendar-slot scheduling
path.

### Status pill (no change needed)

`lib/post-ready-status.ts` already maps `ScheduledPost.status ===
'scheduled'` to a `Scheduled <date> · <time>` pill via
`derivePostReadyStatus`. Once the image makes it into the Post Ready
list, the existing pill rendering does the right thing for free —
hence "Correct status shown (Scheduled with date/time)" comes for
free with the membership fix.

### Tests

Extended `tests/lib/pipeline-finalize.test.ts` with 4 new cases:

- Default (omitted) → no `isPostReady` flag set.
- Explicit `markPostReady: false` → no `isPostReady` flag set.
- `markPostReady: true` → `isPostReady: true` AND `pipelinePending:
  false`.
- `markPostReady: true` survives a successful watermark pass —
  preserves `isPostReady: true` alongside the watermarked URL.

## Out of scope

- The Post Ready filter itself was not broadened to query
  `ScheduledPost.status` — keeping `isPostReady` as the single source
  of truth avoids a parallel filter that the captioning view (which
  filters by `!i.isPostReady`) would also have to learn about.
- `bulkApproveScheduledPosts` / `bulkRejectScheduledPosts` retain
  their existing closure-inside-updater capture pattern. They use one
  `updateSettings` call (not N), so React's eager-state-update
  optimization always fires for them — the BUG-CRIT-012 fix isn't
  needed there. Adding `markPostReady` was a one-line change.
- The auto-poster does not unset `isPostReady` after a successful
  post; the existing posted/failed pill rendering keeps the user's
  view of completed posts intact in Post Ready.

## Verification

- `tsc --noEmit` clean
- `vitest run` — **539 tests pass** (50 files), including the 4 new
  cases in this fix
- Manual: pipeline produces a pending_approval post → user approves →
  image appears in Post Ready with the "Scheduled <date> · <time>"
  pill (was: invisible).
- Manual: user schedules an image directly from a calendar slot →
  image appears in Post Ready with the "Scheduled <date> · <time>"
  pill (was: invisible).
- Manual: user rejects a pipeline post → image lands in Gallery,
  does NOT appear in Post Ready (rejection contract preserved).

## Acceptance criteria check

- [x] Scheduled content visible in Post Ready (every approve / direct-schedule path now flips `isPostReady`)
- [x] Correct status shown (Scheduled with date/time) — `derivePostReadyStatus` already handled this; the membership fix makes it observable
- [x] Inbox written
