# STORY-002 Review — Tauri config + Rust launcher for local Next sidecar

**Status:** DONE (satisfied by prior commit)
**Agent:** Developer
**Date:** 2026-04-14 (backfilled)
**Commit:** `fbf81a5`
**QA:** approved in `docs/bmad/qa/QA-001.md`

---

## Context

QA-001 flagged that a review artifact for STORY-002 was never written,
even though the work itself had already shipped in commit `fbf81a5` as
part of the Phase 1 local-sidecar architecture. This artifact backfills
that record. The story's original spec ("App opens with Vercel URL in
native webview") was obsolete before it was picked up — the Phase 1
architecture replaced the Vercel-URL approach with a fully local
bundled Node sidecar. The rewritten STORY-002 in
`docs/bmad/stories-tauri-windows.md` reflects what actually shipped.

## Acceptance check (rewritten criteria)

| Criterion | Code evidence | Status |
|---|---|---|
| App launches and shows a loading screen | `src-tauri/frontend-stub/index.html`; `tauri.conf.json` → `frontendDist: ../src-tauri/frontend-stub`, `windows[0].url: index.html` | ✓ |
| Rust launcher spawns bundled Node on random 127.0.0.1 port | `src-tauri/src/lib.rs` — `pick_free_port()` via `TcpListener::bind("127.0.0.1:0")`, `Command::new(node_bin).arg(start_js)` with `PORT` env | ✓ |
| Window navigates to local URL once server accepts connections | `src-tauri/src/lib.rs` — background thread polls port, calls `window.navigate(http://127.0.0.1:{port})` on success (30s timeout) | ✓ |
| Sidecar killed cleanly on window close | `src-tauri/src/lib.rs` — `on_window_event` handles `WindowEvent::CloseRequested`, takes `SidecarState` child and kills it | ✓ |
| `PI_BIN` wired so `/api/pi/start` finds bundled pi | `src-tauri/src/lib.rs` sets `PI_BIN` env to `resources/pi/pi.cmd` before spawning Node sidecar; Node process inherits env into Next runtime | ✓ |

All (rewritten) acceptance criteria met.

## Files changed (in `fbf81a5`)

- `src-tauri/tauri.conf.json` — Windows-ready config: local `frontendDist`,
  `bundle.resources: ["resources/**/*"]`, Windows icon paths
- `src-tauri/src/lib.rs` — full rewrite (~170 lines): ephemeral port
  picker, Node sidecar spawn with `CREATE_NO_WINDOW` on Windows,
  cross-platform Node/pi path resolution, window-close sidecar kill
- `src-tauri/frontend-stub/index.html` — dark loading screen
- `src-tauri/resources/README.md` — placeholder so `resources/**/*`
  glob matches before the bake step populates the directory
- `next.config.ts` — `output: 'standalone'` + `outputFileTracingRoot`
  so `.next/standalone/server.js` ends up at a flat path instead of
  being nested under the parent lockfile's path tree
- `scripts/tauri-server-wrapper.js` — JS wrapper loaded as
  `start.js` in the sidecar; hydrates `process.env` from
  `%APPDATA%\MashupForge\config.json` before `require('./server.js')`
- `lib/desktop-env.ts` — TypeScript sibling of the wrapper (used by
  the Next.js runtime itself for consistent env hydration)
- `scripts/fetch-windows-node.ps1` — pins Node v22.11.0 win-x64
- `scripts/bake-pi.ps1` — installs pi-coding-agent via bundled
  `node.exe` + `npm-cli.js` with `pi.cmd` fallback search
- `scripts/copy-standalone-to-resources.ps1` — copies
  `.next/standalone` + `.next/static` + `public/` into
  `src-tauri/resources/app/`, installs wrapper as `start.js`
- `build-windows.ps1` — 7-phase orchestrator (`-Dev`,
  `-SkipToolchainCheck` flags)
- `docs/WINDOWS-BUILD.md` — runbook + Phase 2-4 roadmap table
- `.gitignore` — `.cache/`, `src-tauri/target/`,
  `src-tauri/resources/{node,app,pi}/`

## Why this diverged from the original STORY-002 spec

The original spec's "thin installer + Vercel URL" approach had three
fatal constraints that only surfaced once implementation started:

1. **AI features need internet regardless** — pi.dev runs GLM models
   locally once started, but a Vercel-URL-only installer couldn't
   wire `PI_BIN` to anything bundled, so pi would always require a
   runtime install. That failure mode is worse than shipping a
   larger installer.
2. **No offline fallback** — Maurice's stated Phase 1 goal was
   "works on my PC" without requiring a live deploy. A Vercel-URL
   webview breaks as soon as the deploy is stale or rolled back.
3. **Auth state mismatch** — a Vercel-served frontend talking to a
   local pi via `localhost` routes would have needed CORS gymnastics
   the current codebase doesn't implement.

The local-sidecar architecture sidesteps all three. Larger installer
(~180MB) in exchange for reliability + offline capability + zero
deployment coupling.

## Handoff / next steps

- STORY-002 closed. No further Developer work.
- STORY-003 (verify bundled pi starts from Settings) and STORY-004
  (human validation) are the remaining stories for this epic. Both
  depend on a working `.msi` from either the new CI workflow or a
  local `build-windows.ps1` run.
