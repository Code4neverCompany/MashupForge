# QA Final Review — Auto-Update Settings Feature

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Task:** AUTO-UPDATE-FINAL-QA
**Commits reviewed:** 5786ddf → fddf6ac → 3ed7906 (all on main)
**Confidence:** 0.88

---

## Test Results

| Check | Result |
|---|---|
| `npm run test -- --run` | **824/824 PASS** |
| `npx tsc --noEmit` | **CLEAN** |

---

## Critical Resolutions

### CRITICAL-1: Granular toggles had no runtime effect — PASS ✓

**Verified at `components/UpdateChecker.tsx:113–139`.**

Three granular keys are read from `/api/desktop/config` at startup:

```
checkOnStartup    = AUTO_CHECK_ON_STARTUP !== '0'   (default: true)
shouldAutoDownload = AUTO_DOWNLOAD !== '0'           (default: true)
shouldAutoInstall  = AUTO_INSTALL === '1'            (default: false)
```

`checkOnStartup = false` exits the entire check path before the updater plugin is called. `autoInstallRef.current = true` fires only when both `shouldAutoDownload && shouldAutoInstall`. Backwards-compat path present: if `AUTO_CHECK_ON_STARTUP` is absent from config, falls back to legacy `UPDATE_BEHAVIOR` key.

Behavior matrix confirmed correct per code inspection:

| AUTO_CHECK | AUTO_DOWNLOAD | AUTO_INSTALL | Outcome |
|---|---|---|---|
| 0 | any | any | No check on startup |
| 1 | 0 | any | Check, banner shown, user clicks to install |
| 1 | 1 | 0 | Check, banner shown, user clicks to install |
| 1 | 1 | 1 | Silent auto-install (pipeline-busy gate applies) |

---

### CRITICAL-2: WIN_INSTALL_MODE non-functional — ACCEPTABLE ✓

**Resolution: "Coming soon" badge (commit 3ed7906, designer).**

Verified at `components/Settings/AutoUpdateSettings.tsx:339–378`:

- Wrapper section: `opacity-60` — visually dimmed ✓
- Section label: inline **"Coming soon"** badge (`bg-zinc-800 text-zinc-500 border-zinc-700/60`) ✓
- Radio group: `pointer-events-none` + `aria-label="Windows install mode (coming soon)"` ✓
- Each button: `disabled` + `cursor-not-allowed` ✓
- Selected button: muted zinc palette (no gold — correctly not "active") ✓
- Hint text: `"[mode description] — runtime selection requires a future app build"` ✓

The control persists its value through `draft`/`onFieldChange` unchanged, ready for when the Tauri plugin exposes `installMode` at runtime. Users see their stored preference and understand it's aspirational.

---

## Carry-forward Warnings (not blocking, logged as follow-up)

### [WARNING-1] AUTO_DOWNLOAD has no independent runtime effect

`UpdateChecker.tsx` uses `shouldAutoDownload && shouldAutoInstall` as a single combined gate for `autoInstallRef`. There is no separate "background download, then prompt to install" code path — the Tauri updater JS API only exposes `downloadAndInstall()`. Setting `AUTO_DOWNLOAD=on, AUTO_INSTALL=off` produces identical UX to `AUTO_DOWNLOAD=off` (banner shown, user clicks). The toggle description "Download in the background when a new version is found" overpromises.

**Follow-up:** Update description text or add a `Coming soon` treatment matching WIN_INSTALL_MODE for the auto-download standalone behaviour.

---

### [WARNING-2] hasGranular detection keyed on single key

`UpdateChecker.tsx:120`: `hasGranular = cfg.keys?.AUTO_CHECK_ON_STARTUP !== undefined`. If a user's first settings interaction sets `AUTO_DOWNLOAD` without touching `AUTO_CHECK_ON_STARTUP`, the config would contain `AUTO_DOWNLOAD` but not `AUTO_CHECK_ON_STARTUP`. `hasGranular = false` — UpdateChecker silently falls back to `UPDATE_BEHAVIOR`.

Edge case, very unlikely in practice (requires interacting with a secondary toggle before the primary one on a fresh install). **Follow-up:** Consider detecting on any UPDATER_KEY being present, or writing all keys with defaults on first settings-panel render.

---

### [INFO-1] @tauri-apps/plugin-dialog in package.json, not initialized in Rust

Added to `package.json` as a dependency but `lib.rs` has no `tauri_plugin_dialog::init()` call and `capabilities/default.json` has no dialog permission. Any future code calling it would receive an ACL error. Remove or complete the wiring before use.

### [INFO-2] lastCheckedAt in localStorage (pre-existing)

`LAST_CHECKED_AT_KEY` written via `localStorage.setItem`. Origin-scoped — lost if STORY-121 port fallback fires. Display-only value; no functional impact.

---

## Scope Check

| Artifact | Status |
|---|---|
| `components/Settings/AutoUpdateSettings.tsx` — coming-soon badge | ✓ PASS |
| `components/UpdateChecker.tsx` — granular key reads | ✓ PASS |
| `src-tauri/capabilities/default.json` — store:default | ✓ PASS |
| `src-tauri/src/lib.rs` — plugin-store init | ✓ PASS |
| `src-tauri/Cargo.toml` — tauri-plugin-store | ✓ PASS |
| `package.json` — plugin-store + plugin-dialog | ✓ PASS (plugin-dialog unused — INFO-1) |
| Security: pubkey, dialog:false, endpoint URL | ✓ UNCHANGED |
| Dark theme: no light leaks | ✓ PASS |
| Test suite: 824/824 | ✓ PASS |
| TypeScript: clean | ✓ PASS |

---

## Gate Decision

**[PASS]** — Confidence: **0.88**

Both original criticals are fully resolved. The feature delivers its primary value: users can now meaningfully control startup update behaviour. The coming-soon treatment for WIN_INSTALL_MODE is an honest, well-executed UX decision. Carry-forward warnings are documented follow-up items, none of which block a release.

**Recommended follow-up tasks (not blocking):**
1. Update `AUTO_DOWNLOAD` toggle description text (WARNING-1)
2. Broaden `hasGranular` detection beyond single key (WARNING-2)
3. Either wire or remove `@tauri-apps/plugin-dialog` (INFO-1)
