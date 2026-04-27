# QoL Discovery — Designer Research
**Agent:** Designer | **Date:** 2026-04-27 | **Version at time of research:** v0.9.5

---

## 1. Gallery Collection Visual Indicators

### Current state (codebase scan)
`GalleryCard.tsx` has `img.collectionId` available but **no visible badge on the card itself**. The only indicator is inside the `FolderPlus` dropdown menu where the matching collection row gets `bg-emerald-500/20 text-emerald-400`. A user scanning the gallery cannot tell which cards are already collected without hovering every one.

### Recommended approach — Corner accent pill

A compact pill in the bottom-left corner of the image tile, always visible (not hover-gated), rendered when `img.collectionId` is set.

**Dark-theme color spec:**
```
bg: #c5a062/15   (gold tint, unobtrusive)
border: #c5a062/40
text: #c5a062
icon: FolderOpen (lucide), 10px
font: text-[9px] font-bold uppercase tracking-wide
```

**ASCII sketch — card bottom-left:**
```
┌─────────────────────────────┐
│                             │
│     [image content]         │
│                             │
│ ┌────────────────┐          │
│ │ 📁 Favorites   │          │
│ └────────────────┘          │
└─────────────────────────────┘
  gold pill, collection name truncated to 12ch
```

**Interaction states:**
- Default: pill visible, `opacity-80`
- Card hover: pill bumps to `opacity-100`, slight scale `1.02`
- `dragOverCollection` active on this card: pill pulses `ring-1 ring-[#00e6ff]`

**Secondary option — left edge accent bar:**
A 3px vertical bar on the left edge of the card using `border-l-2 border-[#c5a062]`. Zero text, minimal footprint. Works well for dense grids.

**Component change:** Inline addition to `components/GalleryCard.tsx` — no new file needed. Add inside the image wrapper after the status overlays, conditionally on `img.collectionId`.

**Complexity:** Low — 10–15 LOC addition to `GalleryCard.tsx`. No logic change, pure visual.

**Dark-theme violations to watch:** Gold on zinc-900 passes WCAG AA at 9px bold. Do not use `text-zinc-400` here — it disappears against the card's dark backdrop.

---

## 2. Post-Ready Drag & Drop Between Carousels

### Current state (codebase scan)
`MainContent.tsx` has two existing HTML5 DnD systems:
1. `dragOverCollection` / `dataTransfer.setData('imageId')` — gallery card → collection (line 226)
2. `dragPostId` / `dragOverCell` — calendar cell reordering (lines 315–316, 3466)

Neither covers **dragging images between carousel cards** in Post Ready. `PostReadyCarouselCard.tsx` renders a static image strip with no drag handles. `PostReadyCard.tsx` (single-image) similarly has no reorder surface.

### Recommended library — `@dnd-kit/core` + `@dnd-kit/sortable`

**Why over alternatives in 2026:**
- `@dnd-kit` is the React-first standard: virtual DOM-friendly, no legacy `ReactDOM.findDOMNode`, full a11y (keyboard + screen reader sortable out of the box)
- `react-dnd` requires HTML5 backend wiring and has heavier boilerplate; last major release lagged behind React 19
- HTML5 native DnD works but lacks touch support and the collision detection API needed for smooth insert-between behavior

**Interaction design:**
```
User grabs drag handle (GripVertical icon, left edge of carousel image strip)

  ┌────────────────────────────┐
  │ ⠿ [img1] [img2] [img3]    │  ← drag handle activates on grip icon
  └────────────────────────────┘
              ↓ drag starts
  ┌────────────────────────────┐
  │ ⠿ [img1] [img2] [img3]    │  ← source card dims to 50% opacity (ghost)
  └────────────────────────────┘

  ↓ hovering over target carousel

  ┌────────────────────────────┐
  │  ── INSERT HERE ──         │  ← 2px #00e6ff insert line + gap expands 16px
  │ ⠿ [img4] [img5]           │
  └────────────────────────────┘
```

**Visual tokens:**
- Drag ghost: `opacity-50 scale-95 shadow-2xl border-2 border-[#00e6ff]/60`
- Insert line: `h-0.5 w-full bg-[#00e6ff] rounded-full` with `animate-pulse`
- Drop zone active: card border changes to `border-[#00e6ff]/50 bg-[#00e6ff]/5`
- Drag handle icon: `GripVertical` (lucide), `text-zinc-600 hover:text-zinc-300`, appears on card hover only

