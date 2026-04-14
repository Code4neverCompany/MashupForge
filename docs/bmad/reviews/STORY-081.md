# STORY-081 Review — Test pi.dev in desktop context

**Status:** HANDOFF PREPARED — blocked on Maurice manual test pass
**Agent:** Developer (handoff + one supporting fix; Maurice owns execution)
**Date:** 2026-04-15
**Classification:** routine (manual test by Maurice — per queue)
**Depends on:**
- STORY-070 (portable build fix) — ✅ shipped `d52f56c`
- STORY-080 (.msi observability + hardening) — ✅ shipped `75f76bb`, CI still in flight

---

## Why this is a handoff, not an execution

Per the queue, STORY-081 is `routine (manual test by Maurice)`.
I cannot exercise pi.dev runtime install on Windows from WSL —
`/api/pi/install` spawns `npm` with a Windows `--prefix`, hits
real disk paths under `%APPDATA%`, and produces a `pi.cmd` shim
that only a Windows shell can run. This review captures the test
plan Maurice will follow and the one supporting fix I landed to
make the test actually useful.

## Supporting fix — portable launcher now sets MASHUPFORGE_PI_DIR

While prepping this handoff I found a real gap in the portable
build:

- **`lib/pi-setup.ts:97`** — `getLocalPrefix()` reads
  `process.env.MASHUPFORGE_PI_DIR`; if unset, it falls back to
  `os.tmpdir() / "mashupforge-pi-install"`, which on Windows
  resolves to `%TEMP%\mashupforge-pi-install`.
- **`scripts/build-portable.sh` (pre-fix)** — the emitted
  `start.bat` did not set `MASHUPFORGE_PI_DIR`.
- **`src-tauri/src/lib.rs:209`** — the Tauri `.msi` Rust launcher
  explicitly sets `MASHUPFORGE_PI_DIR` to
  `app_data_dir() / "pi"`, i.e.
  `%APPDATA%\com.4nevercompany.mashupforge\pi`.

Net effect: a portable user would install pi once, Windows
Disk Cleanup (or storage sense) would wipe `%TEMP%`, and the
next portable launch would show "Install pi" in Settings as if
nothing had happened. Different bug class from STORY-070's
crash — it's a silent UX degradation, not a failure — but
would have made STORY-081 flaky.

**Fix:** `start.bat` now sets
```bat
set "MASHUPFORGE_PI_DIR=%APPDATA%\MashupForge\pi"
set MASHUPFORGE_DESKTOP=1
```
before spawning node. `%APPDATA%\MashupForge\` is the same root
the Tauri desktop wrapper already uses for `config.json`, so the
portable build now has a single "MashupForge user data" folder.
Note that this differs from the `.msi`'s
`%APPDATA%\com.4nevercompany.mashupforge\pi` — those are two
distinct install roots on purpose, so the two distribution
channels can't corrupt each other's state.

Both `build-portable.sh` and `build-portable.ps1` updated.

## Test plan (Maurice owns execution)

This has to be run against BOTH distribution channels to clear
the story, because pi.dev's install path differs between them:

| Channel    | pi install dir                                           |
|------------|----------------------------------------------------------|
| Portable   | `%APPDATA%\MashupForge\pi`                               |
| .msi       | `%APPDATA%\com.4nevercompany.mashupforge\pi`             |

### Prerequisites

- Portable: `dist/portable/MashupForge-portable.tar.gz` or `.zip`
  from the fresh build. (Rebuild: `bash scripts/build-portable.sh`.)
- .msi: `mashupforge-windows-msi` artifact from the CI run that
  was auto-triggered by STORY-080's push (`75f76bb`). Give it
  ~22 min from the push timestamp.
- `%APPDATA%\MashupForge\config.json` with a ZAI API key, so the
  chat test has something to call. Schema reminder:
  ```json
  {
    "ZAI_API_KEY": "...",
    "LEONARDO_API_KEY": "..."
  }
  ```

### Test 1 — Portable pi install

1. Extract the portable archive anywhere (e.g. `C:\Temp\MashupForge\`).
2. Double-click `start.bat`.
3. Wait for "Server ready." and the browser to open
   `http://127.0.0.1:3001`.
