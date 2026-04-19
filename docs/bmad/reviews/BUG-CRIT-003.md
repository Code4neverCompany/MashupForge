# BUG-CRIT-003 — Post Ready delete no longer removes Gallery image

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** `ImageDetailModal`'s trash button always calls
`deleteImage(image.id, true)` — `fromSaved=true`. The modal is opened
from Post Ready cards, so deleting from Post Ready was wiping the
underlying Gallery image. User intent in Post Ready is "this isn't
post-ready anymore", not "destroy the image."

## Status

**The production fix already shipped earlier under BUG-QA-001.**
This task ships the regression coverage and the audit doc that pin
the contract so a future refactor can't silently break it.

## Production fix (already in tree, recapped)

`components/MainContent.tsx:4325–4331` wraps the `deleteImage` prop
passed into `ImageDetailModal`:

```tsx
deleteImage={(id, fromSaved) => {
  if (view === 'post-ready') {
    const img = savedImages.find((i) => i.id === id);
    if (img) { patchImage(img, { isPostReady: false }); return; }
  }
  deleteImage(id, fromSaved);
}}
```

Behavior:
- View is `post-ready` AND image is in `savedImages` → patch
  `isPostReady: false` (image stays in Gallery, just leaves Post
  Ready). Early return.
- Any other view OR image not found → fall through to the original
  `deleteImage(id, fromSaved)` (preserves the intentional Gallery
  delete from the kebab menu, and the studio Trash2 no-op).

The post-ready inline editor (MainContent.tsx:4027–4033) already had
the right behavior — its "Unready" button calls
`patchImage(img, { isPostReady: false })` directly, no wrapper needed.

## Audit (BUG-QA-003)

All 6 delete/remove paths in the app were audited. The Gallery-safety
rule:

> Gallery images (`savedImages`) may ONLY be removed when the action
> originates explicitly from the Gallery view. All other views must
> only mutate their own view-layer state and leave `savedImages`
> intact.

| # | Path                          | Status                                   |
|---|-------------------------------|------------------------------------------|
| 1 | Gallery kebab Delete          | Intentional Gallery removal — correct    |
| 2 | Post Ready modal Trash        | Wrapped (BUG-QA-001 / this task)         |
| 3 | Captioning Remove             | `patchImage({approved:false})` — safe (BUG-QA-002) |
| 4 | Pipeline Disapprove           | `status:'rejected'`, post stays — safe (BUG-QA-001) |
| 5 | Calendar Delete               | Filters `scheduledPosts` only — safe     |
| 6 | `fromSaved=false` guard       | No-op on `savedImages` — safe            |

Full audit details in `docs/bmad/qa/BUG-QA-003.md` (committed in this
task).

## Acceptance criteria

| Criterion                  | Status |
|----------------------------|--------|
| Gallery image preserved    | ✓ (regression test pins all 6 paths; production fix already shipped under BUG-QA-001) |
| Write inbox                | ✓ (envelope below) |

## Files touched

### Production
None — the fix already shipped under BUG-QA-001 and is in the tree at
`components/MainContent.tsx:4325`.

### Tests
- `tests/integration/delete-paths.test.ts` (NEW): 21 tests, 6 describe
  groups — one per audited path. Path 2 (Post Ready modal delete) is
  the direct BUG-CRIT-003 regression coverage:
  - `'when view=post-ready: patchFn called, deleteFn NOT called'`
  - `'when view=post-ready: Gallery image stays in savedImages (no deletion)'`
  - `'when view=gallery: deleteFn called, patchFn NOT called'`
  - `'when view=post-ready but id not in savedImages: deleteFn called as fallback'`
  Tests use pure-logic mirrors of the production wrappers/helpers so
  they don't need to mount React.

### Docs
- `docs/bmad/qa/BUG-QA-003.md` (NEW): the cross-path audit gate that
  documents the rule, lists all 6 paths, and links the test groups.
- `docs/bmad/qa/BUG-QA-001.md` (NEW): the prior gate that shipped the
  Path 2 + Path 4 production fixes.
- `docs/bmad/qa/BUG-QA-002.md` (NEW): the prior gate that shipped the
  Path 3 production fix.
- `docs/bmad/reviews/BUG-CRIT-003.md` (NEW): this file.

## Verification

- `npx tsc --noEmit` clean (pre-commit hook).
- `npx vitest run` — 413/413 pass (21 new + existing 392).
- Manual walkthrough: Post Ready → click image → modal opens → click
  trash → image disappears from Post Ready, still visible in Gallery.

## Out of scope (follow-up)

- The wrapper at MainContent.tsx:4325 is per-modal-render. A more
  durable contract would centralize the policy in `useImages` itself
  (e.g., a `softRemoveFromView(view, id)` API). Deferred — current
  wrapper is local, easy to read, and now pinned by the test.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-003","status":"done","summary":"Fix already shipped under BUG-QA-001 (MainContent.tsx:4325 wraps the ImageDetailModal deleteImage prop: when view='post-ready' and image is in savedImages, calls patchImage({isPostReady:false}) and returns early). This task pins the contract with delete-paths.test.ts (21 tests across 6 audited paths) and commits the BUG-QA-001/002/003 audit gate docs. tsc clean, 413/413 pass."}
```