**Touch support:** `@dnd-kit` provides `TouchSensor` alongside `MouseSensor` — minimal extra config.

**Scope of change:**
- `package.json`: add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `components/postready/PostReadyCarouselCard.tsx`: wrap image strip in `<SortableContext>`
- `components/MainContent.tsx` (PostReady section): wrap list in `<DndContext>`, implement `onDragEnd` to reorder

**Complexity:** Medium — 1 new dep (3 packages), ~80 LOC change. The biggest risk is that `MainContent.tsx` is already large; the DnD context should live in a slim `PostReadySortableList` wrapper component to avoid bloat.

**Dark-theme violations to watch:** The `#00e6ff` insert line and drop-zone tint are both on-brand. Do not use white backgrounds for ghost cards — use `bg-zinc-900/95` instead.

---

## 3. Simplify Adding Content to Collection

### Current state (codebase scan)
- `selectedForBatch` (`Set<string>`) tracks multi-select state in `MainContent`
- `BulkTagModal.tsx` handles batch tag apply (append/replace)
- `CollectionModal.tsx` handles creating a new collection
- `addImageToCollection(imageId, collectionId)` handler exists
- **Gap:** No batch "assign to existing collection" flow. Users must click `FolderPlus` on each card individually.

### Recommended approach — Extend the floating batch action bar

When `selectedForBatch.size > 0`, a floating action bar appears (current: only "Bulk Tag" and "Delete"). Add a **"Collection"** action that opens a compact dropdown over the bar.

**ASCII sketch — floating bar with collection dropdown:**
```
                    ┌──────────────────────────────────────────┐
                    │  📁 Favorites                            │
                    │  📁 Best of April                        │
                    │  📁 Instagram Picks                      │
                    │  ─────────────────────────────────────   │
                    │  + New collection…                        │
                    └──────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  ☑ 12 selected   [Tag]  [Collection ▾]  [Approve]  [Delete]    │
└─────────────────────────────────────────────────────────────────┘
```

**Color spec for dropdown:**
```
container: bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl
item default: text-zinc-300 hover:bg-zinc-800
item with icon: FolderOpen text-[#c5a062] w-3.5 mr-2
separator: border-t border-zinc-800/60
"New collection" row: text-[#00e6ff] hover:bg-[#00e6ff]/10
```

**UX flow:**
1. User selects 5+ cards (checkbox tap / shift-click)
2. Batch bar rises from bottom with count badge
3. Click "Collection ▾" → inline dropdown with existing collections + "New collection…"
4. Click collection → calls `addImageToCollection` for each selected ID, then clears batch + shows toast "5 images added to Favorites"
5. "New collection…" → opens existing `CollectionModal` pre-seeded with `selectionCount`

**Interaction states:**
- Collection button hover: `bg-zinc-800 text-white`
- Collection button active (dropdown open): `bg-[#c5a062]/10 text-[#c5a062] border border-[#c5a062]/30`

**Component changes:**
- `components/MainContent.tsx`: extend batch bar (add Collection button + dropdown state)
- No new files required; reuse `CollectionModal` for the "New collection" path

**Complexity:** Low-medium — ~60 LOC in `MainContent.tsx`. Shares the existing `BulkTagModal` pattern exactly.

**Dark-theme violations to watch:** The dropdown floats over gallery cards; ensure `bg-zinc-900` has enough contrast against `bg-zinc-950` backgrounds. Add `backdrop-blur-md` to prevent card content bleeding through.

---

## 4. Additional QoL Ideas

### 4a. Keyboard Shortcut Cheat Sheet Overlay
**Trigger:** `?` key anywhere in the app (not in text inputs)
**Design:** Centered modal, dark semi-transparent backdrop, two-column grid of shortcut rows

```
┌────────────────────────────────────────────────┐
│  ⌨  Keyboard Shortcuts                    [✕]  │
│                                                │
│  NAVIGATION          GALLERY                  │
│  G  → Gallery        Space → Select card      │
│  P  → Pipeline       Shift+A → Select all     │
│  R  → Post Ready     T → Tag selected         │
│  S  → Settings       C → Add to collection    │
│                                                │
│  PIPELINE            GLOBAL                   │
│  ↵  → Approve idea   Cmd+K → Quick action     │
│  D  → Delete idea    ? → This overlay         │
└────────────────────────────────────────────────┘
```

