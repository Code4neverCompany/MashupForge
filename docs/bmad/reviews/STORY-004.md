# STORY-004 Review — Windows Build: Pre-flight Validation

**Story:** Human validation of full Windows flow (Phase 1 runtime-install)
**Agent assigned:** Maurice (requires Windows host)
**Developer role on this story:** pre-flight validation from WSL + prep the manual test checklist
**Status:** pre-flight PASS — ready for Maurice to run the manual pass
**Date:** 2026-04-14
**HEAD:** `e63983b feat(tauri): pi.dev runtime auto-install on first launch`

---

## Scope

STORY-004 is a human-run test pass on a real Windows host because
`tauri build --target x86_64-pc-windows-msvc` requires a Windows toolchain
and WebView2 — nothing I can automate from WSL. This artifact covers the
work I *can* do from dev:

1. Static audit of the full Windows build chain (scripts, Rust launcher,
   Tauri config, sidecar wrapper, pi runtime-install wiring).
2. Confirming each Phase 1 acceptance criterion has a plausible code path.
3. Flagging an architectural drift between the story spec and the code.
4. Handing Maurice a tight manual-test checklist keyed to the criteria.

This replaces the stale "Testing and validation" brief from
`stories-tauri-windows.md` (original spec was written before the Phase 1
runtime-install flip in `e63983b`).

---

## Pre-flight validation — PASS

### 1. Build orchestrator (`build-windows.ps1`)

- `[1/7]` Toolchain check: `node, npm, cargo, rustc, git` + Rust target
  `x86_64-pc-windows-msvc`. Matches prerequisites block at header.
- `[2/7]` `npm ci` — deterministic JS install.
- `[3/7]` `fetch-windows-node.ps1` — pins `v22.11.0 win-x64` from
  `nodejs.org/dist`, caches to `.cache/node`, extracts to
  `src-tauri/resources/node`, verifies `node.exe` landed. Idempotent
  (early-return if `node.exe` already present).
- `[4/7]` Explicitly skipped — pi bake is gone, replaced with runtime install
  (see drift note below). Comment on lines 73-83 documents the flip.
- `[5/7]` `npm run build` — needs `output: 'standalone'` and
  `outputFileTracingRoot` in `next.config.ts`. Confirmed present.
- `[6/7]` `copy-standalone-to-resources.ps1`:
  - Removes stale `src-tauri/resources/app/` before repopulating — no
    lingering files from prior builds.
  - Copies `.next/standalone/*` → `resources/app/`.
  - Copies `.next/static` → `resources/app/.next/static`.
  - Copies `public/` → `resources/app/public/`.
  - Drops `scripts/tauri-server-wrapper.js` in as `resources/app/start.js`.
  - Asserts `server.js` is present post-copy (matches Rust launcher's
    `require('./server.js')` path from `start.js`).
- `[7/7]` `npx tauri build` with optional `--debug`. Artifact probe under
  `src-tauri/target/<mode>/bundle/{msi,nsis}`.

**Status:** coherent. Each step has a clear precondition and postcondition.

### 2. Rust launcher (`src-tauri/src/lib.rs`)

Verified against all Phase 1 acceptance criteria:

| Criterion | Code | Evidence |
|---|---|---|
| Picks a free ephemeral 127.0.0.1 port | `pick_free_port()` | `lib.rs:16-20` (binds `127.0.0.1:0`, drops listener, returns port) |
| Resolves bundled node.exe | `node_binary_path()` + `cfg!(target_os="windows")` | `lib.rs:41-47` (resource_dir/node/node.exe) |
| Spawns sidecar with correct env | `Command::new(&node_bin).env(...)` | `lib.rs:103-112` — sets `PORT`, `HOSTNAME=127.0.0.1`, `MASHUPFORGE_RESOURCES_DIR`, `MASHUPFORGE_PI_DIR`, `MASHUPFORGE_DESKTOP=1` |
| Suppresses flashing console on Windows | `CREATE_NO_WINDOW` creation_flag | `lib.rs:115-120` |
| Creates pi install dir eagerly | `create_dir_all(&pi_install_dir)` | `lib.rs:73-81` — `%APPDATA%/MashupForge/pi` (user-writable, not inside Program Files) |
| Waits for sidecar to accept connections, up to 30s | `wait_for_port(port, Duration::from_secs(30))` | `lib.rs:23-35`, caller at `lib.rs:144` |
| Navigates window to local URL once up | `window.navigate(http://127.0.0.1:{port})` | `lib.rs:146-157` |
| Kills sidecar on window close | `WindowEvent::CloseRequested` → `child.kill()` | `lib.rs:165-177` |
| Background thread doesn't block setup | `thread::spawn(move || {...})` | `lib.rs:143-161` |

