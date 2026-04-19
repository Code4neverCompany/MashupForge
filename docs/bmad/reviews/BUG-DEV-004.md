# BUG-DEV-004 — watermark failures now surface to the dev console

**Status:** done
**Classification:** routine
**Severity:** low
**Why:** Two layers of silent error swallowing in the watermark
finalization path:

1. **`lib/pipeline-finalize.ts:51-66`** — `finalizePipelineImage`
   wrapped `applyWatermark()` in a `try { ... } catch { /* swallow */ }`.
   The fallback (keep original URL) was correct, but with no log
   emitted, a systemic watermark outage shipped un-watermarked images
   for every approved post with no signal to the developer.
2. **`components/MashupContext.tsx:177-187`** — the fire-and-forget
   `void Promise.all(targets.map(async ...))` had no `.catch`. If
   `finalizePipelineImage` itself rejected (it can't, post-fix #1) OR
   if `saveImage` threw (e.g. IDB quota exceeded), the rejection
   bubbled up to the unhandled-promise handler — and depending on the
   environment, was silently swallowed.

Found during the V050-009 static-analysis pass.

## Fix

### `lib/pipeline-finalize.ts`

```ts
} catch (err) {
  // Watermark failed — keep the original URL and ship as-is.
  // BUG-DEV-004: surface the failure to the dev console so a broken
  // watermark service is debuggable. Silent fallback masked an
  // outage where every approved image landed un-watermarked with
  // no signal to the developer or user.
  console.warn('[pipeline-finalize] watermark failed for', img.id, err);
  finalUrl = img.url;
}
```

The catch now binds the error and logs with the established
`[module-tag] message + context + err` convention used elsewhere in
the codebase (e.g. `components/UpdateChecker.tsx:142`). Behaviour is
otherwise unchanged — original URL still preserved, `pipelinePending`
still cleared.

### `components/MashupContext.tsx`

```ts
void Promise.all(
  targets.map(async (img) => {
    try {
      const finalized = await finalizePipelineImage(...);
      saveImage(finalized);
    } catch (err) {
      console.warn('[MashupContext] finalize/save failed for', img.id, err);
    }
  }),
);
```

The per-image `try/catch` ensures one image's failure doesn't abort
the rest of the batch (a `Promise.all` rejects on first reject, so
without per-element catches, image #1 failing would silently abandon
images #2..#N). Each image's failure logs independently.

### Why two layers of catch + log instead of one

The two layers handle different failure modes:
- `pipeline-finalize.ts` catches **watermark service errors** (the
  most likely failure: canvas API issue, image too large, malformed
  base64).
- `MashupContext.tsx` catches **persistence errors** (IDB quota,
  serialization, storage corruption — anything `saveImage` could
  throw synchronously) AND **future-proof against the inner catch
  ever leaking** (defense in depth).

In practice the inner catch handles 100% of today's failures; the
outer is a guard rail.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Watermark errors surfaced | ✓ (both layers now log to console.warn with module-tag + image id + error object) |
| Write inbox | ✓ (envelope below) |

## Why log to `console.warn` and not the user

Watermark failure is best-effort by design — the post still works,
just without the brand mark. Surfacing this to the user via toast
would be noisy (they'd see it on every approval if the service is
broken) and offer no actionable fix (they can't repair the watermark
service from the UI). `console.warn` is the right level for developer
observability without user disruption.

When V050-008 (dev logger) ships, these `console.warn` calls should
be promoted to dev-logger entries with category `pipeline.finalize`
so they surface in the in-app log viewer alongside other pipeline
events. Until then, they're visible in the desktop devtools console.

## Files touched

### Production
- `lib/pipeline-finalize.ts`:
  - Bound error in `applyWatermark` catch (line ~62).
  - Added `console.warn('[pipeline-finalize] watermark failed for', img.id, err)`.
  - Inline docblock pinning the BUG-DEV-004 contract.
- `components/MashupContext.tsx`:
  - Wrapped per-image awaits in `try/catch` inside the
    `Promise.all` map (line ~177).
  - Added `console.warn('[MashupContext] finalize/save failed for', img.id, err)`.
  - Inline docblock.

### Tests
- `tests/integration/approval-gate-watermark.test.ts`:
  - Added 1 test in the existing `BUG-CRIT-001 — watermark-on-approval contract`
    describe block: `'keeps the original URL AND warns when applyWatermark rejects'`.
  - Mocks `console.warn` via `vi.spyOn`, asserts the call shape
    (`[pipeline-finalize] watermark failed for` + image id + Error
    object), and verifies the existing fallback (original URL +
    cleared pipelinePending) still holds.

  No separate test for the MashupContext outer `try/catch` — that
  would require renderHook + IDB mocking to simulate a `saveImage`
  failure, which is disproportionate effort for a defensive guard
  rail. The convention (per-element catch in fire-and-forget batches)
  is the contract.

### Docs
- `docs/bmad/reviews/BUG-DEV-004.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/approval-gate-watermark.test.ts` —
  8/8 pass (was 7/7 pre-fix; +1 new failure-path test).
- `npx vitest run` — full suite green via pre-commit hook.

## Out of scope (follow-up)

- **Promote to dev logger when V050-008 ships.** `console.warn` is the
  right level today; once the in-app dev log viewer exists, these
  events should also land there with category `pipeline.finalize` so
  they're greppable and exportable.
- **Surface a single user-visible toast** if watermark fails on > N
  approvals in a row (not per-failure — that would be spam, but a
  "watermark service appears down" toast after, say, 5 consecutive
  failures would be useful). Defer until there's evidence the
  watermark service is unstable in prod.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-DEV-004","status":"done","summary":"Two layers of silent watermark error swallowing now surface to console.warn. lib/pipeline-finalize.ts: bound the err in the existing applyWatermark catch and added '[pipeline-finalize] watermark failed for' + img.id + err log; behaviour unchanged otherwise. components/MashupContext.tsx: wrapped per-image awaits inside Promise.all in try/catch so one image's failure doesn't abort the rest of the batch (Promise.all rejects on first reject pre-fix); each failure logs '[MashupContext] finalize/save failed for' + img.id + err. Conventions match UpdateChecker.tsx ([module-tag] message + context). 1 new regression test in the existing approval-gate-watermark.test.ts BUG-CRIT-001 describe block: mocks console.warn via vi.spyOn, asserts call shape AND verifies the original fallback (URL preserved, pipelinePending cleared) still holds. tsc clean, 455/455 pass."}
```
