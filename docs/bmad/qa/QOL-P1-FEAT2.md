# QA Review — QOL FEAT-2 DnD Carousels

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Commit:** 75d32d3
**Files reviewed:**
- `components/postready/PostReadyDndGrid.tsx`
- `components/postready/PostReadyCarouselCard.tsx`
- `components/postready/DndUndoToast.tsx`
- `components/MainContent.tsx`
- `tests/integration/postready-dnd.test.tsx`

---

## Tests

**856/856 passing** (7.99s, 75 test files, +8 new)
- `moveCarouselGroup` logic: 4 tests ✓
- `DndUndoToast` component: 4 tests ✓

---

## Findings

### Critical — must fix before merge

**[CRITICAL] Whole-carousel reorder is a dead-end: `CarouselReorderSlot` exported but never mounted**

`CarouselReorderSlot` is defined and exported from `PostReadyDndGrid.tsx` (line 197) as the intended between-card drop target for carousel-kind drags. It is the **only** component that places `{ beforeGroupId }` in its droppable data — the key the `handleDragEnd` carousel branch reads:

```ts
// PostReadyDndGrid.tsx — handleDragEnd carousel branch
const beforeGroupId = over.data.current?.beforeGroupId as string | null | undefined;
if (beforeGroupId === undefined) return; // ← always hits this
```

`CarouselReorderSlot` is never imported or rendered in `MainContent.tsx`. The grid renders `sortedPostItems.map(item => ...)` with no slots injected between items. Dropping a carousel-kind drag on any rendered element (`CarouselCardShell` exposes `{ carouselId }`, not `{ beforeGroupId }`) always triggers the early-return guard. `moveCarouselGroup` is never called in production.

**What works:** header drag handle renders, ghost renders, visual drag is smooth.
**What doesn't work:** the drop does nothing. Carousels cannot be reordered via DnD.

**Fix:** Import `CarouselReorderSlot` in `MainContent.tsx` and render one slot between every adjacent pair of carousel cards in the grid, and one at the end:
```tsx
{sortedPostItems.map((item, idx) => (
  <React.Fragment key={item.id}>
    <CarouselReorderSlot beforeGroupId={item.id} />
    {/* ...existing PostReadyCarouselCard / DraggableSingleWrapper */}
  </React.Fragment>
))}
<CarouselReorderSlot beforeGroupId={null} />
```

---

### Warnings — should fix

**[WARNING] Toast progress bar resets to 100% on hover instead of pausing**

`DndUndoToast` sets `animation: none` when `paused === true`:
```ts
animation: paused ? 'none' : `dnd-undo-toast-drain ${durationMs}ms linear forwards`
```

`animation: none` removes the animation entirely, which snaps the bar back to its `from` value (`width: 100%`) on hover, then re-drains from full on unhover. The dismiss timer is correctly paused (no incorrect dismiss fires), but the visual is wrong: bar jumps full → drains from full.

The spec says "Hovering the toast → pauses the progress bar." The correct CSS property to freeze an animation mid-playback is `animation-play-state: paused`:

```ts
style={{
  animationName: 'dnd-undo-toast-drain',
  animationDuration: `${durationMs}ms`,
  animationTimingFunction: 'linear',
  animationFillMode: 'forwards',
  animationPlayState: paused ? 'paused' : 'running',
}}
```

---

### Info — noted, no action required

**[INFO] Ghost opacity 0.50 vs spec §3.4's 0.60**
Commit message explicitly notes "image now opacity-50 (was 60)" — deliberate override matching Hermes's dispatch spec. Noted, not a failure.

**[INFO] Toast message omits carousel name: `"Image moved"` vs spec's `"Image moved to {carousel name}"`**
Carousel-reorder toast (`"Carousel reordered"`) matches spec. Image-move toasts (`"Image moved"`, `"Image separated"`) omit the destination carousel name. Functional, just less informative. Low-impact.

---

## Checklist results

| Item | Result | Notes |
|---|---|---|
| 856/856 tests pass | ✓ | |
| `autoScroll` on DndContext `{ x:0, y:0.2 }` | ✓ | PostReadyDndGrid.tsx:143 |
| `PointerSensor` / `TouchSensor` / `KeyboardSensor` | ✓ | Already in skeleton |
| Carousel header `GripVertical` 16×16, opacity-0 resting | ✓ | `group-hover/card:opacity-100`, `cursor-grab` |
| `group/card` on `CarouselCardShell` root | ✓ | Enables `group-hover/card:` |
| Card-level Tier-2 drop: `border-[#00e6ff]/50` on hover | ✓ | Different-source guard correct |
| Strip ignores carousel-kind drags | ✓ | `isImageDrag` check in `DroppableImageStrip` |
| Image ghost: `opacity-50 scale-95 border-[#00e6ff]/60 shadow-2xl glow` | ✓ | opacity-50 (see INFO above) |
| Carousel ghost: 320px preview, `opacity-70 scale-90 border-[#00e6ff]/60` | ✓ | Status pill + 3 thumbs |
| `moveCarouselGroup` reorder logic (before, end, no-op, content) | ✓ | 4 tests pass |
| Undo snapshot pushed before mutating | ✓ | MainContent.tsx:773 |
| `DndUndoToast` renders message + `⌘Z` chip + Undo button | ✓ | |
| Toast `fixed bottom-6 right-6 z-50 min-w-[280px]` | ✓ | |
| Toast `backdrop-blur-md`, `rounded-xl`, `bg-zinc-900` | ✓ | |
| `Undo2` icon `text-[#c5a062]` | ✓ | |
| Toast self-dismisses after 5s | ✓ | Test confirms with `durationMs` override |
| Toast hover pauses timer | ✓ | setTimeout guard correct |
| Toast hover pauses visual progress bar | ✗ | **WARNING** — bar resets to 100% |
| Whole-carousel drag handle visible + draggable | ✓ | Visually correct |
| Whole-carousel reorder executes on drop | ✗ | **CRITICAL** — `CarouselReorderSlot` not mounted |
| `CarouselReorderSlot` insert line visible during carousel drag | ✗ | **CRITICAL** — component never rendered |

---

## Gate Decision

**[CONCERNS]** — Two fixes needed:

1. **CRITICAL** — Mount `CarouselReorderSlot` between cards in `MainContent.tsx`. Without this, carousel reorder (the headline FEAT-2 feature for whole-card drag) is entirely non-functional despite all the supporting machinery being in place. One import + ~5 LOC in the grid map.

2. **WARNING** — Replace `animation: none` with `animationPlayState: paused` in `DndUndoToast`. Purely visual, but the hover-pause is a specced interaction that currently misbehaves.

Everything else — sensors, ghost polish, card-level drop zones, undo logic, toast structure, strip guard — is clean and spec-compliant. This is a thin fix list; the implementation is solid underneath.
