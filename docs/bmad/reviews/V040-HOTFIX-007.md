---
id: V040-HOTFIX-007
title: V040-HOTFIX-007 — Pipeline images stay out of Gallery until approved + watermarked
status: done
date: 2026-04-18
classification: complex
relates_to: V040-008, V040-HOTFIX-004
---

# V040-HOTFIX-007 — Segregate pipeline-pending images from the Gallery pool

## What was wrong

Before this change, every image the pipeline produced hit `saveImage`
the moment Leonardo finished generating it. That added the image to
`savedImages` — the same pool Gallery renders from — so an un-approved,
un-watermarked pipeline image showed up in Gallery immediately,
alongside finalized user work. Two problems fell out of that:

1. **Gallery was polluted** with work the user hadn't reviewed yet.
2. **Pipeline images were never watermarked.** Manual "pick winner"
   (`useComparison.pickComparisonWinner`) calls `applyWatermark` at
   finalize time, but the pipeline path via `generateComparison`
   skips watermarking entirely. Images landed raw.

The task carved a clean fix: Gallery = finalized + watermarked pool;
pipeline-in-flight images live in a holding state until the user
approves them, at which point the watermark gets applied and the
image is promoted to Gallery.

## What changed

### New field — `types/mashup.ts`

- `GeneratedImage.pipelinePending?: boolean` — when true, Gallery
  filters the image out. Cleared (and watermark applied) on approval.

### New helper — `lib/pipeline-finalize.ts`

- `collectFinalizeTargets(post, images)` returns the pipelinePending
  images an approval should finalize — matching either the post's
  direct `imageId` or (for carousels) any image sharing the post's
  `carouselGroupId`. Images that are no longer pipelinePending are
  skipped (already finalized / never pipeline-origin).
- `finalizePipelineImage(img, watermark, channelName, applyWatermark)`
  clears `pipelinePending` and applies the watermark when enabled.
  Watermark failures are swallowed: the flag-flip still happens, because
  the ScheduledPost has already flipped to `scheduled` and the
  auto-poster may pick it up at any moment. A stuck pipelinePending
  flag would silently lose work.

### `lib/pipeline-processor.ts`

Added `pipelinePending` computation at the top of `processIdea`:

```ts
const willSchedule = autoSchedule && pipelinePlatforms.length > 0;
const pipelinePending =
  willSchedule &&
  resolvePipelinePostStatus(pipelinePlatforms, settings.pipelineAutoApprove) ===
    'pending_approval';
const savePipelineImage = (img) =>
  saveImage(pipelinePending ? { ...img, pipelinePending: true } : img);
```

All four in-processor `saveImage` calls were redirected through
`savePipelineImage`: carousel-mode initial save (line 210), carousel-
mode captioned re-save (line 229), single-mode initial save (line 320),
single-mode captioned re-save (line 336).

Pipelines that auto-schedule (all platforms opt-in) still write images
without `pipelinePending` — they go straight to Gallery, matching
pre-HOTFIX behavior for self-approved work. Pipelines that will gate
on manual approval hold their images out of Gallery until approval.

### `components/MashupContext.tsx`

- `approveScheduledPost` and `bulkApproveScheduledPosts` now also
  finalize the post's images: flag-flip is synchronous (Gallery
  renders the image instantly on approval click); watermark is applied
  in the background and the URL is swapped via `saveImage` when the
  canvas step completes. Best-effort — a failing watermark never
  blocks the approval flow.
- Watermark async path reuses the existing `applyWatermark` helper
  (already imported for comparison finalization).

### `components/MainContent.tsx`

One-line filter in `displayedImages`:

```ts
if (img.pipelinePending === true) return false;
```

Gallery now renders finalized images only.

### `components/PipelinePanel.tsx`

- `ApprovalQueue` now receives `images={savedImages}` instead of
  `images={images}`. The in-memory `images` state is populated only by
  the manual generate flow and never contained pipeline images —
  approval cards were already failing to find them, and this hotfix
  makes the mismatch intolerable (pipelinePending images literally
  live only in savedImages).

## Tests

- NEW `tests/lib/pipeline-finalize.test.ts` (7 tests):
  - `collectFinalizeTargets`: direct imageId match, carousel group
    transitivity, skipping of already-finalized images.
  - `finalizePipelineImage`: watermark applied + flag cleared when
    enabled; flag cleared but URL preserved when disabled / undefined
    watermark; flag still cleared on watermark exception.
