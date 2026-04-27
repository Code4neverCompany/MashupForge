# FEAT-2 — Post-Ready DnD Between Carousels — DESIGN SPEC

**Status:** Design spec, ready for Dev
**Date:** 2026-04-27
**Author:** Designer
**Implementation status:** `PostReadyDndGrid` skeleton + per-image `useDraggable`/`useDroppable` already shipped at commit 425321c. Gaps below are flagged **NEW**.
**Library:** `@dnd-kit/core` (already installed)

---

## 0. Aesthetic Direction

The Post Ready surface is the moment of curation — the user is composing carousels for publication. The DnD layer must feel **deliberate, weighted, and confident**, not chatty. Every transition is short (≤300ms), every accent is the brand Electric Blue (`#00e6ff`), every container is on Agency Black (`#050505`) or zinc-900 strata. The user's drag should feel like moving glass over a dark table — magnetic to drop targets, dim where it leaves, sharp where it lands.

**One memorable detail:** the insert line between two images is a 2px Electric Blue rule with `animate-pulse` and a 16px gap-expansion on either side — the source of all visual feedback during a precision-drop. Everything else stays quiet so this single mark reads.

---

## 1. Design Token Inventory

All tokens already exist in `app/globals.css` and the brand kit. This spec does **not** introduce new colors.

### Surfaces

| Token | Value | Used for |
|---|---|---|
| Agency Black | `#050505` | Page background, deep wells |
| Surface 1 | `bg-zinc-900/80 backdrop-blur-sm` | Carousel card body |
| Surface 2 | `bg-zinc-950` | Image strip well (existing) |
| Surface 3 | `bg-zinc-900` | Floating menus, undo toast |

### Brand accents

| Token | Value | Role |
|---|---|---|
| Electric Blue | `#00e6ff` | All DnD interactive feedback (drop zones, insert lines, drag-ghost border, focus rings) |
| Metallic Gold | `#c5a062` | Carousel "ready" border, decorative pills, NOT used for DnD |
| Emerald 500 | `border-emerald-500/60` | "Posted" status (read-only — never a drop target) |
| Sky 500 | `border-sky-500/60` | "Scheduled" status (drop allowed but warns — see §5.4) |
| Red 500 | `border-red-500/60` | "Failed" status |
| Zinc 600/700/800 | various | Neutral chrome (handles, separators, idle states) |

### Borders

| Token | Use |
|---|---|
| `border-2 border-[#c5a062]/30` | Card resting (status: ready) |
| `border-2 border-[#00e6ff]/50` | Card while a draggable hovers it (drop-eligible) |
| `border-2 border-[#00e6ff]` (full opacity) + glow | Card while drop is *committed* (final 100ms before drop) |
| `border border-zinc-800/60` | Inner separators |
| `ring-1 ring-[#00e6ff]/50` | Strip droppable hover (already implemented) |
| `ring-2 ring-[#00e6ff]/60` | New-group target ring on single-image card hover (already implemented) |

### Spacing scale

The grid + card use a strict 4px / 8px scale. Gaps and paddings here are written in Tailwind's spacing tokens and the px equivalents:

| Token | px | Use |
|---|---|---|
| `gap-1` | 4px | Image-to-image inside strip (existing) |
| `gap-2` | 8px | Sibling chips, button rows |
| `gap-4` | 16px | Card-to-card in the grid (existing); also the insert-line gap-expansion |
| `gap-6` | 24px | Section-to-section padding inside cards |
| `p-2` | 8px | Strip well padding (existing) |
| `p-3` | 12px | Card body content padding (existing) |
| `min-h-[144px]` | 144px | Image strip min height (existing) |
| `h-32 w-32` | 128×128 | Image thumb (existing) |
| `rounded-2xl` | 16px | Card corners (existing) |
| `rounded-lg` | 8px | Image thumbs, drag-ghost frame |

### Animation timing

| Token | Duration | Use |
|---|---|---|
| `transition-colors` (default 150ms) | 150ms | Hover border tints |
| `transition-opacity` (default 150ms) | 150ms | Drag handle fade-in on card hover |
| `transition-all duration-200` | 200ms | All `btn-*` utilities |
| `transition-all duration-300` | 300ms | Card border-color + glow on drop-eligible |
| `animate-pulse` (Tailwind default) | 2s loop | Insert line, drop-zone idle pulse |
| `dropAnimation={null}` | 0ms | Drag overlay snap on release (already set in `PostReadyDndGrid.tsx:121` — no settle animation, the move is instant) |

