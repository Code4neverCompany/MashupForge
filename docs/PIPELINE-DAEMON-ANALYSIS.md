# Pipeline Continuous/Scheduled Mode — Deep Analysis

## Complete Workflow Diagram

```
User clicks "Start Pipeline" in PipelinePanel
       │
       ▼
startPipeline() [usePipeline.ts:71]
       │
       ▼
daemon.runOuterLoop(processor.processIdea) [usePipelineDaemon.ts:347]
       │
       ▼
withPipelineRunning(setPipelineRunning, async () => {
       │
       ├── 1. Create AbortControllers (runAbort, skipAbort)
       ├── 2. Snapshot pipeline settings for checkpoint
       ├── 3. Clear pending resume prompt
       ├── 4. Log "pipeline-start"
       ├── 5. pi.dev pre-check (/api/pi/status)
       ├── 6. Fetch Instagram engagement data (cached 24h)
       │
       ▼
   do {  ←── CONTINUOUS MODE LOOP (do...while)
       │
       ├── a. accumulatedPosts = []  (reset per cycle)
       ├── b. pendingIdeas = ideas with status='idea'
       │
       ├── c. IF no pending ideas:
       │      └── autoGenerateIdeas(3) via pi.dev
       │          └── Adds 3 ideas to state
       │
       ├── d. FOR each pending idea:
       │      │
       │      ├── Create skipAbort controller per idea
       │      ├── Set 10-min hard timeout (IdeaTimeoutError)
       │      ├── Race: processIdea() vs timeout
       │      │
       │      └── processIdea() [pipeline-processor.ts:145]:
       │          ├── Step a: Mark idea as 'in-work'
       │          ├── Step b: Fetch trending context (/api/trending)
       │          ├── Step c: Expand idea → prompt (pi.dev enhance)
       │          ├── Step d: Generate images (Leonardo multi-model)
       │          ├── Step e: Wait for images (with skip support)
       │          ├── Step f: Caption (pi.dev, parallel pool of 3)
       │          ├── Step g: Schedule (findNextAvailableSlot)
       │          │    └── Routes through pickFillWeekSlot [fill-week-scheduler.ts]
       │          │         ├── computeWeekFillStatus → check week 1 filled?
       │          │         ├── IF not filled: horizonDays = 7
       │          │         ├── IF filled: horizonDays = 14
       │          │         └── findBestSlot(posts, engagement, {horizonDays})
       │          │              └── findBestSlots [smartScheduler.ts:329]
       │          │                   ├── startDate = tomorrow ← BUG: skips today
       │          │                   ├── Score each slot: dayMult × hourWeight + bonus
       │          │                   ├── Divide by (1 + existing posts on that day) ← BUG-CRIT-002
       │          │                   └── Return best slot
       │          └── Step h: Mark idea as 'done'
       │
       ├── e. IF continuous mode:
       │      ├── horizonDays = max(targetDays, 14)
       │      ├── fill = computeWeekFillStatus(allPosts, horizonDays, targetPerDay)
       │      ├── IF !fill.filled → continue (next cycle immediately)
       │      ├── IF fill.filled → sleep intervalMin minutes
       │      │    └── 2-second slice loop, checks runAbort between slices
       │      └── weekFilledPromptedThisRun reset for next horizon
       │
       └── Loop back to do {
              ... (next cycle)
           } while (readContinuous() && !runAbort.signal.aborted)
       │
       ▼
   Clean exit: clearCheckpoint(), clearPipelineLog()
```

## Architecture Summary

| Component | File | Role |
|---|---|---|
| Daemon hook | `hooks/usePipelineDaemon.ts` | Outer loop, state, AbortControllers, continuous sleep |
| Idea processor | `hooks/useIdeaProcessor.ts` | Builds ProcessIdeaDeps, wires slot picker |
| Pipeline processor | `lib/pipeline-processor.ts` | Pure processIdea: trending → expand → gen → caption → schedule |
| Fill-week scheduler | `lib/fill-week-scheduler.ts` | pickFillWeekSlot: caps horizon at 7d until week 1 filled |
| Smart scheduler | `lib/smartScheduler.ts` | findBestSlot(s): engagement-based slot scoring |
| Weekly fill status | `lib/weekly-fill.ts` | computeWeekFillStatus: per-day gap analysis |
| Pipeline utils | `lib/pipeline-daemon-utils.ts` | countFutureScheduledPosts, resolvePipelinePostStatus |
| Composer | `hooks/usePipeline.ts` | Thin wrapper: daemon + processor → startPipeline |
| UI panel | `components/PipelinePanel.tsx` | Controls, status, approval queue |
| Resume handler | `lib/resume-checkpoint.ts` | Apply checkpoint settings + resume hint |

## Bugs Found

### BUG 1: Design Mismatch — `findBestSlots` Skips Today but `computeWeekFillStatus` Counts Today

**Severity:** HIGH — causes infinite loop in continuous mode near midnight

