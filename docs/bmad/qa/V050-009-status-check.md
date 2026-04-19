# V050-009 — Full program status check

**Status:** done (with prerequisite caveat)
**Classification:** complex
**Date:** 2026-04-19
**Branch:** main (post v0.5.1)

## Prerequisite caveat

The task brief opens with *"After V050-008 (dev logging) is shipped and
installed"*. **V050-008 is not in tree** — there is no new dev logger.
The only logging file present is `lib/pipeline-log-store.ts`, which is
the long-standing pipeline log, not a runtime UI logger. There is also
**no E2E test harness** in the repo (no Playwright, no Cypress —
package.json has neither dependency).

This means the literal acceptance criteria — "Test every tab", "Test
every flow", "Test every button" — cannot be satisfied by a CLI agent
without a UI driver. What I delivered instead:

1. **Full automated test suite** — 427/427 pass (post-fix: 435/435).
2. **Static-analysis bug hunt** across every recently-modified surface
   from the v0.5.1 cycle, looking for adjacent regressions.
3. **Dev server boot verification** — Next.js 16.2.3 (Turbopack)
   compiles clean; an instance was already running on port 3000.
4. **Bug fixes** for what is unambiguous and small-blast-radius
   (BUG-DEV-001 in this commit).
5. **Fix-task dispatch envelopes** for the three deferred bugs that
   need a design call from Maurice before touching code (see
   "Bugs found — for Hermes to dispatch" below).

The proper way to satisfy the literal brief is one of:
- Wait for V050-008 (dev logger) to ship, then have Maurice run a
  guided manual pass while the logger captures runtime state.
- Add Playwright (1 dep, ~30 min setup) so CLI agents can drive the
  Tauri/Next surface end-to-end.

I did NOT install Playwright as part of this task — adding a test
framework is a complex dep-add that needs explicit approval.

## Bugs found — fixed in this commit

### BUG-DEV-001 (CRITICAL): reject paths missed the status guard

**File:** `components/MashupContext.tsx:207-216` (singular) and `:238-249` (bulk)
**Severity:** critical (silent data corruption, no recovery path)

**Before:**
```ts
const rejectScheduledPost = (postId: string) => {
  updateSettings((prev) => ({
    scheduledPosts: (prev.scheduledPosts || []).map((p) =>
      p.id === postId ? { ...p, status: 'rejected' as const } : p
    ),
  }));
};
```

The bulk approve path on the same file (lines 226-229) **did** check
`p.status === 'pending_approval'` before flipping to 'scheduled'. The
reject paths did not. Consequence: any reject call against a post that
had already been scheduled / posted / failed would silently flip it to
'rejected', and the auto-poster (which only inspects `status === 'scheduled'`)
would lose track of it forever. No UI surface shows rejected posts, so
the user has no recovery path.

**Trigger conditions in production:**
- Stale UI reference — the user clicks "Reject" on a card that has
  already been auto-posted by the cron between render and click.
- Bulk reject — the user "reject all visible" against a list that
  contains a mix of statuses (likely if they leave the Approval Queue
  open while the auto-poster acts).

**Fix:** added `&& p.status === 'pending_approval'` to the conditional
in both reject paths, mirroring the bulk approve guard.

**Test:** `tests/integration/reject-status-guard.test.ts` (NEW, 8 tests)
— logic-mirror of both reject paths, verifying every non-pending status
(scheduled, posted, failed) is left alone, plus the empty-id-set no-op
short-circuit.

## Bugs found — for Hermes to dispatch

These were identified by the audit but **not** fixed in this commit.
Each needs either a design call (rejection semantics) or wider
blast-radius analysis (calendar key churn) before touching code.

### BUG-DEV-002 (HIGH): array index used as React key on calendar grids

**Files:**
- `components/MainContent.tsx:2995` — week header day cells
- `components/MainContent.tsx:3027` — week calendar cells
- `components/MainContent.tsx:3246` — month calendar cells
- `components/MainContent.tsx:1910` — PREDEFINED_PROMPTS options

**Symptom:** when navigating between weeks/months, React reconciles by
index, so cell-local state (selection, drag-over highlight, popover
open) leaks across navigations. A user selects 6pm Monday, swipes to
next week, sees 6pm Monday still highlighted on the new week.

**Fix shape:** replace `key={i}` with `key={toYMD(d)}` for day cells,
`key={cellKey}` for hour cells (already constructed at line 3020 as
`${dateStr}:${hour}`), `key={p}` or hash for predefined prompts.

**Why deferred:** 4 sites, calendar surface is not covered by any test,
risk of subtly breaking drag-drop/click handlers if a key collision
exists. Routine fix, but propose first.

### BUG-DEV-003 (MEDIUM): rejection orphans pipelinePending images

**File:** `components/MashupContext.tsx:207-249`

**Symptom:** when a user rejects a pipeline-generated post, the
underlying `GeneratedImage` still has `pipelinePending: true`. Gallery
filters those out, so the image is invisible — but it's also not
deletable (no UI surface for "rejected, hidden" images), and never
gets a watermark (which only happens via `finalizePipelineImagesForPosts`
on approve). Result: the image is in IDB forever, occupying quota,
unseeable, unusable.

**Fix shapes (need design call):**
- (A) Reject also deletes the underlying image. Cleanest, matches
  "never want this" intent. Risk: if the same image is referenced by
  multiple scheduled posts, deleting it would orphan the others.
- (B) Reject calls `finalizePipelineImagesForPosts(rejectedPosts)` so
  the image lands in Gallery (watermarked) and the user can delete it
  manually. Less destructive, but adds a watermark to an image the
  user already said they don't want.
- (C) New surface: a "Rejected" panel where users can review and
  delete previously rejected items. Most flexible, most work.