### Typography

Carousel-card content uses the existing semantic scale (`type-title`, `type-muted`, `type-caption`). The DnD layer adds **no new text** — every state communicates through color, motion, and the GripVertical icon.

The undo toast (§7) is the only DnD element that introduces text; it uses NEXUS MONO (`font-mono`) for the keyboard-shortcut chip and `type-body` for the message.

---

## 2. PostReadyDndGrid — Layout & Responsive Behavior

### 2.1 Grid container (already implemented at MainContent.tsx:3976)

```tsx
<PostReadyDndGrid postItems={sortedPostItems} onMove={dndMoveHandler}>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {sortedPostItems.map(item => /* PostReadyCard | PostReadyCarouselCard */)}
  </div>
</PostReadyDndGrid>
```

| Breakpoint | Columns | Card max-width |
|---|---|---|
| `< 1024px` (mobile, tablet) | 1 | full |
| `≥ 1024px` (lg) | 2 | (container − 16px gap) ÷ 2 |
| `≥ 1536px` (2xl) — **NEW** recommendation | optionally 3, only if usage data shows users with many simultaneous carousels |

**Why no 3/4-column variant by default:** carousel cards are tall (image strip + caption + hashtags + platforms + actions = ~620px). A 3-column layout at 1280px starves each card to ~380px wide which crowds the action button row and triggers wrapping. Keep 2-up until usage warrants the 3-up.

### 2.2 Drag interaction at the grid level

`PostReadyDndGrid` wraps everything in `<DndContext>` with three sensors (already configured at `PostReadyDndGrid.tsx:79-86`):

| Sensor | Activation | Why these values |
|---|---|---|
| `PointerSensor` | `distance: 8` (8px before drag starts) | Prevents accidental drag-vs-click misfire on the GripVertical icon |
| `TouchSensor` | `delay: 200, tolerance: 5` | 200ms long-press threshold + 5px wiggle room — matches iOS/Android "press to drag" muscle memory |
| `KeyboardSensor` | default | Tab to focus a draggable, Space to lift, arrows to move, Space to drop |

### 2.3 Grid behavior during an active drag (**NEW** — extend the overlay)

When `activeData != null`:

