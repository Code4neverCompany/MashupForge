# BUG-UI-002 — "GPT Image-1.5 pill visible but missing from params section"

**Status:** done — premise corrected; minor UX hardening shipped
**Classification:** routine
**Severity:** none (no data bug); UX papercut addressed

## Premise correction

Hermes inbox said:

> "Three model pills but AI-OPTIMIZED PARAMETERS only shows 2 cards."
> Acceptance: "Params shows all selected models."

The screenshot actually shows **four** pills, not three:

| Pill | Selected? | Visual cue |
|---|---|---|
| Nano Banana | **No** | Gray border, dim text, no checkmark |
| Nano Banana 2 | **Yes** | Gold border, gold text, BookmarkCheck icon |
| Nano Banana Pro | **Yes** | Gold border, gold text, BookmarkCheck icon |
| GPT Image-1.5 | **No** | Gray border, dim text, no checkmark |

Verified by cropping/zooming the model selection block
(`/tmp/pills-zoom.png`): the GPT Image-1.5 pill matches the
Nano Banana (unselected) styling exactly — no gold border, no icon,
dim zinc-400 text. Both unselected pills sit on row 2 of the 3-column
grid because there are 4 models total.

The CTA at the bottom of the panel reads **"Generate 2 Images"** —
which matches the 2 selected models. The AI-Optimized Parameters
section correctly shows 2 cards (one per selected model). There is
no mismatch between selection state and what the params section
renders.

## What the params loop does

`components/MainContent.tsx:1996-2008` iterates `comparisonModels.map()`
with no filter — every entry in the selection array renders at minimum
the model name span (line 2007 `{model?.name || modelId}`), even when
`modelPreviews[modelId]` is undefined. Verified `enhancePromptForModel`
(`lib/modelOptimizer.ts:41`) is a synchronous metadata-only function
that cannot throw for any registered model id, including
`gpt-image-1.5`. So if GPT Image-1.5 *were* in `comparisonModels`,
its name would appear in the params section regardless of preview
availability.

The fact that the params section shows exactly 2 cards is dispositive:
`comparisonModels` contains exactly 2 entries, both nano-banana
variants. Both cards show "Negative: yes" — `gpt-image-1.5` would
suppress the negative-prompt segment because
`modelOptimizer.ts:46` strips it (`supportsNegPrompt = modelId !==
'gpt-image-1.5'`). Another tell that GPT Image-1.5 is not selected.

## Why the misread is understandable

Looking at the screenshot quickly, all four pills sit in the same grid
with similar rounded-rectangle shapes. The selected/unselected
distinction is:

- Selected: gold border `border-[#c5a062]` + gold text + `BookmarkCheck` icon
- Unselected: zinc-800/60 border + zinc-400 text + no icon

In a 1920px screenshot rendered down to display, the gold border is
narrow enough that the *fill colour* (zinc-900 vs `bg-[#c5a062]/15`)
is the main visual cue, and at zoom level the difference is subtle
enough that "all four look like pills" is a reasonable first read —
which is exactly what tripped Hermes (and probably Maurice when he
filed the report).

## Fix shipped (UX hardening, not a bug fix)

Three small changes to `components/MainContent.tsx` so the selection
state is unmissable:

1. **Selection counter** in the "Select Models" label header:
   `Select Models` + `2 of 4 selected` (right-aligned, mono, dim).
   Now the user has an explicit, persistent confirmation of the
   selection count, independent of whether the pill border renders
   strongly enough.
2. **Unselected pills get a `Plus` icon** (instead of nothing) — the
   same slot the selected `BookmarkCheck` occupies, so the eye sees
   "tick = selected, plus = add". Pairs the existing iconography
   convention used in chip pickers (`Step2Niche.tsx`, `BulkTagModal.tsx`).
3. **Unselected pills dimmed to opacity-70** with hover bumping back
   to 100. Strengthens the at-a-glance contrast without changing the
   colour palette. Selected pills keep full opacity.
4. **`aria-pressed`** added to each pill button — the `<button>` was
   semantically a toggle but never advertised that to assistive tech.

The behaviour is unchanged: clicking a pill still toggles its
membership in `comparisonModels`. No state shape, no API call, no
network surface touched. Pre-commit passes (`tsc --noEmit && vitest run`,
455/455).

## Files touched

### Production
- `components/MainContent.tsx` — Select Models block (lines ~1916–1942):
  added selection counter span, switched the pill `.map` to use a
  named `isSelected` local + ternary for the icon slot + `aria-pressed`
  + opacity bump.

### Docs
- `docs/bmad/reviews/BUG-UI-002.md` (this file).

## Verification

- `npx tsc --noEmit` → exit 0 (no new type errors).
- `vitest run` → 455/455 pass via the pre-commit hook.
- Visual: cannot run dev server in this WSL session reliably; the
  changes are pure Tailwind + icon swap + aria attribute, no logic.
- Behaviour-equivalence: pill click handler unchanged; the
  `comparisonModels` state shape and persistence to
  `localStorage['mashup_comparison_models']` are untouched, so
  `useEffect` dependency arrays stay aligned.

## Out of scope

- **Stronger pill colour palette.** Could swap unselected to a flatter
  `bg-zinc-950` or remove the border entirely so selected pills pop
  more. Held off — would change the established gold/zinc design
  language and the Designer (V050-DES-002) didn't flag this in
  current work.
- **Auto-select all on mount.** The default state already selects all
  4 models on first load (`MainContent.tsx:1106`), so the pattern is
  "user explicitly *removed* models." Not a bug, just user choice.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-002","status":"done","summary":"Premise correction: there are FOUR model pills in the screenshot, not three. Verified by cropping/zooming /tmp/pills-zoom.png: Nano Banana (unselected, gray, no checkmark) | Nano Banana 2 (selected, gold border, BookmarkCheck) | Nano Banana Pro (selected, gold, BookmarkCheck) | GPT Image-1.5 (unselected, gray, no checkmark). CTA says 'Generate 2 Images' — matches the 2 selected. Params section correctly shows 2 cards (one per selected model). No data mismatch — the params loop iterates comparisonModels.map() with no filter, so every selected model would render its name even without preview data. Both visible cards show 'Negative: yes' which gpt-image-1.5 would never show (modelOptimizer.ts:46 strips negative prompts for it) — second tell that GPT Image-1.5 is unselected. Misread is understandable: at zoom-down resolution the gold-border vs gray-border distinction is subtle. Shipped UX hardening to prevent re-confusion: (1) selection counter '2 of 4 selected' next to the Select Models label, (2) unselected pills get a Plus icon in the same slot the selected BookmarkCheck occupies (tick=selected, plus=add convention from existing chip pickers), (3) unselected pills dimmed to opacity-70 with hover→100, (4) aria-pressed added for a11y. No state/behaviour change. Pre-commit green (455/455). MainContent.tsx ~25 LOC touched, single block. Doc at docs/bmad/reviews/BUG-UI-002.md."}
```
