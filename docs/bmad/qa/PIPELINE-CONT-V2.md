# QA Review — PIPELINE-CONT-V2

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-26
**Commit:** bce2a03 (tip of 5-commit range: c9f94fa bca82f9 a04ae24 f975293 bce2a03)

## Files Reviewed

- `lib/weekly-fill.ts`
- `hooks/usePipelineDaemon.ts`
- `components/PipelinePanel.tsx`
- `components/pipeline/WeekProgressMeter.tsx`
- `components/PipelineStatusStrip.tsx`
- `tests/lib/weekly-fill.test.ts`
- `tests/lib/pipeline-daemon.test.ts`
- `types/mashup.ts`

## Findings

### Critical (must fix before merge)
_None._

### Warnings (should fix)

- [WARNING] **Success banner not implemented (Feature Spec §4).** The brief
  requires PipelineStatusStrip or PipelineView to display a dedicated success
  banner when a `pipeline-week-confirmed` log entry appears. Only `STEP_LABELS`
  in PipelinePanel.tsx received the new label — PipelineStatusStrip.tsx has no
  awareness of this event. The daemon emits the log correctly; the UI surface
  for it is missing.

- [WARNING] **Daemon continuous-mode not integration-tested.** `a04ae24` pins
  the fill-decision predicate via a `pickBranch()` mirror function calling
  `computeWeekFillStatus` directly. The actual hook's `continue` / sleep
  dispatch is not exercised end-to-end. Commit message explicitly acknowledges
  this tradeoff ("hook resists isolated unit tests") — acceptable pragmatism,
  but means a future refactor of the sleep/continue block could regress silently.

- [WARNING] **`pipelineIdeasPerCycle` UI wiring has no dedicated test.** The
  input renders in PipelinePanel and reads from context via `useMashup()`, but
  no component or integration test asserts that changing the input persists and
  is consumed by the daemon.

### Info (noted, no action required)

- [INFO] `PipelineLogEntry.step` is an open `string` (not a discriminated
  union), so `pipeline-week-confirmed` and `pipeline-week-partial` are valid
  without schema changes. No log-store migration needed.

- [INFO] `percent` in WeekFillStatus correctly uses `scheduledTotal /
  targetTotal` — pending_approval posts do not inflate the progress bar.

- [INFO] `pending_approval` outside the horizon window is correctly excluded
  from `pendingApprovalTotal` (covered by bce2a03 edge-case tests).

## Scope Check

- [IN-SCOPE] `lib/weekly-fill.ts` — pending_approval split, new interface fields
- [IN-SCOPE] `hooks/usePipelineDaemon.ts` — confirmed-fill branching, ideasPerCycle state + persistence
- [IN-SCOPE] `components/PipelinePanel.tsx` — ideas/cycle input, pending indicator, interval min bump
- [IN-SCOPE] `tests/lib/weekly-fill.test.ts` — 17 cases, edge cases for horizon exclusion and over-scheduling
- [IN-SCOPE] `tests/lib/pipeline-daemon.test.ts` — 22 predicate-pin cases
- [OUT-OF-SCOPE] `components/PipelineStatusStrip.tsx` — untouched; success banner absent (spec gap)

## Acceptance Criteria Verdict

| AC | Description | Status |
|----|-------------|--------|
| 1 | pending_approval week → daemon continues, no sleep | ✅ PASS |
| 2 | scheduled-only full week → daemon sleeps interval | ✅ PASS |
| 3 | "Pending Approval" count visible in PipelinePanel | ✅ PASS |
| 4 | Ideas/cycle configurable 1-10, default 5 | ✅ PASS |
| 5 | Interval minimum 120 min in UI | ✅ PASS |
| 6 | All new code paths have tests | ⚠️ PARTIAL — predicate-only for daemon; no test for ideas/cycle wiring |
| 7 | WeekProgressMeter shows scheduled-only percentage | ✅ PASS |

## Gate Decision

**[CONCERNS]** — Core behaviour (ACs 1-5, 7) is correctly implemented and
well-reasoned. Two spec gaps prevent PASS: the `pipeline-week-confirmed`
success banner is absent from PipelineStatusStrip (Feature Spec §4, not in
numbered ACs but explicitly called out), and AC6 test coverage has known holes
in daemon integration and UI wiring. Merge is acceptable; banner and wiring
test should be tracked as follow-up before v1.0.

Confidence: 0.77
