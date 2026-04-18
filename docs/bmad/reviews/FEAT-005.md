# FEAT-005 — KebabMenu component + gallery wire-in (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 2 created/modified
- `components/KebabMenu.tsx` (NEW, ~330 LOC)
- `components/MainContent.tsx` (gallery card action row only)

---

## What shipped

### `components/KebabMenu.tsx` — built per DESIGN-003 spec

Implementation choices (per task brief: "CSS transitions, close-on-activate, data-driven items API"):

- **CSS-only animation** — `transition-[opacity,transform] duration-[120ms] ease-out` open / `duration-[80ms] ease-in` close. Mount/unmount gated by a 80ms post-close timer so the close animation actually plays. No framer-motion to keep the component dependency-light.
- **Reduced-motion** — `prefers-reduced-motion: reduce` swaps the transform animation for opacity-only and zeros the unmount delay.
- **Data-driven items API** — exact `KebabMenuItem` discriminated union from §6 of the spec: `{kind:'item'|'separator'|'label', ...}`. Items prop is the only way to populate; no compound `<Menu.Item>` API.
- **Close-on-activate** — `activate(idx)` calls `onSelect()` then `close(true)` (true = return focus to trigger).

### A11y (full §4 conformance)

- Trigger: `aria-haspopup="menu"` + `aria-expanded={open}` + `aria-controls={menuId}` (when open) + `aria-label` from props.
- Panel: `role="menu"` + `aria-label`. Items get `role="menuitem"`; separators `role="separator"`; labels `role="presentation"`.
- Keyboard:
  - **Trigger**: Enter/Space/ArrowDown opens with focus on first item; ArrowUp opens with focus on last item; Escape closes; Tab follows normal flow.
  - **Panel**: ArrowDown/Up cycle (wrap), Home/End jump to first/last, Enter/Space activate, Escape closes (focus → trigger), Tab closes (focus passes through naturally), type-ahead jumps to next item starting with the typed letter (600ms buffer reset).
- Focus management: roving `tabIndex` (active item is `tabIndex=0`, others `-1`). `useLayoutEffect` calls `.focus()` on the active item so screen readers track movement.
- Click-outside: `pointerdown` listener on document with capture phase — closes when click lands outside trigger and panel.
- Focus-out: `focusin` listener — closes when focus moves outside the trigger/panel pair.
- Scroll-out: `scroll` listener with capture — closes if a scroll happens outside the panel itself (panel-internal scroll OK), preventing the panel from detaching from its anchor.

### Auto-flip positioning (§5)

