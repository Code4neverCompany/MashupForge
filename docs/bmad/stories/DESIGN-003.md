# DESIGN-003 — Reusable `<KebabMenu>` component spec

**Status:** design spec ready — implementation routes to Developer
**Owner:** Designer (spec); Developer (impl)
**Classification (per task file):** complex
**Routing per CLAUDE.md:** Designer mandate is "visual changes only — colors, styles, layout. NOT implementation logic." A new shared React component with state, click-outside, and keyboard handling is implementation work. **Designer ships this design spec; Developer implements `components/KebabMenu.tsx` from it.**

Companion to DESIGN-002, which assumes this component exists for the gallery action overflow row.

---

## 0. Brand kit — applied here

| Token | Hex | Tailwind | Where it lives in this component |
|---|---|---|---|
| Agency Black | `#050505` | `bg-zinc-950` / `bg-zinc-900` | Trigger button bg (idle), dropdown panel bg |
| Metallic Gold | `#C5A062` | `[#c5a062]` | Open-state ring on trigger, focus ring on items, hover accent on item icons, "destructive separator" line accent |
| Electric Blue | `#00E6FF` | `[#00e6ff]` | Trigger active/keyboard-focus ring (reserved for interactive feedback per brand discipline) |
| Failure Red | `red-400/500` | tailwind | Destructive item text + hover bg |

**Brand discipline note:** Gold = decoration / hover affordance; Blue = active interaction feedback. Destructive items get red but stay outside the gold/blue palette so they're unmistakable.

---

## 1. What it is

A small, accessible, single-trigger overflow menu. One button (three vertical dots) opens a downward dropdown of action items. Used wherever a card/row has more actions than fit comfortably on its primary surface.

**First consumer:** the gallery card action row (DESIGN-002 §3, items 7).
**Anticipated future consumers:** Post Ready cards, scheduled-post rows in the calendar, idea cards in the Ideas tab.

---

## 2. Visual states

### 2.1 Trigger button

Three states. All three sit in a `w-8 h-8` square (matches existing card icon row at `MainContent.tsx:4351-4474`).

| State | Visual |
|---|---|
| **Idle** | `bg-black/50 text-white rounded-lg backdrop-blur-md` — identical to sibling icon buttons so it doesn't visually shout |
| **Hover** | `hover:bg-[#c5a062]/80 hover:text-zinc-900` — gold hover to differentiate from action buttons (Approve = emerald, Delete = red, etc.). Reads as "more options" not "do a thing." |
| **Open** | `bg-[#c5a062] text-zinc-900 ring-2 ring-[#00e6ff]/50` — gold fill + electric-blue focus ring so the user can't lose track of which trigger spawned the panel |
| **Keyboard focus (closed)** | `focus-visible:ring-2 focus-visible:ring-[#00e6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950` |

Icon: `<MoreVertical className="w-4 h-4" />` from lucide-react (matches the other 4×4 icons in the card action row).

### 2.2 Dropdown panel

Anchored to the trigger. Default placement: **below + right-aligned**. Auto-flips above when within 220px of viewport bottom (see §5).

```
bg-zinc-900/95 backdrop-blur-md
border border-[#c5a062]/30           ← gold accent matches DESIGNER.md "Gold for borders"
rounded-xl shadow-2xl shadow-black/60
p-1.5 min-w-[180px] max-w-[240px]
z-50
```

Compare with the existing collection popover at `MainContent.tsx:4411` (`bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl`) — same family, but bumped to `border-[#c5a062]/30` to land on-brand instead of off-the-shelf zinc.

### 2.3 Menu items

Each item is a button row.

```
flex items-center gap-2.5
w-full px-2.5 py-2 rounded-lg
text-left text-xs text-zinc-300
hover:bg-[#c5a062]/15 hover:text-white
focus-visible:bg-[#c5a062]/15 focus-visible:outline-none
disabled:opacity-40 disabled:cursor-not-allowed
transition-colors
```

- **Icon:** `w-3.5 h-3.5 text-zinc-400 group-hover:text-[#c5a062]` (icon adopts gold on hover — subtle brand callback)
- **Label:** flex-1
- **Optional shortcut hint:** right-aligned `text-[10px] text-zinc-500 font-mono` (e.g. `⌫`, `⌘D`) — uses NEXUS MONO via the existing `font-mono` class

### 2.4 Destructive items

Items flagged `destructive: true` get a separator above and red text:

```
border-t border-zinc-800 mt-1 pt-1     ← separator wraps the destructive group
text-red-400 hover:bg-red-500/15 hover:text-red-300
```