- `tests/lib/pipeline-processor.test.ts` (+2 tests):
  - `pipelinePending=true` propagates on every saveImage call when any
    platform requires manual approval.
  - `pipelinePending=undefined` when every platform auto-approves
    (images go straight to Gallery — pre-HOTFIX behavior preserved).

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Pipeline-generated images NOT inserted into Gallery on generation | ✅ `processIdea` sets `pipelinePending: true` when a manual-gate post will be produced; `MainContent.displayedImages` filters them out |
| Images stay in pipeline-only state until approval | ✅ `pipelinePending` persists in IDB via `savedImages`; ApprovalQueue renders them by reading `savedImages` directly |
| On approval: watermark added, then inserted into Gallery | ✅ `MashupContext.approveScheduledPost` calls `finalizePipelineImage`; applies watermark via `applyWatermark` (same helper `pickComparisonWinner` uses); `pipelinePending` flips to false; Gallery renders |
| Gallery shows finalized images only | ✅ `MainContent.displayedImages` filter guarantees this |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Auto-cleanup of rejected pipeline images.** Rejecting a post
  today removes the ScheduledPost but leaves its pipelinePending
  images orphaned in IDB — invisible in Gallery, invisible in the
  approval queue (no post references them), but still on disk. A
  proper GC pass (walk savedImages, drop pipelinePending images with
  no surviving post reference) belongs in a follow-up, not a hotfix.
  Current behavior is safe — orphans don't break anything, they just
  accumulate.
- **Watermarking auto-approved pipeline posts.** When every platform
  opts into auto-approve, the post goes straight to `scheduled` and
  images go straight to Gallery without watermark. The task spec
  explicitly scopes watermarking to the approval event; auto-approved
  posts bypass that event by design. Matching pre-HOTFIX behavior.
- **Threading `applyWatermark` into `pipeline-processor` deps.**
  Would let the pipeline watermark its own auto-approved output,
  but adds a non-trivial dep + a React-only canvas call into pure
  processor code. Kept out.
- **ApprovalQueue component tests.** No jsdom/RTL setup in this
  project; the approval UI hook points (`onApprove`, `onReject`) are
  unchanged and remain covered by their existing call sites.
- **Migration for pre-existing pipeline images.** None needed — no
  existing image has `pipelinePending` set, so the Gallery filter is
  a no-op on every pre-HOTFIX image. New pipeline runs are the only
  code path that writes the flag.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 29 files / 305 tests passing (was 28 / 296; net
  +1 file `pipeline-finalize.test.ts` with 7 tests, +2 tests in
  `pipeline-processor.test.ts`)
- Manual reasoning about the full flow:
  1. User kicks off pipeline → images generate.
  2. Pipeline computes `pipelinePending = true` (at least one
     platform requires manual approval).
  3. Each `savePipelineImage` persists the image with the flag.
  4. Gallery (`MainContent.displayedImages`) filters them out.
  5. `ApprovalQueue` (fed `savedImages`) renders the approval cards.
  6. User clicks Approve → `approveScheduledPost` flips
     `ScheduledPost.status` → `'scheduled'` + `pipelinePending` →
     false on each target image.
  7. Gallery now renders the image (sync flag flip already landed).
  8. Watermark canvas resolves asynchronously, saveImage swaps the
     URL, Gallery re-renders the watermarked version.

## Files touched

- `types/mashup.ts` (+10 lines: new field + docblock)
- `lib/pipeline-finalize.ts` (NEW, ~65 lines)
- `lib/pipeline-processor.ts` (+15 lines for pipelinePending logic; 4
  `saveImage` → `savePipelineImage` swaps)
- `components/MashupContext.tsx` (+40 lines: finalize helper, extended
  approve / bulkApprove; new import)
- `components/MainContent.tsx` (+5 lines: single filter clause with
  inline docblock)
- `components/PipelinePanel.tsx` (~5 lines: pass `savedImages` to
  `ApprovalQueue` instead of ephemeral `images`)
- `tests/lib/pipeline-finalize.test.ts` (NEW, 7 tests)
- `tests/lib/pipeline-processor.test.ts` (+2 tests)
- `docs/bmad/reviews/V040-HOTFIX-007.md` (this file)
