# Brief: MashupForge QoL Improvements

## Context
Maurice wants quality-of-life improvements for MashupForge. Research conducted by Dev, Designer, and QA agents simultaneously. Discovery findings:
- `docs/bmad/discoveries/qol-dev.md` — codebase analysis + implementation feasibility
- `docs/bmad/discoveries/qol-designer.md` — UI/UX patterns, dark-theme specs
- `docs/bmad/discoveries/qol-qa.md` — test strategy, edge cases, risk assessment

## Features

### FEAT-1: Gallery Collection Visual Indicators — PRIORITY: HIGH
**What:** Show a "folder" badge on gallery cards that belong to a collection. No need to hover — visible at a glance.

**Current state:** `img.collectionId` exists. Collection membership shown only inside a portaled dropdown menu. No persistent card indicator.

**Design (Designer):** Corner accent pill, bottom-left of card:
```
bg: #c5a062/15   border: #c5a062/40   text: #c5a062
icon: FolderOpen (lucide), 10px
font: text-[9px] font-bold uppercase tracking-wide
```
- Default: `opacity-80`
- Card hover: `opacity-100 scale-1.02`
- Drag-over: `ring-1 ring-[#00e6ff]` pulse

**Implementation (Dev):** 10-15 LOC in `GalleryCard.tsx`. No new library. Purely derived from `img.collectionId`.

**Complexity: LOW**

**Files:** `components/GalleryCard.tsx`
**Stories:** 1 (design + dev can merge)
**Tests needed:** badge appears/disappears, orphan collectionId on deletion

---

### FEAT-2: Post-Ready Drag & Drop Between Carousels — PRIORITY: HIGH
**What:** Drag single images between carousel groups. Optionally drag entire carousel as a unit.

**Current state:** No drag between carousels. HTML5 DnD used for gallery-to-collection only.

**Design (Designer):** @dnd-kit for React-native DnD:
- Drag handle: `GripVertical` icon, left edge, appears on card hover
- Ghost: `opacity-50 scale-95 shadow-2xl border-2 border-[#00e6ff]/60`
- Insert line: `h-0.5 w-full bg-[#00e6ff] rounded-full animate-pulse`
- Drop zone active: `border-[#00e6ff]/50 bg-[#00e6ff]/5`

**Data model impact:**
- Single image drag: remove from source `carouselGroupId`, assign to target `carouselGroupId` (or create new)
- Full carousel drag: all images with same `carouselGroupId` move together
- Undo: restore previous `carouselGroupId` assignments

**Tech (Dev):** `@dnd-kit/core` + `@dnd-kit/sortable` — preferred over HTML5 DnD for multi-container sortable with touch support.

**Complexity: MEDIUM/HIGH** (refactors existing DnD handlers, adds dependency)

**Files:** `package.json`, `components/postready/PostReadyCarouselCard.tsx`, `components/MainContent.tsx`, `lib/carouselView.ts`
**Stories:** 2 (backend/story+design, frontend/story+design)
**Tests:** single image move, carousel move, invalid target, undo

---

### FEAT-3: Simplify Batch-Adding to Collections — PRIORITY: MEDIUM
**What:** Faster workflow to add similar content to a collection.

**Current state (Dev found):** `findMatchingImages()` and `proposeTagGroups()` already exist in `hooks/useCollections.ts` but are underused. `selectedForBatch: Set<string>` already drives 5 batch operations.

**Design options:**
1. **"Add Similar" button** in collection modal — uses existing `findMatchingImages()` to auto-suggest and add matching images
2. **Gallery FilterBar → "Add to Collection" button** — batch-select then add all filtered results
3. **Post Ready batch selection checkboxes** — select multiple images in Post Ready, add all to collection in one click

**Implementation:** Activate existing `findMatchingImages()` + wire to UI. Low new code.

**Complexity: LOW/MEDIUM**

**Files:** `components/GalleryCard.tsx`, `components/CollectionModal.tsx`, `hooks/useCollections.ts`
**Stories:** 1 (dev + design)
**Tests:** batch add, race conditions, state consistency

---

### FEAT-4: pi.dev Web Search Improvements — PRIORITY: MEDIUM
**What:** Better AI-powered research from within MashupForge.

**Current state:** 3-query DDG/Brave search in `idea` mode only. Results injected as hidden prompt context. No citation extraction, no inline footnotes.

**Options:**
1. **Citation footnotes** — extract source URL + title, display as numbered superscripts inline
2. **Deep research toggle** — `mode=deep` triggers Perplexity-style multi-source synthesis
3. **pi.dev search package integration** — existing ecosystem packages for multi-engine search

**Complexity: MEDIUM** (API changes, new UI for citations)

**Files:** `lib/web-search.ts`, `components/CollectionModal.tsx`, `app/api/pi/prompt/route.ts`
**Stories:** 1 (dev)

---

### FEAT-5: Additional QoL (LOW PRIORITY)
Proposed by Dev:
- `Ctrl+Shift+C` keyboard shortcut: create collection from selection
- Failed post retry queue: kebab menu on failed Post Ready items
- Pending prompt queue: queue prompts when pi.dev is offline, resume when back
- Auto-scroll to newest carousel after creation

---

## Recommended Priority Order
1. **FEAT-1** (LOW complexity, HIGH impact, quick win)
2. **FEAT-3** (activates existing code, LOW complexity)
3. **FEAT-2** (HIGH impact, MEDIUM/HIGH complexity, biggest refactor)
4. **FEAT-4** (MEDIUM complexity, separate feature)
5. **FEAT-5** (LOW priority, varied complexity)

## QA Notes
- FEAT-1: Watch orphan `collectionId` when collection deleted — no cascade clear
- FEAT-2: Accessibility: keyboard fallback needed for drag-and-drop
- FEAT-2: Switch from HTML5 DnD to @dnd-kit — verify no regression on existing gallery-to-collection DnD
- FEAT-3: Race condition risk on simultaneous batch adds

## Research Sources
- Dev: `docs/bmad/discoveries/qol-dev.md`
- Designer: `docs/bmad/discoveries/qol-designer.md`
- QA: `docs/bmad/discoveries/qol-qa.md`
- NotebookLM research: `1d48ae2e-0c94-44d6-8ec7-faa16334836d`
