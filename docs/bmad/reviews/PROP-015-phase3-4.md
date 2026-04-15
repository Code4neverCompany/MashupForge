---
name: PROP-015 phases 3 + 4 — finish object-shape migration and delete the any helper
description: Migrate MainContent + usePipeline to typed helpers, then remove the legacy any-returning extractJsonFromLLM
type: review
---
# PROP-015 phases 3 + 4 — finish migration and delete the any helper

**Date:** 2026-04-15
**Author:** developer
**Files touched:**
- `components/MainContent.tsx` (+15 / -7)
- `hooks/usePipeline.ts` (+5 / -7)
- `lib/aiClient.ts` (+8 / -16, net delete)
**Status:** DONE

## Why phases 3 and 4 ship together

Phase 4 (delete the legacy `any` overload) is a one-line deletion
that's only safe once **every** caller has migrated. Phase 3
(MainContent migration) was the last batch of callers. There is no
reachable state in between where phase 3 has landed but phase 4
hasn't — the `extractJsonFromLLM` symbol either exists for legacy
callers or doesn't. Bundling them is honest about that coupling.

I also folded in 2 bonus call sites in `hooks/usePipeline.ts` that
showed up after grep in the original phase 3 plan. Same pattern,
same migration, no reason to defer them.

## Phase 3 — MainContent.tsx (3 sites) + usePipeline.ts (2 sites)

### Site 1 — push-to-compare prompt enhancement (MainContent ~922)

The fattest object in the codebase: 7 string fields with allowlist
validation against `ART_STYLES`, `LIGHTING_OPTIONS`, etc. The pre-fix
code did `ART_STYLES.includes(data.style)` directly on an `any` —
runtime worked but tsc had no idea `data.style` was even a string.

```ts
const data = extractJsonObjectFromLLM(text);
const pickString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;
const enhancedPrompt = pickString(data.enhancedPrompt);
const negativePrompt = pickString(data.negativePrompt);
const styleStr = pickString(data.style);
// ... lighting, angle, aspectRatio, imageSize ...

setComparisonOptions(prev => ({
  ...prev,
  style: styleStr && ART_STYLES.includes(styleStr) ? styleStr : ART_STYLES[0],
  // ... etc ...
}));
```

The local `pickString` helper is intentionally narrow — extracted to
this site, not module-level, because no other call site in the file
needs it.

### Site 2 — animate dynamic settings (MainContent ~1261)

The tricky one. `defaultAnimationDuration` is typed as the literal
union `3 | 5 | 10`, so `duration = rawDuration` failed type checking
when `rawDuration: number`. First attempt used
`typeof rawDuration === 'number' && [3, 5, 10].includes(rawDuration)`
— TS narrows that to `number`, not `3 | 5 | 10`. Replaced with a
discriminated check:

```ts
const rawDuration = dynamicSettings.duration;
if (rawDuration === 3 || rawDuration === 5 || rawDuration === 10) {
  duration = rawDuration; // narrowed to 3 | 5 | 10 here
}
```

This is the more honest narrow — the literal union check carries
through.

### Site 3 — animate ensureTags (MainContent ~1354)

Same pattern as `useImageGeneration.ensureTags` from phase 2: filter
to strings, fall back to `['Mashup']` if none survive.

### Sites 4 & 5 — usePipeline.ts buildIdeasFromPrompt (~544, ~562)

Both already used defensive narrowing patterns
(`Array.isArray(parsed?.variations)`, etc.) — they only needed the
import flip. The previous `if (!Array.isArray(parsed)) return [];`
guard on the array path is now redundant because
`extractJsonArrayFromLLM` returns `unknown[]` by contract.

## Phase 4 — collapse parser, delete the legacy export

```diff
- export function extractJsonFromLLM(raw: string, kind: 'array' | 'object' = 'array'): any {
+ function parseJsonFromLLM(raw: string, kind: 'array' | 'object'): unknown {
    let text = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // ... unchanged body ...
    return JSON.parse(text);
  }

  export function extractJsonArrayFromLLM(raw: string): unknown[] {
-   return extractJsonFromLLM(raw, 'array') as unknown[];
+   const parsed = parseJsonFromLLM(raw, 'array');
+   return Array.isArray(parsed) ? parsed : [];
  }

  export function extractJsonObjectFromLLM(raw: string): Record<string, unknown> {
-   return extractJsonFromLLM(raw, 'object') as Record<string, unknown>;
+   const parsed = parseJsonFromLLM(raw, 'object');
+   return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
+     ? (parsed as Record<string, unknown>)
+     : {};
  }
```

Three improvements rolled into the deletion:

1. **`extractJsonFromLLM` is gone from the public surface.** No more
   `any` exports from `lib/aiClient.ts`.
2. **The shared parser is now module-private** (`parseJsonFromLLM`) —
   it returns `unknown`, not `any`, so any future internal caller
   has to narrow.
3. **Each typed helper now validates the top-level shape at
   runtime.** Previously they cast — if the LLM returned an object
   when an array was requested, the cast was a lie and downstream
   `Array.isArray()` checks were the only safety net. Now the helper
   itself returns `[]` / `{}` on shape mismatch, matching what the
   types claim.

## Verification

- `npx tsc --noEmit` → clean
- `npx eslint app components hooks lib types` → clean
- `grep -r 'extractJsonFromLLM' app components hooks lib types` →
  no matches
- The 24 lint errors visible from `eslint .` are all in
  `dist/portable/.next/server/chunks/...` build artifacts and
  unrelated to this work — they should be in `.eslintignore`,
  separate cleanup.

## What this closes

PROP-015 done. `lib/aiClient.ts` is now `any`-free. Five files
across the codebase now have honest types where the LLM result
flows into typed state.

**Status:** DONE — phases 3 + 4 ready for QA.