1. The grid's container gets a subtle dim — `opacity: 1` stays, but inert siblings render with `opacity: 0.7` (300ms ease). Source card gets `opacity: 0.4` (existing per-image is 0.3 — promote to 0.4 on the source card itself; image stays at 0.3).
2. `DragOverlay` renders the ghost (already implemented; spec'd in §3.4).
3. Drop-eligible carousels (every carousel except the source) get a hover-priming ring: `ring-1 ring-zinc-700/40` resting → `ring-1 ring-[#00e6ff]/50` on hover. **NEW** — current implementation only shows feedback on the strip, not the whole card.

### 2.4 Auto-scroll during drag (**NEW**)

@dnd-kit ships an `autoScroll` modifier on `DndContext`. Enable defaults:
- Threshold: 0.2 (start scrolling when pointer is within 20% of viewport edge)
- Speed: default
- Order: `'tree'` so nested overflow containers scroll before window

Without this, dragging an image to a carousel below the fold requires releasing and scrolling — friction. Add to `PostReadyDndGrid`:

```tsx
<DndContext sensors={sensors} autoScroll={{ threshold: { x: 0, y: 0.2 } }} ...>
```

---

## 3. PostReadyCarouselCard — Full Component Spec

### 3.1 Resting state (already implemented)

```
┌─────────────────────────────────────────────┐
│ [status pill] [Carousel · 3] [manual]       │  ← px-3 pt-3 pb-2, gap-2
├─────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← bg-zinc-950, p-2, min-h-144
│ ░ [128×128] [128×128] [128×128] →         ░ │  ← gap-1 between thumbs
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────────┤
│ Shared caption                              │
│   Lorem ipsum…                              │  ← p-3, space-y-3
│ Hashtags                                    │
│   #foo #bar +3 more                         │
│ Platforms                                   │
│   [Instagram ✓] [Pinterest]                 │
│ [Post Now]  [Schedule]  [⋯]                 │
└─────────────────────────────────────────────┘
```

Card frame: `bg-zinc-900/80 backdrop-blur-sm border-2 border-[#c5a062]/30 rounded-2xl overflow-visible`. Status changes the border per `visualsForKind()` (existing).

### 3.2 Drag handle states (per-image — already implemented + small refinements)

The handle is a `GripVertical` icon (lucide, 14×14 in the existing impl). It lives at `absolute -left-1 top-1/2 -translate-y-1/2` over the image thumb.

| State | Class | Visual |
|---|---|---|
| Resting (no card hover) | `opacity-0` | Hidden |
| Card hover (mouse) | `opacity-100` (existing `group-hover/img:opacity-100 transition-opacity`) | Fades in over 150ms |
| Touch device (no hover) — **NEW refinement** | always `opacity-60` on touch breakpoints | Always visible on touch — see §4.2 |
| Hover on the handle itself | `text-zinc-200` (existing) + cursor `cursor-grab` | Indicates draggability |
| Active grab (mouse-down on handle) | `cursor-grabbing` (existing) + `bg-black/80` (current is `/60`, bump for press feedback) | Slightly darker pill background |
| Currently dragging this image | `opacity-30` on the wrapper (existing) | Source dims; pointer-events handled by overlay |
| Keyboard-focused | `ring-2 ring-[#00e6ff] ring-offset-2 ring-offset-zinc-950` | Same as `btn-*:focus-visible` from globals.css |

Handle background pill (existing): `bg-black/60` resting → `bg-black/80` when actively grabbed.

### 3.3 Per-image dim (already implemented at `PostReadyCarouselCard.tsx:164`)

Source image during its own drag:
```css
opacity: 0.3;
```

**NEW refinement:** also apply `filter: grayscale(0.4)` on the source so it visibly recedes — not just transparent. Keeps spatial position so the user sees where it'll snap back if released over an invalid target.

### 3.4 DragOverlay ghost (already implemented at `PostReadyDndGrid.tsx:121`)

The ghost is rendered ABOVE everything via `<DragOverlay>`. Specs:

| Property | Value |
|---|---|
| Frame | `rounded-lg overflow-hidden` |
| Image | `h-32 w-32 object-cover` (matches strip thumb size 1:1) |
| Opacity | `opacity-60` |
| Scale | `scale-95` (hint of lift, not so big it covers drop targets) |
| Border | `border-2 border-[#00e6ff]/60` |
| Shadow | `shadow-2xl` (Tailwind default — `0 25px 50px -12px rgb(0 0 0 / 0.25)`) |
| Glow — **NEW** | also add a colored shadow: `shadow-[0_0_24px_rgba(0,230,255,0.35)]` matching the `.btn-cta` glow language |
| Pointer events | none (default for DragOverlay) |
| Drop animation | `dropAnimation={null}` — instant snap on commit |

Final ghost classes (drop-in for `PostReadyDndGrid.tsx:123`):
```tsx
className="opacity-60 scale-95 rounded-lg overflow-hidden pointer-events-none
           border-2 border-[#00e6ff]/60
           shadow-2xl shadow-[0_0_24px_rgba(0,230,255,0.35)]"
```

### 3.5 Card-as-drop-target states (NEW for the whole card; partial for the strip)

The droppable currently lives on the **strip** (`useDroppable` in `DroppableImageStrip`). Extend to the whole card so a user can drop anywhere on a target carousel, not just inside its strip.

Three escalating tiers:

| Tier | Trigger | Card frame | Strip well |
|---|---|---|---|
| **0 — Idle** | No active drag, or drag started but pointer outside | `border-2 border-[#c5a062]/30` (existing) | `bg-zinc-950` |
| **1 — Eligible** (drag active, this card is a valid target, pointer is *somewhere*) | `activeData` set + `card.id !== activeData.sourceCarouselId` | `border-2 border-zinc-700/60` (subtle "ready to receive" — neutral, not urgent) | unchanged |
| **2 — Hovering** (pointer over card or strip) | dnd-kit `isOver === true` on either droppable | `border-2 border-[#00e6ff]/50` + `transition-all duration-300` | `bg-[#00e6ff]/5 ring-1 ring-[#00e6ff]/50` (existing) |
| **3 — Committed** (release imminent — within 100ms of mouseup over the target) | dnd-kit drop committed | flash `border-[#00e6ff]` + `shadow-[0_0_36px_rgba(0,230,255,0.40)]` for 200ms then settle to Tier 0 | brief 200ms `bg-[#00e6ff]/10` flash |

Implementation: wrap the card root in a `useDroppable({ id: \`card-\${carouselId}\` })` and OR its `isOver` with the strip's `isOver` to drive the Tier 2 styling.

---

## 4. Touch vs Mouse Drag States

@dnd-kit's `TouchSensor` already exists; the visual layer needs to differentiate.

### 4.1 Mouse mode (default)

- Drag handles fade in only on `group-hover` of the image cell. Out of sight when idle.
- Cursor: `cursor-grab` (over handle) → `cursor-grabbing` (active drag).
- Tier transitions are crisp (300ms) — desktop expects responsive feedback.

### 4.2 Touch mode (**NEW**)

Detect with the standard CSS `@media (hover: none) and (pointer: coarse)` query (or a `useHasHover()` hook).

- **Drag handles always visible** at `opacity-60`, bumped to `opacity-100` on first user interaction (200ms long-press starts). No hover affordance available — surfacing the handle is the only way the user discovers DnD on touch.
- Handle hit-target enlarges: `w-3.5 h-3.5` icon stays, but the surrounding button gets `p-2` instead of `p-0.5` so the tap area is ~28×28 (Apple HIG minimum). Use `before:absolute before:inset-[-8px]` to extend hit area without changing visual size.
- **Long-press feedback** (during the 200ms `TouchSensor` delay): radial scale-up of the handle pill — `scale-100 → scale-110 → scale-100` with `transition-transform duration-200`. Tells the user "we heard you, a drag is starting."
- Tier 2 hover state on touch is harder to convey since there's no cursor. The 16px gap-expansion + insert line (§8) compensates — exaggerate the expansion to 24px on touch.
- Tier 3 commit flash is identical (no change needed).

### 4.3 Keyboard mode (a11y)

- Tab cycles to each draggable image in tab order matching DOM (carousel-by-carousel, image-by-image inside).
- Focused image: `ring-2 ring-[#00e6ff] ring-offset-2 ring-offset-zinc-950` on the wrapper.
- Press **Space** to lift. Live region announces: `"Image X of carousel A is being dragged. Use arrow keys to move."`
- Arrow keys traverse droppable zones; the eligible target gets Tier 2 styling identical to mouse hover. A persistent visual cursor (a 2px Electric Blue outline pulsing on the active drop target) replaces the missing pointer.
- Press **Space** to drop, **Esc** to cancel. Live region announces the result: `"Image X moved to carousel B"` or `"Drop cancelled"`.

---

## 5. Empty Carousel During Drag (Receiving-Drop State)

This is the case where a carousel had 2 images, the user drags both away one-by-one, and the strip becomes empty. Per the cleanup in `MainContent.tsx:746` (`groups.filter(g => g.imageIds.length >= 2)`), empty groups are auto-pruned — but **mid-drag, between the lift and the drop, the group exists transiently with 1 or 0 images.**

### 5.1 Visual: empty / near-empty receiving state (**NEW**)

When a carousel has < 2 images AND a drag is active:

```
┌─────────────────────────────────────────────┐
│ [status pill]    [Carousel · 1]             │
├─────────────────────────────────────────────┤
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │      Drop image to add to carousel        │ │  ← dashed border placeholder
│ │      ⊕                                    │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└─────────────────────────────────────────────┘
```

Placeholder spec:
- `min-h-[144px]` (matches normal strip height — prevents layout jump)
- `border: 2px dashed`, color `border-zinc-700` resting → `border-[#00e6ff]/50` on Tier 2 hover
- `bg-zinc-950/40`
- Centered: `Plus` icon (lucide, 24×24, `text-zinc-600` → `text-[#00e6ff]/70` on hover) + `text-[11px] text-zinc-500` "Drop image to add to carousel"
- The text uses **NEXUS MONO** (`font-mono`) to match the technical/structural feel of placeholder copy elsewhere

### 5.2 Pruning trigger

After drop, if any group's `imageIds.length < 2`, prune via the existing logic (`groups.filter(g => g.imageIds.length >= 2)`). The placeholder NEVER persists outside an active drag — it's a transient affordance.

### 5.3 New-group hover (already implemented at `PostReadyDndGrid.tsx:51-59`)

Dropping a single image onto a *different* single image creates a new carousel. The receiving single's outer wrapper gets `ring-2 ring-[#00e6ff]/60 rounded-2xl`. **Spec'd; no change needed.**

### 5.4 Drop on a SCHEDULED carousel (warning case)

Carousels with `kind === 'scheduled'` can still receive drops, but the user should be warned that adding an image to a scheduled post requires re-confirming the schedule.

| State | Visual |
|---|---|
| Tier 1 eligible | `border-2 border-sky-500/60` (existing) — no change yet |
| Tier 2 hover | overlay a tooltip: `"Adding to a scheduled carousel will unschedule it"` — `bg-zinc-900 border border-amber-500/40 text-amber-300 text-[11px] px-2 py-1 rounded-lg shadow-2xl`, positioned above the card |
| Tier 3 commit | drop allowed; carousel auto-transitions to `ready` (unscheduled); show toast `"Carousel unscheduled — re-confirm schedule"` |

---

## 6. Carousel Header Drag — Full-Carousel Move (**NEW** — not yet implemented)

The story calls for "drag entire carousel as a unit." Today, only individual images are draggable. This adds a card-level drag handle.

### 6.1 Where the handle lives

The status-pill row (current `PostReadyCarouselCard.tsx:236-266`) gets a leading drag handle, before the status pill:

```
┌─────────────────────────────────────────────┐
│ ⠿  [status pill]  [Carousel · 3] [manual]  │   ← gap-2, handle is left-most
├─────────────────────────────────────────────┤
```

Specs:
- Icon: `GripVertical` (lucide), 16×16 (slightly larger than the per-image 14×14)
- Resting: `opacity-0` on mouse devices, `opacity-50` on touch (per §4.2)
- Card hover: `opacity-100`, `text-zinc-500 hover:text-zinc-200`
- Pill background: `bg-zinc-800/80 hover:bg-zinc-700` rounded-md, `p-1.5` so hit area is comfortable
- Cursor: `cursor-grab` → `cursor-grabbing`

### 6.2 Whole-card drag visuals

- Source card during drag: `opacity-30 scale-[0.98]` — slightly more pronounced than per-image (the user is moving a bigger thing, want bigger feedback).
- DragOverlay shows a **scaled-down preview** of the entire card: width 320px (down from natural ~520px), `scale-90`, `opacity-70`, `border-2 border-[#00e6ff]/60`, `shadow-2xl shadow-[0_0_36px_rgba(0,230,255,0.40)]`. Don't try to render the full card 1:1 — too large to track on screen.
- Whole-card overlay only renders the status pill row + first 3 image thumbs (clipped). User recognizes it as "the carousel" without bandwidth cost.

### 6.3 Drop targets for whole-carousel drag

- Drop zones are **between cards in the grid**, not on top of other cards. This is a re-order operation, not a merge.
- Insert-line indicator (§8 spec) appears horizontally between two cards in the grid, full-width, animate-pulse.
- Cards on either side gap-expand by 16px (so the line has room).
- Dropping the whole carousel onto another whole carousel does NOT merge them — that's an explicit "Combine" action, not implicit DnD. Show the not-allowed cursor or simply ignore the drop (return to origin).

### 6.4 Data model impact

`onMove.moveImageToCarousel` is the existing single-image API. Add a new handler signature for whole-group reorder:

```ts
export interface DndMoveHandler {
  moveImageToCarousel: (...) => void;        // existing
  moveImageToNewGroup: (...) => void;        // existing
  moveCarouselGroup: (groupId: string, beforeGroupId: string | null) => void;  // NEW
}
```

`moveCarouselGroup` reorders the `settings.carouselGroups` array. Pure UI — no schedule changes, no image reassignment. The order in `carouselGroups` already drives `sortPostItems` ordering.

---

## 7. Undo Indicator UI (**NEW** — Ctrl+Z is wired, no UI yet)

The current implementation registers `Ctrl/Cmd+Z` globally on `keydown` (MainContent.tsx:756-768) and pops `dndUndoStackRef`. Users have no idea this exists. Add a transient toast.

### 7.1 Toast appearance

After every successful DnD move, show a toast for **5 seconds**:

```
                         ┌──────────────────────────────────────────────┐
                         │  ↶  Image moved   ⌘Z  Undo                  │
                         └──────────────────────────────────────────────┘
                         │
                         └─ 5s remaining (progress bar at top, 1px tall)
```

Location: bottom-right of viewport. `position: fixed; bottom: 24px; right: 24px; z-index: 50`.

Box:
- `bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl`
- `backdrop-blur-md`
- `px-4 py-3`
- `flex items-center gap-3`
- `min-w-[280px]`

Content (left to right):
- `Undo2` icon (lucide), 16×16, `text-[#c5a062]`
- Label: `"Image moved to {carousel name}"` (or `"Carousel reordered"` for whole-card moves) — `text-sm text-zinc-200`
- Spacer (`ml-auto`)
- Keyboard chip: `<kbd className="font-mono text-[10px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300">⌘Z</kbd>`
- Action: `<button>Undo</button>` styled as `text-[11px] text-[#00e6ff] hover:underline`

Top edge: 1px progress bar that drains left-to-right over 5s — `bg-[#00e6ff]` with `transition: width 5000ms linear`. When it hits 0, the toast fades out (`opacity-0` over 200ms) and unmounts.

### 7.2 Toast behavior

- Pressing `⌘Z` / `Ctrl+Z` while toast is visible → triggers undo, replaces toast with `"Undone"` confirmation (1.5s, no progress bar, no keyboard chip).
- Clicking the `Undo` button → identical to keyboard.
- Hovering the toast → pauses the progress bar (and the dismissal timer). Common pattern; users hover to read.
- Successive moves stack: the second move REPLACES the first toast (don't pile up). The `dndUndoStackRef` already holds prior states, so multiple sequential undos work even if the toast only shows the most recent.

### 7.3 Touch behavior

On touch devices, the toast uses `bottom-4 left-4 right-4` (full-width minus 16px gutters) and the progress bar timer extends to **8 seconds** to compensate for slower reaction time and lack of hover-to-pause.

### 7.4 Where this lives

Recommend a `<DndUndoToast>` component sibling to `PostReadyDndGrid`, controlled by a small `useUndoToast()` hook. Hook listens to `onMove` callbacks and exposes `{ visible, message, undo, dismiss }`.

---

## 8. Insert Line Between Images (**NEW refinement** — current is top-of-strip only)

The current `DroppableImageStrip` shows a single `h-0.5 w-full bg-[#00e6ff]` insert line at the **top** of the strip when the strip is hovered (`PostReadyCarouselCard.tsx:132-134`). This communicates "drop is eligible somewhere" but not "drop is going to land HERE specifically." Upgrade to a position-aware insert line.

### 8.1 Detection

Use `@dnd-kit/sortable`'s `useSortable` per image (replacing the current `useDraggable` per image), with a horizontal `SortableContext` per strip:

```tsx
<SortableContext items={images.map(i => `drag-${i.id}`)} strategy={horizontalListSortingStrategy}>
  {images.map(img => <SortableImage key={img.id} image={img} carouselId={carouselId} />)}
</SortableContext>
```

dnd-kit's collision detection then yields the index *between* images where the drop will insert.

### 8.2 Visual

Between two images, when the pointer is between them, show a 2px-wide vertical Electric Blue rule that pulses:

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░ [img1] [img2] ║ [img3] [img4]          ░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                ↑
          insert line
```

Spec:
- `width: 2px`
- `height: 100%` of strip well (= 128px of image + 16px of strip padding = ~144px)
- `bg-[#00e6ff] rounded-full`
- `animate-pulse`
- The two flanking images push apart by **16px** (extra to the existing 4px `gap-1` = 20px effective gap) via a CSS transform: `translateX(±8px)`. `transition: transform 200ms ease-out`.
- On release: insert line snaps invisible (0ms — drop committed). Images animate back to default `gap-1` over 200ms as the new image lands in position.

### 8.3 At-the-end insertion

If the user hovers past the last image:
- Insert line appears flush against the right edge of the last thumb (still 2px wide).
- If the strip is `overflow-x-auto`-scrolled, ensure auto-scroll kicks in (per §2.4) so the user can drop after a hidden-right image.

### 8.4 Empty-strip insertion (intersect with §5)

When dropping into a strip with 0 visible images during drag (the placeholder state):
- The placeholder dashed box itself becomes the drop indicator
- No vertical insert line — the position is unambiguous (only one slot)
- The `Plus` icon in the placeholder pulses Electric Blue (`text-[#00e6ff] animate-pulse`) when Tier 2 hover is active

---

## Summary — Implementation Checklist for Dev

Already done (✓) vs new work needed (○):

- [✓] `@dnd-kit/core` deps installed
- [✓] `PostReadyDndGrid` with PointerSensor / TouchSensor / KeyboardSensor
- [✓] `DroppableImageStrip` with strip-level hover ring
- [✓] `DraggableImage` per-image with GripVertical handle, opacity-30 source dim
- [✓] `DragOverlay` rendering image ghost on drag
- [✓] `DraggableSingleWrapper` for single→new-group merge
- [✓] `dndUndoStackRef` + Ctrl+Z keyboard handler in `MainContent`
- [✓] Group prune (length < 2 filter)
- [○] `autoScroll` prop on `DndContext` (§2.4)
- [○] Card-level droppable + Tier 1/2/3 frame transitions (§3.5)
- [○] Glow on drag ghost (§3.4)
- [○] Source-image grayscale + opacity bump to 0.4 on the wrapper (§3.3)
- [○] Empty/near-empty placeholder during drag (§5.1)
- [○] Scheduled-carousel warning tooltip + auto-unschedule on drop (§5.4)
- [○] Carousel header drag handle + whole-card drag visuals + reorder API (§6)
- [○] Undo toast component (§7) — recommend `<DndUndoToast>` + `useUndoToast()` hook
- [○] Position-aware insert line via `SortableContext` + `horizontalListSortingStrategy` (§8)
- [○] Touch-mode handle visibility + larger hit target (§4.2)
- [○] Keyboard a11y live region announcements (§4.3)

## Out-of-scope for FEAT-2

- Cross-grid drag (e.g., drag an image from Post Ready into the Gallery view) — separate feature
- Multi-select drag (lasso + drag many images) — separate feature, would belong with Smart Bulk Select
- Drag-to-trash to remove from Post Ready — Post Ready already has `onUnready` per card; redundant
- Inter-platform drag (drag to a "Pinterest-only" vs "Instagram-only" zone) — better solved by per-platform toggles, not DnD

---

## Acceptance — Visual QA Checklist

Cross-reference with the story's existing functional ACs. Pure visual verification:

1. ✓ Resting carousel matches existing dark theme; no new chrome introduced.
2. ✓ Drag handle on image only visible on card hover (mouse) or always at 60% opacity (touch).
3. ✓ Source image dims to opacity-30 + grayscale-40% during drag.
4. ✓ Drag ghost shows the image at scale-95 with Electric Blue border + colored glow.
5. ✓ Hovered target carousel: full card border transitions to Electric Blue, strip well tints.
6. ✓ Insert line between images: 2px vertical, pulsing, flanking images push apart 16px.
7. ✓ Empty receiving carousel: dashed Electric Blue placeholder with `Plus` icon.
8. ✓ Whole-carousel drag: shrunk card preview, drop between grid cells with horizontal insert line.
9. ✓ Undo toast: bottom-right (or full-width on touch), 5/8s timer, progress bar drains.
10. ✓ Keyboard focus rings match the global `btn-*:focus-visible` style.
11. ✓ No off-brand colors anywhere — only `#00e6ff`, `#c5a062`, `#050505`, zinc-9xx, status colors.
12. ✓ All transitions ≤300ms; nothing feels sluggish.
