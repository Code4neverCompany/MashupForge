# Pre-release Debrief: v0.4.0

**Date:** 2026-04-18
**Reviewer:** QA subagent
**Suite baseline:** 273/273 · tsc clean

---

## 1. Must fix before release

### BUG: `CarouselGroup.status` hardcoded to `'scheduled'` in V040-008 carousel path

**File:** `lib/pipeline-processor.ts:292`

```typescript
// WRONG — ignores the per-platform approval gate V040-008 just added
status: 'scheduled' as const,
```

`CarouselGroup.status` is always set to `'scheduled'` even when the individual
`ScheduledPost` entries for the same carousel correctly land as
`'pending_approval'` (e.g. the platform set includes Instagram). The
`carouselStatus` variable computed just 18 lines above (via
`resolvePipelinePostStatus`) is not used here.

**Is this breaking today?** Probably not — `approval-grouping.ts` drives the
approval UI and auto-poster via `ScheduledPost.status`, not `CarouselGroup.status`.
But the group's state is semantically wrong, could mislead any UI that reads it,
and proves the fix was incomplete. `CarouselGroup.status` doesn't support
`'pending_approval'` (valid values: `'draft' | 'scheduled' | 'posted' | 'failed'`),
so the right mapping is:

```typescript
status: carouselStatus === 'scheduled' ? 'scheduled' : 'draft',
```

This is a **5-second fix** that should go in before v0.4.0 ships.

---

## 2. Most impactful quick fix

The `CarouselGroup.status` fix above (1 line, zero risk). It closes the semantic
gap opened by V040-008 and prevents future code from trusting a stale `'scheduled'`
status on a group whose posts are queued for approval.

---

## 3. Loose ends

**a. `WeekHeatmap.tsx` pure helpers untested (V040-001)**
`classifyTint`, `computeDisplayedStars`, `formatUpdatedAgo`, `computeWeekScores`
were deliberately deferred from unit testing (see review "Out of scope"). These
are pure functions with spec-encoded behavior tables. Low regression risk
right now, but they belong in `tests/lib/` before the next major version.

**b. `fanCaptionToGroup` WARN-1 guard still untested (V040-003)**
The "don't overwrite manually-edited siblings" guard (`if (!force && ci.postCaption) continue`)
has never had a test. V040-003 extracted the logic to one place but the test gap
persists from the original QA-BUG-001 WARN-1 flag. One targeted test would
close this.

**c. Approval-flow integration gap (V040-008)**
V040-008 has 9 unit tests for `isPlatformAutoApproved` and
`resolvePipelinePostStatus` but no test that walks a pipeline run with
Instagram in the platform set and verifies the resulting `ScheduledPost.status`
is `'pending_approval'`. The unit tests prove the helpers are correct; a
`pipeline-processor` integration test would prove the wiring is correct. The
hardcoded group status bug (§1) would have been caught by such a test.

**d. Month-view heatmap (V040-001 out of scope)**
Per-day tinting in month mode is still unimplemented. Flagged as a follow-up
in the spec — just making sure it's on the backlog.

---

## 4. Embarrassing

V040-008 landed the per-platform approval gating as its flagship feature.
Every callsite in `pipeline-processor.ts` was correctly updated — except one:
the `CarouselGroup` object written to `UserSettings.carouselGroups` always
gets `status: 'scheduled'` regardless of whether the posts themselves are
pending approval. The fix was done at `ScheduledPost` level (line 275 correctly
uses `carouselStatus`) but missed the accompanying group record 17 lines later.

The approval-flow tests covered the helpers in isolation but not the wiring —
so the inconsistency shipped. The test gap in §3c would have caught it.
