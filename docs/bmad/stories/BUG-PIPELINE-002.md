# BUG-PIPELINE-002 — No Auto-Start of Continuous Mode on App Load

**ID:** BUG-PIPELINE-002  
**Severity:** HIGH (P0)  
**Filed by:** QA Agent  
**Date:** 2026-04-22  
**Source:** `docs/PIPELINE-DAEMON-ANALYSIS.md` Bug 2  
**Status:** Open

---

## Summary

When `pipelineEnabled = true` and `pipelineContinuous = true` are persisted in localStorage,
the pipeline does NOT start automatically on app load. The user must manually click "Start
Pipeline" every time the app reopens. The "every X minutes" interval setting is meaningless
across restarts.

---

## Reproduction

1. Enable pipeline toggle + continuous mode toggle in PipelinePanel.
2. Click "Start Pipeline" — pipeline runs and cycles correctly.
3. Close the browser tab / app window.
4. Reopen — settings are restored from localStorage (`pipelineEnabled=true`, `pipelineContinuous=true`).
5. Pipeline is **not running**. Status strip shows "Ready" (correct label) but the loop never starts.
6. User must manually click "Start Pipeline" again.

---

## Root Cause

No `useEffect` or initialization logic checks whether continuous mode was active and
auto-calls `startPipeline()` on mount. The `do...while(readContinuous())` loop inside
`usePipelineDaemon.ts` is correct once running, but nothing triggers the first run.

Evidence:
- `PipelineStatusStrip.tsx:83` shows "Ready" when `pipelineEnabled && pipelineContinuous && !pipelineRunning` — confirming the intended state is "about to auto-start", but the start never fires.
- `PipelinePanel.tsx:317-334` has the only start trigger: the manual "Start Pipeline" button.
- No `useEffect` in any component, hook, or context checks the auto-start condition.

---

## Recommended Fix

Add a mount-only `useEffect` in `MashupContext.tsx` (or a new `usePipelineAutoStart` hook):

```typescript
// In MashupContext.tsx — after pipelineEnabled/pipelineContinuous are loaded:
useEffect(() => {
  if (pipelineEnabled && pipelineContinuous && !pipelineRunning) {
    const timer = setTimeout(() => {
      startPipeline();
    }, 5000); // 5s delay — let settings and images hydrate fully
    return () => clearTimeout(timer);
  }
}, []); // intentionally empty: run once on mount only
```

The 5-second delay gives `useSettings` and `useImages` time to hydrate from IDB before
the first pipeline cycle reads them.

Alternative: wire auto-start in `usePipelineDaemon.ts` directly after the hydrate effects
complete. See `docs/PIPELINE-DAEMON-ANALYSIS.md` §Bug 2 for the alternate sketch.

---

## Acceptance Criteria

- [ ] App load with `pipelineEnabled=true` + `pipelineContinuous=true` in localStorage → pipeline starts automatically within 5–8 seconds, no manual click required.
- [ ] App load with only `pipelineEnabled=true` (continuous off) → pipeline does NOT auto-start.
- [ ] App load with both flags false → no change to current behavior.
- [ ] The auto-start fires at most once per mount (the `useEffect` dependency array must be `[]`).
- [ ] Manual "Start Pipeline" button still works when auto-start does not apply.

---

## Related

- `docs/PIPELINE-DAEMON-ANALYSIS.md` §Bug 2
- `PipelineStatusStrip.tsx:83` ("Ready" state label)
- `PipelinePanel.tsx:317-334` (existing manual start button)
