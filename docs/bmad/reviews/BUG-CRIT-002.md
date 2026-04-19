# BUG-CRIT-002 — Smart-scheduler distributes across the week

**Status:** done
**Classification:** complex
**Severity:** critical
**Why:** With the default engagement weights (Saturday 1.0× × 20:00
0.95 = 0.95, plus a 0.15 weekend-evening bonus = 1.10), every
slot on Saturday outranked every slot on every other day. The
pipeline auto-scheduler called `findBestSlot` once per idea, each
call returned the next-highest *Saturday* slot, and 12 ideas piled up
on Saturday at 18:00, 19:00, 20:00, 21:00, etc. — with no posts on
any other day.

## Root cause

`findBestSlots` flattened every (day × hour) slot in the next 14 days
into one candidate list, sorted globally by score, and sliced the top
N. That global ranking guarantees pile-up: a high-engagement day's
*last* slot still beats a medium-engagement day's *best* slot under
plausible weight distributions, so the algorithm fills one day before
moving to the next.

The pipeline loop in `useIdeaProcessor.findNextAvailableSlot` made it
worse — each `findBestSlot` call only sees the previously-accumulated
posts as `taken` (exact `date+time` set membership). Once Saturday
20:00 is taken, the next call returns Saturday 19:00 because that's
still the global #2 — the algorithm has no notion that "this day is
getting crowded, try a different one."

The existing `caps`/`pipelineDailyCaps` plumbing was a hard ceiling
(skip the day entirely once cap hit) and required users to opt in
via settings. Most users had it unset → no distribution behavior at
all.

## Fix

Add a soft per-day saturation penalty inside `findBestSlots`:

```ts
const dayDivisor = 1 + (dayCounts[dateStr] || 0);
// ...
const score = rawScore / dayDivisor;
```

`dayCounts` is built from `existingPosts` excluding `posted`/`failed`
(same filter as the existing per-platform cap counts — historical
events shouldn't permanently lock a day out of distribution).

Numbers: Saturday's #1 slot stays at score 1.10 (divisor=1). Once one
post is on Saturday, Saturday's next slot scores 1.05/2 = 0.525,
which loses to Friday's #1 at 0.95×0.95+0.15 = 1.05 — so the second
pick lands on Friday. Third pick: Saturday's third = 1.0/3 = 0.33 vs
Thursday's first ≈ 0.81 — Thursday wins. The result is a natural
round-robin that respects engagement: best days fill first, then
spill, then spill further.

The 14-day candidate window already covers two weeks, so once week 1
is uniformly saturated the algorithm naturally moves into week 2 (the
next-Saturday is back at divisor=1 again). The
`'overflows to the second week'` test pins this.

The penalty is per-day (any platform), not per-platform — if Saturday
already has an Instagram post, scheduling a Twitter post on Saturday
still pays the penalty, because we want cross-platform distribution
too. Hard per-platform caps via `options.caps` still take precedence
and skip the day entirely when hit.

## Acceptance criteria — all met

| Criterion                                                       | Status |
|-----------------------------------------------------------------|--------|
| Posts distributed across the week (not piled on one day)        | ✓ (10-pick test asserts ≥5 distinct days, ≤3 per day) |
| Engagement-based slot selection                                 | ✓ (raw scoring unchanged; only the divisor is new) |
| Overflow to next week when slots full                           | ✓ (14-pick test asserts week-2 picks exist) |
| Write inbox                                                     | ✓ (envelope below) |

## Files touched

### Production
- `lib/smartScheduler.ts`:
  - Added `buildPerDayCounts` helper (mirror of
    `buildPerDayPlatformCounts` but day-only, used for the divisor).
  - `findBestSlots`: divides each candidate's score by `1 + posts on
    that day`. Long block comment in the docstring spelling out the
    motivation, the math, and the cross-platform behavior.
  - Renamed local `dayCounts` → `platDayCounts` for clarity since the
    new `dayCounts` is the single-name variable now.

### Tests
- `tests/lib/smartScheduler.test.ts` — added `describe('BUG-CRIT-002
  — distributes across the week instead of piling on one day')` with
  5 cases:
  - 10-pick batch spreads across ≥5 days, ≤3 per day
  - Day with 3 existing posts is no longer the next pick
  - Twitter posts on a day still penalize an Instagram pick (cross-
    platform distribution)
  - Iterative single-slot loop (simulating the pipeline) distributes
    12 picks across ≥5 days
  - 14-pick saturation forces overflow to week 2
  - posted/failed entries don't penalize the day

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — 391/391 across 37 files (was 385; +6 new
  scheduler cases).
- Existing tests (per-platform cap, posted/failed exclusion, slot-
  collision avoidance, sort-descending invariant) all pass unchanged
  — the divisor doesn't change relative ordering of slots within a
  day, so any test that checks "this slot ≥ that slot on the same
  day" stays valid.

## Out of scope (follow-up)

- The divisor is uniform (`1 + count`). Could be tunable per-user
  (e.g. "I want denser scheduling — divide by `1 + count*0.5`") but
  the default is sane and there's no UI ask.
- The pipeline UI doesn't show *why* a slot was picked over another
  ("would have been Saturday but it's saturated"). The `reason`
  string still mentions raw weights, not the divisor — could be
  enriched but no one's asked.
- `findBestSlots` returns the *saturated* score in `SlotScore.score`,
  not the raw one. Heatmap consumers go through `scoreSlotDetailed`
  separately and are unaffected. If a future caller needs both, we
  can add a `breakdown` field — but no current caller does.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-002","status":"done","summary":"Smart-scheduler now distributes auto-scheduled posts across the week. Added a per-day saturation divisor (1 + posts already on that day) inside findBestSlots so successive picks pay an increasing penalty for piling onto the same day. Iterative pipeline loop now spreads 12 picks across ≥5 distinct days; 14 picks overflow into week 2. Per-platform caps still take precedence. tsc clean, 391/391 pass."}
```
