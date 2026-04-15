---
name: PROP-014 — persistCarouselGroup useCallback wrap
description: Two-file fix that also closes the last lint warning in the codebase
type: review
---
# PROP-014 — persistCarouselGroup useCallback wrap

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `hooks/useSettings.ts` (+8 / -3), `components/MainContent.tsx` (+3 / -3)
**Status:** DONE

## Problem

`MainContent.tsx:969` was the last `react-hooks/exhaustive-deps`
warning in the repo: an effect that auto-bundles comparison results
into a carousel group calls `persistCarouselGroup(...)` inside its
body but didn't list it as a dep. Naively adding the dep would loop
because `persistCarouselGroup` was a plain const arrow function whose
identity changed every render.

## Fix shape

Two coordinated changes, smallest viable:

### 1. Memoize `updateSettings` upstream (hooks/useSettings.ts)

`updateSettings` was a fresh function every render of `useSettings`,
which meant any downstream consumer wrapping it in useCallback would
also be re-created every render — defeating the wrapping. Since
`useState`'s `setSettings` is itself stable across renders,
`updateSettings` can safely be wrapped in `useCallback(..., [])`.

```ts
const updateSettings = useCallback((newSettings) => {
  setSettings((prev) => {
    const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
    return { ...prev, ...patch };
  });
}, []);
```

This is the correct upstream fix — `updateSettings` *should* have
been stable from the start. Stable identities are a property hooks
should provide, not something every consumer has to work around with
ref-stash patterns.

**Public-API impact:** Any consumer that previously had
`updateSettings` in a useEffect dep array will now see fewer re-runs
(specifically: only when the consumer itself re-mounts, instead of
on every render of `useSettings`'s parent). That's a behavior change
in the strict sense — but it's strictly less work, and the only
reason a consumer would *want* updateSettings to change identity is
to force a re-run on every render, which is never the right pattern.

### 2. Wrap `persistCarouselGroup` in useCallback (MainContent.tsx)

```ts
const persistCarouselGroup = useCallback(
  (id, imageIds, patch?) => {
    const groups = settings.carouselGroups || [];
    // ... existing body unchanged ...
  },
  [settings.carouselGroups, updateSettings],
);
```

Deps: `settings.carouselGroups` (the function reads it from the
closure) + the now-stable `updateSettings`. The function will
re-create only when the carousel groups list actually changes, not
on every render.

### 3. Add to the line-969 effect

```ts
}, [comparisonResults, settings.pipelineCarouselMode, persistCarouselGroup]);
```

Safe because the effect is gated on `pendingIdeaCarouselRef.current`
which it sets false on first run, so the re-creation of
persistCarouselGroup (when settings.carouselGroups updates) doesn't
double-fire the bundling logic.

## Verification

- `npx tsc --noEmit` → clean.
- `npx eslint hooks/useSettings.ts components/MainContent.tsx` →
  **zero warnings**. The line-969 warning is gone.
- `npx eslint .` → **0 errors, 0 warnings.** The codebase is now
  fully lint-clean for the first time today.
- 7 other `persistCarouselGroup` call sites (lines 559, 583, 2234,
  2426, 2693, 3639, etc.) didn't need to change — they were already
  passing the function value directly.

## Why this is also a real correctness improvement

Before this fix, `persistCarouselGroup` captured a stale closure of
`settings.carouselGroups` whenever it was called from inside an
effect or a callback that didn't list it as a dep. The line-969
effect happened to work despite this because comparisonResults
changes (which DO trigger re-render and therefore a fresh closure)
were the trigger anyway. But the next time someone added a similar
"auto-bundle" effect they could easily walk into the stale-closure
trap. Wrapping in useCallback documents the dep contract explicitly.

## Follow-up suggestion (not in this fix)

A few other consumers of `useSettings` may benefit from similar
upstream stabilization: `setSettings` itself is exposed via
`updateSettings`, but other returned values (the `settings` object,
`isSettingsLoaded`) change every commit by design, so no further
memoization is needed there.

**Status:** DONE — ready for QA. Closes PROP-014 and the last
exhaustive-deps warning.
