# QA Review — PR #4: feat(prompt): wire buildEnhancedPrompt into image generation callers + mmx image route

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-29
**Branch:** `feat/mmx-prompt-wire` → `main`
**CI commit:** `5059b4a`

---

## Files Reviewed

- `hooks/useImageGeneration.ts` (generate + reroll paths)
- `app/api/mmx/image/route.ts` (NEW — 111 lines)
- `app/api/leonardo/route.ts` (comment update only)
- `lib/image-prompt-builder.ts` (comment update only)
- `tests/api/mmx-image-route.test.ts` (NEW — 8 tests)
- `tests/lib/image-prompt-builder-wiring.test.ts` (NEW — 4 tests)

---

## Prior QA Warning Resolution

### QA-W1 — `runMmxJson` empty-stdout undefined-cast
**Status: FIXED (PR #3)**
`lib/mmx-client.ts:166–174` — `parsed === undefined` now throws `MmxError('PARSE', 'mmx returned empty output ...')` before the `return parsed as T` line. The silent undefined return path is closed. All callers that previously relied on optional-chaining as a workaround are now backed by a real error.

### QA-W2 — Sunday recap route returns already-deleted artifact paths
**Status: ADDRESSED (PR #3)**
`app/api/cron/sunday-recap/route.ts:118–126` — comments now explicitly document that the paths are `RUNNER-LOCAL`, are deleted by the `finally` block, and are present in the response only as workflow-log breadcrumbs. The structural fix (upload artifacts to durable storage before unlink) is deferred to a future commit. The behavior is intentional and now clearly communicated in-source.

### QA-W3 — `buildEnhancedPrompt` has no production callers
**Status: FIXED (this PR)**
Two production callers now wire through `lib/image-prompt-builder.ts`:
1. `hooks/useImageGeneration.ts` — both `generateImages` and `rerollImage` call `buildEnhancedPrompt(modelPrompt, { modelId, styleName, aspectRatio, count: 1 })` and forward `result.leonardo.*` into the Leonardo request body.
2. `app/api/mmx/image/route.ts` (new) — calls `buildEnhancedPrompt(body.prompt, inputs)` and passes `result.mmx` to `generateImage`.

---

## Findings

### Critical (must fix before merge)

_None._

### Warnings (should fix)

- **[WARNING] `/api/mmx/image` route has no authentication.**
  `app/api/mmx/image/route.ts:13` — the file header says "Gate with a Bearer secret in middleware before deploying to a shared host" and explicitly scopes this as a single-user desktop deployment. In that context it is acceptable. The warning stands as a deployment prerequisite: this route must not be exposed on a shared host without middleware auth. No action needed for desktop-only release; track as a pre-launch gate if hosting changes.

### Info (noted, no action required)

- **[INFO] `buildEnhancedPrompt` wiring is correct and symmetric.**
  In both `generateImages` (hook lines ~516–553) and `rerollImage` (~703–733), the call shape is identical: `buildEnhancedPrompt(modelPrompt, { modelId: selectedModel, styleName: modelStyle, aspectRatio: currentAspectRatio, count: 1 })`. `result.leonardo.width/height/styleIds/quality` feed `leonardoBaseParams` via `?? fallback`, and `result.prompt` (hint-appended) replaces `modelPrompt` as the string sent to `submitWithOneRetry`. The `count: 1` is correct — the outer `for` loop handles batch sizing, one request per item.

- **[INFO] Fallback chain is preserved for un-spec'd models.**
  When `buildEnhancedPrompt` returns `undefined` for `leonardo.width/styleIds` (no spec file for the model), the existing `getLeonardoDimensions` call and fuzzy UUID match from `LEONARDO_MODELS` are the `??` fallbacks. Behaviour for unspecified models (e.g. `gpt-image-1.5` if not in model-specs/) is identical to pre-PR. No regression.

- **[INFO] `MmxQuotaError` is handled correctly in the new route.**
  `app/api/mmx/image/route.ts:86–91` — catches `MmxQuotaError` → 402 with `{ error: 'MMX quota / Token Plan ...', hint: e.hint }`. `MmxSpawnError` → 503, `MmxError` → 502 with `code`, generic → 500. All four branches are exercised by `mmx-image-route.test.ts`. The 402 test verifies both `error` matching `/quota/i` and `hint` present.

- **[INFO] Diagnostic response fields in `/api/mmx/image`.**
  The route returns `appliedHints` and `finalPrompt` alongside `urls/files/base64`. These expose what `buildEnhancedPrompt` actually appended, letting callers confirm a style/spec lookup landed correctly without inspecting CLI args. Low noise, high debuggability.

- **[INFO] `req.signal` propagated to `generateImage`.**
  Client disconnects cleanly abort the running `mmx` subprocess. Correct for single-user desktop; noted for completeness.

- **[INFO] `lib/image-prompt-builder.ts` and `app/api/leonardo/route.ts` diff is comments only.**
  Both files drop the "wiring follow-up" stale note and replace it with an accurate reference to the callers. No logic change; no review concerns.

---

## Scope Check

- **[IN-SCOPE] W3 wiring:** `useImageGeneration.ts` generate + reroll paths call `buildEnhancedPrompt`. ✓
- **[IN-SCOPE] New `/api/mmx/image` route:** Accepts raw inputs, runs `buildEnhancedPrompt`, forwards `result.mmx` to CLI. ✓
- **[IN-SCOPE] All four MMX error classes handled:** 402 quota, 503 spawn, 502 generic, 500 unknown. ✓
- **[IN-SCOPE] Test coverage for new route:** 8 tests covering all HTTP status paths and spec-input forwarding. ✓
- **[IN-SCOPE] Wiring contract pin tests:** 4 tests verifying Leonardo + MMX output shapes and no-spec fallback. ✓
- **[OUT-OF-SCOPE] `streamAIToString` reroll enhancement:** Unchanged. Not part of this PR. ✓
- **[OUT-OF-SCOPE] `enhancePromptForModel` (model optimizer):** Unchanged upstream step. ✓

---

## Test Suite

| Scope | Count | Status |
|---|---|---|
| Full suite (branch) | 987 / 987 | ✓ PASS |
| `mmx-image-route.test.ts` (new) | 8 | ✓ |
| `image-prompt-builder-wiring.test.ts` (new) | 4 | ✓ |
| Baseline (main) | 975 | ✓ (pre-merge) |

---

## Gate Decision

**[PASS]** — All three prior QA warnings resolved. Core wiring is correct: both production callers (`useImageGeneration.ts` Leonardo path and `/api/mmx/image` MMX path) route through `buildEnhancedPrompt` and consume the appropriate provider slice. Fallback chain for unspecified models is intact. `MmxQuotaError` returns 402 with hint. 12 new tests pin the new behavior. No critical or blocking issues.

One warning: the `/api/mmx/image` route has no auth guard — intentional for desktop, must be addressed before any shared hosting. Already documented in the source.

**Confidence: 0.90**
