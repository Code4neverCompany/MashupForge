# Story: FEAT-2 — Post-Ready Drag & Drop Between Carousels

## Feature
Drag single images between carousel groups in Post Ready. Optionally drag entire carousel as a unit.

## Design Spec (from designer discovery)
**Library:** `@dnd-kit/core` + `@dnd-kit/sortable`

**Interaction:**
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
- Insert line: `h-0.5 w-full bg-[#00e6ff] rounded-full animate-pulse`
- Drop zone active: `border-[#00e6ff]/50 bg-[#00e6ff]/5`
- Drag handle: `GripVertical` (lucide), `text-zinc-600 hover:text-zinc-300`, appears on card hover only

**Touch support:** Enable `TouchSensor` alongside `MouseSensor` in @dnd-kit config.

## Data Model Impact
- Single image drag: remove from source `carouselGroupId`, assign to target `carouselGroupId` (or create new one)
- Full carousel drag: all images with same `carouselGroupId` move together
- Undo: restore previous `carouselGroupId` assignments (implement as reversible state change)

## Steps
1. Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to `package.json`
2. Wrap PostReady carousel list in `<DndContext>`
3. Wrap each carousel card's image strip in `<SortableContext>`
4. Implement `onDragEnd` — detect source/target carousel, update `carouselGroupId`
5. Add drag handle icon to `PostReadyCarouselCard.tsx` (appears on hover)
6. Implement drop indicator (insert line between images)
7. Implement undo — save previous `carouselGroupId` state before move

## Hard Acceptance Criteria
1. **No DnD regression:** existing gallery-to-collection drag (HTML5 DnD) still works exactly as before
2. **Single image move:** drag image from carousel A to carousel B — image moves, both carousels update immediately
3. **Full carousel move:** drag carousel card header — all images in that carousel move together
4. **Keyboard a11y:** @dnd-kit keyboard navigation (arrow keys) works for reordering within a carousel
5. **Touch support:** drag works on touch devices (tested via @dnd-kit touch sensor)
6. **Undo:** Ctrl+Z restores previous carouselGroupId assignments after a move
7. **Invalid target:** dropping on non-carousel area returns image to original position
8. **824/824 tests pass** — new tests for DnD must be added

## Files
- `package.json` (add deps)
- `components/postready/PostReadyCarouselCard.tsx` (add drag handle, wrap in SortableContext)
- `components/MainContent.tsx` (wrap carousel list in DndContext, implement onDragEnd)
- `lib/carouselView.ts` (check impact on computeCarouselView)
- New test file: `tests/integration/postready-dnd.test.tsx`

## Complexity: MEDIUM/HIGH
## Tests: New test file required
