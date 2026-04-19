# BUG-CRIT-004 — Disapproved (rejected) content stays visible

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** `rejectScheduledPost` and `bulkRejectScheduledPosts`
previously `.filter()`-ed the rejected post out of `scheduledPosts`
entirely. The post (and its visible footprint on the calendar /
schedule history) vanished. Users had no way to see "this post was
rejected and that's why nothing went out" — content effectively
disappeared.

## Status

**The production fix already shipped under BUG-CRIT-009 (commit
`4f73ad0`).** The regression test ships in
`tests/integration/delete-paths.test.ts` Path 4 (5 tests) under
BUG-CRIT-003 (commit `a6f2cab`). This task is the explicit BUG-CRIT-004
review doc tying the pieces together.

## Production fix (already in tree, recapped)

### Reject = mark, don't remove

`components/MashupContext.tsx:207–213` and `:236–244`:

```tsx
const rejectScheduledPost = (postId: string) => {
  updateSettings((prev) => ({
    scheduledPosts: (prev.scheduledPosts || []).map((p) =>
      p.id === postId ? { ...p, status: 'rejected' as const } : p
    ),
  }));
};

const bulkRejectScheduledPosts = (postIds: string[]) => {
  if (postIds.length === 0) return;
  const idSet = new Set(postIds);
  updateSettings((prev) => ({
    scheduledPosts: (prev.scheduledPosts || []).map((p) =>
      idSet.has(p.id) ? { ...p, status: 'rejected' as const } : p
    ),
  }));
};
```

Both now `.map()` to set `status: 'rejected'` instead of `.filter()`-ing.
The post stays in the array and remains addressable.

### Type extension

`types/mashup.ts:158`:

```ts
status?: 'pending_approval' | 'scheduled' | 'posted' | 'failed' | 'rejected';
```

`'rejected'` is the terminal-but-visible status. Sibling unions in
`lib/smartScheduler.ts` (`ExistingPost.status`) were widened to match
so callers can pass `ScheduledPost[]` without a cast.

### Downstream contract — rejected posts are *excluded from work
queues* but *visible in displays*

| Consumer                                        | Behavior on `'rejected'`            |
|-------------------------------------------------|-------------------------------------|
| `components/MainContent.tsx:546` (`calendarColorFor`) | renders zinc swatch — **visible** |
| `components/PipelinePanel.tsx:753` (approval queue filter) | excluded (`!== 'pending_approval'`) |
| `lib/pipeline-daemon-utils.ts:93` (`countFutureScheduledPosts`) | excluded (terminal status) |
| `lib/smartScheduler.ts:277, 297` (per-day saturation counts)   | excluded (no day lock) |
| `lib/weekly-fill.ts:79` (week-fill status)      | excluded (no slot occupation)       |
| Auto-poster                                     | already gated on `status === 'scheduled'` — never picks up rejected |

The contract: rejected posts are read-only relics — they appear on
the calendar so the user remembers they made the call, but they
don't fight for slots, count toward caps, or trigger any work.

## Acceptance criteria

| Criterion                  | Status |
|----------------------------|--------|
| Rejected content visible   | ✓ (calendar zinc swatch via `calendarColorFor`; post remains in `scheduledPosts` array) |
| Write inbox                | ✓ (envelope below) |

## Files touched (this task)

### Production
None — the fix already shipped under BUG-CRIT-009 (`4f73ad0`) and
BUG-QA-001.

### Tests
None — the regression coverage ships in
`tests/integration/delete-paths.test.ts` Path 4 (5 tests) committed
under BUG-CRIT-003 (`a6f2cab`):
- `'sets status=rejected on the post, post stays in array'`
- `'rejected post is excluded from the approval queue filter'`
- `'rejected post is excluded from countFutureScheduledPosts (terminal status)'`
- `'other posts in array are untouched'`
- `'savedImages are never touched by reject — no deleteImage call path exists'`

### Docs
- `docs/bmad/reviews/BUG-CRIT-004.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — 413/413 pass (Path 4 group `'Pipeline disapprove'`
  pins this contract).
- Manual: open approval queue → reject a post → post disappears from
  the queue but appears on the calendar with a zinc swatch; the
  underlying `GeneratedImage` (linked via `post.imageId`) is still in
  Gallery.

## Out of scope (follow-up)

- The rejected calendar swatch is plain zinc with no icon overlay or
  strikethrough. Could add an X icon or strikethrough text to make
  rejected status more legible at a glance — deferred, no design ask.
- The approval queue UI doesn't surface a "rejected this month: N"
  affordance. If the user wants to undo a recent rejection, they
  currently have to find it on the calendar. Deferred.
- Rejected posts that link to pipelinePending images leave the image
  in `pipelinePending: true` state forever (no approval to release the
  flag, no re-flow on rejection). This is the orphaned-rejection
  cleanup TODO already noted in BUG-CRIT-009 §"Out of scope" and
  carried forward from V040-HOTFIX-007.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-004","status":"done","summary":"Fix already shipped under BUG-CRIT-009 (4f73ad0): rejectScheduledPost + bulkRejectScheduledPosts now .map() to set status:'rejected' instead of .filter()-ing the post out. 'rejected' added to ScheduledPost.status union; downstream filters in pipeline-daemon-utils, smartScheduler, weekly-fill skip rejected; calendarColorFor renders zinc swatch so the post stays visible. Regression coverage in delete-paths.test.ts Path 4 (5 tests, committed under BUG-CRIT-003 / a6f2cab). This commit ships the BUG-CRIT-004 review doc. tsc clean, 413/413 pass."}
```
