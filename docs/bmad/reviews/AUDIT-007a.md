---
name: AUDIT-007a — MainContent comparisonOptions exhaustive-deps
description: Add 3 missing comparisonOptions fields to the model-preview effect deps
type: review
---
# AUDIT-007a — MainContent.tsx:1024 model-preview deps

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `components/MainContent.tsx` (+5 / -1)
**Status:** DONE
**Sibling:** AUDIT-007b (line 969 persistCarouselGroup) lifted to PROP-014.

## Problem

The model-preview effect at `MainContent.tsx:1024` reads
`comparisonOptions.style`, `.aspectRatio`, and `.negativePrompt` inside
its body but only listed `[comparisonPrompt, comparisonModels]` in its
dep array. Result: changing any of the three options in the UI did NOT
refresh the per-model preview chips until the user also retyped the
prompt or toggled a model on/off.

This is a true bug, not just a lint nag. Users editing the negative
prompt or aspect ratio would see stale previews until they touched
something else.

## Fix

Add the three options as explicit deps:

```ts
}, [
  comparisonPrompt,
  comparisonModels,
  comparisonOptions.style,
  comparisonOptions.aspectRatio,
  comparisonOptions.negativePrompt,
]);
```

The effect already has a 800ms debounce timer (`previewTimerRef`) and a
shallow-equality guard around `setModelPreviews` (the JSON.stringify
comparison at line 1018), so re-running on each option edit is safe and
costs at most one extra debounced API round-trip.

## Why the line-969 warning is NOT in this fix

The other exhaustive-deps warning (`MainContent.tsx:969` — missing
`persistCarouselGroup`) cannot be fixed by simply adding the dep:
`persistCarouselGroup` is a plain const arrow function defined inside
the component body at line 529, so its identity changes every render.
Adding it would trigger an infinite re-render loop because the effect
itself calls `persistCarouselGroup` which calls `setSavedImages` which
re-renders the component which mints a new function reference which
re-runs the effect.

The right fix is to wrap `persistCarouselGroup` in `useCallback` first,
which requires reasoning about ITS deps (which currently capture
`savedImages` from closure). That's a structural change, not a one-line
dep tweak — lifted to **PROP-014**.

## Verification

- `npx eslint components/MainContent.tsx` → 1 warning remaining (the
  line-969 case lifted to PROP-014). The line-1024 warning is gone.
- `npx tsc --noEmit` → clean.

**Status:** DONE — ready for QA.
