# QA Review — STORY-004

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-14
**Commit:** e63983b (HEAD at review: 1e70c9a)

---

## Scope

STORY-004 is a human-run test pass on a real Windows host. Developer delivered
a pre-flight validation from WSL (static audit). This gate covers:
1. Quality of Developer's static pre-flight artifact
2. Blocking issues that will prevent the manual pass from succeeding

---

## Findings

### Pre-flight artifact quality
- [INFO] Developer's pre-flight review (`docs/bmad/reviews/STORY-004.md`) is thorough. All 7 sub-systems audited with code references and line numbers.
- [INFO] Acceptance criteria table is exhaustive — 9 criteria, each with code evidence and file:line pointers. Spot-checked `pick_free_port()` (lib.rs:16-20), `wait_for_port` (lib.rs:23-35), `CloseRequested` handler (lib.rs:165-177). All confirmed present in HEAD.
- [INFO] Architecture drift between STORY-003 spec (bake-pi) and current code (runtime-install) is correctly flagged. The `build-windows.ps1:82` skip comment and e63983b commit are the authoritative record.
- [INFO] Manual test checklist is well-formed and maps 1:1 to acceptance criteria.

### Blocking bugs from pi-autosetup review (see `docs/bmad/qa/pi-autosetup-review.md`)

- [CRITICAL] **WIN-1 — `localPrefix` with spaces breaks `npm install`.**
  `lib/pi-setup.ts` uses `shell: true` on Windows, which passes args to
  `cmd.exe` without quoting. Any Windows user with a space in their username
  (e.g., `C:\Users\John Doe\AppData\...`) will see `npm install` fail with a
  confusing "invalid package name" error on first pi launch. This blocks Test 5
  and Test 6 of the manual checklist for the majority of Windows users.
  **Status: unfixed as of HEAD 1e70c9a.**

- [CRITICAL] **RACE-1 — No install lock; concurrent `npm install` calls corrupt the pi prefix.**
  Two `POST /api/pi/install` requests (hot reload, second window) both see
  `getPiPath() === null` and launch simultaneous npm installs into the same
  `MASHUPFORGE_PI_DIR`. npm does not tolerate concurrent writers to the same
  prefix. Can produce a corrupt install that passes `piPath` existence checks
  but crashes on invocation.
  **Status: unfixed as of HEAD 1e70c9a.**

### Non-blocking observations
- [WARNING] **SEC-1** — `piPath` interpolated raw into shell strings (`setup/route.ts:61, 75`). Medium severity. Mitigated in Tauri deployment by `MASHUPFORGE_PI_DIR` always being set, but pattern is wrong.
- [WARNING] **SEC-2** — Dead `PI_BIN` candidate in `piCandidates()` (`lib/pi-setup.ts:74`). Any env with `PI_BIN` set will bypass the runtime-install resolver.
- [INFO] **RACE-2** — `getPiModels()` blocks event loop for up to 10s on every `/api/pi/status` request during install. Indirectly degrades the install experience.
- [INFO] STORY-003 spec requires rewrite to reflect runtime-install architecture. Not a STORY-004 blocker but should not be deferred past the next backlog grooming.
- [INFO] Manual E2E test (Tests 1–6) is pending Maurice on a real Windows host. Gate cannot be cleared until those tests run.

---

## Gate Decision

CONCERNS — Pre-flight static validation is high quality and all Phase 1 acceptance
criteria have plausible code paths. However, two HIGH-severity bugs from the
pi-autosetup review (WIN-1: spaces-in-path, RACE-1: no install lock) are unresolved
in HEAD and will cause the manual Windows test to fail for most users. These must be
fixed before Maurice runs the manual pass. STORY-004 cannot be marked DONE until:

1. WIN-1 fixed in `lib/pi-setup.ts`
2. RACE-1 fixed in `app/api/pi/install/route.ts`
3. Manual tests 1–6 passing on a real Windows host
