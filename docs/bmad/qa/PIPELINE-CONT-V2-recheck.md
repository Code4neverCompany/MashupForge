# QA Re-Review — PIPELINE-CONT-V2 (followup concerns)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-26
**Commits:** 487bde5 38c7218 6ea442e
**Prior review:** docs/bmad/qa/PIPELINE-CONT-V2.md (CONCERNS, 0.77)

## Files Reviewed

- `components/PipelineStatusStrip.tsx`
- `tests/components/PipelineStatusStrip-week-confirmed.test.tsx`
- `tests/components/PipelinePanel-ideasPerCycle-pin.test.ts`
- `tests/lib/usePipelineDaemon-ideasPerCycle.test.tsx`
- `lib/pipeline-daemon-utils.ts`
- `hooks/usePipelineDaemon.ts`
- `tests/lib/pipeline-daemon.test.ts`

## Concern 1 — PipelineStatusStrip week-confirmed banner (487bde5)

**Original finding:** success banner for `pipeline-week-confirmed` absent from PipelineStatusStrip.

**Fix verified:** `pipelineLog` is now consumed from `useMashup()` in the strip.
`showWeekConfirmedBanner = latestLog?.step === 'pipeline-week-confirmed'` — bound
to the last log entry, no index or scan. Auto-dismiss is purely reactive: the
moment the daemon emits any newer log event (next cycle's `pipeline-cycle`,
`daemon`, etc.) `pipelineLog[last]` changes and the banner disappears — no
timer, no manual close state needed. Clean approach.

4 test cases cover the full truth table:
- renders when last entry is `pipeline-week-confirmed` ✅
- does NOT render when a newer `pipeline-cycle` follows it (auto-dismiss) ✅
- does NOT render on empty log ✅
- does NOT confuse `pipeline-week-partial` with confirmed ✅

### Findings

- [INFO] Banner text is "Week confirmed" — spec prose said 'Week [date] fully
  scheduled'. Date is not surfaced in the pill. The emerald pill is clearly
  identifiable; the wording deviation is cosmetic and does not affect
  correctness. Not raising as a warning.

**Concern closed. ✅**

## Concern 2 — ideasPerCycle wiring test coverage (38c7218)

**Original finding:** `pipelineIdeasPerCycle` UI wiring had no test.

**Fix verified:** Two files, two layers:

`tests/lib/usePipelineDaemon-ideasPerCycle.test.tsx` (hook layer, 4 cases):
- Default = 5 when localStorage empty ✅
- Setter clamps: below 1 → 1, above 10 → 10, valid value passes through ✅
- localStorage round-trip: value persisted after `setPipelineIdeasPerCycle(8)`,
  fresh remount reads 8 not the default ✅
- Pre-V2 backwards compat: persisted blob without `ideasPerCycle` field
  falls back to 5 ✅

`tests/components/PipelinePanel-ideasPerCycle-pin.test.ts` (panel wiring, 4 cases):
- `pipelineIdeasPerCycle` and `setPipelineIdeasPerCycle` destructured from
  `useMashup` ✅
- `value={pipelineIdeasPerCycle}` and `ideas/cycle` label present ✅
- `min={1}` `max={10}` on the input ✅
- `onChange` calls `setPipelineIdeasPerCycle(Math.max(1, Math.min(10, ...)))` ✅

Source-text pin pattern is appropriate here — avoids heavy jsdom render of
the full PipelinePanel while still catching destructure or clamp regressions.

**Concern closed. ✅**

## Concern 3 — pickContinuousBranch in pipeline-daemon-utils (6ea442e)

**Original finding:** daemon tests used a `pickBranch()` mirror — divergence
from the actual hook logic could regress silently.

**Fix verified:**
- `pickContinuousBranch` exported from `lib/pipeline-daemon-utils.ts` as a
  pure function with typed `ContinuousBranch` union
  (`'continue-not-filled' | 'continue-pending' | 'sleep-confirmed'`) ✅
- Hook imports and calls `pickContinuousBranch(fill)` — the production branch
  is now the only copy of this logic ✅
- `pickBranch()` mirror completely removed from the test file ✅
- All 22 test assertions now call `pickContinuousBranch(fill)` directly from
  the same import as the hook — no duplication ✅

**Concern closed. ✅**

## Test run

```
Test Files  5 passed (5)
     Tests  51 passed (51)
  Duration  1.05s
```

Files: PipelineStatusStrip-week-confirmed (4), usePipelineDaemon-ideasPerCycle
(4), PipelinePanel-ideasPerCycle-pin (4), pipeline-daemon (22), weekly-fill (17).

## Scope Check

- [IN-SCOPE] `components/PipelineStatusStrip.tsx` — banner only, no other changes
- [IN-SCOPE] `lib/pipeline-daemon-utils.ts` — additive: new export, nothing removed
- [IN-SCOPE] `hooks/usePipelineDaemon.ts` — branch logic unchanged, import swapped
- [IN-SCOPE] `tests/components/PipelineStatusStrip-week-confirmed.test.tsx` — new
- [IN-SCOPE] `tests/components/PipelinePanel-ideasPerCycle-pin.test.ts` — new
- [IN-SCOPE] `tests/lib/usePipelineDaemon-ideasPerCycle.test.tsx` — new
- [IN-SCOPE] `tests/lib/pipeline-daemon.test.ts` — mirror removed, real import added

## Gate Decision

**[PASS]** — All three concerns from the initial CONCERNS verdict are
closed. Banner is correctly bound and auto-dismisses. Wiring is tested
end-to-end from hook state through localStorage persistence and panel
render. Branch logic lives in a single canonical location used by both
hook and tests. 51/51 tests pass. No new issues found.

Confidence: 0.95
