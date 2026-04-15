# QA Review — STORY-090

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** e36cec4

## Findings

- [INFO] `extractLeonardoError(parsed: unknown): string | null` correctly handles all four Leonardo v2 error shapes: `{error: string}`, `{error: {message}}`, `{errors: [{message}]}`, `{message: string}`. The old template-string stringify on `{error: {message, code}}` produced `[object Object]` — a real UX bug on the most common failure mode (validation errors).
- [INFO] Helper returns `null` on no match, allowing the existing fallback behavior (raw `parsedErr` stringify) to handle unknown shapes. No regression on non-matching responses.
- [INFO] `tsc --noEmit` → exit 0.
- [INFO] Scope is correctly bounded to the POST route's error handling path. Poll route, modelOptimizer, and client-side components unchanged.
- [INFO] v2 contract verification (endpoint, auth header, MODEL_ID_MAP, body shape, negative_prompt exclusion, generation-id extraction, v1 fallback) is thorough. No API drift found.
- [INFO] Live E2E (real API key, real generation, deliberate validation error) correctly deferred to Maurice. Cannot test from WSL.

## Gate Decision

PASS — Bug fix is correct and minimal. `[object Object]` toast on validation errors is resolved. TypeScript clean. API contract verified against v2 docs with no drift found.
