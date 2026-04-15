# QA Review — STORY-121

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 3234b0c

## Findings

- [INFO] Root cause correctly identified: `pick_free_port()` returned a fresh ephemeral OS port on every launch, changing the WebView2 origin (`http://127.0.0.1:<port>`) and causing IndexedDB reads to find nothing. Clean diagnosis.
- [INFO] `DESKTOP_PORT: u16 = 19782` rationale is sound: IANA-unassigned, outside Windows (49152–65535) and Linux (32768–60999) ephemeral ranges, above 1024, not a common dev tool default.
- [INFO] Fallback to ephemeral + **prominent WARN** in `startup.log` on conflict is the correct tradeoff: app still works (with loss of persistence for that session), failure is visible, user can diagnose.
- [INFO] `cargo check --offline` clean.
- [WARNING] **One-time settings migration cost:** existing settings under previous ephemeral-port origins are not recoverable (IndexedDB is origin-scoped, WebView2 provides no cross-origin import). Maurice must re-enter his configuration once after installing this build. This is correctly documented in the review and is unavoidable given the root cause. Noted but not a gate blocker.
- [INFO] Long-term fix (move settings to `app_data_dir` JSON via Tauri command) is correctly deferred — it's a multi-file change requiring Tauri plugin work. Port fix is the right unblocking step.
- [INFO] Orphan IndexedDB origins from previous launches accumulate in `%LOCALAPPDATA%\...\EBWebView`. Not critical — no data leakage, they're just never read again. Can be cleaned up by the eventual file-based settings migration.

## Gate Decision

PASS — Correct root cause fix. Stable port eliminates IndexedDB origin drift. Fallback is soft with visibility. One-time data loss is unavoidable and documented. `cargo check` clean.
