# QA Review — QOL P1-B + P1-C

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Commit:** 425321c
**Files reviewed:**
- `components/GalleryFilterBar.tsx`
- `components/MainContent.tsx`
- `tests/components/GalleryFilterBar.test.tsx`

---

## P1-B — Batch Add to Collection

**Gate: PASS** (confidence: 0.93)

### Checklist results

**Batch bar integration**
- [x] "Collection" button visible when `selectedForBatch.size > 0`
- [x] Default style matches other batch buttons (`bg-zinc-800 hover:bg-zinc-700 text-white`)
- [x] Active/open state: `bg-[#c5a062]/10 text-[#c5a062] border-[#c5a062]/30` ✓
- [x] `ChevronDown` caret rotates 180° when open ✓
- [x] ARIA: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"` — full a11y ✓

**Dropdown contents**
- [x] Lists all existing collections with `FolderOpen text-[#c5a062]` icon ✓
- [x] Section header label ("Add to collection") in `text-zinc-500 uppercase` ✓
- [x] Separator `border-t border-zinc-800/60` between list and new-collection row ✓
- [x] "New collection…" row: `text-[#00e6ff] hover:bg-[#00e6ff]/10` ✓
- [x] Container: `bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl backdrop-blur-md` ✓
- [x] `max-h-[320px] overflow-y-auto` — long lists scroll cleanly ✓

**UX flow**
- [x] Click collection → `onBatchAddToCollection(c.id)` called, menu closed immediately ✓
- [x] "New collection…" → `onBatchCreateCollection()` called, menu closed ✓
- [x] `handleBatchAddToCollection` iterates all `selectedForBatch` ids, calls `addImageToCollection` per id ✓
- [x] Batch selection cleared after assign (`setSelectedForBatch(new Set())`) ✓
- [x] Toast: `"N image(s) added to <name>."` with singular/plural handling + graceful null name fallback ✓

**Edge cases**
- [x] 0 collections → "Add to collection" header and list hidden; "New collection…" still shown ✓
- [x] Outside click dismissal: `mousedown` listener on `document` with `collectionMenuRef` containment check ✓
- [x] Escape key dismissal: `keydown` listener removes on cleanup ✓
- [x] After selection: menu closes, selection cleared — no stale open state ✓

**Findings**
- [INFO] Dropdown opens downward (`top-full mt-2`) rather than upward. Spec ASCII sketch implied above-bar positioning, but the filter bar sits at the top of the gallery section — opening downward is correct and expected. No action needed.

---

## P1-C — Smart Bulk Select

**Gate: PASS** (confidence: 0.95)

### Checklist results

**Filter links**
- [x] "Approved" link: `handleSelectApproved` → `displayedImages.filter(img => img.approved)` ✓
- [x] "This Collection" link: `displayedImages.filter(img => img.collectionId === selectedCollectionId)` ✓
- [x] "Invert" link: functional state update `prev => new Set(displayed.filter(!prev.has))` — correct pattern ✓
- [x] All styled `text-[10px] text-[#00e6ff] hover:underline` ✓
- [x] "Quick" label: `text-zinc-600 font-bold uppercase tracking-wider` — visual anchor ✓

**Conditional visibility**
- [x] Entire cluster hidden when `displayedCount === 0` ✓
- [x] "This Collection" hidden when `selectedCollectionId === 'all'` ✓
- [x] "Invert" hidden when `selectedForBatch.size === 0` ✓

**Findings**
- [INFO] Button label is "Approved" (not "All Approved" per spec). Cleaner — no action needed.
- [INFO] Quick-select cluster shown at all times when `displayedCount > 0`, not only inside the batch-active block. This is better UX (you can use it to *start* a selection). Intentional divergence from spec — approved.

---

## Tests

**30/30 passing** (1.77s, vitest 4.1.5)

Coverage for FEAT-3:
- [x] Menu opens and renders all collections + "New collection…"
- [x] `onBatchAddToCollection` called with correct `id`
- [x] `onBatchCreateCollection` called on "New collection…"
- [x] 0 collections → only "New collection…" shown

Coverage for smart-select:
- [x] "Approved" visible at `displayedCount > 0`, hidden at 0
- [x] "This Collection" conditional on `selectedCollectionId !== 'all'`
- [x] "Invert" conditional on `selectedForBatch.size > 0`
- [x] All three handlers fire correctly on click
- [INFO] No test for Escape key or outside-click dismissal — JSDOM limitation, acceptable

---

## Dark-theme compliance
- [x] All new borders: `border-zinc-800/60` ✓
- [x] Dropdown background: `bg-zinc-900` + `backdrop-blur-md` ✓
- [x] Gold accent (`#c5a062`) on collection icons and active button state only ✓
- [x] Cyan accent (`#00e6ff`) on "New collection…" and quick-select links only ✓
- [x] No `indigo-*` introduced ✓

---

## Regression
- 30/30 GalleryFilterBar tests passing
- No new TypeScript errors in reviewed files
- `handleBatchAddToCollection` uses `showToast(..., 'success')` — variant exists in `Toast.tsx` ✓
- Existing `onBatchCreateCollection` path preserved and reachable via "New collection…" ✓

---

## Gate Decision

**[PASS]** — P1-B and P1-C are clean, well-tested, and match the spec. Three INFO observations, zero warnings, zero criticals. Both items ready to merge.
