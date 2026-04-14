# UX Review — DESIGN-002: Gallery Grid Hover Effects

**Role:** UX Expert (Sally)
**Date:** 2026-04-14
**Commit reviewed:** `8b25874`
**Verdict:** PASS with one fix recommendation

---

## What was implemented

Two changes to `components/MainContent.tsx` at the gallery image card:

1. **Card shadow/border** — gold glow opacity raised `0.08 → 0.18`, spread
   increased `20px → 40px`, offset added `y: 8px` for a physical lift feel.
   Added 1px inner gold ring at 15% opacity. Border opacity on hover: `/50 → /60`.

2. **Image-area gradient overlay** — `opacity-0 → opacity-100` on
   `group-hover` over 500ms. Gradient: gold `#c5a062` at 12% from bottom,
   Electric Blue `#00e6ff` at 6% from top, transparent mid. `pointer-events-none`,
   `z-[6]` (below approved badge z-10, action buttons z-20, state overlays z-40).

---

## Existing hover effects (not changed — noted for context)

| Layer | Effect | Timing |
|---|---|---|
| `motion.div` card | `scale: 1.02, y: -4` spring (stiffness 300, damping 25) | ~250ms spring |
| Card border + shadow | CSS transition-all | `duration-300` |
| `<Image>` / `<video>` | `group-hover:scale-110` | `duration-700` |

---

## Timing cascade analysis

On hover, the user perceives 4 layers firing in sequence:

1. **~250ms** — card springs up and out (immediate spring physics)
2. **300ms** — border brightens, shadow expands
3. **500ms** — gradient overlay fully visible (gold warmth + blue edge)
4. **700ms** — image zoom fully settled

This stagger is intentional and creates a sense of depth and progressive reveal.
The overall effect reads as premium. **Pass.**

---

## Layer / z-index audit

```
z-40  generating/error state overlays    (correct — always on top)
z-30  batch-select checkbox              (correct)
z-20  action button row                  (correct)
z-10  approved badge                     (correct — above overlay)
z-[6] DESIGN-002 gradient overlay        (correct — below badge)
auto  image / video                      (correct — below overlay)
```

No stacking conflicts introduced. Approved badge remains fully legible over
the overlay. Watermark div (`z-10` in video branch) also unaffected.
**Pass.**

---

## Drag-over interaction

When `dragOverCollection` is true, the card switches to
`ring-2 ring-[#00e6ff] border-[#00e6ff]/50` — overriding the hover shadow and
border. The gradient overlay is always in the DOM and opacity-controlled by
CSS `group-hover`, so it will still appear on hover during drag. At 12%/6%
max opacity, the overlay does not visually compete with the Electric Blue drag
ring. The drag affordance remains clear. **Pass.**

---

## Brand-kit compliance

| Token | Usage | Value | Status |
|---|---|---|---|
| Metallic Gold `#c5a062` | Overlay bottom, shadow, border | `#c5a062` / `rgba(197,160,98,...)` | ✓ |
| Electric Blue `#00e6ff` | Overlay top edge, shadow accent | `#00e6ff` | ✓ |
| Dark background `#050505` | Card bg (unchanged) | `bg-zinc-900/80` | ✓ |

---

## Accessibility

- `pointer-events-none` on overlay — click/keyboard targets unaffected. ✓
- No text is present in the image area below z-10, so the overlay does not
  reduce any text contrast. ✓
- Pre-existing: `whileHover` and CSS transitions do **not** currently respect
  `prefers-reduced-motion`. This is a project-wide pattern, not a DESIGN-002
  regression. Tracking as **follow-on** (DESIGN-004 candidate).

---

## Issue: overlay exit transition is 200ms slower than card border

**Severity:** Minor / Polish

On mouse-out:
- Card border snaps back in **300ms**
- Overlay fades out in **500ms**

The gradient lingers ~200ms after the border has already returned to rest.
This "trailing glow" effect is not necessarily wrong — some would call it
a soft fade — but it creates a timing inconsistency: the card border is
sharp and fast, while the overlay is slow and dreamy. Under rapid
hover-passes across a grid, this produces a brief mismatch where the border
is gone but the image still glows.

**Fix:** Change `duration-500` → `duration-300` on the overlay div so enter
and exit match the card's CSS transition timing.

---

## Fix (applied as part of this review)

Changed `transition-opacity duration-500` → `transition-opacity duration-300`
on the overlay div to synchronise exit timing with the card border.
