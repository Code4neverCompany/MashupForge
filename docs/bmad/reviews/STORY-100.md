# STORY-100 Review — Verify .msi installs without crash

**Status:** HANDOFF PREPARED — blocked on Maurice manual test pass
**Agent:** Developer (pointer artifact; Maurice owns execution)
**Date:** 2026-04-15
**Classification:** routine (manual test by Maurice)

## Why this is a pointer, not a new checklist

STORY-100 overlaps three stories already carrying full test plans.
Re-authoring a fourth checklist would duplicate content and let
versions drift. This artifact points at the existing plans and
captures what's new: the CI build Maurice just received.

## What Maurice has in front of him

- Fresh `.msi` artifact from the CI run triggered by commit `75f76bb`
  (STORY-080 observability + hardening). Shipped to Desktop.
- Contains the full Phase 1 Windows fix batch, newest last:
  - STORY-030: Windows path handling (quoteWinArg)
  - STORY-031: humanized Windows errors
  - STORY-041: loopback HOSTNAME pin (no Defender prompt)
  - STORY-080: file logs, panic hook, native MessageBox, sidecar
    stdio capture, pre-flight checks, 60s port wait
- `.msi` install root: `%APPDATA%\com.4nevercompany.mashupforge\`

## Test plan — reuse the existing checklists

| Goal                               | Checklist to follow                          |
|------------------------------------|----------------------------------------------|
| Basic install + launch             | docs/bmad/reviews/STORY-061.md (Tests 1-2.5) |
| .msi pi.dev install / start / cache| docs/bmad/reviews/STORY-081.md (Tests 4-6)   |
| Full Phase 1 acceptance matrix     | docs/bmad/reviews/STORY-004.md (Tests 1-6)   |

Minimum bar to mark STORY-100 `[x]`:

1. Uninstall any previous MashupForge .msi build
2. Run the new installer — finishes without error
3. Launch from Start menu
4. Window opens to the MashupForge UI (not a loading-stub freeze)
5. No Windows Defender Firewall prompt (STORY-041)
6. No MessageBox error dialog (STORY-080 — would fire on any
   preflight failure in the Rust launcher)

If any of those fail, the diagnostic artifacts are now present:

| File                                                              | What it tells you                                    |
|-------------------------------------------------------------------|------------------------------------------------------|
| `%APPDATA%\com.4nevercompany.mashupforge\logs\startup.log`        | Synchronous breadcrumbs from Rust launcher setup     |
| `%APPDATA%\com.4nevercompany.mashupforge\logs\tauri.log`          | tauri-plugin-log structured output                   |
| `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log`        | Next.js sidecar stdout + stderr (piped from Stdio)   |
| Any native MessageBoxW dialog                                     | Setup-phase failure with specific error text         |

Failure reporting: append the three log tails + screenshot of any
MessageBoxW to this artifact, then re-dispatch developer autoloop.

## Known unknowns

This is the **first** `.msi` test with the new observability layer.
Three scenarios:

1. **Boots clean** → STORY-100 `[x]`, move to STORY-101 (pi.dev)
2. **Crashes with MessageBox** → instant diagnosis from dialog text;
   file a failure report with the message and whichever log named
   the failing step
3. **Silent crash with no dialog** → would indicate the panic hook
   itself fired *before* log_dir resolved, which is an edge case
   worth a new story; capture whatever Windows Event Viewer has

Scenario 1 is the target. Scenarios 2/3 mean STORY-080 did its
job — the next cycle is diagnosis, not guessing.

## Handoff

- STORY-100 marked `[~]` in the queue
- No code changes this story — observability was front-loaded into
  STORY-080
- Going idle. Next developer-side work is triage of any failure
  Maurice reports OR STORY-101 follow-up once STORY-100 passes.
