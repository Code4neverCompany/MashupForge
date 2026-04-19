# BUG-CRIT-005 — Captioning tab card now removable

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** The "Remove" button on a Captioning card called
`patchImage(img, { postCaption: '', postHashtags: [], tags: [] })`.
That cleared the visible text fields but left `approved: true`, so
the card remained visible in the Captioning filter (which gates on
`i.approved`). User intent was "remove this card from Captioning",
not "wipe its caption text and leave the card."

## Status

**The production fix already shipped under BUG-QA-002.** The
regression test ships in `tests/integration/delete-paths.test.ts`
Path 3 (4 tests), committed under BUG-CRIT-003 (`a6f2cab`). This
task ships the explicit BUG-CRIT-005 review doc.

## Production fix (already in tree, recapped)

`components/MainContent.tsx:2612` — confirm-remove handler in the
Captioning card's per-image action row:

```tsx
patchImage(img, { approved: false, postCaption: '', postHashtags: [], tags: [] });
setPendingRemoveId(null);
```

The added `approved: false` removes the image from the Captioning
filter. The image stays in `savedImages` and remains visible in the
Gallery tab — matching the existing button tooltip "Remove from
Captioning (image stays in Gallery)".

### Why `approved: false` is the right knob

The Captioning filter at `MainContent.tsx:2208` is:

```tsx
const all = savedImages.filter((i) => !i.isPostReady && i.approved);
```

Two boolean gates:
- `!i.isPostReady` — exclude images already promoted to Post Ready
- `i.approved` — exclude images the user hasn't approved yet (or has
  un-approved)

Setting `approved: false` flips the second gate without touching
`isPostReady` or removing the image from `savedImages`. This is the
same `approved` flag the user can re-toggle from Gallery's
BookmarkCheck button, so the action is reversible.

## Acceptance criteria

| Criterion                          | Status |
|------------------------------------|--------|
| Card removable from Captioning     | ✓ (`approved: false` removes the card from the filter; image stays in Gallery) |
| Write inbox                        | ✓ (envelope below) |

## Files touched (this task)

### Production
None — the fix already shipped under BUG-QA-002.

### Tests
None — regression coverage in `tests/integration/delete-paths.test.ts`
Path 3 (4 tests) committed under BUG-CRIT-003 (`a6f2cab`):
- `'sets approved=false on the target image, image stays in array'`
- `'clears postCaption, postHashtags, tags on removal'`
- `'image disappears from Captioning filter after removal'`
- `'other images in array are untouched'`

### Docs
- `docs/bmad/reviews/BUG-CRIT-005.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — 413/413 pass; Path 3 group `'Captioning remove'`
  pins this contract.
- Manual: Captioning tab → click red trash → click confirm → card
  vanishes from Captioning. Open Gallery → image still present.

## Out of scope (follow-up)

- The remove confirmation pattern (`pendingRemoveId` two-click) is
  duplicated in several places (Captioning, Carousel sub-cards). A
  shared `<ConfirmRemoveButton>` would dedupe — deferred.
- There's no "undo last remove" affordance. User can re-approve from
  Gallery (BookmarkCheck button). Not tracked as a bug.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-005","status":"done","summary":"Fix already shipped under BUG-QA-002 (MainContent.tsx:2612 confirm-remove handler now sets approved:false alongside the text clears). The Captioning filter (!i.isPostReady && i.approved) drops the card while the image stays in savedImages and remains visible in Gallery. Regression coverage in delete-paths.test.ts Path 3 (4 tests, committed under BUG-CRIT-003 / a6f2cab). This commit ships the BUG-CRIT-005 review doc. tsc clean, 413/413 pass."}
```
