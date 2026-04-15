# QA Review — STORY-041

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 27a4efe

## Findings

- [INFO] Root cause correctly identified: `hydrateDesktopEnv()` could overwrite the Rust launcher's `HOSTNAME=127.0.0.1` with a user-supplied value from config.json. The old `if (!HOSTNAME)` fallback only covered the unset case, not the wrong-value case.
- [INFO] Fix runs AFTER `hydrateDesktopEnv()` — correct ordering. User config cannot escape the loopback cage regardless of what they put in config.json.
- [INFO] Both `HOSTNAME` and `HOST` pinned — belt-and-suspenders. Zero cost, one extra line.
- [INFO] Override logs a warning when it fires (`[tauri-wrapper] overriding HOSTNAME=... -> 127.0.0.1`) so intentional user config changes are visible in the Tauri stdout. No silent suppression.
- [INFO] Desktop-only file (`scripts/tauri-server-wrapper.js`). Hard-coding loopback is safe because the only caller is the Rust sidecar spawn. Vercel/Linux/CI are unaffected.
- [INFO] `node -c scripts/tauri-server-wrapper.js` → syntax OK per review.
- [INFO] IPv6 (`::1`) correctly excluded — the Rust launcher's `wait_for_port` polls `127.0.0.1`, so the whole chain is IPv4. Adding `::1` would break the readiness gate.
- [INFO] New Test 2.5 added to STORY-061 checklist: "No Defender dialog on first launch."

## Gate Decision

PASS — Correct minimal fix. Override order is right, logging is right, scope is tight to the desktop wrapper. Eliminates Windows Defender Firewall prompt without requiring admin elevation or a netsh rule.
