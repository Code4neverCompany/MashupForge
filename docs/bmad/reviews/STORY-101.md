# STORY-101 Review — Test pi.dev in desktop context (.msi + portable)

**Status:** HANDOFF PREPARED — blocked on Maurice manual test pass
**Agent:** Developer (pointer artifact; Maurice owns execution)
**Date:** 2026-04-15
**Classification:** routine (manual test by Maurice)
**Depends on:** STORY-100 (.msi boots clean)

## Relationship to STORY-081

STORY-101 is functionally identical to STORY-081: both verify pi.dev
install / start / cached-on-second-launch in both distribution
channels. STORY-081's checklist already exists and is current.

Reusing it rather than re-authoring. Consider STORY-101 the
**execution gate** for the STORY-081 plan against the new CI `.msi`.

## What Maurice runs

Follow **all six tests** in `docs/bmad/reviews/STORY-081.md`:

| Test | Channel  | Proves                               |
|------|----------|--------------------------------------|
| 1    | Portable | Runtime pi install works             |
| 2    | Portable | pi spawn + chat path                 |
| 3    | Portable | pi persistence across runs           |
| 4    | .msi     | Runtime pi install works             |
| 5    | .msi     | pi spawn + chat path                 |
| 6    | .msi     | pi persistence across runs           |

Distinct install roots (by design, so the two channels can't
corrupt each other's state):

- Portable: `%APPDATA%\MashupForge\pi\`
- .msi:     `%APPDATA%\com.4nevercompany.mashupforge\pi\`

## Minimum bar to mark STORY-101 `[x]`

All six tests green, or Tests 4-6 green if the portable channel
is skipped for this cycle (the portable half already rode along
with STORY-070's smoke test on Linux).

## Failure reporting

Same as STORY-081: append a failure section to either this artifact
or STORY-081 with test number, channel, UI error, and the relevant
log tail. New-this-cycle log paths:

- Portable: `logs\server.log` in the extracted folder
- .msi: `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log`
  plus `startup.log` (STORY-080)

`POST /api/pi/install` response body now includes the humanized
Windows error from STORY-031 (EACCES / ENOENT / ENOSPC / etc.
mapped to actionable guidance).

## Coverage improvements landed since STORY-081 was written

- **STORY-090** (commit e36cec4): Leonardo v2 error-shape extraction
  — unrelated to pi.dev but means any Leonardo failure during the
  STORY-081 Test 2/5 chat round-trip now shows a real message,
  not `[object Object]`.
- **STORY-093** (commit b60b55f): `pi/status` and `pi/models` routes
  now have top-level try/catch. Previously a filesystem error inside
  `piStatusSnapshot()` or a spawn error inside `getPiModels()` would
  return HTML 500 and break the Settings panel's JSON parse, leaving
  the pi state indicator stuck. If Maurice's test 3 or 6 ever showed
  a "ghost" install (pi.cmd present but UI shows "Install") this
  was the likely cause; that path is now defensive.

Neither of those changes is expected to flip a failing test to
passing, but they will make failures diagnose faster.

## Handoff

- STORY-101 marked `[~]` in the queue
- No code changes this story
- Going idle. Next developer-side work is triage of any failure
  Maurice reports.
