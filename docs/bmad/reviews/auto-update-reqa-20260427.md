# QA Re-Review — Auto-Update Settings Feature

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Task:** AUTO-UPDATE-REQA-20260427
**Prior review:** docs/bmad/reviews/auto-update-qa-review.md (FAIL, 0.55)
**Commits reviewed:** 5786ddf (design) + working-tree fixes (auto-update-fix-criticals)
**Confidence:** 0.82

---

## Test Results

| Check | Result |
|---|---|
| `npm run test -- --run` | **824/824 PASS** |
| `npx tsc --noEmit` | **CLEAN** |

---

## Resolution of Prior Criticals

### CRITICAL-1: Granular toggles had no runtime effect — **FIXED ✓**

`UpdateChecker.tsx` now reads three granular keys from `/api/desktop/config`:

```
checkOnStartup    = AUTO_CHECK_ON_STARTUP !== '0'   (default: true)
shouldAutoDownload = AUTO_DOWNLOAD !== '0'           (default: true)
shouldAutoInstall  = AUTO_INSTALL === '1'            (default: false)
```

Backwards-compat path preserved: if `AUTO_CHECK_ON_STARTUP` is absent from config (user never visited the new panel), falls back to legacy `UPDATE_BEHAVIOR` key. The gate (`autoInstallRef.current = true`) now requires both `shouldAutoDownload && shouldAutoInstall`, matching the UI's cascading disable logic.

Behavior matrix verified correct:

| AUTO_CHECK | AUTO_DOWNLOAD | AUTO_INSTALL | Runtime outcome |
|---|---|---|---|
| 0 | any | any | No check on startup ✓ |
| 1 | 0 | any | Check, show banner — no auto-install ✓ |
| 1 | 1 | 0 | Check, show banner — user clicks to install ✓ |
| 1 | 1 | 1 | Silent auto-install (pipeline-busy gate applies) ✓ |

---

### CRITICAL-2: WIN_INSTALL_MODE not applied to install call — **WONTFIX (API limitation) ✓**

Dev confirmed `@tauri-apps/plugin-updater@2.10.1` JS API `DownloadOptions` has only `headers` and `timeout` — no `installMode` field. Windows install mode is build-time configuration only (via `tauri.conf.json` or `Builder::installer_args()` in Rust), not a runtime parameter exposed to the frontend. The assumption in the QA plan was incorrect.

Status: the UI and persistence are correct; the setting has no runtime effect. This is documented in `docs/bmad/reviews/auto-update-fix-criticals.md`. Acceptable as API limitation.

---

## New Findings Against Fixed Code

### Warnings (should fix, not blocking)

#### [WARNING-1] AUTO_DOWNLOAD toggle has no independent runtime effect

`UpdateChecker.tsx` uses `shouldAutoDownload && shouldAutoInstall` as a single combined gate for `autoInstallRef.current`. There is no separate "download in background then prompt" code path — the Tauri updater API only exposes `downloadAndInstall()` (combined) in this plugin version.

Practical consequence: `AUTO_DOWNLOAD=on, AUTO_INSTALL=off` produces identical UX to `AUTO_DOWNLOAD=off, AUTO_INSTALL=off`. Both show the update banner and wait for the user to click "Update Now." The toggle description "Download in the background when a new version is found" is misleading.

`AUTO_DOWNLOAD` only has meaningful effect as a prerequisite gate for `AUTO_INSTALL` — it cannot independently trigger a background download. This is the same API limitation as CRITICAL-2.

**Recommendation:** Update the toggle description in `AutoUpdateSettings.tsx:326` from "Download in the background when a new version is found" to "Allow automatic download when a new version is found" (or similar) to avoid implying silent background activity that doesn't occur.

---

#### [WARNING-2] hasGranular detection keyed on single key

`UpdateChecker.tsx` detects whether to use granular settings via `cfg.keys?.AUTO_CHECK_ON_STARTUP !== undefined`. If a user's first interaction with the new settings panel is toggling `AUTO_DOWNLOAD` (without touching `AUTO_CHECK_ON_STARTUP`), the config would contain `AUTO_DOWNLOAD` but not `AUTO_CHECK_ON_STARTUP`. `hasGranular` would be `false`, and the update behavior would silently fall back to the legacy `UPDATE_BEHAVIOR` key, ignoring the user's `AUTO_DOWNLOAD` change.

Edge case but real. Consider detecting on the presence of any UPDATER_KEY (`AUTO_DOWNLOAD`, `AUTO_INSTALL`, or `WIN_INSTALL_MODE`) as an OR condition, or writing all keys with defaults on first settings-panel render.

---

### Info (noted, no action required)

#### [INFO-1] @tauri-apps/plugin-dialog added to package.json but not initialized in Rust

`package.json` now lists `@tauri-apps/plugin-dialog: ^2` as a dependency, but `lib.rs` does not call `.plugin(tauri_plugin_dialog::init())` and no dialog capability is granted in `capabilities/default.json`. Any frontend code that imports and calls `@tauri-apps/plugin-dialog` would receive an ACL error.

Since nothing currently imports it, the risk is zero. Remove if not planned for use in this feature.

#### [INFO-2] tauri-plugin-store registered but auto-update settings use config.json API

`tauri-plugin-store` is now initialized in Rust (`tauri_plugin_store::Builder::default().build()`) and `store:default` is granted. However, neither `AutoUpdateSettings.tsx` nor `UpdateChecker.tsx` calls the store API — both use `fetch('/api/desktop/config')` (reads/writes `config.json` on disk via the existing desktop API). Plugin-store is available infrastructure but not yet used by this feature.

This is harmless and expected if plugin-store will be used by another feature.

#### [INFO-3] WIN_INSTALL_MODE should have a UI note about build-time limitation

The radio group works and persists the selection, but as confirmed by CRITICAL-2 investigation, the setting has no runtime effect. A future iteration should show a tooltip or helper text indicating this is a build-time preference (e.g., "Applies to the next installed build"). Without it, users who select `basicUi` or `quiet` may be confused when they see the passive installer.

#### [INFO-4] lastCheckedAt still in localStorage (pre-existing)

Unchanged from the original review WARNING-1. `localStorage.setItem(LAST_CHECKED_AT_KEY, ...)` is origin-scoped and will be lost if STORY-121's port fallback fires. Display-only value — not a functional regression. Out of scope for this fix task.

---

## Scope Check

- [IN-SCOPE] `components/UpdateChecker.tsx` — granular key reads, backwards compat ✓
- [IN-SCOPE] `package.json` — plugin-dialog + plugin-store added ✓
- [IN-SCOPE] `src-tauri/Cargo.toml` — tauri-plugin-store added ✓
- [IN-SCOPE] `src-tauri/capabilities/default.json` — store:default added ✓
- [IN-SCOPE] `src-tauri/src/lib.rs` — plugin-store initialized ✓
- [IN-SCOPE] `docs/bmad/reviews/auto-update-fix-criticals.md` — dev review written ✓

---

## Gate Decision

**[CONCERNS]** — Merge acceptable with known issues documented. Confidence: **0.82**

Both original criticals are resolved. The primary feature value is delivered: users can now disable auto-check on startup, and auto-install works end-to-end. The remaining warnings are API limitations of `@tauri-apps/plugin-updater@2.10.1` (same root cause as CRITICAL-2) and an edge case in granular-key detection.

**Merge condition:** Document WARNING-1 (AUTO_DOWNLOAD description) and INFO-3 (WIN_INSTALL_MODE build-time note) as follow-up tasks. Neither blocks the current release.