### 3. Tauri sidecar wrapper (`scripts/tauri-server-wrapper.js`)

- Loads `%APPDATA%\MashupForge\config.json` (Windows branch) or platform
  equivalents; hydrates every string entry into `process.env` before
  Next boots.
- Defaults `HOSTNAME=127.0.0.1` and `PORT=0` if unset (though the Rust
  launcher always passes them).
- `require('./server.js')` — sibling path works because the wrapper is
  installed as `resources/app/start.js` alongside the standalone
  `server.js`.
- Pure Node, no TS/Next imports — safe to run before Next is loaded.

### 4. Tauri config (`src-tauri/tauri.conf.json`)

- `frontendDist: "../src-tauri/frontend-stub"` — loads the local stub
  window at startup (the loading screen Maurice will see for ~1s before
  the Rust thread calls `navigate`).
- `app.windows[0].url: "index.html"` — matches
  `src-tauri/frontend-stub/index.html` (confirmed present).
- `bundle.targets: "all"` produces both MSI and NSIS installers.
- `bundle.resources: ["resources/**/*"]` pulls node, standalone app, and
  icons into the installer payload. No `resources/pi` glob needed since
  pi is runtime-installed now.
- JSON parses cleanly (`node -e "JSON.parse(...)"` → valid).

### 5. GitHub Actions workflow (`.github/workflows/tauri-windows.yml`)

- `runs-on: windows-latest`, `timeout-minutes: 45`, Node 22, Rust stable
  with `x86_64-pc-windows-msvc` target. All match the local script's
  toolchain expectations.
- **`permissions: contents: write` present on the `build` job (lines 32-33).**
  This resolves the QA-001 warning (`STORY-005` queue item). The
  `softprops/action-gh-release@v2` draft-release step on tag pushes
  will now succeed on restricted-token repos.
- Calls `.\build-windows.ps1 -SkipToolchainCheck` — single source of
  truth: Maurice's local flow and CI run the same script.
- Uploads MSI and NSIS as separate artifacts with `if-no-files-found: error`.
- YAML parses cleanly.
- **Minor (info, not a blocker):** the `bundled-node-v22.11.0-${{ runner.os }}`
  cache key is hardcoded. If `scripts/fetch-windows-node.ps1` bumps its
  pinned version without a YAML edit, the cache will silently drift. QA-001
  already flagged this. Next Node bump should be done as a 2-file change.

### 6. Pi runtime install (`lib/pi-setup.ts` + `app/api/pi/install/route.ts`)

- `getLocalPrefix()` reads `MASHUPFORGE_PI_DIR` (set by the Rust launcher)
  and falls back to `tmpdir()` for Vercel/serverless. Desktop path lands
  in `%APPDATA%\MashupForge\pi`.
- `getLocalBin()` returns `<prefix>/pi.cmd` on Windows (matches npm's
  Windows shim convention for `--prefix` installs, not `--global` PATH).
- `installPi()` spawns `npm.cmd install --prefix <localPrefix> --global
  @mariozechner/pi-coding-agent` with `shell: true` (required for `.cmd`
  resolution on Windows). Probes write access to both localPrefix and
  HOME before spawning — catches read-only-overlay weirdness.
- Install route POST is short-circuited by `getPiPath()` so a re-install
  is a no-op after first run.
