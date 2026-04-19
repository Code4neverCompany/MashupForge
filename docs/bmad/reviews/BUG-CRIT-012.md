# BUG-CRIT-012 — Carousel approve-all only finalizes the first image

**Severity:** CRITICAL
**Status:** fixed
**Date:** 2026-04-20

## Summary

Clicking **Approve carousel** on a pipeline carousel card (3+ images
sharing one `carouselGroupId`) flipped every sibling's
`ScheduledPost.status` to `'scheduled'` correctly, but only the first
image actually got finalized: image #1 landed in Gallery (watermark
applied, `pipelinePending: false`), and images #2..N were silently
left as `pipelinePending: true` (hidden from Gallery, no watermark).

Same shape on **Reject carousel** — only the first image was released
to Gallery; the rest stayed orphaned. Individual per-image approve and
the bulk-select approval action were not affected.

## Root cause

Two compounding issues. The carousel-specific symptom is the second.

### 1. Closure-inside-updater + React's eager-state-update optimization

Old shape in `components/MashupContext.tsx`:

```ts
const approveScheduledPost = (postId: string) => {
  let approvedPost: ScheduledPost | undefined;
  updateSettings((prev) => {
    approvedPost = (prev.scheduledPosts || []).find(
      (p) => p.id === postId && p.status === 'pending_approval',
    );
    return { scheduledPosts: prev.scheduledPosts.map(...) };
  });
  if (approvedPost) finalizePipelineImagesForPosts([approvedPost]);
};
```

React's `useState` setter optimizes via "eager state update": when the
fiber's update queue is **empty**, the functional updater is invoked
synchronously to compute the next state. When the queue is **non-
empty**, the updater is deferred to the render phase.

Single click: queue empty → updater runs eagerly → `approvedPost` set →
`if (approvedPost) finalize(...)` fires. Works.

Carousel approve-all: `CarouselApprovalCard.approveRemaining` fans out
N back-to-back `approveScheduledPost(postId)` calls. Call 1 enqueues
an update — eager-eval succeeds. Call 2 sees a non-empty queue →
eager-eval bails → updater is queued → `approvedPost` stays
`undefined` when the synchronous `if` line runs immediately after.
Same for call 3. Result: only call 1's `finalizePipelineImagesForPosts`
fires.

This is documented in React source under `dispatchSetState` /
`hasEagerState`. It's an optimization, not a contract — relying on it
is the bug.

### 2. Status flip vs. finalize are different code paths

`updateSettings`'s functional updater eventually runs (during render
prep), so the `status: 'scheduled'` flip lands for all N posts —
that's why the user sees the carousel "approved" but later notices the
images never appeared in Gallery and went out unwatermarked. Status
and finalize had drifted apart.

## Fix

### `lib/approval-actions.ts` (new)

Two pure helpers — `planApproveScheduledPost(posts, postId)` and
`planRejectScheduledPost(posts, postId)` — return
`{ toFinalize, nextPosts }`. Read-side and update-side are split:

- `toFinalize` is computed from the snapshot the caller already has
  (the React `settings` closure, captured at render time).
- `nextPosts(current)` is the functional updater, applied inside
  `updateSettings((prev) => ...)`. It uses the `p.status === 'pending_approval'`
  guard so chained queued updates remain correct (only the first
  approve in a chain flips status; subsequent ones are no-ops).

### `components/MashupContext.tsx`

`approveScheduledPost` and `rejectScheduledPost` now call the helpers
**before** `updateSettings`. The toFinalize array is captured against
the rendered `settings.scheduledPosts` (closure-stable across the
back-to-back calls), so each of N sibling calls produces its own
finalize work — no longer dependent on React's eager-eval timing.

```ts
const approveScheduledPost = (postId: string) => {
  const { toFinalize, nextPosts } = planApproveScheduledPost(
    settings.scheduledPosts || [],
    postId,
  );
  if (toFinalize.length === 0) return;
  updateSettings((prev) => ({
    scheduledPosts: nextPosts(prev.scheduledPosts || []),
  }));
  finalizePipelineImagesForPosts(toFinalize);
};
```

### Tests

`tests/lib/approval-actions.test.ts` — 11 tests:

- Status guards (only `pending_approval` is acted on; idempotent
  double-click for `scheduled` / `posted` / `rejected`).
- `nextPosts` flips only the targeted post and is idempotent against
  already-flipped state.
- **The regression invariant**: three sequential calls against one
  snapshot must each return their own `toFinalize` (matches the React
  rendered-snapshot pattern that the production fix uses).
- Chained `nextPosts` updaters compose left-to-right correctly,
  matching React's queued-updater order — three approves in a row
  land all three siblings as `scheduled`.

## Out of scope

- The `bulkApproveScheduledPosts` / `bulkRejectScheduledPosts` paths
  use a single `updateSettings` call, so they were not affected by the
  closure-timing bug. They still use the inside-updater capture
  pattern; that pattern is safe for single-call paths because eager-
  eval always fires when the queue is empty. Left untouched to keep
  this fix minimal — the helpers are available if a future refactor
  wants to unify them.
- `collectFinalizeTargets` traversal: the carousel-group-id branch
  exists but is dormant for pipeline-produced images (the pipeline
  sets `carouselGroupId` on the `ScheduledPost`, not on the
  `GeneratedImage`). Each per-post finalize correctly targets only its
  own image — N approve calls produce N finalizes for N images. No
  change needed.

## Verification

- `tsc --noEmit` clean
- `vitest run` — **535 tests pass** (50 files), including the 11 new
  unit tests in this fix
- Manual: pipeline produces a 3-image carousel → user clicks **Approve
  carousel** → all three ScheduledPosts flip to `scheduled`, all three
  GeneratedImages clear `pipelinePending: false` and appear in
  Gallery, all three are watermarked.
- Manual: same scenario for **Reject carousel** → all three land in
  Gallery (watermarked) with their ScheduledPosts at `rejected`.

## Acceptance criteria check

- [x] Approve-all approves ALL images in carousel (status flip + finalize for every sibling)
- [x] All images get watermarked (every finalize call runs the watermark pass)
- [x] Consistent with individual approve behavior (singleton path was already correct on its own; the loop path now matches)
- [x] Inbox written
