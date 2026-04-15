---
name: AUDIT-011 — pi.dev pre-check at pipeline start
description: Single status fetch + warning log so unreachable pi is visible before 90s of image generation burns
type: review
---
# AUDIT-011 — pi.dev pre-check at pipeline start

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `hooks/usePipeline.ts` (+27 / -0)
**Status:** DONE

## Problem

The pipeline calls pi.dev for trending research, prompt expansion,
and caption generation. If pi is unreachable (sidecar crashed, not
installed, npm prefix corrupted), each step silently falls through
to a generic fallback:

- Trending → empty `trendingContext`
- Prompt expansion → fallback expander output
- Caption generation → expanded-prompt-as-caption fallback (AUDIT-010)

Each individual fallback is correct in isolation, but stacked
together they produce a string of identical-looking error logs
spread across ~90s of image generation runtime. Maurice has to wait
for the whole cycle to finish before noticing pi is down.

## Fix shape

Single fetch to `/api/pi/status` immediately after the pipeline-start
log, before any other work. Three outcomes, three log levels:

```ts
try {
  const piRes = await fetch('/api/pi/status');
  if (piRes.ok) {
    const piStatus = (await piRes.json()) as {
      installed?: boolean;
      running?: boolean;
      lastError?: string | null;
    };
    if (!piStatus.installed) {
      addLog('pi-precheck', '', 'error', 'pi.dev not installed — ...');
    } else if (!piStatus.running) {
      addLog('pi-precheck', '', 'error', `pi.dev installed but not running${piStatus.lastError ? ` — last error: ${piStatus.lastError}` : ''}`);
    } else {
      addLog('pi-precheck', '', 'success', 'pi.dev reachable — proceeding');
    }
  } else {
    addLog('pi-precheck', '', 'error', `pi.dev status check failed (HTTP ${piRes.status})`);
  }
} catch (e: unknown) {
  addLog('pi-precheck', '', 'error', `pi.dev status check threw: ${getErrorMessage(e)}`);
}
```

## Design choices

**Warning, not abort.** The audit task explicitly said "warning log",
not "block the run". Keeping it informational means:
- A pi outage doesn't accidentally lock out users who want to push
  through with the fallback paths anyway (e.g. captioning works
  fine with the expanded-prompt fallback for many users).
- The new `pi-precheck` log entry is a single high-signal line
  Maurice can grep for in the pipeline log instead of three
  separate failure modes scattered across the run.

**No caching.** The fetch happens once per `startPipeline` call. In
continuous mode it does NOT re-check on each cycle — that's
intentional. The pi sidecar is process-stable; if it's running
when the pipeline starts, it'll stay running for the duration of a
typical run. A per-cycle re-check would just add noise.

**Top-level try/catch.** The /api/pi/status route already returns
200 + zeroed payload on internal errors (intentional — see route.ts
line 22), so the only way the fetch itself throws is network/abort.
The outer try catches both that and JSON parse failure.

## Verification

- `npx tsc --noEmit` → clean
- `npx eslint hooks/usePipeline.ts` → clean
- `npm test` → 17/17 still passing
- The new log entries follow the existing `addLog(level, ideaId, kind, message)`
  shape used everywhere else in the pipeline.

## Why this also closes part of the AUDIT-010 follow-up

AUDIT-010 made the caption fallback explicit so blank captions
don't ship; AUDIT-011 makes the *cause* of the fallback visible
before the fallback even fires. The two together turn what used to
be a silent 90-second debug session into a 5-second "pi is down"
glance at the log.

**Status:** DONE — ready for QA.
