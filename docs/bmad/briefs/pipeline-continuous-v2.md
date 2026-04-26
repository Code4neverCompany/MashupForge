# Pipeline Continuous Mode v2 — Autonomous Week-Fill

## Problem Statement

The current continuous mode has a stall condition: when `pending_approval` posts fill the week horizon, `computeWeekFillStatus` reports `filled=true` and the daemon sleeps for `interval` minutes (default 120). But `pending_approval` means not published — those slots are still empty from a publishing standpoint, and the 2-hour sleep window means missed engagement slots. Additionally, when the queue is empty the daemon generates only 3 ideas per cycle, which isn't enough to sustain a full week of content when individual posts may fail approval or be rejected.

## Goal

Autonomous continuous pipeline that generates content for an entire week ahead without waiting for per-post approval, then rolls into the next week. Scheduling still requires approval before posts go live — but the daemon should NOT stall on `pending_approval` fill. It should keep generating and accumulating posts in `pending_approval` until the true scheduled horizon is full.

## Architecture

### Current behavior (baseline)
1. Queue empty → `autoGenerateIdeas(3)` → 3 ideas via pi.dev
2. For each idea: trending → prompt → generate → caption → schedule → `pending_approval`
3. Week fill check: `computeWeekFillStatus(allPosts, horizonDays=Math.max(targetDays,14), targetPerDay)`
4. `filled=true` (including `pending_approval` posts) → sleep `interval` minutes → repeat

### Problems to fix
1. `pending_approval` posts count toward "filled" in `computeWeekFillStatus` — daemon stalls while posts are unapproved
2. Fixed 3-ideas-per-cycle is insufficient for sustaining a week
3. Week-fill success/match is not validated — no confirmation the week is actually filled before sleeping
4. No explicit "week successfully filled" acknowledgment — just a log line

## Feature Spec

### 1. Per-cycle idea batch size
**File:** `hooks/usePipelineDaemon.ts` + `components/PipelinePanel.tsx`

Make the number of ideas generated per cycle configurable instead of hardcoded `3`. Add a new UI control in the PipelinePanel (next to the "Every X min" and "target Y days" controls) for "Ideas per cycle" with a default of 5 and a range of 1-10.

```typescript
// hooks/usePipelineDaemon.ts — add new state
const [pipelineIdeasPerCycle, setPipelineIdeasPerCycleState] = useState(() => loadPersistedConfig().ideasPerCycle ?? 5);

// persistence key: 'pipelineIdeasPerCycle'
// persist with the other config fields
```

UI: Number input, min=1, max=10, default=5, next to the interval/targetDays row.

### 2. Fix week-fill to ignore pending_approval posts
**File:** `lib/weekly-fill.ts`

`computeWeekFillStatus` should only count posts with `status === 'scheduled'` (truly pre-scheduled, not awaiting approval) toward the "filled" calculation. `pending_approval` posts should be tracked separately in the DayFill but NOT counted toward `scheduledCount` for fill purposes.

```typescript
// In computeWeekFillStatus:
// OLD: counts pending_approval + scheduled posts
// NEW: only counts 'scheduled' posts
if (p.status === 'posted' || p.status === 'failed' || p.status === 'rejected') continue;
// Now also skip pending_approval — these haven't been approved yet
if (p.status === 'pending_approval') continue;
```

Add a new field `pendingApprovalCount` to `DayFill` and `WeekFillStatus`:
```typescript
export interface DayFill {
  // ...existing fields...
  /** Count of pending_approval posts on this day (not counted toward fill). */
  pendingApprovalCount: number;
}

export interface WeekFillStatus {
  // ...existing fields...
  /** Sum of pending_approval posts across all days in the horizon. */
  pendingApprovalTotal: number;
}
```

### 3. New "Week Confirmed Fill" state
**File:** `hooks/usePipelineDaemon.ts`

After the continuous loop detects `fill.filled === true` AND `fill.pendingApprovalTotal === 0`, emit a new week-fill success state. This is the trigger for "week is successfully matched" — scheduled posts confirmed for all days.

