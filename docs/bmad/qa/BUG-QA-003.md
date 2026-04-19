# QA Gate: BUG-QA-003 — Audit all delete/remove actions for Gallery safety

**Date:** 2026-04-19
**Status:** PASS
**Tests before:** 392 | **Tests after:** 413 (+21 new in `tests/integration/delete-paths.test.ts`)

---

## Audit Rule

Gallery images (`savedImages`) may ONLY be removed when the action originates
explicitly from the Gallery view. All other views must only mutate their own
view-layer state and leave `savedImages` intact.

---

## Path Audit (6 paths)

### Path 1 — Gallery kebab delete ✅ INTENTIONAL
- `GalleryCard.tsx:434`: `deleteImage(id, true)` — `fromSaved=true` → removes from `savedImages`
- This is the one intentional Gallery delete. Correct.

### Path 2 — Post Ready modal delete ✅ FIXED (BUG-QA-001)
- `ImageDetailModal.tsx:423`: `deleteImage(image.id, true)` — previously removed from Gallery
- Fixed: `MainContent.tsx` wraps the prop; when `view === 'post-ready'`, calls
  `patchImage(img, { isPostReady: false })` and returns early. `deleteImage` never reached.
- Fallback: if image not in `savedImages`, wrapper falls through to `deleteImage` as before.

### Path 3 — Captioning remove ✅ FIXED (BUG-QA-002)
- `MainContent.tsx:2633`: previously called `patchImage({ postCaption:'', ... })` — only cleared text,
  card stayed visible in Captioning.
- Fixed: now calls `patchImage({ approved: false, postCaption: '', postHashtags: [], tags: [] })`.
  Setting `approved=false` removes the card from the Captioning filter (`!i.isPostReady && i.approved`),
  while the image remains in `savedImages` and is visible in Gallery.

### Path 4 — Pipeline disapprove ✅ FIXED (BUG-QA-001)
- `MashupContext.tsx:207,234`: `rejectScheduledPost` and `bulkRejectScheduledPosts`
  previously `.filter()`-ed out posts entirely (content vanished from all views).
- Fixed: now `.map()` + `status: 'rejected'`. Post stays in `scheduledPosts`;
  not shown in approval queue (`pending_approval` filter), not counted in scheduling
  (`rejected` added to terminal-status guard in 3 lib files).
- `savedImages` is never touched by this path — confirmed in tests.

### Path 5 — Calendar delete ✅ SAFE
- `MainContent.tsx:3016`: `scheduledPosts.filter(sp => sp.id !== editing.id)`
- Removes the `ScheduledPost` entry (the schedule record), NOT the underlying Gallery image.
- `savedImages` is untouched. Correct behavior — user is canceling a scheduled post.

### Path 6 — `fromSaved=false` guard ✅ SAFE
- `GalleryCard.tsx:373` (studio Trash2 button): `deleteImage(img.id, false)` — no-op.
- `GalleryCard.tsx:160` (Dismiss failed image in studio): `deleteImage(img.id, view==='gallery')`
  → `fromSaved=false` in non-gallery view → no-op.
- `useImages.deleteImage(id, false)` never touches `savedImages`.

---

## Integration tests — `tests/integration/delete-paths.test.ts` (21 tests)

| Group | Tests |
|---|---|
| Path 1 — Gallery kebab delete | 2 |
| Path 2 — Post Ready modal delete | 4 |
| Path 3 — Captioning remove | 4 |
| Path 4 — Pipeline disapprove | 5 |
| Path 5 — Calendar delete | 3 |
| Path 6 — fromSaved=false guard | 3 |

---

## Acceptance criteria

| Criterion | Result |
|---|---|
| Every delete path audited | PASS — 6 paths documented |
| Gallery images only deleted from Gallery view | PASS — all other paths verified safe |
| Integration tests for each delete path | PASS — 21 tests, all green |
| Write inbox | PASS |
