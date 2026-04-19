# BUG-CRIT-010 — KebabMenu dropdown rendered behind card prompt overlay

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** In Gallery view, the KebabMenu opened correctly but its
dropdown panel painted *behind* the card's bottom-prompt hover overlay.
The Delete item lived in the area covered by the overlay and was
visually obscured / hard to click.

## Root cause

`components/GalleryCard.tsx` has two stacking siblings inside the
card:

| Element                                | Line | z-index   | Pointer |
|----------------------------------------|------|-----------|---------|
| Top Actions Overlay (button row, hosts KebabMenu) | 252 | `z-20`    | auto    |
| Bottom prompt hover overlay            | 444  | `z-[20]`  | none    |

Both at `z-20`. CSS stacking ties are broken by paint order — and the
prompt overlay is *later* in the DOM, so it wins.

The KebabMenu's panel is `z-50` (`components/KebabMenu.tsx:341`), but
that `z-50` only applies *within* its parent's stacking context. The
parent button row's `z-20` is the value that actually competes with
the prompt overlay's `z-[20]`. Tie → later wins → kebab dropdown
painted underneath the prompt overlay text region (which is where
the dropdown lands when it opens downward via `top-[calc(100%+4px)]`).

The button row's `z-20` was originally enough because the prompt
overlay didn't exist when this code shipped — the overlay was added
later at the same z-tier without anyone re-checking the kebab.

## Fix

Bump the Top Actions Overlay row from `z-20` → `z-30` in
`components/GalleryCard.tsx:252`. The kebab panel inside it now wins
the paint-order race against the prompt overlay (`z-[20]`).

The bump does not regress any other layer:

| Other layer using z-30                              | DOM position vs button row | Outcome                  |
|-----------------------------------------------------|----------------------------|--------------------------|
| pipelinePending top-left badge (line 169)           | earlier in DOM             | doesn't overlap visually (top-left vs top-right) |
| Collection-modal dark backdrop (line 494)           | later in DOM               | still wins paint order at z-30 → unchanged |
| Error/loading overlays at z-40 (lines 131, 147)     | n/a                        | already higher → unchanged |

The buttons themselves (top-right) remain visually clear of the prompt
text region (bottom, with `pt-12` gap from the top), so no visual
regression.

## Acceptance criteria

| Criterion                              | Status |
|----------------------------------------|--------|
| Menu renders above card content        | ✓ (z-30 row wins paint order over the z-[20] prompt overlay) |
| Write inbox                            | ✓ (envelope below) |

## Files touched

### Production
- `components/GalleryCard.tsx`:
  - Line 252: `z-20` → `z-30` on the Top Actions Overlay container.
  - Inline comment pinning the BUG-CRIT-010 contract so a future
    refactor doesn't silently re-tie z-indices and orphan the kebab
    again.

### Tests
None. Stacking-order is a paint-time concern that vitest+jsdom can't
meaningfully assert. The inline docblock is the regression guard.

## Verification

- `npx tsc --noEmit` clean (pre-commit hook).
- `npx vitest run` — pre-commit hook gate; no test logic touched.
- Visual: kebab in Gallery view now opens with all items (incl.
  Delete) clickable; prompt overlay no longer paints over the
  dropdown.

## Out of scope (follow-up)

- The KebabMenu still uses absolute positioning inside its parent's
  stacking context. A more durable fix is to portal the panel to
  `document.body` with fixed positioning, which would eliminate the
  whole class of "parent stacking context traps the dropdown" bugs.
  Deferred — the z-30 bump solves the only known incidence, and a
  portal rewrite touches every existing KebabMenu usage in
  MainContent.tsx as well.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-010","status":"done","summary":"GalleryCard top-action row bumped from z-20 → z-30 so its KebabMenu dropdown paints above the bottom prompt overlay (also z-[20], later in DOM, was winning the paint-order tie). Delete item now clickable. tsc clean, no test logic touched."}
```
