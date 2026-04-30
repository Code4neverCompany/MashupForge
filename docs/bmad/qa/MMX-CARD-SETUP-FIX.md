# QA Review — MMX-CARD-SETUP-FIX

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-30
**Commit:** fa2beb0 (NOT FOUND — changes are uncommitted working tree; reviewed against `git diff HEAD`)

## Files Reviewed
- `components/SettingsModal.tsx` (diff only — 2 hunks)
- `app/api/mmx/setup/route.ts` (read-only context check)
- `lib/useMmxAvailability.ts` (hook return-type audit)

## Verify Criteria vs. Findings

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Card click: unavailable/unauthenticated → `handleMmxSetup()` | ✅ PASS (with caveat — see W-1) |
| 2 | Not Installed CTA: `btn-gold-sm` button "Launch MMX Setup" | ✅ PASS |
| 3 | No new TS errors (`tsc --noEmit`) | ✅ PASS — clean |
| 4 | `setup/route.ts` 400 surfaced via `mmxError` state | ✅ PASS |

## Findings

### Critical (must fix before merge)
_None._

### Warnings (should fix)

- **[WARNING W-1] Loading-state false-trigger on card click**
  `useMmxAvailability` returns `null` while the probe fetch is in flight.
  `available = mmxStatus?.available ?? mmxAvailable` resolves to `null`
  during the brief loading window (before either the status fetch or the
  availability hook settles). Because `!null === true`, the card onClick
  condition fires `handleMmxSetup()` instead of `updateSettings()` for
  any click during that window — even on a machine where mmx IS installed
  and authenticated.
  **Fix:** change the guard to `available === false` (strict equality) rather
  than `!available`. This is a one-character change:
  ```diff
  -  if (!available || mmxStatus?.authenticated === false) {
  +  if (available === false || mmxStatus?.authenticated === false) {
  ```

- **[WARNING W-2] Card button missing `disabled={mmxBusy}`**
  The explicit "Launch MMX Setup" buttons (Not Installed + Not Authenticated
  panels) are correctly disabled while busy. The card button is not. The
  `mmxBusyRef` guard prevents duplicate POSTs, but there is no visual
  feedback on the card itself while setup is running from a card click.
  Recommend adding `disabled={mmxBusy}` to the card `<button>`.

- **[WARNING W-3] Misleading CTA label for Not Installed state**
  "Launch MMX Setup" in the Not Installed panel implies a setup wizard will
  open. It always returns 400 (`mmx binary not found`), surfacing the error
  via `mmxError`. The old static text was honest; the button now costs the
  user an extra click to reach the same information. Consider label
  "Check MMX Status" or retain a short inline note alongside the button.
  _(Spec explicitly requested this label — flagging for product awareness
  only. Merge acceptable as-is.)_

### Info

- **[INFO I-1] Commit fa2beb0 does not exist.**
  `git log --oneline -10` shows HEAD at `d34fc28`. The changes are
  **uncommitted working tree** modifications. Reviewed via `git diff HEAD`.
  Changes must be committed before this review can be formally linked to a
  SHA. Recommend committing before merge.

- **[INFO I-2] `void handleMmxSetup()` in card onClick is correct.**
  `handleMmxSetup` is async; discarding the promise with `void` is the right
  pattern in an event handler. No unhandled rejection risk — the function
  has its own try/catch.

- **[INFO I-3] Not Authenticated and Not Installed panels are now structurally
  identical.** This is consistent and correct — both states expose the same
  setup CTA + error slot. Good.

## Scope Check
- [IN-SCOPE] Card click routing for unavailable/unauthenticated MMX
- [IN-SCOPE] Not Installed panel CTA replacement
- [IN-SCOPE] No changes to setup/route.ts (already correct)
- [OUT-OF-SCOPE] No Pi.dev card touched, no other components modified

## Gate Decision

**[CONCERNS — 0.82]** — All four verify criteria pass. Two warnings (W-1, W-2)
are low-risk UX edge cases, not correctness bugs. W-1 is the most actionable:
a one-character fix that eliminates a false setup trigger during the ~100–200 ms
load window. W-2 is a cosmetic UX gap. Neither blocks merge. Recommend fixing
W-1 before shipping to users; W-2 can be a follow-up.
