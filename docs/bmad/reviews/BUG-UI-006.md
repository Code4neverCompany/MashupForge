# BUG-UI-006 — "Weekly fill showing 30/14 slots — counting beyond limit"

**Status:** done — semantic cap added in helper
**Classification:** routine
**Severity:** medium (misleading meter; informs daemon-adjacent UX)

## Bug as reported

> "Week fill shows 30/14 — system counting posts beyond weekly cap.
> Should enforce 14 max."
> Acceptance: "Weekly fill capped at max. No overflow counting."

The Week Progress meter (and the Daily Digest "slots" widget) were
displaying numerators larger than the configured target — e.g.
`30/14 · 100%`. With 7 days × 2 posts/day = 14 target slots, the
display claimed 30 — visibly wrong.

## Root cause

`lib/weekly-fill.ts:103` (pre-fix):

```typescript
const scheduledTotal = days.reduce((sum, d) => sum + d.scheduledCount, 0);
```

`scheduledTotal` was the **raw** sum of every non-terminal post in the
window with no per-day cap. If the user (or the daemon during a
transient state) parked 8 posts on Monday and 0 elsewhere, the
aggregate counted 8 toward the 14-target — making the meter look
57% full even though six of seven days were empty. With many days
over-scheduled, totals could comfortably exceed `targetTotal`.

Two display sites consumed the field:

- `components/pipeline/WeekProgressMeter.tsx:28` —
  `{scheduledTotal}/{targetTotal} · {percent}%`
- `components/ideas/DailyDigest.tsx:272` —
  `{weekFillStatus.scheduledTotal} / {weekFillStatus.targetTotal}` "slots"

`percent` was already correctly capped at 100 via `Math.min`, but the
numerator still leaked the overflow. `filled` (`scheduledTotal >=
targetTotal`) coincidentally still flipped true at the right moment,
so the daemon's sleep behaviour was unaffected — the bug was purely
in the surfaced number.

## Fix shipped

`lib/weekly-fill.ts` only — single helper, 2 display sites
inherit automatically:

```typescript
const scheduledTotal = days.reduce(
  (sum, d) => sum + Math.min(d.scheduledCount, d.target),
  0,
);
```

Each day now contributes at most `postsPerDay` slots to the
aggregate. Semantically `scheduledTotal` becomes "filled slots out
of `targetTotal`", which is what every consumer was already trying
to display anyway.

Per-day `DayFill.scheduledCount` is **unchanged** — it still carries
the raw count so the per-day cells / tooltip can show "5/2" if the
user genuinely over-scheduled a day. Only the aggregate is capped.

JSDoc on `WeekFillStatus.scheduledTotal` updated to spell out the
new contract:

> Sum of `min(day.scheduledCount, day.target)` per day. Each day
> contributes at most `postsPerDay` slots so the aggregate is a
> "filled slots" measure, not a raw post count, and is guaranteed
> to satisfy `scheduledTotal <= targetTotal`.

## Verification

- `npx tsc --noEmit` → exit 0.
- `vitest run` → 456/456 pass via the pre-commit hook
  (one new assertion below pushes the total from 455 → 456).
- The previous test case `'over-target total still reports filled;
  percent caps at 100'` was renamed and tightened — it asserted
  `scheduledTotal=17` (the raw sum) which encoded the buggy semantic.
  New assertion: `scheduledTotal=14, scheduledTotal <= targetTotal`,
  with the day-level raw count `days[0].scheduledCount=5` still
  preserved.
- Added a new regression test
  `'uneven over-scheduling on one day does not mask gaps elsewhere'`
  that pins the exact bug shape: 8 posts on day 0, 0 elsewhere →
  raw=8 (would previously have shown "8/14 · 57% full") now
  correctly shows `scheduledTotal=2, percent≈14`, `filled=false`.
- The daemon's own scheduling-loop count (`futurePosts` in
  `usePipelineDaemon.ts:644`) is computed independently of
  `weekFillStatus`, so the cap change does not influence
  daemon control flow.

## Why I didn't fix at the display layer

Two display sites both read `scheduledTotal`. Capping at the display
layer would mean two `Math.min(scheduledTotal, targetTotal)`
expressions and a third one wherever this surfaces next. The helper
is the single source of truth, the field's docstring explicitly
called it "Sum of day.scheduledCount" — that *was* the bug. Fix the
contract, not the readers.

Capping per-day (`min(scheduledCount, target)`) is more meaningful
than a final `min(total, targetTotal)` because it reflects "filled
slots" semantically: a week with 8 posts on Monday and 0 elsewhere
has 2 filled slots, not 8, and the new aggregate matches that.

## Files touched

### Production
- `lib/weekly-fill.ts` — `scheduledTotal` reducer now caps each
  day's contribution at `d.target`; JSDoc on the field updated.
  ~10 LOC delta in one function.

### Tests
- `tests/lib/weekly-fill.test.ts` — renamed and tightened the
  over-target test (now asserts the cap), added a new regression
  test for the uneven-over-scheduling bug shape.

### Docs
- `docs/bmad/reviews/BUG-UI-006.md` (this file).

## Out of scope

- **Per-day display cells** still show raw `scheduledCount/target`
  (e.g., "5/2"). Intentional — the user wants to see they
  over-scheduled a specific day. Only the aggregate is capped.
- **Daemon "futurePosts" counter** in
  `usePipelineDaemon.ts:644` uses its own raw count of future posts
  and is not aware of per-day caps. Out of scope here; the daemon
  already correctly stops scheduling when it has 14 future posts
  even if they're unevenly distributed.
- **Add a "(uneven distribution)" warning** when the week has gaps
  but is over-scheduled on some day. Possible UX follow-up; the
  per-day bars already encode this visually (some emerald, some
  zinc).

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-006","status":"done","summary":"Week meter showed 30/14 because lib/weekly-fill.ts summed scheduledTotal as the raw count across all days with no per-day cap. Two display sites (WeekProgressMeter.tsx:28, DailyDigest.tsx:272) inherited the overflow. Fix: changed the reducer to sum min(day.scheduledCount, day.target) so each day contributes at most postsPerDay slots and the aggregate is bounded by targetTotal. Per-day DayFill.scheduledCount stays raw so the per-day cells still show '5/2' if the user over-scheduled a day. JSDoc updated to spell out the new contract. Updated one test (was asserting the buggy raw=17 sum) to assert the cap, plus a new regression test for the uneven-over-scheduling bug shape (8 posts on Monday, 0 elsewhere → scheduledTotal=2 not 8). Daemon's futurePosts count is independent → no daemon control-flow change. Pre-commit green (456/456 — one new assertion). ~10 LOC in one helper. Doc at docs/bmad/reviews/BUG-UI-006.md."}
```