Icon also adopts red. Used for: Delete, Remove from Collection, Clear, etc.

### 2.5 Section labels (optional)

For grouped menus, allow an `{ kind: 'label', text: 'Add to Collection' }` row:

```
px-2.5 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest
```

Mirrors the existing collection-popover label at `MainContent.tsx:4412`.

---

## 3. Animation

Keep it light — gallery is a grid; cascading animations would feel chaotic.

| Phase | Tailwind / Framer Motion |
|---|---|
| Open | `opacity 0→1`, `scale 0.95→1`, `translateY -4px → 0`, **120ms** ease-out |
| Close | reverse, **80ms** ease-in (close faster than open — feels responsive) |
| Item hover | `bg` 100ms ease (already covered by `transition-colors`) |
| Reduced motion | Respect `@media (prefers-reduced-motion: reduce)` — drop scale/translate, keep opacity only |

If the codebase already uses framer-motion (`motion.div` is imported in MainContent.tsx) the panel should use it for symmetry. Otherwise CSS transitions are fine.

---

## 4. Accessibility (must-have)

The codebase has **zero existing menu a11y** (no `aria-haspopup` / `aria-expanded` / Escape handling anywhere — confirmed by repo grep). This component sets the convention.

### Trigger
- `<button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel}>` (caller passes `ariaLabel`, e.g. `"More actions for image {prompt}"`)
- Keyboard: Enter / Space / ArrowDown opens the menu and focuses the first item

### Panel
- `role="menu"` on the panel root
- `role="menuitem"` on each action; `role="separator"` on dividers; `role="presentation"` on labels

### Keyboard navigation (inside open menu)
| Key | Behavior |
|---|---|
| ArrowDown / ArrowUp | move focus between items, wrapping at edges |
| Home / End | first / last item |
| Enter / Space | activate focused item, then close |
| Escape | close menu, return focus to trigger |
| Tab | close menu, normal tab order continues |
| Type-ahead (any letter) | jump to next item starting with that letter |

### Click-outside / focus-out
- Clicking outside the panel closes it
- Losing focus to anything not in panel closes it
- Scrolling outside the panel closes it (prevents the panel detaching from its anchor mid-scroll)

### Focus visibility
- Trigger: `focus-visible:ring-2 ring-[#00e6ff]` only on keyboard focus (mouse click should NOT show ring — use `:focus-visible`, not `:focus`)
- Items: visible `bg-[#c5a062]/15` highlight on focus, identical to hover

---

## 5. Positioning (Developer hand-off)

### Default
- Anchor below the trigger, right-aligned (so the panel grows leftward into the card, not offscreen).
- `position: absolute; top: calc(100% + 4px); right: 0;`

### Auto-flip rules
- If `triggerRect.bottom + panelHeight > viewport.bottom - 8`, flip to **above** the trigger (`bottom: calc(100% + 4px); top: auto`)
- If `triggerRect.right - panelWidth < 8`, switch to left-aligned (`left: 0; right: auto`)
- Recompute on open + on window resize while open

For the gallery grid specifically: cards near the bottom row of the viewport WILL trigger the auto-flip. This is mandatory, not optional.

### Portal vs in-tree
Render in-tree (no portal) for the gallery use case — the card has `overflow: hidden` on the image area but the action row is positioned inside the card's outer container which does NOT clip. Avoids portal z-index complexity.

If a future consumer has clipping issues, add an opt-in `portal={true}` prop that mounts the panel via `createPortal` to `document.body` and tracks the trigger position via a ref + ResizeObserver.

---

## 6. Component API (for Developer)

```ts
// components/KebabMenu.tsx

import type { LucideIcon } from 'lucide-react';

export type KebabMenuItem =
  | {
      kind: 'item';
      id: string;
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      destructive?: boolean;
      disabled?: boolean;
      shortcut?: string;     // e.g. "⌫"
    }
  | { kind: 'separator' }
  | { kind: 'label'; text: string };

export interface KebabMenuProps {
  /** Required for screen readers — describe what the menu controls. */
  ariaLabel: string;
  /** Items in display order. Empty array = render nothing. */
  items: KebabMenuItem[];
  /** Render the panel above instead of below. Default: auto. */
  placement?: 'auto' | 'top' | 'bottom';
  /** Override trigger button className (e.g. to match a sibling row) */
  triggerClassName?: string;
  /** Disable the trigger entirely (e.g. card is in busy state) */
  disabled?: boolean;
  /** Optional: notify parent when menu opens/closes (analytics, scroll-lock) */
  onOpenChange?: (open: boolean) => void;
}
```

