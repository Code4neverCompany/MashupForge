# Review: Auto-Update — Fix 2 Critical QA Failures

**Task:** auto-update-fix-criticals
**Date:** 2026-04-27
**Agent:** developer
**Status:** COMPLETE (CRITICAL-1 fixed; CRITICAL-2 resolved as won't-fix — API doesn't support it)
**Confidence:** 0.90

## CRITICAL-1: Granular toggles have no runtime effect — FIXED

`UpdateChecker.tsx` now reads `AUTO_CHECK_ON_STARTUP`, `AUTO_DOWNLOAD`, and `AUTO_INSTALL` from `/api/desktop/config` at startup.

### Changes to `components/UpdateChecker.tsx`

1. **Removed** import of `UPDATE_BEHAVIOR_DEFAULT` and `UpdateBehavior` type (no longer needed).

2. **Replaced** the legacy `UPDATE_BEHAVIOR` single-key read with granular config read:
   - `AUTO_CHECK_ON_STARTUP !== '0'` → gates the entire `run()` path (default: on)
   - `AUTO_DOWNLOAD !== '0'` → gates whether auto-download triggers (default: on)
   - `AUTO_INSTALL === '1'` → gates `autoInstallRef.current` (default: off — safe)

3. **Backwards compatibility**: if `AUTO_CHECK_ON_STARTUP` is not yet in config (user hasn't visited the new settings panel), falls back to legacy `UPDATE_BEHAVIOR`:
   - `off` → `checkOnStartup = false`
   - `auto` → `shouldAutoDownload = true, shouldAutoInstall = true`
   - `notify` (default) → defaults apply (check + download on, install off)

4. **Auto-install gate**: `autoInstallRef.current = true` now only fires when BOTH `shouldAutoDownload` AND `shouldAutoInstall` are true, matching the UI's cascading disable logic (install requires download, download requires check).

### Behavior matrix

| AUTO_CHECK | AUTO_DOWNLOAD | AUTO_INSTALL | Result |
|---|---|---|---|
| 0 | any | any | No check at startup |
| 1 | 0 | any | Check runs, shows banner if available. No auto-download. |
| 1 | 1 | 0 | Check + show banner. User clicks to install. |
| 1 | 1 | 1 | Silent auto-install (gated by pipeline-busy postponement) |

## CRITICAL-2: WIN_INSTALL_MODE not passed to downloadAndInstall() — WON'T FIX (API limitation)

### Investigation

Inspected `@tauri-apps/plugin-updater@2.10.1` type definitions and JS source:

- `downloadAndInstall(onEvent?, options?: DownloadOptions)` — `DownloadOptions` only has `headers` and `timeout`
- `install(): Promise<void>` — no parameters
- No `installMode`, `windowsOptions`, or equivalent anywhere in the plugin's JS API

The QA review assumed `downloadAndInstall()` accepts `{ installMode }` but the Tauri v2 updater JS API does **not** expose Windows install mode as a runtime parameter. On Windows, NSIS install mode is determined by:
1. `tauri.conf.json` → `plugins.updater.windows.installMode` (build-time config)
2. Or NSIS installer command-line arguments via `Builder::installer_args()` in Rust (compile-time)

Neither path supports per-user runtime selection from the frontend.

### Current state

- `WIN_INSTALL_MODE` is persisted to config.json by the UI (the radio group works)
- The setting has no runtime effect — the NSIS installer always uses `passive` (Tauri default)
- To make this work, a custom Tauri command would need to read the setting and pass it to the Rust-side updater, which the current plugin architecture doesn't support

### Recommendation

Keep the `WIN_INSTALL_MODE` UI and persistence as-is. Add a tooltip or note in a future UI iteration: "Takes effect after the next app build" or gate it behind a platform check. Not a user-facing regression since the default (`passive`) matches what users expect.

## Verification

- `tsc --noEmit` — clean
- `vitest run` — 824/824 tests passing
- No files outside `components/UpdateChecker.tsx` modified
