---
name: AUDIT-009 — usePipeline.ts:489 missing useCallback deps
description: Add generateComparison + saveImage to deps; drop unused generateImages
type: review
---
# AUDIT-009 — usePipeline.ts runIdeaThroughPipeline deps

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `hooks/usePipeline.ts` (+1 / -1)
**Status:** DONE

## Problem

`hooks/usePipeline.ts:489` triggered exhaustive-deps: the
`runIdeaThroughPipeline` useCallback closure used `generateComparison`
(line 271) and `saveImage` (lines 308, 322, 395, 405) but neither was
listed in the dep array.

When the parent `useMashup` (or whichever root hook composes the
pipeline) re-creates these functions across renders, the cached
callback keeps its STALE references — calling old versions that close
over outdated state. Symptoms would be:

- New images written via `saveImage` going to a stale `savedImages`
  array, potentially silently dropping in-flight edits.
- `generateComparison` running with a stale settings/credentials
  snapshot for whichever closure it captured.

The other peer functions (`generatePostContent`, `expandIdeaToPrompt`,
etc.) were already listed in the dep array, so the parent IS expected
to provide stable references. These two were just missed.

## Secondary finding — dead `generateImages` destructure

After adding the two missing deps, ESLint flagged `generateImages` as
an UNNECESSARY dependency. Confirmed by grep: `generateImages` is
declared in the `UsePipelineDeps` interface and destructured at
line 91, but never actually called inside `usePipeline.ts`. It was a
leftover prop from an earlier pipeline shape.

Scoped fix: remove it from the dep array only. Leaving the
destructuring + interface declaration in place avoids touching the
hook's public API in a lint-debt commit — that's a separate cleanup
worth its own task if/when someone wants to prune the interface.

## Fix

```ts
}, [
  expandIdeaToPrompt,
  generateComparison,    // added
  generatePostContent,
  saveImage,             // added
  updateIdeaStatus,
  updateSettings,
  settings,
  addLog,
  findNextAvailableSlot,
]);  // generateImages removed (unused inside this callback)
```

## Verification

- `npx eslint hooks/usePipeline.ts` → clean.
- `npx tsc --noEmit` → clean.
- Behavior: stable parents see no change. Parents that re-create
  generateComparison/saveImage across renders now get the fresh
  references inside the pipeline runner instead of the cached stale
  ones — which is the intended semantics.

## Follow-up (not in this fix)

`UsePipelineDeps.generateImages` and the `generateImages` destructure
at line 91 are dead code. Worth removing in a separate cleanup that
also audits whichever caller passes the prop.

**Status:** DONE — ready for QA.