**Location:** `lib/smartScheduler.ts` lines 369-376 vs `lib/weekly-fill.ts` lines 95-107

**Note:** The "skip today" behavior in `findBestSlots` is **intentional** — verified by explicit test
at `tests/lib/smartScheduler.test.ts:78` ("starts the search from tomorrow, never today").
The bug is that `computeWeekFillStatus` was not updated to match — it still counts today as day 0.

```typescript
// smartScheduler.ts — intentionally skips today:
const startDate = new Date(now);
startDate.setDate(startDate.getDate() + 1);  // ← DESIGN: starts from tomorrow

// weekly-fill.ts — counts today as day 0:
for (let i = 0; i < targetDays; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);  // ← i=0 = TODAY
  // ...counts posts on this day
}
```

**How it breaks continuous mode:**

1. `computeWeekFillStatus` (weekly-fill.ts) counts TODAY as day 0 of the N-day window
2. `findBestSlots` starts candidates from TOMORROW (day 1) — intentionally
3. If today has 0 posts, `computeWeekFillStatus` reports `filled = false` with a 2-slot gap on today
4. The daemon calls `pickFillWeekSlot` → `findBestSlot` → but the best slot is always tomorrow onward
5. The cycle fills tomorrow, day+2, etc., but today stays at 0
6. `computeWeekFillStatus` still shows today's gap → `filled = false`
7. **INFINITE LOOP:** daemon runs cycle after cycle trying to "fill" a day it can never schedule into

**When it triggers:** Any time the pipeline runs when today's posting window (6:00-23:00) is being missed — especially near midnight, or when the app starts late in the day. The pipeline eventually exits the loop once the saturation penalty forces enough posts onto future days to compensate for today's gap, but this takes far more cycles than intended.

**Fix proposal (Option A — recommended):** Make `computeWeekFillStatus` start from tomorrow too, matching the scheduler:
```typescript
// In lib/weekly-fill.ts, computeWeekFillStatus():
// Start from tomorrow, not today, to match findBestSlots behavior:
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

for (let i = 0; i < targetDays; i++) {
  const d = new Date(tomorrow);  // ← Start from tomorrow
  d.setDate(tomorrow.getDate() + i);
  // ...
}
```

**Fix proposal (Option B):** Allow `findBestSlots` to include today with past-hour filtering:
```typescript
// In lib/smartScheduler.ts, findBestSlots():
const startDate = new Date(now);
// Don't skip today — start from now.
for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
  const checkDate = new Date(startDate);
  checkDate.setDate(checkDate.getDate() + dayOffset);
  for (const { hour } of eng.hours) {
    if (hour < 6 || hour > 23) continue;
    // Skip past hours on today
    if (dayOffset === 0 && hour <= now.getHours()) continue;
    // ...
  }
}
```
This requires updating the existing test "starts the search from tomorrow, never today".

---

### BUG 2: No Auto-Start of Continuous Mode on App Load

**Severity:** HIGH — "every X minutes" doesn't work across app restarts

**Location:** No auto-start logic exists anywhere.

**Evidence:**
- `PipelineStatusStrip.tsx:83` shows "Ready" when `pipelineEnabled && pipelineContinuous && !pipelineRunning` — confirming the intent is for the pipeline to be ready to auto-start
- `PipelinePanel.tsx:317-334` has a manual "Start Pipeline" button — the ONLY way to start the pipeline
- No `useEffect` in any component checks `pipelineEnabled && pipelineContinuous` to auto-call `startPipeline()`
- The pipeline `do...while(readContinuous())` loop works correctly once started — the sleep between cycles is functional. But it never starts itself.

**How it manifests:**
- User enables Pipeline toggle + Continuous mode toggle + sets interval to 120 min
- User starts pipeline → runs great, cycles through ideas, sleeps 120 min between cycles
- User closes app (or browser tab)
- App reopens → `pipelineEnabled=true`, `pipelineContinuous=true` persisted in localStorage
- But pipeline is NOT running — user must click "Start Pipeline" again
- The "every 120 min" interval is meaningless because nothing triggers the first run

**Fix proposal — add to `MashupContext.tsx` or a new `usePipelineAutoStart` hook:**
```typescript
// In MashupContext.tsx or a new hook mounted alongside:
useEffect(() => {
  if (pipelineEnabled && pipelineContinuous && !pipelineRunning) {
    // Small delay to let the app hydrate fully
    const timer = setTimeout(() => {
      startPipeline();
    }, 5000); // 5s after mount — let settings/images hydrate
    return () => clearTimeout(timer);
  }
}, []); // Only on mount — deps intentionally empty
```

**Alternative fix:** Add the auto-start in `usePipelineDaemon.ts` itself:
```typescript
// In usePipelineDaemon, after the hydrate effects:
useEffect(() => {
  const config = loadPersistedConfig();
  if (config.enabled && config.continuous) {
    const timer = setTimeout(() => {
      // Trigger startPipeline via a ref or callback
    }, 3000);
    return () => clearTimeout(timer);
  }
}, []);
```

---

