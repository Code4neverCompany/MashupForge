# BUG-UI-005 — "Header status bar cramped"

**Status:** done — spacing + label legibility shipped
**Classification:** routine
**Severity:** low (cosmetic)

## Bug as reported

> "'Armed | 0 0 | Ready' needs better spacing."
> Acceptance: "Better spacing. Write inbox."

The header pipeline status pill (`PipelineStatusStrip`) was reading
ambiguously. The literal user-quoted string "Armed | 0 0 | Ready" was
the giveaway — there is no "0 0" anywhere in the data. The actual
content is "Armed · Q 0 · Ready", but at xs size the dim zinc-400
"Q " prefix sat so close to the count that it visually flattened into
a second digit. Combined with `gap-2` everywhere and a single `·`
character separator, the eye couldn't parse the segment boundaries.

## Root cause

`components/PipelineStatusStrip.tsx:93-108`. Three independent
contributors:

1. **Tight gap.** Container was `gap-2` (8px) between every child.
   The dot, Zap icon, label, separator dot, and queue text all sat at
   the same pitch — so "Armed" → "·" → "Q" → "0" looked like one run
   of equally-spaced glyphs rather than three groups.
2. **Single-character separator.** `<span>·</span>` at default size
   provided no visual gap, just a thin glyph that disappeared next to
   the dim zinc-500 text.
3. **Confusing queue label.** `<span className="text-zinc-400">Q </span>`
   followed by the count. At small size and dim weight, a lone "Q"
   reads as a zero, making "Q 0" look like "0 0".

## Fix shipped

Single-component edit, `components/PipelineStatusStrip.tsx`:

1. **Bumped container spacing.** `gap-2 px-2.5 py-1` →
   `gap-3 px-3 py-1.5`. Roomier hit-target plus visible breathing
   space between segments.
2. **Grouped each segment.** Wrapped the status (dot + Zap + label)
   in its own flex group with `gap-1.5`, so the icons stay tightly
   coupled to their label while the *segment-level* gap-3 separates
   it from the next group. Same for the queue group.
3. **Replaced `·` with a vertical divider.**
   `<span className="h-3 w-px bg-zinc-700" aria-hidden="true" />`.
   1px-wide, 12px tall hairline rule — the standard pattern for
   inline-toolbar separators. Reads as a divider at any size; the
   `·` did not.
4. **Renamed the queue label.**
   `Q ` (zinc-400, default size) → `Queue` (zinc-500, `text-[10px]`,
   uppercase, `tracking-wider`). Now visually distinct from the
   numeric count and unmistakably a label, not a digit. The count
   itself stays tabular-nums so width doesn't jitter as it changes.

The visual result is now legible as three discrete segments:
`[● ⚡ Armed]  |  [QUEUE 0]  |  [Ready]`.

## Files touched

### Production
- `components/PipelineStatusStrip.tsx` — render block only
  (lines 93–108): grouped children into flex sub-spans, swapped
  `·` for `<span class="h-3 w-px bg-zinc-700">`, switched the
  queue prefix to a tiny uppercase label. ~18 LOC delta.

### Docs
- `docs/bmad/reviews/BUG-UI-005.md` (this file).

## Verification

- `npx tsc --noEmit` → exit 0.
- `vitest run` → 455/455 pass via the pre-commit hook.
- Cannot run dev server visual smoke from WSL; the changes are pure
  Tailwind utility swaps + one renamed label. No state, no handlers,
  no logic.
- Behaviour-equivalence: same `pipelineEnabled` / `pipelineRunning` /
  `queueCount` / `timerText` reads from `useMashup()`, same `setView`
  click handler, same `aria-label` (still narrates as
  `Pipeline ${label}, queue ${queueCount}, ${timerText}` for screen
  readers). Visible class change only.

## Why I didn't go further

Considered:

- **Drop the Zap icon.** Would free more space but removes the
  brand-consistent action affordance. Held off.
- **Hide the "Queue" label entirely when count is 0.** Cleaner at
  zero but loses the at-a-glance schema for someone scanning the
  header. Held off — explicit > implicit.
- **Collapse the strip to a single icon at lg breakpoint.** Already
  hidden below `lg:` (`hidden lg:flex`). At lg the user has the
  width budget; cramming it tighter would be the wrong direction.

## Out of scope

- **Mobile/medium-breakpoint variant.** The strip is `hidden lg:flex`
  by design; smaller breakpoints get no status pill at all. Adding
  one would be a separate UX decision (probably a dot-only icon-link
  to the Pipeline tab).
- **Live region for queue changes.** `aria-label` updates
  on each render, but a `aria-live="polite"` annotation could
  announce queue depth changes. Probably noisy — defer until
  someone asks.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-005","status":"done","summary":"Header pipeline status pill was reading as 'Armed | 0 0 | Ready' — the dim 'Q ' prefix flattened into the count digit and gap-2 made all glyphs equidistant. Fix in PipelineStatusStrip.tsx render block (~18 LOC): (1) bumped container gap-2→gap-3 and px-2.5→px-3, (2) grouped each segment in its own flex span with gap-1.5 so icons stay tight to their label while segment gaps breathe, (3) swapped the '·' separator for a 1px×12px zinc-700 vertical hairline rule, (4) renamed 'Q ' prefix to 'Queue' in tiny uppercase tracking-wider zinc-500 (unmistakably a label, not a digit). Now reads as three discrete segments. No state/handler/aria changes; same useMashup() reads, same setView click, same aria-label. Pre-commit green (455/455). Doc at docs/bmad/reviews/BUG-UI-005.md."}
```
