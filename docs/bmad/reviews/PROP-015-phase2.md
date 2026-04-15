---
name: PROP-015 phase 2 — migrate useImageGeneration.ts to typed array helper
description: Replace 5 untyped extractJsonFromLLM calls with extractJsonArrayFromLLM + element validators
type: review
---
# PROP-015 phase 2 — useImageGeneration.ts migration

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `hooks/useImageGeneration.ts` (+45 / -25)
**Status:** DONE

## Problem

5 call sites in `hooks/useImageGeneration.ts` used the legacy
`extractJsonFromLLM(text, 'array'): any` helper, then either skipped
runtime validation entirely or wrote ad-hoc `.tags` / `Array.isArray`
fallbacks that weren't expressible in the type system.

The two distinct shapes in the file:

1. **Tag arrays** (3 sites): `string[]` of free-form tags from pi.dev.
2. **GeneratedItem arrays** (2 sites): the rich `{prompt, aspectRatio,
   tags, selectedNiches, selectedGenres, negativePrompt}` shape that
   the brainstorm/idea modes return.

## Fix shape

### Imports

```ts
- import { streamAIToString, extractJsonFromLLM } from '@/lib/aiClient';
+ import { streamAIToString, extractJsonArrayFromLLM } from '@/lib/aiClient';
```

### New module-level helpers

To avoid duplicating element validation between the two
`itemsToGenerate` sites, added a `parseGeneratedItems` helper plus a
`pickStringArray` utility. Both module-level (pure functions, no
closure over hook state):

```ts
interface GeneratedItem {
  prompt: string;
  aspectRatio?: string;
  tags?: string[];
  selectedNiches?: string[];
  selectedGenres?: string[];
  negativePrompt?: string;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strs = value.filter((v): v is string => typeof v === 'string');
  return strs.length > 0 ? strs : undefined;
}

function parseGeneratedItems(raw: string): GeneratedItem[] {
  return extractJsonArrayFromLLM(raw)
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      prompt: typeof item.prompt === 'string' ? item.prompt : '',
      aspectRatio: typeof item.aspectRatio === 'string' ? item.aspectRatio : undefined,
      tags: pickStringArray(item.tags),
      selectedNiches: pickStringArray(item.selectedNiches),
      selectedGenres: pickStringArray(item.selectedGenres),
      negativePrompt: typeof item.negativePrompt === 'string' ? item.negativePrompt : undefined,
    }))
    .filter((item) => item.prompt.length > 0);
}
```

### Per-site changes

**Site 1 — `autoTagImage` (line ~291):** dropped the dead
object-fallback branch (the helper guarantees `unknown[]`), narrowed
elements to strings, applied the existing "Warhammer 40,000" →
"Warhammer 40k" normalization on validated strings only.

**Sites 2 & 5 — `ensureTags` (lines ~362, ~619):** identical
inline helpers in `generateImages` and `rerollImage`. Both now
call `extractJsonArrayFromLLM`, filter to strings, and return
`['Mashup']` if no string elements survive.

**Sites 3 & 4 — `itemsToGenerate` (lines ~404, ~444):** swapped
to `parseGeneratedItems(promptText)`. The existing fallback
arrays in the catch blocks are unchanged.

## Why this also fixes a real correctness issue

The pre-fix `ensureTags` returned `parsed?.tags` if the LLM
returned an object instead of an array. That branch was unreachable
because the helper passes `kind: 'array'` and slices `[...]` from
the input — but the `.tags` access on an `any`-typed value silently
swallowed type errors *and* was dead code. The new code is
honest: validate elements, fall back if validation fails.

The dead object-fallback in `autoTagImage` had the same shape and
the same problem. Both are now gone, replaced with element
validation that actually runs.

## Verification

- `npx tsc --noEmit` → clean
- `npx eslint hooks/useImageGeneration.ts` → clean
- 0 remaining references to `extractJsonFromLLM` in this file

## Remaining call sites of the legacy helper

After phase 2, `extractJsonFromLLM` (the `any` overload) is still
used by:
- `components/MainContent.tsx` — 8 object-shape sites (phase 3)
- `hooks/usePipeline.ts` — re-imports through MainContent surface

Phase 3 migrates MainContent.tsx; phase 4 deletes the `any`
overload.

**Status:** DONE — phase 2 ready for QA.