In the daemon continuous-mode block, add:
```typescript
if (fill.filled && fill.pendingApprovalTotal === 0) {
  // TRUE fill — all posts are scheduled (approved), no pending approvals
  addLog('pipeline-week-confirmed', '', 'success',
    `Week confirmed filled: ${fill.scheduledTotal}/${fill.targetTotal} posts across ${horizonDays}d — all scheduled`);
  // Sleep interval before next week
} else if (fill.filled && fill.pendingApprovalTotal > 0) {
  // PARTIAL fill — posts queued for approval, keep generating
  addLog('pipeline-week-partial', '', 'success',
    `Week has ${fill.scheduledTotal}/${fill.targetTotal} scheduled + ${fill.pendingApprovalTotal} pending approval — continuing`);
  continue; // immediately next cycle
}
```

### 4. Week-confirmed notification
**File:** `lib/pipeline-log-store.ts` (or new log type)

The log store should support a new log type `'pipeline-week-confirmed'` so the UI can surface a clear "Week [date] fully scheduled" message. The PipelineStatusStrip or PipelineView should display a success banner when this log entry appears.

### 5. Pending approval queue indicator
**File:** `components/PipelinePanel.tsx`

Show a "Pending Approval" count in the PipelinePanel when `weekFillStatus.pendingApprovalTotal > 0`. Format: `3 pending approval` in amber text, below the WeekProgressMeter.

```tsx
{weekFillStatus.pendingApprovalTotal > 0 && (
  <p className="text-sm text-amber-400">
    {weekFillStatus.pendingApprovalTotal} pending approval
  </p>
)}
```

### 6. Continuous mode: no sleep while pending approvals exist
**File:** `hooks/usePipelineDaemon.ts`

When in continuous mode and `fill.filled === true` but `fill.pendingApprovalTotal > 0`, the daemon should NOT sleep the interval timer — it should `continue` immediately to generate more ideas. Only sleep when `fill.filled === true` AND `fill.pendingApprovalTotal === 0`.

Current code (around line 678-711):
```typescript
// OLD: sleeps whenever filled=true
if (!weekFilledPromptedThisRun) {
  addLog('pipeline-week-filled', ...);
  weekFilledPromptedThisRun = true;
}
// ...sleep block...
weekFilledPromptedThisRun = false; // reset for next cycle
```

New logic: the sleep should be conditional on confirmed fill (no pending approvals).

### 7. Interval hardcoded minimum
**File:** `components/PipelinePanel.tsx`

Change the "Every X min" input minimum from `30` to `120` to match Maurice's stated preference for 120-minute cycles. The existing `pipelineInterval` default of `120` is already correct.

### 8. Tests
**Files:** `tests/lib/weekly-fill.test.ts` (new), `tests/lib/pipeline-daemon.test.ts` (update)

- `tests/lib/weekly-fill.test.ts`: Add test cases for `pending_approval` exclusion from fill math, `pendingApprovalCount` per day, and `pendingApprovalTotal` aggregate
- `tests/lib/pipeline-daemon.test.ts`: Add test for continuous-mode behavior when `pending_approval` posts exist (should `continue`, not `sleep`)

## Files to Modify
- `lib/weekly-fill.ts` — pending_approval exclusion, new fields
- `hooks/usePipelineDaemon.ts` — new state, confirmed-fill logic
- `components/PipelinePanel.tsx` — new UI control + pending indicator
- `tests/lib/weekly-fill.test.ts` — new test file
- `tests/lib/pipeline-daemon.test.ts` — update existing tests

## Files to Create
- `docs/bmad/briefs/pipeline-continuous-v2.md` — this document

## Acceptance Criteria
1. When week has scheduled posts + pending_approval posts, daemon continues generating (no sleep)
2. When week has ONLY scheduled posts filling all slots (no pending approvals), daemon sleeps interval
3. "Pending Approval" count is visible in PipelinePanel
4. "Ideas per cycle" is configurable (1-10, default 5)
5. Interval minimum in UI is 120 minutes
6. All new code paths have tests
7. `WeekProgressMeter` still shows correct percentage (scheduled-only denominator)
