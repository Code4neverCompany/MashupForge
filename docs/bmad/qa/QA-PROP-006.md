# QA Review — QA-PROP-006 (Tauri crash reporter — local-only)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** d98a56c

## Findings

### Surface 1 — Rust panic hook (`src-tauri/src/lib.rs`)

- [INFO] `install_panic_hook()` extended: now writes a dedicated `crashes/crash-<ts>.log`
  alongside the existing `startup.log` line. ✓
- [INFO] `Backtrace::force_capture()` — forces backtrace in release builds regardless of
  `RUST_BACKTRACE` env var. Correct. ✓
- [INFO] `prune_crash_logs(crash_dir, 50)` called on startup — keeps at most 50 crash logs,
  deletes oldest-first. Prevents unbounded growth. ✓
- [INFO] `MASHUPFORGE_CRASH_DIR` set as `log_dir.join("crashes")` and passed to the
  sidecar via `.env()`. All three crash surfaces (Rust, Node, webview) share one dir. ✓

### Surface 2 — Node sidecar (`scripts/tauri-server-wrapper.js`)

- [INFO] Crash handler IIFE installed before any other `require()` — correct ordering.
  If the require chain itself throws, the handler is already in place. ✓
- [INFO] `process.on('uncaughtException', ...)` — logs then allows Node to exit naturally.
  Correct: swallowing an uncaughtException and continuing is dangerous. ✓
- [INFO] `process.on('unhandledRejection', ...)` — logs and continues. Correct: unhandled
  rejections are non-fatal in the current Node LTS; logging is appropriate for a background
  process. ✓
- [INFO] Gated on `process.env.MASHUPFORGE_CRASH_DIR` — if not set (web/dev without Tauri),
  the handler installs as a no-op. No crash dir write attempted. ✓
- [INFO] `writeCrashLog` wrapped in try/catch — if the log write itself fails (disk full,
  permissions), the exception is swallowed. The original crash still propagates correctly. ✓

### Surface 3 — React global error boundary (`app/global-error.tsx`)

- [INFO] `useEffect([error])` fires once per unique error. `fetch('/api/crash', ...)` is
  fire-and-forget with `.catch(() => {})`. Non-blocking — the error UI renders regardless
  of whether the crash report succeeds. ✓
- [INFO] `/api/crash` returns 404 in non-desktop environments (MASHUPFORGE_DESKTOP !== '1').
  The fetch silently fails in web mode — no user-visible effect. ✓
- [INFO] `error?.stack` included in the report body. Stack traces survive React's error
  boundary wrapping (React re-throws with `error.stack` intact in v18+). ✓

### Surface 4 — `app/api/crash/route.ts` (reviewed in AUDIT-010)
- [INFO] Previously reviewed — desktop guard correct, path construction safe, no traversal
  surface. ✓

### Security
- [INFO] Crash log content: message, stack, url — all JavaScript runtime data. No secrets,
  no credentials, no user content beyond the error context. ✓
- [INFO] `crashDir` from `MASHUPFORGE_CRASH_DIR` (launcher-controlled). Filename:
  `crash-node-${Date.now()}.log` — not user-influenced. ✓

## Gate Decision

PASS — All four crash surfaces correctly implemented. Rust: `force_capture()` + file write +
50-log prune. Node: IIFE before require chain, safe exit on uncaughtException. React: fire-and-
forget POST, non-blocking. API route: already gated PASS. Zero new deps, zero new network calls.
