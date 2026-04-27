# QA Review Prep — QOL-P1 Sprint (Quinn)

**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Sprint:** QoL P1 — collection badge, batch add to collection, smart bulk select
**Status:** PREP — awaiting QOL-P1-DESIGN DONE signal from Designer

---

## Baseline Scan (pre-review)

| Item | File | Baseline state |
|---|---|---|
| P1-A | `components/GalleryCard.tsx` | **COMMITTED** — `1039e04` (QOL-FE01) |
| P1-B | `components/GalleryCard.tsx`, `components/GalleryFilterBar.tsx`, `components/MainContent.tsx` | Not yet — "Collection" button exists but creates NEW collection only |
| P1-C | `components/GalleryFilterBar.tsx` | Not yet — "Select All" + "Clear" exist; smart filter links missing |

**Known pre-existing state in batch bar (`GalleryFilterBar.tsx`):**
- Count badge, Post Ready, Caption, Animate, Tag, "Collection" (→ `onBatchCreateCollection` = new collection), Delete, Select All, Clear

---

## P1-A Review Checklist — Collection Badge on GalleryCard

**File:** `components/GalleryCard.tsx` + `tests/components/GalleryCard.test.tsx`
**Commit to review:** `1039e04`

### Visual / Structure
- [ ] Gold pill is bottom-left, inside image wrapper, above model chips (`absolute bottom-9 left-2 z-[5]`)
- [ ] Only renders when `img.collectionId` is set
- [ ] Orphan collectionId (collection deleted) → renders nothing (no crash, no ghost label)
- [ ] Collection name truncated to 12 chars with `…`
- [ ] Icon: `FolderOpen` lucide, `w-2.5 h-2.5` (≈10px)
- [ ] Font: `text-[9px] font-bold uppercase tracking-wide`
- [ ] Colors: `bg-[#c5a062]/15 text-[#c5a062] border border-[#c5a062]/40 rounded-full`
- [ ] Backdrop blur applied (`backdrop-blur-md`)

### Interaction States
- [ ] Default: `opacity-80`
- [ ] Card hover: `group-hover:opacity-100` and `transition-opacity`
- [ ] ⚠️ SPEC GAP: `scale-1.02` on hover NOT implemented — pill only changes opacity (WARN)
- [ ] ⚠️ SPEC GAP: `dragOverCollection` active → pill should pulse `ring-1 ring-[#00e6ff]` — not implemented (card-level ring changes, pill does not pulse) (WARN)
- [ ] `pointer-events-none select-none` (pill does not intercept clicks)

### Dark-theme Compliance
- [ ] Gold on zinc-900 WCAG AA at 9px bold — passes per spec (verify visually)
- [ ] Does not use `text-zinc-400` (would disappear on dark card)
- [ ] No pure white backgrounds

### Tests
- [ ] Test: badge renders when `img.collectionId` set + valid collection
- [ ] Test: badge hidden when `img.collectionId` not set
- [ ] Test: badge hidden when `img.collectionId` is orphan (collection deleted)
- [ ] Test: long name truncated to 12 chars with `…`
- [ ] All 828 tests passing (`npm run test`)

---

## P1-B Review Checklist — Batch Add to Collection

**File:** `components/GalleryFilterBar.tsx` + `components/MainContent.tsx`

### Batch Bar Integration
- [ ] "Collection ▾" button visible when `selectedForBatch.size > 0`
- [ ] Button style: `bg-zinc-800 hover:bg-zinc-700 text-white` (matches other batch buttons)
- [ ] Active/open state: `bg-[#c5a062]/10 text-[#c5a062] border border-[#c5a062]/30`
- [ ] Caret/chevron (`▾` or lucide `ChevronDown`) present on button

### Dropdown Contents
- [ ] Lists all existing collections with `FolderOpen` icon in `text-[#c5a062]`
- [ ] "New collection…" row at bottom, styled `text-[#00e6ff] hover:bg-[#00e6ff]/10`
- [ ] Separator between collection list and "New collection" row (`border-t border-zinc-800/60`)
- [ ] Dropdown container: `bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl`
- [ ] Item hover: `hover:bg-zinc-800`
- [ ] `backdrop-blur-md` on dropdown (prevents card bleed-through per spec)