**Color spec:**
- Backdrop: `bg-black/70 backdrop-blur-sm`
- Container: `bg-zinc-900/95 border border-zinc-800/60 rounded-2xl`
- Section labels: `text-[9px] font-bold text-zinc-500 uppercase tracking-widest`
- Key badge: `bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-1.5 py-0.5 font-mono text-[10px]`
- Description: `text-zinc-400 text-xs`

**Component name:** `KeyboardShortcutsOverlay` in `components/KeyboardShortcutsOverlay.tsx`
**Complexity:** Low — new component, one `useEffect` for `keydown`, no state dependencies.

---

### 4b. Right-Click Context Menu on Gallery Cards
**Trigger:** `contextmenu` event on `GalleryCard`
**Design:** Compact popover (same portal pattern as the existing `FolderPlus` dropdown)

```
[Right-click on card]
  ┌──────────────────────────┐
  │ ✦ Open details           │
  │ ✔ Approve / Unapprove    │
  │ 📁 Add to collection ▶   │  → submenu with collection list
  │ 🏷 Tag                   │
  │ ─────────────────────    │
  │ ⬇ Save                  │
  │ 🗑 Delete                │
  └──────────────────────────┘
```

**Color spec:** Same as collection dropdown above (`bg-zinc-900`, `border-zinc-800/60`).
**Complexity:** Low — wraps existing `KebabMenu` items in a `contextmenu` handler + portal. `KebabMenuItem[]` type already exists and matches this shape.

---

### 4c. Smart Bulk Selection
Extend the gallery selection bar with smart-select shortcuts:

| Button | Action |
|---|---|
| Select All Approved | `selectedForBatch = images.filter(i => i.approved).map(i => i.id)` |
| Select This Collection | `selectedForBatch = images.filter(i => i.collectionId === activeCollection)` |
| Invert Selection | swap selected/unselected |

**Placement:** Inline with the existing batch count badge, as text-links styled `text-[10px] text-[#00e6ff] hover:underline`.
**Complexity:** Trivial — pure filter operations on existing state. ~15 LOC.

---

### 4d. Pipeline / Auto-Save Toast Notifications
**Gap:** Auto-save in `DesktopSettingsPanel` has a visual `saveState` inline indicator, but pipeline state changes (idea approved, caption generated, post ready) surface only inside the panel — not as ephemeral toasts.

**Design:** Extend the existing `Toast.tsx` / `UndoToast.tsx` system with a `PipelineToast` variant:

```
                    ╔══════════════════════════════╗
                    ║ ✓ 3 ideas queued for captions ║  ← emerald, 3s auto-dismiss
                    ╚══════════════════════════════╝
```

**Color variants:**
- `approved` → `border-emerald-500/40 text-emerald-300`
- `caption-ready` → `border-[#00e6ff]/40 text-[#00e6ff]`
- `post-ready` → `border-[#c5a062]/40 text-[#c5a062]`
- `error` → `border-red-500/40 text-red-300`

**Complexity:** Low — extend existing `Toast.tsx` with variant prop. Wire in `usePipeline` hook's state transitions.

---

## Priority Ranking

| Item | User Impact | Dev Effort | Recommended Priority |
|---|---|---|---|
| Collection badge on card | High — daily confusion | Low (15 LOC) | **P1 — quick win** |
| Batch add to collection | High — removes repetitive clicks | Low-medium (60 LOC) | **P1 — quick win** |
| Smart bulk select | Medium | Trivial | **P1 — quick win** |
| Keyboard shortcut overlay | Medium — power user | Low (new component) | **P2** |
| Right-click context menu | Medium | Low | **P2** |
| Pipeline toasts | Medium — ambient feedback | Low | **P2** |
| PostReady DnD between carousels | High (if Maurice reorders frequently) | Medium (new dep) | **P3 — needs scoping** |

## Dark-theme violation checklist (global)
- All new borders: `border-zinc-800/60` or branded color at `/30–/40` opacity
- All new backgrounds: `bg-zinc-900` (modals), `bg-[#050505]/40` (inset panels), never pure white
- Text hierarchy: white → zinc-300 → zinc-400 → zinc-500 → zinc-600 (labels/hints)
- Interactive blue accent (`#00e6ff`): buttons, active states, insert indicators
- Gold accent (`#c5a062`): secondary actions, collection indicators, highlights
- Never use default Tailwind `indigo-*` without verifying the `@theme` alias — in this codebase `indigo-300+` renders as Electric Blue cyan, not purple