4. In the app, click the Settings/gear icon.
5. In the Settings panel, find the pi.dev section. Click
   **"Install pi"** (or equivalent — the button copy lives in
   STORY-032's desktop Settings panel).
6. **Expect:**
   - No Windows Defender Firewall prompt (STORY-041 pin)
   - Installation progress appears in the UI
   - On success, `%APPDATA%\MashupForge\pi\pi.cmd` exists
   - The "Install" button changes to "Start pi" (or similar
     authenticated-state affordance)
7. If install fails:
   - Copy the error text the UI shows (STORY-031 humanized it)
   - Open `logs\server.log` in the portable folder — every
     `console.log` from `[pi-install]` goes there (STORY-070
     piped stdio)
   - Paste both into the failure report (see below)

### Test 2 — Portable pi start + chat

1. After Test 1's install succeeds, click **"Start pi"** in
   Settings (or the equivalent).
2. **Expect:** pi.cmd spawns; stdout/stderr appears in the UI
   stream; pi reports ready.
3. Type a test prompt in the app's chat surface.
4. **Expect:** a response from pi.dev within a few seconds
   (depends on ZAI endpoint latency).
5. If chat fails, the error typically points at:
   - Missing `ZAI_API_KEY` in config.json → add it, reload
   - pi.cmd quoted-argv issue on paths with spaces → this was
     STORY-030's fix; confirm it holds
   - Defender quarantined `pi.cmd` → check
     `%APPDATA%\MashupForge\pi\` still has `pi.cmd` present

### Test 3 — Portable second launch uses cached pi

1. Close the portable app (Ctrl+C in the console, or close the
   window).
2. Re-run `start.bat`.
3. Open Settings.
4. **Expect:** pi is already marked installed (no "Install"
   button). Click "Start pi" — should work immediately.
5. If this fails but Test 1 passed: the persistence fix is
   broken. Check whether
   `%APPDATA%\MashupForge\pi\pi.cmd` still exists between runs.

### Test 4 — .msi pi install

1. **Prerequisite:** STORY-080's new `.msi` must boot. If it
   still crashes, triage STORY-080 first via
   `startup.log` + `sidecar.log`.
2. Uninstall any previous MashupForge .msi build.
3. Install the new `.msi`.
4. Launch from the Start menu.
5. In Settings, click **"Install pi"**.
6. **Expect:**
   - Installation progress
   - On success,
     `%APPDATA%\com.4nevercompany.mashupforge\pi\pi.cmd` exists
     (NOTE: different path from portable — uses Tauri bundle id)
   - STORY-030 quoted-argv fix still holds
7. If install fails, the error output now lives in
   `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log`
   (STORY-080 piped sidecar stdio there). Capture the tail.

### Test 5 — .msi pi start + chat

Same as Test 2, but against the `.msi` install. Proves pi
works end-to-end in the Tauri sidecar context.

### Test 6 — .msi second launch uses cached pi

Same as Test 3, but against the `.msi` install. Proves
`getPiPath()` in `lib/pi-setup.ts:145` correctly resolves
the cached `pi.cmd` in the bundle-id appdata path.

## What each test proves

| Test | Proves                               | Covers fix from        |
|------|--------------------------------------|------------------------|
| 1    | Portable runtime install works       | STORY-070 + this story |
| 2    | Portable pi spawn + chat path        | STORY-030, STORY-032   |
| 3    | Portable pi persistence across runs  | This story's pi_dir fix|
| 4    | .msi runtime install works           | STORY-080 + STORY-030  |
| 5    | .msi pi spawn + chat path            | STORY-080, STORY-032   |
| 6    | .msi pi persistence across runs      | STORY-032, getPiPath() |

## Username-with-space regression coverage

Identical to STORY-061's note: if Maurice's Windows account name
has a space in it (e.g. `C:\Users\First Last\`), any of Tests 1
or 4 exercising `installPi()` is the first real proof
STORY-030's `quoteWinArg()` fix holds under a spaced `--prefix`.
Record the state of his account name in the pass/fail report so
we know which way the test ran.

## Failure reporting

If any test fails, append a failure section to this artifact
with:

1. **Test number** (1 / 2 / 3 / 4 / 5 / 6)
2. **Channel** (portable / .msi)
3. **UI error** — screenshot ideal, text acceptable
4. **Relevant log tail** — which log depends on the channel:
   - Portable: `logs\server.log` from the extracted folder
   - .msi: `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log`
     and `startup.log`
5. **`POST /api/pi/install` response body** if install failed —
   the `diagnostics` field has the humanized Windows error
   (STORY-031) with actionable guidance

Then re-dispatch the developer autoloop with a pointer to the
failure artifact.

## Exit criteria

All six tests green on a real Windows host → STORY-081 marked
`[x]`, pi.dev is considered production-ready in both desktop
channels, and the Windows Phase 1 user acceptance group can run
it.

Any test failing → file the failure report, classify the bug,
loop through the Developer autoloop until fixed.

## Handoff

- STORY-081 marked `[~]` in the queue with "blocked on Maurice
  manual test pass"
- Supporting fix (portable `MASHUPFORGE_PI_DIR`) landed in the
  same commit as this review artifact
- No CI change, no new dependencies, no code touches on the
  `.msi` path
- Going idle. Next developer-side work is triage of any failure
  Maurice reports OR STORY-080 follow-up once its `startup.log`
  arrives.
