# QA Review — STORY-080

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 75f76bb

## Findings

- [INFO] Correct diagnosis: zero observability in Release builds was the blocking issue, not a fixable code bug. Three compounding silencers identified: `windows_subsystem = "windows"` (no console), log plugin gated on `debug_assertions` (no log file), sidecar `Stdio::inherit()` (no console to inherit → /dev/null). All three addressed.
- [INFO] Always-on `tauri_plugin_log` (both Debug and Release) + independent synchronous `startup.log` is the right two-layer approach. The async plugin can miss a crash during `setup()`; the sync `startup_log_line()` with `OpenOptions::append` captures even pre-plugin events.
- [INFO] `preflight_resources()` checks are well-ordered and the error messages point at the specific build step that produced the missing artifact. Good diagnostic UX.
- [INFO] `user32.MessageBoxW` via `#[link(name = "user32")]` is the correct approach for a blocking error dialog without adding a new crate dep. Non-Windows stub via `#[cfg(not(target_os = "windows"))]` ensures Linux builds compile. ✓
- [INFO] Panic hook installed BEFORE fallible work in `setup()` — correct. A panic during path resolution will now leave a breadcrumb in `startup.log`.
- [INFO] Sidecar piped to `sidecar.log` via `File::create` + `try_clone()` — correct. Every `console.log` from start.js and server.js now has a durable home.
- [INFO] Timeout bump 30s → 60s is justified for first-launch AV scan on Program Files. Non-destructive timeout behavior (no `window.close()`) is the right call for diagnostic visibility.
- [INFO] `cargo check --offline` → clean. No new Cargo dependencies added.

### Security
- [INFO] `MASHUPFORGE_LOG_DIR` passed to sidecar — exposes a filesystem path to the Next.js process, which already runs in the app data dir. No new trust boundary crossed.
- [INFO] `user32.MessageBoxW` FFI: correct `extern "system"` calling convention for Win32 API. Non-blocking `MB_OK` — no input is taken from the user. No injection surface.

### Root cause
- [INFO] Root cause of the original crash is still undiagnosed — the observability code is the tool for diagnosing it, not the fix for it. This is the correct sequencing: diagnose before guessing. Gate PASS on the code quality; Maurice's `startup.log` output will determine whether a follow-up fix is needed.

## Gate Decision

PASS — Observability rewrite is well-constructed. `cargo check` clean. Three-layer diagnostic trail (startup.log, tauri.log, sidecar.log) plus MessageBox on preflight failure gives Maurice everything needed to triage the crash. Root cause determination is downstream and correctly deferred.
