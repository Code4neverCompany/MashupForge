# QA Gate: BUG-QA-004 — Full approval flow audit

**Date:** 2026-04-20
**Status:** PASS
**Tests before:** 413 | **Tests after:** 510 (+97 total, +23 in `tests/integration/approval-flow-audit.test.ts`)

---

## Bugs found and fixed in current codebase (pre-audit fixes by developer)

### BUG-DEV-001: `rejectScheduledPost` had no status guard
**Symptom:** Could silently flip an already-`scheduled`/`posted`/`failed` post to `'rejected'`,
removing it from the auto-poster with no recovery path.  
**Fix (already applied in MashupContext.tsx):** Added `&& p.status === 'pending_approval'`
guard to both the `find` and the `map` in `rejectScheduledPost` and `bulkRejectScheduledPosts`.

### BUG-DEV-003: `rejectScheduledPost` orphaned `pipelinePending` images
**Symptom:** Rejected posts did not call `finalizePipelineImagesForPosts`, leaving
`pipelinePending: true` on the associated image forever — invisible in Gallery with no
approval card to release it.  
**Fix (already applied):** Rejection now calls `finalizePipelineImagesForPosts([rejectedPost])`
so the image is watermarked and surfaced in Gallery (user can delete explicitly if unwanted).

---

## Approval flow: verified paths

### Path 1 — Reject blocks auto-poster ✅
`MainContent.tsx:1188`: `if (post.status !== 'scheduled') continue;`
- Only `'scheduled'` posts are dispatched to social platforms
- `'rejected'`, `'pending_approval'`, `'posted'`, `'failed'` are all skipped
- Bulk-rejected posts also skip the gate

### Path 2 — Reject status guard (BUG-DEV-001) ✅
`MashupContext.tsx rejectScheduledPost`: map guard `p.status === 'pending_approval'`
- Already-`scheduled`/`posted`/`failed` posts are never flipped to `'rejected'`
- Only `pending_approval` entries are affected

### Path 3 — Reject finalizes pipelinePending images (BUG-DEV-003) ✅
`collectFinalizeTargets(post, images)` matches by:
1. `img.id === post.imageId` (direct match)
2. `img.carouselGroupId === post.carouselGroupId` (all carousel siblings)
Finalization clears `pipelinePending: false` and applies the watermark.

### Path 4 — Approve-all carousel: ALL images approved + finalized ✅
`CarouselApprovalCard.approveRemaining()` loops over all `liveImages` where
`statuses[img.id] ?? 'pending' === 'pending'`. Since React batches state updates,
`localStatus` hasn't changed when the synchronous loop runs — all images pass the
check and `approveImage` is called for each. Each call fires `approveScheduledPost(postId)`.

For `finalizePipelineImagesForPosts`: the **first** approval for any post in the carousel
group triggers `collectFinalizeTargets` with `carouselGroupId` matching, finding ALL
sibling images. They're all watermarked and `pipelinePending: false` in one batch.
Subsequent approvals in the loop find no remaining `pipelinePending` images — correct,
not a bug.

### Path 5 — Watermark on approve ✅
`finalizePipelineImage(img, watermark, channelName, applyWatermark)`:
- `watermark.enabled=true` → applies watermark, clears `pipelinePending`
- `watermark.enabled=false` → skips watermark, still clears `pipelinePending`
- Watermark failure → keeps original URL, clears `pipelinePending`, warns to console

### Path 6 — Mixed approve/reject carousel ✅
- Approved posts (→`'scheduled'`) reach the auto-poster
- Rejected posts (→`'rejected'`) are blocked by the auto-poster gate
- Rejected images in a mixed carousel still get `pipelinePending` cleared (BUG-DEV-003 fix)

---

## Integration tests — `tests/integration/approval-flow-audit.test.ts` (23 tests)

| Group | Tests |
|---|---|
| 4.1 — Reject blocks auto-poster | 4 |
| 4.2 — Reject status guard (BUG-DEV-001) | 4 |
| 4.3 — Reject finalizes pipelinePending (BUG-DEV-003) | 3 |
| 4.4 — Approve-all carousel | 5 |
| 4.5 — Watermark on approve | 4 |
| 4.6 — Mixed approve/reject | 3 |

---

## Acceptance criteria

| Criterion | Result |
|---|---|
| Reject blocks posting (integration test) | PASS — auto-poster gate verified, 4 tests |
| Approve-all approves ALL carousel images | PASS — approveRemaining + collectFinalizeTargets verified |
| All images watermarked on approve | PASS — finalizePipelineImage + carousel batch verified |
| Write inbox | PASS |
