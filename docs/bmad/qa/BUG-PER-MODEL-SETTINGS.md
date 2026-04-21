# QA Review: Per-Model Settings Isolation Fix (d778bff)

**Commit**: d778bff `fix: per-model settings isolation in ParamSuggestionCard`
**Reviewed**: 2026-04-20
**Result**: **PASS** with minor findings

---

## Bug Summary

Two bugs fixed:
1. Tab/panel selection didn't switch which model's settings were displayed
2. Style changes bled to ALL models instead of staying on the edited model

## Fix Analysis

### MainContent.tsx changes

**New state**: `perModelOverrides: Record<string, { style?, aspectRatio?, negativePrompt? }>` — one entry per model, keyed by modelId.

**handleApplySuggestion (lines 1455-1479)**: Iterates `modelIds`, extracts only style/aspectRatio/negativePrompt from each per-model entry. Uses `setPerModelOverrides` so each model retains independent values. Correct approach.

**Preview effect (lines 1153-1191)**: Reads `perModelOverrides[modelId]` per model during the async preview loop. Uses nullish coalescing (`??`) so overrides take precedence over `comparisonOptions` but fall back cleanly. `perModelOverrides` is in the dependency array — previews recompute when overrides change. Correct.

**handleCompare (lines 1491-1508)**: Merges `perModelOverrides` into `modelPreviews` via spread, so overrides win over cached enhancements. Passes merged map to `generateComparison`. Correct.

### ParamSuggestionCard.tsx

Card state uses `structuredClone(suggestion.perModel)` — deep copy ensures local edits never mutate the parent's data. `updateImageField` / `updateVideoField` use functional updater with immutable spread (`{ ...prev, [modelId]: { ...cur, [field]: value } }`). This is the correct pattern and already existed before this fix — the card component itself was already isolating per-model state. The bug was that MainContent wasn't consuming the per-model map.

### Test results

**52 test files, 548 tests — ALL PASSING**.

### New tests (tests/components/ParamSuggestionCard.test.tsx)

5 tests covering:
1. Panel rendering for each selected model
2. Style change isolation (change model A's style, model B unaffected)
3. Apply emits full per-model map with independent values
4. Toggling a model off removes it from the Apply payload
5. Independent aspect ratio changes per model

Coverage is adequate for the two bugs fixed. Tests verify the card's internal isolation AND the emitted payload shape.

## Findings

### ShouldFix: Type mismatch on handleApplySuggestion parameter

`handleApplySuggestion` receives `perModel: Record<string, unknown>` but the `ParamSuggestionCard.onApply` prop emits `Record<string, PerModelSuggestion>`. The handler must cast:

```typescript
const entry = perModel[id] as { style?: string; aspectRatio?: string; negativePrompt?: string } | undefined;
```

This works but is fragile. The handler should match the prop type:

```typescript
perModel: Record<string, PerModelSuggestion>
```

Then access `entry.style` etc. directly without cast. Non-blocking but a type-safety smell.

### Nit: Stale overrides accumulate in state

If a user applies suggestions for models [A, B, C], then deselects model C from the comparison UI, `perModelOverrides` still has a key for C. The preview effect is unaffected (it only iterates `comparisonModels`), and `handleCompare`'s merge only touches models in `modelPreviews`. The stale entry is harmless but could be cleaned up by filtering `perModelOverrides` against `comparisonModels` in the preview effect or a separate effect.

### PASS: No shared-state leak paths found

- `perModelOverrides` is only written in `handleApplySuggestion` (full replace, not merge)
- Read paths iterate per-model with `comparisonModels` as the source of truth
- Card uses immutable functional updaters keyed by modelId
- No global mutable state is touched

## Verdict

**PASS**. The fix correctly addresses both bugs. Per-model state is properly isolated through a new `perModelOverrides` map that flows from the suggestion card's Apply button into the preview and generation paths. All 548 tests pass, including 5 new tests that directly verify the isolation behavior. The type mismatch on the handler parameter is a minor code quality issue but does not affect correctness.
