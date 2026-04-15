# QA Review — STORY-070

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** d52f56c

## Findings

- [INFO] Three distinct bugs found and fixed in one pass: port collision (3000→3001), static asset paths (`.next/static` and `public/` were placed one directory above where `server.js`'s `chdir()` expected them), missing Windows native bindings (sharp-win32-x64, swc-win32-x64-msvc).
- [INFO] Root cause of all three bugs was that the scripts were never committed to git — every session reproduced the broken state. Scripts now tracked.
- [INFO] Static asset layout fix is correct: `server.js` does `process.chdir(__dirname)`, so assets must live in `standalone/.next/static` and `standalone/public`, not `$APP_DIR/.next/static`. ✓
- [INFO] Cross-platform native binding install (`--os=win32 --cpu=x64`) is the correct npm 10 approach for foreign-platform deps. Post-install assertion on both `.node` files is correct.
- [INFO] Loopback pin (`HOSTNAME=127.0.0.1`, `HOST=127.0.0.1`) in `start.bat` mirrors STORY-041's fix for the Tauri path. Consistent approach.
- [INFO] `PORT=3001` is a pragmatic fix for the WSL port collision. Documented known caveat: `taskkill /F /IM node.exe` kills all node.exe processes on the system — acceptable for a portable launcher dev audience.
- [INFO] Linux smoke test confirms: root 200, static chunks 200, public assets 200. Layout fix is proven for the asset-serving path.

### Unverified on Windows (noted, not a blocker)

- `.bat` control flow (cmd.exe parsing, `setlocal`, `start /B` env inheritance)
- `@img/sharp-win32-x64.node` loadable by Windows Node
- Port 3001 free on Maurice's Windows host

These require Maurice's manual confirm and are correctly noted as pending in the review.

## Gate Decision

PASS — Three real bugs correctly diagnosed and fixed. Linux smoke-test validates the core server path. Windows-specific items (bat flow, native bindings, port availability) are correctly flagged as pending Maurice's confirm — standard handoff pattern for a WSL-built Windows target.
