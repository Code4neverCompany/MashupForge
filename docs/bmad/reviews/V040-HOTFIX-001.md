---
id: V040-HOTFIX-001
title: V040-HOTFIX-001 — Restore legacy Instagram auto-approve + add migration shim
status: done
date: 2026-04-18
classification: routine
supersedes_default_in: V040-008
---

# V040-HOTFIX-001 — Fix the v0.4.0 Instagram default break

## What was wrong

V040-008 shipped with `DEFAULT_AUTO_APPROVE.instagram = false`. The
review doc framed that as a safety improvement: Instagram's Graph API
is the most failure-prone integration, so silent auto-posting there
is the most common foot-gun.

That reasoning is sound for **new** users. For **existing** 0.3.x
users, it was a silent behavior break: their saved settings have
no `pipelineAutoApprove` field at all, so on first post-upgrade load
the code resolved Instagram → `false` and IG posts started landing in
the approval queue with zero in-app explanation. The pre-release
debrief flagged this as the highest-priority fix before the v0.4.0
release reached users.

## What changed

### `lib/pipeline-daemon-utils.ts`

Two edits:

1. **Flipped `DEFAULT_AUTO_APPROVE.instagram` from `false` to `true`.**
   All four platforms now default to auto-approval. The JSDoc was
   rewritten to spell out the hotfix reasoning so a future reader
   doesn't re-flip it without context.

2. **Added `applyV040AutoApproveMigration(settings)`.** A pure,
   idempotent helper that writes an explicit
   `{ instagram: true, pinterest: true, twitter: true, discord: true }`
   into `pipelineAutoApprove` when the field is absent. Behavior:
   - If `pipelineAutoApprove` is `undefined` → returns a new object
     with the explicit map written
   - If `pipelineAutoApprove` is *anything else* (including `{}`) →
     returns the input reference unchanged (referential equality
     preserved so React skips re-renders)
   - Generic over `T extends { pipelineAutoApprove?: AutoApproveMap }`
     so it works on the partial-payload types used during settings
     load without a forced cast

### `hooks/useSettings.ts`

Wired the migration shim into the load path. Three call sites:
- localStorage → IDB migration branch (line ~62)
- IDB load branch (line ~67)
- Fresh-install fallback (no saved settings) — the shim runs against
  `defaultSettings` so even brand-new users see the explicit map in
  the PipelinePanel checkbox grid from first launch, instead of
  waiting for their first toggle to materialize the field

The shim runs *after* `mergeSettings` so it sees the fully-merged
settings object, not the raw payload.

It is **not** wired into `updateSettings` (the runtime patch path) —
that path is only triggered by user actions, by which point the
field has already been persisted by the load-time shim.

### `components/PipelinePanel.tsx`

Updated the footer text under the auto-approve toggle grid. The old
text said "Instagram defaults to manual" which is now actively wrong.
Replaced with: "All platforms default to auto — toggle off the ones
you want to review by hand." Same one-line slot.

### `tests/lib/pipeline-daemon-utils.test.ts`

Rewrote the V040-008 test file:
- Updated the `isPlatformAutoApproved` defaults assertions for the
  new uniform-true map
- Updated the `resolvePipelinePostStatus` carousel test (it used to
  rely on Instagram's manual default to assert the strict-gating
  rule; now it uses an explicit `{ instagram: false }` override)
- Added a new `applyV040AutoApproveMigration` test block covering:
  absent field → explicit map; already-set field → no-op (referential
  equality); empty-object → no-op; unrelated fields preserved

Net: 14 tests in this file (was 9). Total suite: 278 (was 273).

## Why "do both" instead of just flipping the default

Flipping the default alone solves the legacy break. But the migration
shim has independent value:

- **Visibility.** Without the shim, the `pipelineAutoApprove` field
  stays `undefined` for legacy users. The PipelinePanel checkboxes
  render correctly (because they bind to `isPlatformAutoApproved`,
  which resolves the default), but the user has no concrete record of
  their settings. Future default changes would silently shift them
  again.
- **Anchoring.** With the shim, every user — legacy and new — has an
  explicit map persisted. If the team ever decides to change a default
  again (say, flipping Instagram back to manual after adding better
  failure UX), only users who have *never* opened the settings would
  be affected, not the entire 0.3.x cohort.
- **Settings UI honesty.** The checkbox grid will accurately reflect
  the user's persisted state, which is also what gets sent to the
  pipeline. No dual source of truth.

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Instagram defaults to auto (preserves legacy behavior) | ✅ `DEFAULT_AUTO_APPROVE.instagram = true` |
| Migration shim on first load | ✅ `applyV040AutoApproveMigration` runs in `useSettings` load path; idempotent so safe across all three load branches |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Telemetry on whether the migration actually ran for a user.** No
  event log here; the shim's behavior is observable via the persisted
  settings state itself.
- **Reverting the strict multi-platform gating rule.** V040-008's
  any-manual-platform → whole-post-manual rule is unaffected. Once a
  user *does* opt in to manual Instagram, the gating still applies.
- **Settings UI banner explaining the change.** A user who *had* set
  custom approval gating would not have done so on 0.3.x (the field
  didn't exist), so there's no prior user choice to reconcile. The
  hotfix's silent restoration of legacy behavior is itself the
  correct UX.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 26 files / 278 tests passing (was 26 / 273 — net
  +5 from the new migration test block)

## Follow-ups not addressed (still loose ends from V040 debrief)

This hotfix only fixes the highest-priority item from the debrief.
Remaining items still open:
- V040-009 aspect-tab labels still render `in/pi/tw/di` (slice(0,2))
- HealthMiniRail dead code in V040-007 still ships unmounted
- Aspect preview still skips carousel cards
- Per-row approve/reject paths still lack undo coverage
- No browser/visual testing was done for the v0.4.0 UI changes
- Studio empty state untouched

A V040-HOTFIX-002 covering the aspect-tab label fix is the natural
next quick-win.

## Files touched

- `lib/pipeline-daemon-utils.ts` (default flip + migration shim, ~35 new lines)
- `hooks/useSettings.ts` (+1 import, 3 call-site wraps)
- `components/PipelinePanel.tsx` (1-line footer text update)
- `tests/lib/pipeline-daemon-utils.test.ts` (rewrote — 9 → 14 tests)
- `docs/bmad/reviews/V040-HOTFIX-001.md` (this file)