- `getPiPath()` searches `[PI_BIN, MASHUPFORGE_PI_DIR/pi.cmd, ~/.hermes/...,
  /usr/local/bin/pi, /usr/bin/pi]` before falling back to `where pi` on
  Windows. The MASHUPFORGE_PI_DIR candidate is checked **before** PATH,
  so a stale global pi from a previous user session won't shadow the
  app-local install.

### 7. Pi start endpoint (`app/api/pi/start/route.ts`)

- `POST /api/pi/start` → `start()` in `lib/pi-client.ts` → `getPiPath()`
  → `pi.cmd` spawn. Wired end-to-end.
- Accepts optional `systemPrompt` in the POST body and routes it through
  `setUserSystemPrompt()`.

---

## Architecture drift — surface this before closing stories

`docs/bmad/stories-tauri-windows.md` STORY-003 still describes the
baked-pi architecture:

> Phase 1 bakes pi into `src-tauri/resources/pi/` at build time (via
> `scripts/bake-pi.ps1`) and the Rust launcher sets `PI_BIN` to the
> bundled binary, so runtime install is gone.

But the code has flipped to runtime install:

- `build-windows.ps1:82` — "Skipping pi bake — runtime-install architecture"
- `src-tauri/src/lib.rs:73-81` — creates `pi_install_dir` in `app_data_dir`,
  sets `MASHUPFORGE_PI_DIR` not `PI_BIN`
- Commit `e63983b feat(tauri): pi.dev runtime auto-install on first launch`

**Action:** rewrite STORY-003 description to match the runtime-install
reality, and either delete `scripts/bake-pi.ps1` or mark it
`resources/README.md`-only. (Not fixing it in this artifact because that's
a cross-story rewrite, not STORY-004's testing scope — lift to proposal
if Hermes agrees.)

---

## Manual test checklist for Maurice

Keyed 1:1 to the Phase 1 acceptance criteria from
`stories-tauri-windows.md`. Do each in order — later steps assume
earlier ones pass.

### Unblock: get a working .msi

Two paths. Use whichever is convenient:

- **CI path:** push a commit to `main`. The `tauri-windows` workflow
  runs `build-windows.ps1 -SkipToolchainCheck` on a clean
  `windows-latest` runner and uploads `mashupforge-windows-msi` and
  `mashupforge-windows-nsis` artifacts. Download from the Actions run.
- **Local path:** on the Windows PC, from the repo root, run:
  ```powershell
  .\build-windows.ps1
  ```
  Artifacts land at `src-tauri\target\release\bundle\{msi,nsis}\`.

### Test 1 — MSI installs cleanly

- [ ] Double-click the `.msi`. Installer launches. (NSIS `*-setup.exe` is
      an equivalent fallback if the MSI misbehaves.)
- [ ] Click through SmartScreen warning (unsigned — expected).
- [ ] Install completes without error. Shortcut appears in Start menu.
- [ ] Installed tree exists under
      `C:\Program Files\MashupForge\` (default) — confirm `node.exe`,
      `app\server.js`, `app\start.js`, and `app\.next\` are present.
      `resources\pi\` should NOT exist (runtime-install architecture).

### Test 2 — App launches; sidecar boots; window navigates to local URL

- [ ] Launch MashupForge from the Start menu.
- [ ] Loading screen appears (this is `frontend-stub/index.html`).
- [ ] Within ~5s the window swaps to the real MashupForge UI
      (URL bar, if visible, shows `http://127.0.0.1:<ephemeral>`).
- [ ] Open Task Manager → Details. One `MashupForge.exe` process AND
      one `node.exe` child are running.
- [ ] Close the window. Task Manager: both processes gone within ~2s.
      (If `node.exe` lingers, the sidecar kill path in `lib.rs:165-177`
      has regressed.)

### Test 3 — config.json hydration

