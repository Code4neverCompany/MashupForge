# QA Gate: BUG-QA-001 — Post Ready delete + Disapprove content visibility

**Date:** 2026-04-19
**Status:** PASS
**Tests before:** 391 passing | **Tests after:** 391 passing

---

## Bug 1: Post Ready delete removed Gallery image

### Root cause
`ImageDetailModal` has a delete button that always calls `deleteImage(id, true)`.
The modal is opened from Post Ready cards (`onClick={() => setSelectedImage(img)}`).
`deleteImage` removes the image from `savedImages` entirely, killing the Gallery entry.

### Fix — `components/MainContent.tsx`
Wrapped the `deleteImage` prop passed to `ImageDetailModal`. When `view === 'post-ready'`
and the image exists in `savedImages`, the wrapper calls `patchImage(img, { isPostReady: false })`
(unready only) and returns early. All other views fall through to `deleteImage` unchanged.

```tsx
deleteImage={(id, fromSaved) => {
  if (view === 'post-ready') {
    const img = savedImages.find((i) => i.id === id);
    if (img) { patchImage(img, { isPostReady: false }); return; }
  }
  deleteImage(id, fromSaved);
}}
```

The "Unready" button in the Post Ready grid already called `patchImage(img, { isPostReady: false })`
correctly — only the modal delete path was broken.

---

## Bug 2: Disapprove made content vanish

### Root cause
`rejectScheduledPost` and `bulkRejectScheduledPosts` in `MashupContext.tsx` used
`.filter()` to remove the post entirely from `scheduledPosts`. Content disappeared
from all views with no recovery path (short of the undo toast).

### Fix — `components/MashupContext.tsx`
Changed both functions to `.map()` + set `status: 'rejected'`. The post remains in
`scheduledPosts` but is excluded from the approval queue filter (`p.status === 'pending_approval'`)
and from active scheduling/fill counts.

```typescript
// rejectScheduledPost
scheduledPosts: prev.scheduledPosts.map((p) =>
  p.id === postId ? { ...p, status: 'rejected' as const } : p
)

// bulkRejectScheduledPosts
scheduledPosts: prev.scheduledPosts.map((p) =>
  idSet.has(p.id) ? { ...p, status: 'rejected' as const } : p
)
```

### Type changes — `types/mashup.ts`
Added `'rejected'` to `ScheduledPost.status` union:
```typescript
status?: 'pending_approval' | 'scheduled' | 'posted' | 'failed' | 'rejected';
```

### Terminal-status guards — 3 lib files
`'rejected'` is a terminal status (like `'posted'` and `'failed'`). Added it to the skip
conditions in all three places that gate on terminal status:

- `lib/pipeline-daemon-utils.ts:93` — `countFutureScheduledPosts`
- `lib/weekly-fill.ts:79` — `computeWeekFillStatus`
- `lib/smartScheduler.ts:275, 295` — `buildPerDayPlatformCounts` + `buildPerDayCounts`

---

## Acceptance criteria

| Criterion | Result |
|---|---|
| Post Ready delete preserves Gallery image | PASS — wrapper calls patchImage({isPostReady:false}) |
| Rejected content stays visible | PASS — status set to 'rejected', not removed |
| Write inbox | PASS |