**Why deferred:** this is a UX/design call, not a code call.

### BUG-DEV-004 (LOW): silent watermark Promise rejection

**File:** `components/MashupContext.tsx:177-187`

The fire-and-forget `void Promise.all(targets.map(...))` in
`finalizePipelineImagesForPosts` swallows any watermark failure with
no logging. If the watermark service breaks, batch approvals silently
ship un-watermarked images with no signal to the developer or user.

**Fix shape:** add `.catch(err => console.warn('watermark failed for', img.id, err))`
to each promise, or wrap the `Promise.all` in `.catch(...)`.

**Why deferred:** trivial, but adjacent to ongoing watermark/approval
work — bundle with the next watermark-touching task to avoid a
one-line commit.

## Surfaces audited — clean

The following surfaces were inspected and found free of static-analysis
bugs in the v0.5.1 baseline. (This is NOT a substitute for runtime
testing — see prerequisite caveat — but it does mean no obvious code
smell flagged.)

| Surface | File | Notes |
|---|---|---|
| `lib/smartScheduler.ts` rejection skip | lines 277, 297 | Both `buildPerDayPlatformCounts` and `buildPerDayCounts` skip 'rejected'. No regression from BUG-CRIT-002. |
| `hooks/useImages.ts` flush gate | line 68 (effect dep `[isImagesLoaded]`) | Listener registers AFTER load completes. Ref updates synchronously every render. No race. |
| `hooks/useSettings.ts` flush gate | line 50 | Same pattern, correctly implemented. |
| `lib/pipeline-finalize.ts` | `collectFinalizeTargets`, `finalizePipelineImage` | Filters by `pipelinePending === true`. Clears flag on success. |
| Carousel + single-image badge derivation | `components/MainContent.tsx:3546-3556` and `:3814-3824` | Both branches use identical priority chain (postedAt → postError → schedule status). No off-by-one. |
| `components/GalleryCard.tsx` delete confirmation | full file | `event.stopPropagation()` correctly applied. Z-index bump consistent. |
| `components/pipeline/ApprovalQueue.tsx` caption editing | inline updater | Functional setState, no race against auto-poster. |
| Error boundaries on `postImageNow` / `postCarouselNow` | `MainContent.tsx:451-1524` | All `throw new Error` paths caught and surfaced via toast. |
| `latestScheduleFor()` null safety | `MainContent.tsx:554-560` | Returns `undefined`; all callers use `?:` ternary defensively. |

## What I could not audit

- **Runtime state during real interaction.** Without the V050-008 dev
  logger (and without me being able to drive the UI), I can't observe
  things like: stuck loading states, double-click double-submission,
  retry storms after a network blip, focus traps, keyboard nav, ARIA
  correctness, animation jank, mobile/Tauri-specific layout.
- **Visual regressions.** Z-index, spacing, color contrast, dark-mode
  rendering — none of this is testable from code review.
- **Cross-platform correctness.** Tauri webview (WebView2 on Windows,
  WKWebView on Mac, WebKitGTK on Linux) sometimes diverges from the
  Chrome/Firefox dev environment.
- **API integration health.** Leonardo, pi.dev, Instagram, Discord,
  Twitter, Pinterest — every external integration. Static analysis
  catches the call shape; only runtime confirms the contract.

These gaps are the reason V050-008 needs to ship before V050-009 can
honestly claim "every tab, every flow, every button tested."

## Acceptance criteria

| Criterion | Status |
|---|---|
| Every tab tested and logged | ✗ — no UI driver, no V050-008 dev logger. Static-analysis pass done instead. |
| Every flow tested end-to-end | ✗ — same. The 427-test suite covers the unit/integration layer; UI flows aren't covered. |
| Every button tested | ✗ — same. |
| All bugs reported with reproduction steps | ✓ — 4 bugs reported (1 fixed, 3 dispatched). |
| Fix tasks created and dispatched | ✓ — BUG-DEV-001 fixed in this commit; BUG-DEV-002/003/004 documented for Hermes. |
| Write inbox | ✓ (envelope below) |

## Files touched (this task)

### Production
- `components/MashupContext.tsx`:
  - Added status guard (`&& p.status === 'pending_approval'`) to
    `rejectScheduledPost` (lines ~207-216).
  - Same guard added to `bulkRejectScheduledPosts` (lines ~238-249).
  - Inline docblocks pinning the BUG-DEV-001 contract on both.

### Tests
- `tests/integration/reject-status-guard.test.ts` (NEW, 8 tests):
  - Singular reject (5 tests): rejects pending_approval; leaves
    scheduled/posted/failed alone; ignores unmatched ids.
  - Bulk reject (3 tests): mixed-status set only flips
    pending_approval; empty-id-set no-op short-circuit; untargeted
    pending posts left alone.

### Docs
- `docs/bmad/qa/V050-009-status-check.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/reject-status-guard.test.ts` —
  8/8 pass in isolation.
- `npx vitest run` — full suite green via pre-commit hook.

## Hermes inbox envelope

```
{"from":"developer","task":"V050-009","status":"done","summary":"Prerequisite gap: V050-008 (dev logger) not in tree, no E2E harness — literal 'test every tab/flow/button' brief cannot be satisfied by a CLI agent. Delivered: static-analysis bug hunt of every v0.5.1-touched surface + automated test suite + dev server boot. Found 4 bugs: BUG-DEV-001 (CRITICAL: reject paths missed status guard, fixed in this commit with 8-test regression suite); BUG-DEV-002 (HIGH: 4× key={i} on calendar grids — propose); BUG-DEV-003 (MEDIUM: rejection orphans pipelinePending images — design call needed); BUG-DEV-004 (LOW: silent watermark failure logging). tsc clean, 435/435 pass."}
```
