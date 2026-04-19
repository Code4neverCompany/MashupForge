# BUG-DEV-003 — rejection now finalizes pipelinePending images

**Status:** done
**Classification:** complex (design call + implementation)
**Severity:** medium
**Why:** `rejectScheduledPost` and `bulkRejectScheduledPosts` flipped
post status to 'rejected' but never called
`finalizePipelineImagesForPosts`. Pipeline-generated `GeneratedImage`s
have `pipelinePending: true` set by `processIdea`, which Gallery
filters out. Without a finalize call on reject, the image became an
invisible orphan — not in Gallery, not deletable from any UI, stuck
in IDB forever.

Found during the V050-009 static-analysis pass and filed with three
candidate fix shapes. This task makes the design call and implements it.

## Design call

Three shapes were on the table in `docs/bmad/qa/V050-009-status-check.md`:

- **(A) Reject deletes the underlying image.** Cleanest "throw away"
  semantics but irreversible and risky if the same image is referenced
  by multiple posts.
- **(B) Reject calls `finalizePipelineImagesForPosts` (mirror approve).**
  Image lands in Gallery (watermarked); user can delete manually.
- **(C) New "Rejected" panel** with review/delete controls. Most work,
  most new UI.

**Chose (B).** Reasons:

1. **Preserves compute investment.** Generation already paid for — the
   asset exists on disk/IDB regardless. Deleting on reject throws away
   work the user might want later.
2. **Avoids accidental data loss.** Reject is a one-click action in a
   batch flow; making it destructive is asymmetric to approve (also
   one-click, preserves). Destructive actions should require a second
   confirmation (which is what Gallery's delete gives us for free).
3. **Mirrors the approve flow.** Same code path, same guarantees, same
   watermark treatment. The ScheduledPost status diverges
   (scheduled vs rejected) but the underlying image lifecycle is
   identical. Less surface for bugs.
4. **No new UI.** (C) would be a new surface, new state shape, new
   tests — not worth the complexity when Gallery already knows how to
   render and delete images.
5. **Reversibility.** If the user changes their mind, the image is
   there. Re-scheduling creates a NEW ScheduledPost with
   status='pending_approval'; the old rejected post stays around in
   settings (harmless, auto-poster ignores it).

**Trade-off accepted:** rejected images get watermarked. The user said
"don't post", so watermarking is technically wasted. But the watermark
is cheap (canvas op) and the user might later repurpose the image for
manual use where the watermark is useful anyway.

## Fix

`components/MashupContext.tsx` — both reject paths now mirror the
approve pattern: capture the actually-rejected posts inside the
`updateSettings` callback, then call
`finalizePipelineImagesForPosts` on them after the state update.

```tsx
const rejectScheduledPost = (postId: string) => {
  let rejectedPost: ScheduledPost | undefined;
  updateSettings((prev) => {
    rejectedPost = (prev.scheduledPosts || []).find(
      (p) => p.id === postId && p.status === 'pending_approval',
    );
    return {
      scheduledPosts: (prev.scheduledPosts || []).map((p) =>
        p.id === postId && p.status === 'pending_approval'
          ? { ...p, status: 'rejected' as const }
          : p
      ),
    };
  });
  if (rejectedPost) finalizePipelineImagesForPosts([rejectedPost]);
};
```

Bulk variant mirrors `bulkApproveScheduledPosts` — `.filter()` instead
of `.find()`, batch call to finalize.

### Why the status guard + finalize combo is correct

The BUG-DEV-001 status guard and the BUG-DEV-003 finalize work
together. Without the guard, reject would finalize images for
posts that had already been scheduled / posted (double-finalize is
safe because `collectFinalizeTargets` filters by `pipelinePending === true`,
but it's wasted work). Without the finalize, the guard is correct but
the image is orphaned.

With both:
- Status-correct pending_approval posts → flipped to rejected AND
  their pipelinePending images are released to Gallery.
- Non-pending posts → no status change, no finalize, no side effects.

### Double-reject safety

If the user rejects a post twice in quick succession (e.g. fat-finger,
race condition), the second reject sees status='rejected' from the
first pass and skips via the status guard — so it also skips the
finalize call. No double-watermark, no duplicate work. The
`'idempotence'` test group in the regression suite pins this.

### Carousel siblings

A carousel post's `collectFinalizeTargets` returns ALL sibling images
in the same `carouselGroupId` (not just `post.imageId`). Rejecting one
carousel post therefore releases every image in the carousel from
pipeline limbo. This matches the approve flow's semantics — if the
user rejects the carousel, the whole asset group goes to Gallery
together.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Rejected pipeline images handled correctly | ✓ (both singular and bulk reject paths now finalize, matching approve) |
| No orphans | ✓ (pipelinePending images released to Gallery on reject; idempotent; carousel-aware) |
| Write inbox | ✓ (envelope below) |

## Files touched

### Production
- `components/MashupContext.tsx`:
  - `rejectScheduledPost` (lines ~219-235): capture rejectedPost inside
    the updater, call finalize after. +docblock.
  - `bulkRejectScheduledPosts` (lines ~250-271): same pattern for
    the batch case. +docblock.
  - Net: +14 LOC across the two handlers.

### Tests
- `tests/integration/reject-finalize.test.ts` (NEW, 10 tests):
  - Singular reject (5 tests): pending forwards to finalize;
    status-guarded non-pending does NOT; unmatched id does NOT;
    finalize target resolution hits the underlying image; carousel
    siblings released together.
  - Bulk reject (3 tests): mixed-status batch only forwards pending;
    empty-id-set no-op short-circuit; multiple carousel rejections
    collect all unique sibling images.
  - Idempotence (2 tests): re-rejecting an already-rejected post (both
    singular and bulk) returns `toFinalize=[]` — the status guard
    handles double-reject safely.

  Logic-mirror pattern (same as BUG-DEV-001 / BUG-DEV-002): no renderHook
  needed because the contract is purely about which posts get captured
  for finalize. The finalize plumbing itself is already covered by
  `approval-gate-watermark.test.ts`.

### Docs
- `docs/bmad/reviews/BUG-DEV-003.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/reject-finalize.test.ts` —
  10/10 pass in isolation.
- `npx vitest run` — full suite green via pre-commit hook.

## Out of scope (follow-up)

- **BUG-DEV-004 (silent watermark failure logging)** is adjacent — the
  fire-and-forget `Promise.all` inside `finalizePipelineImagesForPosts`
  swallows errors. Reject + BUG-DEV-004 would both benefit from a
  shared `.catch` that surfaces watermark failures. Leaving to the
  next dispatch since it's a cross-cutting concern, not a reject-
  specific one.
- **Redundant finalize on a post whose image was already finalized via
  a sibling** — if a carousel has two pending posts pointing at the
  same group, approving one finalizes all siblings; then rejecting the
  second post re-runs the watermark on already-watermarked images.
  `collectFinalizeTargets` filters by `pipelinePending === true`, so
  this is a no-op in practice (the second call's target list is
  empty). Non-issue, documenting for the next person to audit this
  path.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-DEV-003","status":"done","summary":"Design call: picked Option B (reject finalizes like approve) over delete-the-asset (A) or new Rejected panel (C) — preserves compute investment, avoids accidental loss, mirrors approve's code path. Both reject paths now capture the actually-rejected posts inside updateSettings and call finalizePipelineImagesForPosts after, same pattern as bulkApprove. Carousel siblings are released as a group. Double-reject is idempotent via the BUG-DEV-001 status guard. 10 logic-mirror regression tests across singular/bulk/idempotence groups. tsc clean, 454/454 pass."}
```
