---
name: PROP-011 phase 3 — extractJson*FromLLM tests + crash-on-malformed bug fix
description: 17 new tests pinning PROP-015's typed JSON helpers; caught a real bug where malformed LLM output crashed the parser instead of returning the documented fallback
type: review
---
# PROP-011 phase 3 — aiClient.ts test coverage + bug fix

**Date:** 2026-04-16
**Author:** developer
**Files touched:**
- `tests/lib/aiClient.test.ts` (new, 17 tests)
- `lib/aiClient.ts` (+5 / -2 — wrap JSON.parse in try/catch)

**Status:** DONE

## Why these helpers, not the originally scoped ones

Phase 1 deferred phase 3 with a target list of `humanizeWindowsError`,
`quoteWinArg`, and `parseJsonOrThrow`. On inspection all three are
private (or, in `quoteWinArg`'s case, an inline closure inside
`installPi`) — testing them would require either exporting them
(public surface change → complex) or going through HTTP route
handlers (integration test, not pure-function).

`extractJsonArrayFromLLM` and `extractJsonObjectFromLLM` are a
better target:
- Already exported (PROP-015 phase 1)
- Pure functions — no mocks, no temp dirs
- Used by `useImageGeneration`, `MainContent`, and `usePipeline` —
  the three hottest call sites in the app
- Recently rewritten, so a regression is plausible

## What the tests cover

**`extractJsonArrayFromLLM`** (9 cases):
1. Clean JSON array
2. ` ```json ` fence stripping
3. Bare ` ``` ` fence stripping
4. Commentary slicing (LLM "Sure! Here you go: [...] Let me know")
5. Empty / whitespace input → `[]`
6. Object input → `[]` (top-level shape mismatch)
7. **Malformed JSON → `[]`** (caught the bug, see below)
8. Nested arrays
9. Object items inside the array

**`extractJsonObjectFromLLM`** (8 cases):
1. Clean JSON object
2. Fence stripping
3. Commentary slicing
4. Empty input → `{}`
5. Array input → `{}`
6. **Malformed JSON → `{}`** (caught the bug)
7. JSON literal `null` → `{}`
8. Nested objects

## The bug

Two of the 17 tests failed on first run:

```
SyntaxError: Unexpected token 'o', "not json at all" is not valid JSON
 ❯ parseJsonFromLLM lib/aiClient.ts:140:15
```

`parseJsonFromLLM`'s docstring says it "falls back to an empty
array / object on empty input" — and the empty-string path is
handled. But any *non-empty* string with no JSON brackets (or
brackets surrounding garbage) skipped the slice step and went
straight into `JSON.parse`, which throws.

Real-world impact: any LLM that prepends a refusal or returns
plain prose ("I can't help with that.") would crash the entire
`useImageGeneration` / pipeline flow instead of getting the
documented empty-result fallback.

## The fix

Five lines in `parseJsonFromLLM`:

```ts
function parseJsonFromLLM(raw: string, kind: 'array' | 'object'): unknown {
  let text = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const fallback = kind === 'array' ? [] : {};
  if (!text) return fallback;
  // ... bracket slicing unchanged ...
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
```

The fallback is now computed once and used in both the empty-input
and parse-failure paths. Behaviour for valid JSON is unchanged —
only the error path is new.

## Verification

- `npx tsc --noEmit` → clean
- `npm test` → 34/34 (was 17, +17 new)
- Total suite runtime still ~360ms
- `npm test` will run automatically on every Windows build via the
  PROP-011 phase 2 gate

## Pattern: tests caught the bug

This is the second bug PROP-011 has surfaced. Phase 1 caught
`getErrorMessage(undefined)` returning `undefined`; phase 3 caught
`extractJson*FromLLM` crashing on prose. Both bugs were latent in
heavily-used helpers and would have been almost impossible to
notice without a test pinning the contract — they only fire on
edge cases the manual happy-path testing never hits.

The investment is paying off two phases in.

**Status:** DONE — ready for QA.
