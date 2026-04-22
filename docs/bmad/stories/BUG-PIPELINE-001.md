# BUG-PIPELINE-001 — computeWeekFillStatus / findBestSlots Start-Date Mismatch

**ID:** BUG-PIPELINE-001  
**Severity:** HIGH (P0)  
**Filed by:** QA Agent  
**Date:** 2026-04-22  
**Source:** `docs/PIPELINE-DAEMON-ANALYSIS.md` Bug 1  
**Status:** Open

---

## Summary

`findBestSlots` (smartScheduler.ts) intentionally starts candidates from **tomorrow**, but
`computeWeekFillStatus` (weekly-fill.ts) starts its window from **today**. The fill-status
check therefore always sees a gap for today that the scheduler can never close, causing the
pipeline to loop continuously without converging near midnight or on late-day starts.

---

## Reproduction

1. Start the pipeline at any time when today's posting window (06:00–23:00) has fewer posts than `targetPerDay`.
2. The pipeline cycles through ideas, scheduling into tomorrow and beyond.
3. After each cycle `computeWeekFillStatus` still reports `filled = false` because today's 0 posts create a gap.
4. The loop continues indefinitely — it exits only once enough future days are saturated to mathematically exceed the target (including the unschedulable today gap).

Easiest trigger: start the pipeline after 23:00 local time, or in a timezone where the app
opens late in the day.

---

## Root Cause

```typescript
// lib/smartScheduler.ts — intentional: starts from tomorrow
const startDate = new Date(now);
startDate.setDate(startDate.getDate() + 1);  // day 0 = tomorrow

// lib/weekly-fill.ts — starts from today (mismatch):
for (let i = 0; i < targetDays; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);  // i=0 = TODAY
  // ... counts posts on this day against target
}
```

`findBestSlots` never places a post on today. `computeWeekFillStatus` counts today toward
the fill requirement. The delta is permanent: today's `targetPerDay` slots are counted as
needed but can never be filled.

---

## Recommended Fix (Option A — preferred)

Align `computeWeekFillStatus` to start from tomorrow, matching the scheduler:

**File:** `lib/weekly-fill.ts`  
**Function:** `computeWeekFillStatus()`

```typescript
// Before:
for (let i = 0; i < targetDays; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);

// After:
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
for (let i = 0; i < targetDays; i++) {
  const d = new Date(tomorrow);
  d.setDate(tomorrow.getDate() + i);
```

Option A requires no test changes (the existing test "starts the search from tomorrow, never
today" in `tests/lib/smartScheduler.test.ts:78` stays valid).

**Option B** (alternative — allow today in scheduler with past-hour filter) is described in
`docs/PIPELINE-DAEMON-ANALYSIS.md` but requires updating the existing smartScheduler test.

---

## Acceptance Criteria

- [ ] Pipeline started after 23:00 converges within 1–2 cycles (fills 7-day window, then sleeps).
- [ ] `computeWeekFillStatus` test: start-of-window is tomorrow when called at any hour.
- [ ] Existing smartScheduler test "starts the search from tomorrow, never today" still passes.
- [ ] Manual smoke test: enable continuous mode, set `intervalMin = 0`, watch daemon — loop must exit after ≤ 2 cycles when `targetPerDay` is satisfiable.

---

## Related

- BUG-PIPELINE-005 (consequence of this bug — resolved when this is fixed)
- `docs/PIPELINE-DAEMON-ANALYSIS.md` §Bug 1 and §Bug 5