- [ ] Close the app if running.
- [ ] Create `%APPDATA%\MashupForge\config.json` with:
      ```json
      {
        "LEONARDO_API_KEY": "lk_...",
        "ZAI_API_KEY": "..."
      }
      ```
      (Any other env-var-named keys MashupForge API routes read will
      also hydrate — see `tauri-server-wrapper.js:54-60` for the rule:
      non-empty string values only.)
- [ ] Relaunch the app.
- [ ] In the launcher console (if accessible) or Settings "About" panel,
      confirm the env vars are picked up. Wrapper logs a line like
      `[tauri-wrapper] hydrated N env vars from <path>` to stdout on boot.

### Test 4 — End-to-end image generation

- [ ] In the app, go to Studio → enter a prompt → Generate.
- [ ] Leonardo v2 call succeeds; at least one image renders. If it fails
      with "missing API key" the config hydration didn't work (test 3).
      If it fails with a Leonardo API error, the key is wrong — that's
      not a desktop bug.

### Test 5 — Start pi from Settings, receive a chat response

- [ ] Go to Settings → Pi section → click "Start pi" (or equivalent).
- [ ] First launch: pi is installed via npm into `%APPDATA%\MashupForge\pi`.
      Expect a 30-60s delay on first click (npm fetch). Subsequent
      launches should be instant.
- [ ] `/api/pi/status` reports `installed: true`, `piPath:
      "%APPDATA%\\MashupForge\\pi\\pi.cmd"`.
- [ ] Send a chat message via the Studio chat UI. Pi responds with
      streamed text (uses the `/api/pi/prompt` SSE surface).
- [ ] Close the app. `/api/pi/stop` is called during shutdown (or the
      Rust `CloseRequested` handler kills the whole sidecar, which takes
      pi down with it).

### Test 6 — Second launch uses cached pi install

- [ ] Relaunch the app. Go to Settings → verify pi status is `installed:
      true` **without** clicking "Start pi". The resolver should find
      `%APPDATA%\MashupForge\pi\pi.cmd` immediately.

---

## Exit criteria — pass conditions for STORY-004

All six tests above passing on a real Windows host satisfies Phase 1.
Record the run in a comment below this section (date, Windows build,
MSI vs NSIS, any deviations) and mark STORY-004 `[x]` in
`~/.hermes/queues/developer.md`.

## Failure triage pointers

If something breaks, start here:

- **Window never navigates past the stub loading screen:** sidecar
  didn't come up in 30s. Check Tauri log output for `next server did
  not come up within 30s` from `lib.rs:159`. Likely causes:
  `node.exe` missing from resources, `start.js` missing, standalone
  `server.js` missing (check `resources\app\` layout).
- **`node.exe` crashes on launch:** config.json has a non-string value
  or bad JSON. `tauri-wrapper` logs `config load error at <path>: <msg>`.
- **Pi install fails:** check the `BUILD_MARKER` diagnostics blob in the
  response from `POST /api/pi/install`. `localPrefixWritable: false`
  means `%APPDATA%\MashupForge\pi` isn't writable (unusual — that's the
  user's own roaming profile). `npmVersion` error means `npm.cmd` is not
  on PATH inside the bundled Node runtime.
- **Pi installs but `getPiPath()` returns null:** the `--prefix`
  install landed shims somewhere other than `<prefix>\pi.cmd`. Inspect
  `%APPDATA%\MashupForge\pi\` — if pi landed in
  `%APPDATA%\MashupForge\pi\node_modules\.bin\pi.cmd`, `getLocalBin()`
  needs an update (but npm 10+ on Windows puts shims at the prefix root
  for `--prefix` installs, so this would be a surprise).

---

## Summary

| Item | Status |
|---|---|
| Static validation of build chain | PASS |
| Rust launcher wiring against acceptance criteria | PASS |
| Tauri config | PASS |
| GitHub Actions workflow | PASS (QA-005 resolved) |
| Runtime-install pi flow | PASS (static) |
| STORY-003 spec vs code drift | FLAGGED — recommend rewrite |
| Manual E2E test on Windows | BLOCKED on Maurice (pending) |
| STORY-004 itself | ready for manual pass — not DONE until tests 1-6 green |
