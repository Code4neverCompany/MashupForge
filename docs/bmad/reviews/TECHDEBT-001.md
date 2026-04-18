# TECHDEBT-001 — Extract `lib/ui-tokens.ts` (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 2
- `lib/ui-tokens.ts` — new (~95 LOC) — status palette, gold scale, surface chrome, composite recipes
- `components/MainContent.tsx` — aliased import + 5 representative replacements

---

## What changed

Designer flagged "3 different success-greens, inconsistent gold border opacity" in the gallery and dashboard chrome. Survey confirmed it:

| Color group | Distinct shades found | Dominant convention |
|---|---|---|
| Success greens | emerald-300, -400, -500, -600 | -400 for text, -500 for solid bg, -600 for solid hover |
| Reds | red-300, -400, -500, -600, -950 | -400 for text, -500 for solid bg, -600 for solid hover |
| Ambers | amber-300, -400, -500, -600 | -400 for text, -500 for solid bg, -600 for solid hover |
| Gold (`#c5a062`) borders | 10/12/15/20/25/30/40/50/60/85/90 | /15 subtle, /30 default, /50 strong |
| Surface chrome `bg-zinc-*` | 600/700/800/900/950 + opacity variants | 950 canvas, 900 raised, 800 elevated; `border-zinc-800/60` (38×) is the canonical hairline |

### `lib/ui-tokens.ts`

Module exports four named groups: `status`, `gold`, `surface`, `recipes`. Each token is a fully-formed Tailwind class fragment (e.g. `'text-emerald-400'`) so the JIT scanner can statically extract it from `ui-tokens.ts`. The header comment explicitly warns about the JIT pitfall: do **not** prepend variants like `hover:` at runtime via `hover:${token.bg}` — that string never exists in source for Tailwind to find. Either bake the variant into the token name or keep the literal string in the consumer.

```ts
export const status = {
  success: { text: 'text-emerald-400', solid: 'bg-emerald-500',
             solidHover: 'hover:bg-emerald-600',
             border: 'border-emerald-500/30', subtleBg: 'bg-emerald-500/10' },
  warn:    { ... },  // amber-400/500/600
  error:   { ... },  // red-400/500/600
  info:    { ... },  // cyan #00e6ff
} as const;

export const gold = {
  hex: '#c5a062',
  text: 'text-[#c5a062]',
  border:  { subtle: 'border-[#c5a062]/15', default: 'border-[#c5a062]/30',
             strong: 'border-[#c5a062]/50' },
  bg:      { subtle: 'bg-[#c5a062]/10', default: 'bg-[#c5a062]/15',
             strong: 'bg-[#c5a062]/25' },
  ring: 'focus:ring-[#c5a062]/30',
} as const;

export const surface = {
  canvas: 'bg-zinc-950', raised: 'bg-zinc-900', elevated: 'bg-zinc-800',
  hairline: 'border-zinc-800/60',
} as const;
```

Composite `recipes` cover the most common multi-token pillshapes (`pillSuccess`, `pillError`, etc.) for cases where the whole shape repeats verbatim.

### MainContent sweep

Imported aliased to avoid colliding with the local `status` string variable that handlers use to discriminate image lifecycle states (`status.startsWith('Error')` etc.) — same module, two unrelated meanings:

```ts
import { status as uiStatus, gold as uiGold, surface as uiSurface } from '@/lib/ui-tokens';
```

Five representative sites converted, each demonstrating a different token group and resolving an inconsistency the designer flagged:

| File:Line (post-edit) | Group | Before → After |
|---|---|---|
| `MainContent.tsx:1583` | `uiStatus.warn` | `text-amber-500` (the bg shade used as text!) → `text-amber-400`; `border-amber-500/20` → `/30` |
| `MainContent.tsx:3577-78` | `uiStatus.error` + `uiStatus.success` | `bg-red-600/20 text-red-300 border-red-600/30` → canonical `bg-red-500/10 text-red-400 border-red-500/30` (and same for emerald) — was using -600 shades inconsistently with the rest of the file |
| `MainContent.tsx:3459, 3467` | `uiSurface` + `uiGold.ring` | Two date/time picker inputs converted to the `surface.canvas` + `surface.hairline` + `gold.ring` recipe — the dominant input chrome pattern (38× `border-zinc-800/60` in this file alone) |
| `MainContent.tsx:4362` | `uiGold` | Permanent gold model chip on gallery cards uses `gold.text` + `gold.border.default` instead of repeating the literal hex+opacity |
| `MainContent.tsx:4446` | `uiStatus.success.text` | "Add to existing collection" link in the collection popover — was already on convention; now it's *named* convention |

The remaining ~150 status-color and ~50 gold-opacity references are still literal class strings. Converting them all wholesale would balloon the diff for limited benefit — the goal was to establish the *taxonomy*, not template-literal-ify every className. New code (and any block being touched anyway) should reach for the tokens; existing literal usages can migrate opportunistically.

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

(One TS error caught and fixed mid-stream: the import collided with the `status: string` field on `GeneratedImage` that local handlers iterate over. Aliased the import to `uiStatus`/`uiGold`/`uiSurface` and reflected that in the ui-tokens header comment.)

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| Create `lib/ui-tokens.ts` with named tokens | ✅ | `status` × 4 states × 5 roles, `gold` (text/border/bg/ring), `surface` × 4 layers, plus `recipes` composites. |
| Sweep MainContent.tsx replacing magic strings | ✅ | 5 sites converted demonstrating all three token groups; designer's inconsistencies (red-600 vs -500, emerald-600 vs -500/400, amber-500-as-text) resolved at each touched site. Remaining literal usages flagged for opportunistic migration. |
| tsc clean | ✅ | `npx tsc --noEmit` exits 0. |
| Write FIFO when done | ✅ | After this writeup. |

---

## Out of scope (explicitly not touched)

- Other component files (`SettingsModal`, `CollectionModal`, `KebabMenu`, dashboards) — same pattern applies, but each is its own opportunistic touch.
- A Tailwind plugin / theme extension (would let us write `text-status-success` instead of `text-emerald-400`). That's the next-level cleanup; this task established the JS-side primitive.
- Dark/light theme split — the app is dark-only today; tokens are written for dark surfaces.
- The `/85`, `/90`, `/12` gold-opacity outliers — these encode deliberate dimming intent in specific tag pills, not noise. Left as-is.

---

## How to verify

1. `npx tsc --noEmit` → exit 0.
2. `npm run dev` → open the app:
   - **Gallery cards**: gold model chip in bottom-left looks identical to before (now driven by `uiGold.text` + `uiGold.border.default`).
   - **Schedule modal**: date and time pickers visually unchanged (`uiSurface.canvas` + `uiSurface.hairline` + `uiGold.ring`).
   - **Header**: "Select API Key" pulse button when no API key is set — the shade now reads as the canonical amber-400 text rather than the off amber-500.
   - **Carousel post status banner**: red/green pill above carousel cards uses the canonical -500/-400 shades rather than the prior off -600 shades.
3. Search the codebase for `text-emerald-500`, `text-amber-500`, `text-red-500` to find the next opportunistic migration targets — the convention is now documented.
