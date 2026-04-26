---
type: review
task_id: V090-PIPELINE-STYLE-DIVERSITY
commit: 5ee3f79
reviewer: qa
date: 2026-04-24
verdict: approved-with-notes
confidence: 0.88
---

# QA Review — V090-PIPELINE-STYLE-DIVERSITY

**Verdict: APPROVED WITH NOTES** — logic is correct, all edge cases degrade gracefully. One test gap flagged; two minor style issues. No blockers.

---

## Scope

Commit `5ee3f79` — three files:
- `types/mashup.ts` — `perModelOptions` field on `GenerateOptions`
- `hooks/useIdeaProcessor.ts` — extract per-model styles from `suggestion.perModel`
- `hooks/useComparison.ts` — per-model style resolution; skip for non-style models

---

## Focus Area 1: `modelSupportsStyle` — correctness across all models

**Check used:**
```typescript
const modelConfig = LEONARDO_MODELS.find(m => m.id === modelId);
const modelSupportsStyle = Boolean(modelConfig?.styles?.length);
```

**All LEONARDO_MODELS entries evaluated:**

| Model | styles field | modelSupportsStyle | Correct? |
|---|---|---|---|
| `nano-banana` | `LEONARDO_SHARED_STYLES` (19) | `true` | ✅ |
| `nano-banana-2` | `LEONARDO_SHARED_STYLES` (19) | `true` | ✅ |
| `nano-banana-pro` | `LEONARDO_SHARED_STYLES` (19) | `true` | ✅ |
| `gpt-image-1.5` | absent | `false` | ✅ |

**nano-banana-pro** (`apiModelId: 'gemini-image-2'`): has `styles: LEONARDO_SHARED_STYLES`. `LEONARDO_MODEL_PARAMS['nano-banana-pro']` also sets `style_ids: true`. Both data sources agree — style capable. ✅

**kling-o3** (`type: 'video'`): not present in `LEONARDO_MODELS` at all — it lives in `LEONARDO_VIDEO_MODELS`. `LEONARDO_MODELS.find(m => m.id === 'kling-o3')` returns `undefined`, so `modelSupportsStyle = false`. Style injection and UUID lookup are both skipped. Correct outcome for a video model, even if the reason is "not found" rather than "explicitly false". ✅

**Two-source consistency check:** `LEONARDO_MODELS[x].styles?.length` (used by useComparison) and `LEONARDO_MODEL_PARAMS[x].style_ids` (used by param-suggest rule engine) agree on all models in LEONARDO_MODEL_PARAMS. No cross-source drift detected.

---

## Focus Area 2: `useIdeaProcessor.ts` — style-capable image model coverage

**Extraction loop:**
```typescript
for (const mid of Object.keys(suggestion.perModel)) {
  const entry = suggestion.perModel[mid] as PerModelSuggestion;
  if (entry.type === 'image' && entry.style) {
    perModelOpts[mid] = { style: entry.style };
  }
}
```

`suggestion.perModel` is populated by `suggestParametersAI` which iterates `includedModelIds` and skips any model not in `LEONARDO_MODEL_PARAMS` (`if (!spec) continue`). Coverage:

| Model | In LEONARDO_MODEL_PARAMS | Gets perModel entry | style_ids | Gets style diversity |
|---|---|---|---|---|
| `nano-banana-2` | ✅ | ✅ | `true` | ✅ |
| `nano-banana-pro` | ✅ | ✅ | `true` | ✅ |
| `gpt-image-1.5` | ✅ | ✅ | `false` | skipped (correct) |
| `nano-banana` | ❌ (excluded by default) | ❌ | — | n/a |
| `kling-o3` | ✅ (type: video) | ✅ | n/a | `type === 'video'` → filtered out ✅ |

**nano-banana v1 note:** Excluded from shortlist by default — verified by `param-suggest.test.ts:174` (`expect(s.perModel['nano-banana']).toBeUndefined()`). Not a regression; intentional legacy exclusion.

**Filter `entry.type === 'image' && entry.style` is correct:** video models (kling) pass through perModel but are correctly filtered out here. GPT-1.5 passes through with `style: undefined` so it's also filtered. Only style-capable image models with an actual style suggestion reach `perModelOpts`. ✅

**Style diversity works:** `suggestParametersAI` uses a `usedStyles` exclusion set so nano-banana-2 and nano-banana-pro receive different styles when the candidate pool allows it. Tested in `tests/lib/param-suggest.test.ts` (lines 298–307). ✅

---

## Focus Area 3: `perModelOptions` undefined — manual compare fallback

**Resolution chain:**
```typescript
const perModelStyle = options?.perModelOptions?.[modelId]?.style;  // optional chain
const effectiveStyle = modelSupportsStyle
  ? (perModelStyle || enhancement.style || options?.style)
  : undefined;
```

**Case: `options` is `undefined` (manual compare, no options)**
- `perModelStyle = undefined`
- `effectiveStyle = undefined || undefined || undefined = undefined`
- `modelPrompt = enhancement.prompt` (no `Art style: X` suffix)
- `leonardoStyleUuids = undefined` (early return: `if (!modelStyle) return undefined`)
- Result: pre-V090 behavior, unmodified. ✅

