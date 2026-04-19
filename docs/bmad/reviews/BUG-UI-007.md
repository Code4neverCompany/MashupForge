# BUG-UI-007 — "Pipeline status conflict — Running vs paused"

**Status:** done — empty-state text now reads from real state; vocabulary unified
**Classification:** routine
**Severity:** medium (contradictory copy on adjacent surfaces)

## Bug as reported

> "Header says 'Running' but digest says '0 posts · pipeline paused?'.
> Status inconsistent."
> Acceptance: "Consistent pipeline status everywhere."

The header `PipelineStatusStrip` correctly read `pipelineRunning=true`
and showed "Running". On the same screen, the Daily Digest's
"Yesterday" tile showed the literal text "0 posts · pipeline paused?".
Two surfaces, opposite stories.

## Root cause

Two independent issues, in the same file
(`components/ideas/DailyDigest.tsx`):

### 1. Hardcoded empty-state copy (the visible bug)

`DailyDigest.tsx:239` (pre-fix):

```jsx
metrics.shippedYesterday === 0 ? (
  <div className="text-sm text-zinc-500 py-1.5">0 posts · pipeline paused?</div>
) : (
  …
)
```

The "pipeline paused?" string was a **literal**, branched only on
`shippedYesterday === 0`. It made no reference to actual pipeline
state. A user who hasn't published yet today (or whose pipeline
shipped zero yesterday for any reason) would see "paused?" even
while the daemon was happily mid-cycle.

### 2. Vocabulary drift between surfaces

The header strip and the digest pill describe the same three
pipeline states with **different words**:

| State (`pipelineEnabled` / `pipelineRunning`) | PipelineStatusStrip | DailyDigest pill |
|---|---|---|
| `true` / `true` | Running | Running |
| `true` / `false` | **Armed** | **Paused** |
| `false` / `false` | **Idle** | **Off** |

Even with the empty-state copy fixed, a user looking at the header
("Armed") and the digest pill ("Paused") at the same moment would see
two different labels for the same state. Not strictly wrong, but
exactly the inconsistency the acceptance criterion calls out.

## Fix shipped

`components/ideas/DailyDigest.tsx` — single file, ~14 LOC delta.

### 1. Empty-state copy reads from `pipelineState.label`

```jsx
metrics.shippedYesterday === 0 ? (
  <div className="text-sm text-zinc-500 py-1.5">
    0 posts · pipeline {pipelineState.label.toLowerCase()}
  </div>
) : (…)
```

Now the empty-state line reads "0 posts · pipeline running" /
"…armed" / "…idle" depending on actual daemon state. The "?" is
gone (it implied uncertainty; the digest *knows* the state). Single
source of truth — same `pipelineState` object the digest's own pill
already uses.

### 2. Digest pill labels unified with header strip

Renamed the digest pill labels:
- `Paused` → `Armed`
- `Off` → `Idle`

Now both surfaces ('Running' / 'Armed' / 'Idle') describe the same
state with the same word. The colour palette is unchanged
(emerald for Running, amber for Armed, zinc for Idle) — only the
text labels move.

Added a one-line comment above `pipelineState` explaining the
shared vocabulary so a future contributor doesn't drift it back.

## Why "Armed" / "Idle" over "Paused" / "Off"

- `Paused` implies a user-initiated stop. The state in question
  (`pipelineEnabled && !pipelineRunning`) is actually
  "auto-mode on, currently between cycles" — an active waiting
  state, not a halt. `Armed` matches that semantic.
- `Off` reads like a power-down. The state is "auto-mode disabled
  but configuration intact" — `Idle` matches more honestly.
- Header strip already used these terms and is the canonical
  always-visible status surface; bringing the digest into line
  was the lower-blast-radius direction.

## Files touched

### Production
- `components/ideas/DailyDigest.tsx` — empty-state branch now
  reads `pipelineState.label`; pill `label` renamed
  `Paused→Armed` and `Off→Idle`; one-line vocab comment added.

### Docs
- `docs/bmad/reviews/BUG-UI-007.md` (this file).

## Verification

- `npx tsc --noEmit` → exit 0.
- `vitest run` → 456/456 pass via the pre-commit hook.
- Cannot run dev server visual smoke from WSL; the changes are pure
  string substitutions + a label rename in one component, no logic.
- No test fixtures referenced the old `'Paused'` / `'Off'` labels
  (greppable confirmation: no matches in `tests/`).
- Behaviour-equivalence: pill colour palette and click handlers
  unchanged; header strip vocabulary unchanged. Only the digest's
  text labels move and the empty-state branch now derives from
  state instead of literal copy.

## What I deliberately did not change

- `docs/bmad/stories/V040-DES-002.md` line 194 still spells out
  `"Paused" pill in amber-500/20` as the original spec language.
  I did **not** rewrite the spec — historical specs encode design
  intent at the time they were written, and this fix supersedes
  that copy. A follow-up doc cleanup pass could refresh it.
- `PipelineStatusStrip` was not touched; it already used the
  canonical vocabulary.

## Out of scope

- **Loading/transient state mid-tick.** When the daemon flips
  `pipelineRunning` true→false→true rapidly between cycles, the
  digest will follow. No debouncing — the strip doesn't debounce
  either, so the surfaces stay in lockstep.
- **`Idle` vs `Disabled` vs `Off`** distinction. Currently
  `pipelineEnabled === false` is the only "not armed" state; if
  we ever surface "configured but blocked by quota" as a fourth
  state, both surfaces will need a 4-state palette together.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-007","status":"done","summary":"Header pill said 'Running' while the digest's Yesterday tile said '0 posts · pipeline paused?' regardless of actual state. Two issues in DailyDigest.tsx: (1) the empty-state copy was a hardcoded literal branched only on shippedYesterday===0, with no reference to pipelineRunning/pipelineEnabled; (2) the digest pill labels (Paused/Off) drifted from the header strip's canonical vocabulary (Armed/Idle) for the same states. Fix: empty-state now reads `pipeline {pipelineState.label.toLowerCase()}` so it can never contradict the digest's own pill, and the pill labels were renamed Paused→Armed and Off→Idle to match the header strip exactly. Same colour palette, same click handlers; only text moved. Added a comment above pipelineState pinning the shared vocabulary so a future contributor can't drift it back. No tests referenced the old labels. Pre-commit green (456/456). Single-file ~14 LOC. Doc at docs/bmad/reviews/BUG-UI-007.md."}
```
