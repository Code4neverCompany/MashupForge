# STORY-MMX-PROMPT-WIRE — wire `buildEnhancedPrompt` into image-generation callers

**Date opened:** 2026-04-29
**Origin:** QA-W3 (MMX integration QA, CONCERNS 0.85)
**Status:** open — follow-up to v0.9.11
**Touches:** `lib/image-prompt-builder.ts`, `hooks/useImageGeneration.ts`, `app/api/leonardo/route.ts`, `app/api/mmx/image/route.ts` (when added)

---

## Background

`buildEnhancedPrompt` (in `lib/image-prompt-builder.ts`) is a tested,
provider-aware composer that emits both a shared enhanced prompt
string and structured per-provider options (`result.leonardo` /
`result.mmx`) from a base prompt + a model-spec lookup. It exists to
move style/aspect/quality decisions out of ad-hoc string concatenation
in callers and into one place that both providers can share.

Today it has zero production callers. `hooks/useImageGeneration.ts`
still:
- Concatenates prompt + negative prompt manually (`finalPrompt = ...`)
- Enhances prompts via the pi.dev / GLM route (`streamAIToString`)
- Passes `styleIds`, `aspectRatio`, `quality` directly to the Leonardo
  route, computed inline

The Leonardo route is already shape-compatible (it accepts
`styleIds`, `quality`, `width`, `height`) — the gap is the upstream
caller, not the route.

## Why this matters

- **Drift.** When a new spec arrives (e.g. a new Nano Banana model with
  different style IDs), the inline logic in `useImageGeneration.ts`
  has to be updated separately from the spec data.
- **MMX.** When `/api/mmx/image` lands, it will need the same
  prompt+aspect+style decisions Leonardo gets. Without `buildEnhancedPrompt`
  wired, that route will reimplement the logic.
- **Test coverage.** `buildEnhancedPrompt` has its own unit tests; the
  inline string-concat in `useImageGeneration.ts` is covered only by
  integration tests against Leonardo's mocked response. A regression
  in the spec lookup would slip past unit-test gates.

## Scope

1. Replace the inline prompt-enhancement + structured-param path in
   `hooks/useImageGeneration.ts` with a `buildEnhancedPrompt(...)` call,
   sourcing inputs from the active model spec + UI selections.
2. Keep `streamAIToString` (the pi.dev re-roll/enhance step) — it is
   orthogonal to spec-driven enhancement and continues to run when the
   user explicitly requests an AI re-imagine.
3. Add `/api/mmx/image/route.ts` as a thin wrapper that consumes
   `result.mmx` directly (the new route is part of this story, not a
   separate one).
4. Snapshot a few representative `buildEnhancedPrompt` outputs in
   integration tests so future spec additions surface in diff review.

## Out of scope

- Provider auto-fallback (already explicitly rejected in MMX-INT-FULL).
- Removing `streamAIToString` — kept until the AI re-imagine UX is
  re-evaluated separately.

## Acceptance criteria

- [ ] `useImageGeneration.ts` no longer hand-builds the Leonardo body
      for the spec-driven case; it calls `buildEnhancedPrompt` and
      forwards `result.prompt` + `result.leonardo` to the route.
- [ ] `/api/mmx/image/route.ts` exists and consumes `result.mmx`.
- [ ] All existing tests pass; new snapshot tests exercise at least
      Nano Banana Pro + GPT-Image-1.5 spec flows.
- [ ] No new production callers of `image-prompt-builder` are added
      without a TODO if they bypass the helper.