### BUG 3: UTC/Local Date Mismatch in Slot Assignment

**Severity:** MEDIUM — causes wrong-day scheduling for non-UTC timezones

**Location:** `lib/smartScheduler.ts`, line 376

```typescript
// findBestSlots uses UTC dates:
const dateStr = checkDate.toISOString().split('T')[0]; // UTC!

// But computeWeekFillStatus uses local dates:
// weekly-fill.ts line 56-60:
function formatDate(d: Date): string {
  const y = d.getFullYear();       // LOCAL
  const m = String(d.getMonth() + 1).padStart(2, '0'); // LOCAL
  const day = String(d.getDate()).padStart(2, '0');    // LOCAL
  return `${y}-${m}-${day}`;
}
```

**How it breaks:** For a user in UTC+2 (most of Europe):
- `findBestSlots` generates `dateStr = "2026-04-21"` (UTC)
- But locally it's already `2026-04-22` (2 hours ahead)
- `computeWeekFillStatus` counts the post under `2026-04-22` (local)
- The post gets assigned to the wrong day's fill count
- Can cause off-by-one in the "filled?" check

**Fix proposal:**
```typescript
// In lib/smartScheduler.ts, findBestSlots():
// Replace UTC date formatting with local:
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Then use: const dateStr = formatDateLocal(checkDate);
// Same fix needed in findBestSlot's fallback (line 425).
```

---

### BUG 4: `countFutureScheduledPosts` vs `computeWeekFillStatus` Count Mismatch

**Severity:** LOW — cosmetic/confusing logs, no functional breakage

**Location:** `lib/pipeline-daemon-utils.ts:85` and `lib/weekly-fill.ts:72`

**The discrepancy:**
- `countFutureScheduledPosts(allPosts, horizonDays)` counts ALL future posts within the horizon (raw total)
- `computeWeekFillStatus(allPosts, horizonDays, targetPerDay)` caps each day at `targetPerDay`
- The daemon logs `futurePosts/targetTotal` where `futurePosts` is raw and `targetTotal` is capped
- If a day has 3 posts but targetPerDay is 2: `countFutureScheduledPosts` counts 3, `computeWeekFillStatus` counts 2 for that day
- Log line could show "29/28 posts" which is confusing

**Fix proposal:** Use `fill.scheduledTotal` instead of `countFutureScheduledPosts` in the daemon log:
```typescript
// In usePipelineDaemon.ts, around line 661:
// const futurePosts = countFutureScheduledPosts(allPosts, horizonDays); ← REMOVE
const futurePosts = fill.scheduledTotal;  ← USE CAPPED COUNT
```

---

### BUG 5: Today's Fill Gap Creates Perpetually Unfilled Week (interacts with Bug 1)

**Severity:** HIGH (consequence of Bug 1)

**Detailed scenario:**
1. It's 11 PM Monday. Pipeline starts.
2. `computeWeekFillStatus(posts, 14, 2)` → today (Mon) has 0 posts, gap=2
3. `fill.filled` = false because `scheduledTotal = 26 < targetTotal = 28`
4. `pickFillWeekSlot` → `computeWeekFillStatus` shows week1 (7d) not filled → horizon=7
5. `findBestSlot(posts, engagement, {horizonDays: 7})` → candidates start from Tue
6. Best slot is Tue 20:00. Post scheduled. Repeat for Tue 18:00.
7. Now Tue has 2 posts. Next cycle: Wed gets posts...
8. After 7 days of posts (Tue-Mon), week1 has 12/14 (Sat/Sun might still need posts)
9. But Monday's 2 slots are NEVER filled because `findBestSlots` skipped them
10. Daemon runs indefinitely: `fill.filled` is always false (26 < 28 for 14d horizon)

**Even with tomorrow saturated:** Once all Tue-Sun slots are full, the scheduler picks the least-penalized day. But Monday (today) is never a candidate. The horizon wraps to next week, filling days 8-14. If the 14-day window eventually reaches 28 posts (excluding today's 2), the loop exits. But that requires filling ALL 14 future days, which takes many cycles.

**Net effect:** Continuous mode works, but slowly. Each "filled" check requires overfilling future days to compensate for today's gap. The "X days ahead" target is effectively reduced by 1 day.

---

## Fix Priority

| Priority | Bug | Fix Effort | Approach |
|---|---|---|---|
| P0 | Bug 2: No auto-start | 5-line useEffect | Add auto-start in MashupContext on mount if enabled+continuous |
| P0 | Bug 1: Fill-status/scheduler mismatch | 1-5 lines | Option A: make computeWeekFillStatus start from tomorrow (match scheduler) |
| P1 | Bug 3: UTC/local date mismatch | 10 lines | Add local formatDate to smartScheduler.ts, use everywhere |
| P2 | Bug 4: Log count mismatch | 1 line | Use fill.scheduledTotal instead of countFutureScheduledPosts in daemon log |
| P2 | Bug 5: Interacts with Bug 1 | Resolved | Resolved by fixing Bug 1 |
