---
id: V030-008-per-model
title: V030-008 — per-model parameter suggestions + style UUID safety net
status: done
date: 2026-04-18
---

# V030-008 (per-model) — Smart parameters become per-model

## Why

V030-008 originally returned ONE set of parameters that the user
applied to whichever models they had selected. That's wrong: each
Leonardo.AI model exposes a different parameter surface. `gpt-image-1.5`
takes `quality` (LOW/MEDIUM/HIGH); `nano-banana-pro` takes `style_ids`
(UUIDs); `kling-3.0` takes `duration` + `mode` + `motion_has_audio`.
A global suggestion is necessarily lossy.

Maurice's directive: for each selected model, call pi.dev with that
model's capabilities and let pi reason about the optimal settings for
that specific model.

## What changed

### `lib/leonardo-api-docs.ts`
- Added `LEONARDO_API_DOCS_BY_MODEL: Record<string, string>` — per-id
  doc slice for each of the 6 production models.
- Kept `LEONARDO_API_DOCS` (concatenation) for the legacy holistic
  prompt path.

### `lib/param-suggest.ts`
- New `PerModelSuggestion` discriminated union (`PerModelImageSuggestion |
  PerModelVideoSuggestion`).
- `ParamSuggestion` gained `perModel: Record<string, PerModelSuggestion>`.
  Top-level shared fields kept for back-compat with the existing apply
  path that writes to a single shared `comparisonOptions`.
- `suggestParameters` (rule engine) now derives a per-model entry per
  shortlisted model: image entries get aspect/dims/imageSize/quality/
  style/promptEnhance; video entries get aspect/dims/duration/mode/
  motionHasAudio. The "best shared" view is taken from the first
  (highest-ranked) entry.
- `suggestParametersAI` runs the rule engine first for the shortlist
  and per-model fallback values, then fires **N parallel pi.dev
  calls** — one per shortlisted model. Each call gets ONLY that
  model's API doc slice via `LEONARDO_API_DOCS_BY_MODEL`. Per-model
  failures fall back to that model's rule-engine entry. Overall
  source rolls up: all-ai → `ai`; any-ai → `ai+rules`; none → `rules`.
- New `buildPerModelPromptPayload` constructs the per-model prompt.
  The image variant explicitly demands the style NAME (not UUID).

### Style UUID safety net
- `resolveStyleAlias(raw, availableStyles)` accepts either a NAME or
  a UUID and returns the canonical NAME (or undefined).
- Wired into `mergePerModelAI` so if pi disobeys and returns a UUID,
  the system maps it back to the name. Downstream
  (`useComparison.ts:146`, `useImageGeneration.ts:515,689`) already
  resolves NAME → UUID before hitting `/api/leonardo`, so consistent
  name handling at this layer is what matters.
- The per-model pi prompt was strengthened with a CRITICAL note:
  "return the human-readable NAME … Do NOT return a UUID. The app maps
  the name → UUID before calling Leonardo."

### `components/ParamSuggestionCard.tsx`
- Rewritten to show one section per shortlisted model, each with that
  model's resolved parameters and a 1-2 sentence reason. Edit mode
  exposes per-model overrides (image vs. video editor variants).
- Apply hands back BOTH the legacy "shared" GenerateOptions (derived
  from the first model) and the full per-model map. The Compare tab
  consumer takes the shared options today; per-model state plumbing in
  the Compare tab is left as future work (noted in `MainContent.tsx`).

### `components/MainContent.tsx`
- `handleApplySuggestion` now accepts the per-model map (currently
  `_perModel`, ignored — comparisonOptions is still a single shared
  GenerateOptions).

## Why we didn't add a Leonardo `/presets` style fetch

Maurice's brief asked: "Check the Leonardo API for a style presets
listing endpoint. If it exists, fetch it and cache it." There is no
such public endpoint exposed in this codebase, and Leonardo's v2 docs
don't surface one. The 19 style preset UUIDs are already hardcoded in
`LEONARDO_SHARED_STYLES` (types/mashup.ts:324-344), and the rest of
the pipeline already does NAME → UUID translation correctly — the gap
was just at the pi-output layer, which the safety net + prompt
strengthening close.

If Leonardo ever ships a presets endpoint, the safety net is
forward-compatible: `availableStyles` is already plumbed into the
merge layer and could be populated from a fetch instead of the
hardcoded constant.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 24 files / 260 tests passing
- `tests/lib/param-suggest.test.ts` → 20 tests covering:
  - Per-model entries emitted per shortlisted model
  - Image entry width/height/imageSize/promptEnhance
  - 2K + HIGH bump on detail keywords
  - Quality omitted for models that don't expose it
  - Style only set when model supports `style_ids`
  - Aspect ratio clamped to 1:1 when model only supports 1024x1024
  - Per-model AI calls (one per model)
  - Per-model failure isolation (fallback to rules for that model only)
  - **UUID accidentally returned by pi → resolved back to canonical name**
  - Invented style names dropped
  - Video model per-model entry shape

## Out of scope (deliberate)

- Per-model state in the Compare tab. The card surfaces per-model
  values; applying still writes a single shared `comparisonOptions`.
  Threading per-model overrides through the Compare tab's render +
  generate path is a separate refactor.
- Refactoring the duplicated NAME → UUID lookup blocks in
  `useComparison.ts` and `useImageGeneration.ts` into a shared
  helper. Out of scope per "don't refactor beyond what the task
  requires"; the existing inline blocks work correctly.

## Files touched

- `lib/leonardo-api-docs.ts` (per-model slice export)
- `lib/param-suggest.ts` (per-model types + N parallel pi calls + UUID safety net)
- `components/ParamSuggestionCard.tsx` (per-model UI)
- `components/MainContent.tsx` (apply signature)
- `tests/lib/param-suggest.test.ts` (per-model coverage)
