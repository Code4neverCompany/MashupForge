# Stories: Tauri Windows Desktop Build

## STORY-001: GitHub Actions workflow for Windows build
- Description: Create .github/workflows/tauri-windows.yml
- Acceptance: Workflow triggers on push to main, builds .msi
- Complexity: routine
- Agent: Developer
- Status: **DONE** (commit `fd93edb`, review `docs/bmad/reviews/STORY-001.md`, QA-approved in `docs/bmad/qa/QA-001.md`)

## STORY-002: Tauri config + Rust launcher for local Next sidecar
- Description: Configure tauri.conf.json and Rust launcher to spawn a
  bundled Node sidecar serving the Next.js standalone build on a local
  ephemeral port. Supersedes the original "Vercel URL in webview" spec,
  which was abandoned before implementation in favor of the Phase 1
  local-sidecar architecture.
- Acceptance:
  - App launches and shows a loading screen
  - Rust launcher spawns bundled Node on a random 127.0.0.1 port
  - Window navigates to local URL once server accepts connections
  - Sidecar killed cleanly on window close
  - `PI_BIN` wired so `/api/pi/start` can find the bundled pi binary
- Complexity: complex
- Agent: Developer
- Status: **DONE** (satisfied by commit `fbf81a5`, review `docs/bmad/reviews/STORY-002.md`, QA-approved in `docs/bmad/qa/QA-001.md`)

## STORY-003: Verify bundled pi.dev starts from app Settings
- Description: Phase 1 bakes pi into `src-tauri/resources/pi/` at build
  time (via `scripts/bake-pi.ps1`) and the Rust launcher sets `PI_BIN`
  to the bundled binary, so runtime install is gone. The remaining
  work is validating that the existing Settings modal's "Start pi"
  button correctly spawns the bundled `pi.cmd` in desktop mode.
- Acceptance:
  - Clicking "Start pi" in Settings launches `%PI_BIN%` (bundled pi.cmd)
  - `/api/pi/status` reports the child as running
  - `/api/pi/stop` terminates the child cleanly
  - Works from a fresh install with no pre-existing global pi.dev install
- Complexity: routine (verification task; code changes only if Windows
  spawn-shim handling breaks)
- Agent: Developer
- Depends on: STORY-004 producing a working `.msi` to test against

## STORY-004: Human validation of full Windows flow
- Description: Human-run end-to-end validation of the Phase 1 build on
  a real Windows machine. Cannot be automated from WSL because
  `tauri build` for Windows requires a Windows host or the
  `windows-latest` CI runner.
- Acceptance:
  - `.msi` installs cleanly on Windows (from CI artifact or local
    `build-windows.ps1` run)
  - App launches; sidecar boots; window navigates to local URL
  - User can create `%APPDATA%\MashupForge\config.json` with Leonardo +
    pi keys and have them picked up on next launch
  - User can generate an image end-to-end
  - User can start pi from Settings and receive a chat response
- Complexity: routine (manual test pass)
- Agent: **Maurice** (not Developer — requires Windows host)
- Unblock path: (a) new tauri-windows workflow CI run produces a
  downloadable `.msi` artifact, OR (b) Maurice runs `build-windows.ps1`
  locally on his Windows PC.
