---
name: PROP-015 phase 1 — typed sibling functions for extractJsonFromLLM
description: Additive typed entry points without breaking the legacy any-returning callers
type: review
---
# PROP-015 phase 1 — typed sibling functions

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `lib/aiClient.ts` (+19 / -0)
**Status:** DONE

## Problem

`extractJsonFromLLM(raw, kind): any` is the only `any` return in
`lib/aiClient.ts` and the source of unchecked types in ~16 call sites
across `components/MainContent.tsx`, `hooks/useImageGeneration.ts`,
and `hooks/usePipeline.ts`. Flipping the return type in place to
`unknown[] | Record<string, unknown>` cascades immediately:

- `'never'` errors from `setState` inference where the call result is
  spread into a typed slice
- object-field access (`.foo`, `.bar`) without narrowing
- array-element shape assumptions where elements were treated as
  `{ title, prompt }` etc. without runtime validation

A probe (TASK-140) confirmed the cascade: 16 errors across 3 files,
each needing bespoke narrowing. That's not a single commit — it's a
phased migration.

## Fix shape

Phase 1 is purely additive: leave the legacy `any` overload alone,
add two thin sibling functions with proper return types so new code
(and migrated callers in phases 2-4) have a typed entry point.

```ts
export function extractJsonArrayFromLLM(raw: string): unknown[] {
  return extractJsonFromLLM(raw, 'array') as unknown[];
}

export function extractJsonObjectFromLLM(raw: string): Record<string, unknown> {
  return extractJsonFromLLM(raw, 'object') as Record<string, unknown>;
}
```

Both delegate to the existing parser — zero behavior change, zero
duplication, zero caller changes. The `as` casts are honest: the
underlying parser already returns `any`, we're just narrowing the
return type at the new entry point.

## Why phase 1 first (and not just do the whole thing)

The temptation is to flip the original signature and fix the 16
call sites in one PR. Don't:

1. **Atomic 16-site refactor risks regressing a stale-data path.**
   Each site needs its own validator (`typeof item.title === 'string'`
   etc.) and the validators differ. Bundling them means one bad
   narrowing slips past review.
2. **Phased migration lets each call site land with its own review
   artifact and its own commit.** When something breaks two weeks
   from now, `git blame` points at the exact migration, not a 400-line
   bulk commit.
3. **The legacy `any` version stays callable**, so phases 2/3 can
   migrate file-by-file without a lint-gate stopping the build halfway
   through.

Phase 4 deletes the `any` version once all callers are migrated.

## Verification

- `npx tsc --noEmit` → clean (additive change, no callers touched)
- `npx eslint lib/aiClient.ts` → clean
- No call sites touched; the original `extractJsonFromLLM` signature
  is unchanged.

## Next phases (queued, not in this commit)

- **Phase 2:** migrate 5 `useImageGeneration.ts` array-shape sites
  (lines 291, 362, 404, 444, 619) with element validators.
- **Phase 3:** migrate 8 `MainContent.tsx` object-field sites
  (lines 922, 1261, 1354) with field-by-field casts.
- **Phase 4:** delete the `any` overload of `extractJsonFromLLM` once
  zero callers remain.

**Status:** DONE — phase 1 ready for QA.