### UX Flow
- [ ] Click collection → calls `addImageToCollection(id, collectionId)` for EACH selected image
- [ ] After assign: batch selection cleared (`setSelectedForBatch(new Set())`)
- [ ] After assign: toast shows (e.g., "5 images added to Favorites")
- [ ] "New collection…" → opens `CollectionModal` (existing component, pre-seeded with `selectionCount`)
- [ ] Empty collections list → "New collection…" still shown, no blank dropdown

### Edge Cases
- [ ] 0 collections in app → dropdown shows only "New collection…" (no empty list)
- [ ] Image already in a different collection → `addImageToCollection` overwrites or handles gracefully (no crash)
- [ ] Dropdown closes on outside click (focus trap or click-away)
- [ ] Dropdown closes after collection is selected

### Tests
- [ ] Test: "Collection" button appears when batch > 0
- [ ] Test: clicking collection assigns all selected images
- [ ] Test: toast message shows correct count
- [ ] Test: "New collection…" opens CollectionModal

---

## P1-C Review Checklist — Smart Bulk Select

**File:** `components/GalleryFilterBar.tsx`

### New Filter Links
- [ ] "All Approved" link → selects `images.filter(i => i.approved)`
- [ ] "This Collection" link → selects `images.filter(i => i.collectionId === selectedCollectionId)` (only when a specific collection is selected, not "all")
- [ ] "Invert" link → swaps selected/unselected across visible images
- [ ] Links styled: `text-[10px] text-[#00e6ff] hover:underline`

### Placement
- [ ] Inline with the batch count badge (not floating separately)
- [ ] Visible when batch bar is active (`selectedForBatch.size > 0`) OR always visible
- [ ] "This Collection" disabled/hidden when `selectedCollectionId === 'all'`

### Edge Cases
- [ ] "All Approved" with 0 approved images → sets empty selection (no crash)
- [ ] "Invert" with nothing selected → selects all visible images
- [ ] "Invert" with all selected → clears all
- [ ] Filter links do not add horizontal scroll on small viewports

### Tests
- [ ] Test: "All Approved" selects only approved images
- [ ] Test: "This Collection" selects only images in current collection
- [ ] Test: "Invert" swaps selection set correctly

---

## Dark-Theme Global Checklist (all 3 items)

- [ ] All new borders: `border-zinc-800/60` or branded color at `/30–/40` opacity
- [ ] All new backgrounds: `bg-zinc-900` (modals/dropdowns), never pure white
- [ ] Text hierarchy maintained (white → zinc-300 → zinc-400 → zinc-500 → zinc-600)
- [ ] Blue accent (`#00e6ff`) used only for interactive/active states
- [ ] Gold accent (`#c5a062`) used only for collection-related UI
- [ ] No default Tailwind `indigo-*` without `@theme` alias verification

---

## Regression Check

- [ ] `npm run test` — all tests pass (baseline: 828)
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] Existing batch bar actions unaffected (Post Ready, Caption, Animate, Tag, Delete)
- [ ] Existing `onBatchCreateCollection` flow still works via "New collection…" path
- [ ] `GalleryCard` renders correctly when `img.collectionId` is null/undefined
- [ ] Drag-to-collection (`dragOverCollection`) card-level ring still works

---

## Notes on P1-A Spec Deviations (pre-identified)

The following are already known from baseline scan — review to confirm they exist and assess severity:

1. **Scale on hover not implemented** — spec says `scale-1.02` on pill hover. Current: only opacity change. Severity: WARNING (cosmetic only, pill still clearly visible).
2. **dragOverCollection pill pulse not implemented** — spec says `ring-1 ring-[#00e6ff]` on pill when card is drag target. Current: card-level ring handles this. Severity: INFO (user gets visual feedback from card ring; pill-level feedback is bonus).

---

*Status: READY — checklist complete. Waiting for Designer DONE signal on QOL-P1-DESIGN.*