Default `triggerClassName` matches the gallery card row pattern; consumers in different contexts can override.

---

## 7. Usage example (gallery card — what DESIGN-002 calls for)

```tsx
import { KebabMenu } from '@/components/KebabMenu';
import { Video, Download, Trash2, FolderPlus } from 'lucide-react';

<KebabMenu
  ariaLabel={`More actions for ${img.prompt.slice(0, 60)}`}
  items={[
    img.imageId && !img.isVideo
      ? { kind: 'item', id: 'animate', label: 'Animate', icon: Video, onSelect: () => handleAnimate(img) }
      : null,
    {
      kind: 'item',
      id: 'download',
      label: 'Download',
      icon: Download,
      onSelect: () => triggerDownload(img),
    },
    view === 'gallery'
      ? { kind: 'label', text: 'Add to Collection' }
      : null,
    // ...collection items mapped from collections[]
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onSelect: () => deleteImage(img.id, view === 'gallery'),
    },
  ].filter(Boolean) as KebabMenuItem[]}
/>
```

---

## 8. Visual sketches

### Idle (closed, in card hover row)
```
... [✓] [🔖] [📁] [⋮]
                  ↑
          gold-on-hover trigger
```

### Open (anchored below-right)
```
... [✓] [🔖] [📁] [⋮]   ← trigger now bg-[#c5a062]
                ╭───────────────╮
                │  ▶ Animate    │
                │  ▶ Download   │
                │ ─────────────  │
                │  ADD TO COL.  │
                │  ▶ Heroes     │
                │  ▶ Villains   │
                │ ─────────────  │  ← gold-tinted divider before destructive
                │  ✕ Delete     │  ← red text
                ╰───────────────╯
```

### Open (auto-flipped above — bottom-row cards)
```
                ╭───────────────╮
                │  ▶ Animate    │
                │  ▶ Download   │
                ╰───────────────╯
... [✓] [🔖] [📁] [⋮]
```

---

## 9. Acceptance checklist

- [ ] `components/KebabMenu.tsx` exported from a single file, no external dependency beyond what the project already uses (lucide-react, optionally framer-motion)
- [ ] All four trigger states render correctly (idle / hover / open / keyboard-focus)
- [ ] Panel respects auto-flip above when near viewport bottom
- [ ] Full keyboard nav per §4 works (verify with no mouse)
- [ ] Click-outside, Escape, Tab-out all close the menu
- [ ] Destructive items visually distinct (red + separator)
- [ ] No `console.error` for missing `aria-*` attributes (React-Aria style audit clean)
- [ ] Reduced-motion users get opacity-only animation
- [ ] Drop-in replaces the gallery card action overflow per DESIGN-002 §3.7
- [ ] Existing collection popover at `MainContent.tsx:4392-4430` migrated to use this component (or scheduled as follow-up — flagged below)

---

## 10. Out-of-scope / follow-ups

- **Submenus** (e.g. Collection → list of collections nested) — not in v1. Use a `label` row + flat list instead. If we need true submenus later, add `{ kind: 'submenu', items: [...] }`.
- **Right-click / context menu** mode — not in v1.
- **Touch long-press to open** — gallery cards use hover today; touch users tap the card to open the detail modal. Defer touch UX to a separate task.
- **Migrate the existing FolderPlus collection popover** to use `KebabMenu` — separate cleanup task; not blocking this one.

---

## 11. Open questions for Hermes/Maurice

1. Framer-motion or CSS-only animation? (`motion.div` is already used in MainContent.tsx, so framer is "free.")
2. Should the panel close when the user activates an item, or stay open for multi-select-style flows? **Default proposal: close on activate** — matches OS conventions. Multi-select would be a different component (a popover, not a menu).
3. Do we want a `<KebabMenu.Item>` compound-component API (`<KebabMenu><Item>...</Item></KebabMenu>`) or stay with the data-driven `items` prop? Data-driven is simpler to type and easier to filter/conditionally include items (see §7 example where some items only render in specific views). **Recommendation: data-driven.**

---

## 12. Routing recap

This task is **complex** per the task file's own classification. Per CLAUDE.md autonomic-loop §"Routing classification": complex items go to `~/.hermes/proposals.md` rather than self-assigning. I'm shipping the **design spec** as the Designer deliverable (visual + interaction + a11y rules). Hermes should route the actual `KebabMenu.tsx` build to Developer with this spec as the brief.