**Case: `options.perModelOptions` is `undefined` (pipeline, but `suggestParametersAI` threw → fallback `{ negativePrompt: baseNegative }`)**
- `perModelStyle = undefined`
- Falls through to `enhancement.style || options?.style`
- Pre-V090 shared-style behavior. ✅

**Case: `options.perModelOptions[modelId]` absent for a specific model (nano-banana v1, if somehow included)**
- `perModelStyle = undefined`
- Falls through to shared style. No crash, correct degradation. ✅

Fallback chain is sound for all reachable code paths.

---

## Focus Area 4: style name → UUID mismatch (silent degradation)

**UUID lookup:**
```typescript
const leonardoStyleUuids = (() => {
  if (!modelStyle) return undefined;
  const modelConfig = LEONARDO_MODELS.find(m => m.id === modelId);  // ← re-lookup
  if (!modelConfig?.styles) return undefined;
  const match = modelConfig.styles.find(s =>
    s.name.toLowerCase() === modelStyle.toLowerCase() ||
    s.name.toLowerCase().includes(modelStyle.toLowerCase())
  );
  return match ? [match.uuid] : undefined;
})();
```

**When `modelStyle` comes from `perModelStyle` (V090 primary path):**
`perModelStyle` originates from `suggestion.perModel[mid].style` which is only set when `availableStyleNames.has(candidate)` (line `param-suggest.ts:370-376`). `availableStyleNames` is built from `LEONARDO_SHARED_STYLES`. Therefore a per-model style will **always** match the UUID lookup. The miss path is unreachable via V090's primary path. ✅

**When `modelStyle` comes from `enhancement.style` (fallback, pre-existing):**
`enhancement.style` is the return value of `enhancePromptForModel` — a pi.dev call. If pi.dev returns a style name outside `LEONARDO_SHARED_STYLES`, `leonardoStyleUuids` will be `undefined` while `Art style: X` is still text-injected into `modelPrompt`. This is a pre-existing silent degradation, not introduced by V090.

**Behavior when UUID miss occurs:** No crash, no error — API call proceeds without `styleIds` parameter. The style hint is still in the text prompt. Acceptable degradation.

---

## Minor Issues

### ISSUE-1 — Redundant intermediate variable (useComparison.ts:137-140)

```typescript
const effectiveStyle = modelSupportsStyle
  ? (perModelStyle || enhancement.style || options?.style)
  : undefined;
const modelStyle = effectiveStyle;  // ← pure alias, adds no clarity
```

`modelStyle` is immediately assigned from `effectiveStyle` and never differs. The two-variable form suggests they might diverge in a later revision, which they don't. A single `const modelStyle = ...` with the ternary is cleaner.

**Severity:** Cosmetic. Not a bug.

### ISSUE-2 — Duplicate `LEONARDO_MODELS.find` in same block (useComparison.ts:135,161)

`modelConfig` is looked up at line 135 for the `modelSupportsStyle` check. The `leonardoStyleUuids` IIFE at line 161 re-runs the same `LEONARDO_MODELS.find(m => m.id === modelId)` independently. The outer `modelConfig` is in scope and could be reused.

**Severity:** Minor inefficiency. Not a bug (same result). Suggest passing `modelConfig` into the IIFE or inlining the UUID lookup using the already-resolved variable.

### TEST-GAP — No useComparison unit tests for the new code path

`tests/lib/param-suggest.test.ts` covers the **generation side** of style diversity (rule engine outputs correct per-model styles). But there are no tests for the **consumption side** in `useComparison` — specifically:

- `perModelOptions` undefined → falls back to `enhancement.style` (Focus Area 3)
- `perModelOptions[modelId]` present → overrides enhancement style (the V090 feature)
- `modelSupportsStyle = false` → style text not injected, no styleIds sent (Focus Area 1)
- UUID lookup miss → returns `undefined` (Focus Area 4)

`useComparison` is a React hook (fetch-dependent), so a full integration test is expensive. However, the style-resolution logic (lines 132–143) is pure enough to extract or test via a helper. Recommend a follow-up story to pin these invariants before a future refactor silently drops the per-model override. Pattern reference: `BUG-PIPELINE-002` / `tests/integration/usePipeline-autostart.test.tsx`.

**Severity:** Medium. No existing behaviour is broken, but the new code path has zero direct test coverage.

---

## Quality Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean |
| `npx vitest run` | ✅ 783/783 |
| `console.log` scan | ✅ None |
| `param-suggest` style-diversity tests | ✅ Pass (lines 293–336) |
| nano-banana v1 exclusion test | ✅ Pass (line 174) |

---

## Confidence

**0.88** — Logic is correct end-to-end. Withholding from 1.0 for:
1. No direct test coverage on `useComparison`'s `perModelOptions` consumption path — a future edit could silently regress it.
2. Minor code-quality issues (redundant variable, duplicate lookup).

**Recommendation: Merge approved.** Open a follow-up story for `useComparison` test coverage.