- Default placement: `bottom + right-aligned`.
- `recomputePlacement()` runs on open (via `useLayoutEffect`) and on `resize`. Reads `triggerRef.current.getBoundingClientRect()`:
  - If `viewport.height - rect.bottom < 220 + 8` → flip to `top` (panel sits above trigger).
  - If `rect.right - 180 < 8` → switch to `left-aligned` (so the panel doesn't go off the left edge).
- Render placement uses Tailwind utility classes (`top-[calc(100%+4px)]` vs `bottom-[calc(100%+4px)]`, `right-0` vs `left-0`) — no inline style positioning.
- `placement` prop accepts `'auto' | 'top' | 'bottom'` to opt out of flipping if a consumer needs to.

### Visual states (§2)

- **Trigger idle:** matches the gallery card icon row (`w-8 h-8 bg-black/50 backdrop-blur-md`)
- **Hover:** `hover:bg-[#c5a062]/80 hover:text-zinc-900` (gold differentiates "more options" from emerald/red action buttons)
- **Open:** `bg-[#c5a062] text-zinc-900 ring-2 ring-[#00e6ff]/50` (the spec's active-blue ring on gold fill)
- **Keyboard focus (closed):** `focus-visible:ring-2 focus-visible:ring-[#00e6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`
- **Panel:** `bg-zinc-900/95 backdrop-blur-md border border-[#c5a062]/30 rounded-xl shadow-2xl shadow-black/60 p-1.5 min-w-[180px] max-w-[240px] z-50`
- **Items:** zinc-300 → white on hover, `hover:bg-[#c5a062]/15`. Icons go zinc-400 → gold via `group-hover:text-[#c5a062]` (subtle brand callback).
- **Destructive items:** red-400 text + `hover:bg-red-500/15 hover:text-red-300`. Icon turns red. A divider (`border-t border-zinc-800 mt-1 pt-2`) auto-renders above the first destructive item in a run, only when the prior row is not already a separator.

### Wired into gallery card (`MainContent.tsx`)

DESIGN-002 §3.7 plan applied — gallery view only:
- **Hidden in gallery** (with `view !== 'gallery'` guards): Animate, Save-to-Gallery (Bookmark), Delete.
- **Kept in gallery** (primary actions): Approve, Add-to-Collection (FolderPlus popover — kept as-is for now since it's a multi-item popover, not a single action), Save-for-Post (Save → post-ready).
- **KebabMenu added** when `view === 'gallery'` with items: Animate (when `imageId && !isVideo`, disabled while animating), Download (creates an `<a download>` and clicks it), separator, Delete (destructive).
- Studio view is unchanged (out of scope per "wire into gallery card action row").

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

One incidental fix: a `view === 'gallery'` comparison inside a `view !== 'gallery'` guard branch became dead code and triggered TS2367. Replaced with the literal `false` it had narrowed to.

---

## Acceptance checklist (from task)

- [x] **KebabMenu.tsx built per DESIGN-003 spec** — all four trigger states, panel styling, item styling, destructive separator, optional shortcut hint, optional label rows.
- [x] **CSS transitions only (no framer-motion)** — `transition-[opacity,transform]` with explicit durations.
- [x] **Close on item activate** — `activate()` calls `close(true)`.
- [x] **Data-driven items API** — `KebabMenuProps.items: KebabMenuItem[]` is the sole API.
- [x] **Full a11y** — roles, aria-haspopup/expanded, full keyboard nav incl. type-ahead, focus management, click-outside, focus-out, scroll-out.
- [x] **Auto-flip when near viewport bottom** — `recomputePlacement()` flips when `vh - rect.bottom < 220 + 8`.
- [x] **Wired into gallery card action row** — replaces 3 hidden buttons (Animate/Bookmark/Delete) + adds Download which previously only existed in the bottom hover overlay.
- [x] **tsc clean** — verified.
- [x] **Write FIFO when done** — done after this writeup.

---

## Out of scope (deferred follow-ups)

- **Migrate the existing FolderPlus collection popover to KebabMenu** — DESIGN-003 §10 flags this as a separate cleanup task. The Add-to-Collection popover has multi-row dynamic content (collections list, drag-and-drop targets, "New Collection" CTA) and is more naturally a popover than a menu. Lifting it now would balloon scope.
- **Studio view kebab compression** — DESIGN-002 §3.7 also calls for studio's row to compress (Approve/Save-to-Gallery/Re-roll primary; Animate/Download/Delete + collections in kebab). FEAT-005 task specifically said "gallery card action row," so I left studio alone. Recommend a follow-up `FEAT-005b` to apply the same kebab pattern to studio cards.
- **Touch UX** — long-press to open kebab on touch devices is flagged in DESIGN-003 §10. Defer to its own task.

---

## How to verify

1. `npm run dev`
2. Open the gallery view (cards saved to gallery).
3. Hover any card → top-right action row shows: Approve, Add-to-Collection, Save-for-Post, **⋮ kebab**.
4. Click the kebab — panel opens below-right with: Animate (if applicable), Download, separator, Delete (red).
5. Scroll the gallery so a card sits in the bottom row — kebab on those cards should auto-flip to open above the trigger.
6. Tab into the kebab trigger, press Enter/ArrowDown → first item gets focus. ArrowDown/Up cycles. Type "d" → focus jumps to "Download." Escape → focus returns to trigger.
