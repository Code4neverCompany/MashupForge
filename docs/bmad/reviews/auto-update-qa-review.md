# QA Review — Auto-Update Settings Feature

**Status:** FAIL → superseded by PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Commit reviewed:** 5786ddf (design story only — backend story not yet shipped)
**Confidence:** 0.55

> **Superseded.** Both criticals resolved across commits fddf6ac + 3ed7906.
> Final gate: **PASS 0.88** — see `docs/bmad/reviews/auto-update-final-qa.md`

---

## Files Reviewed

- `components/Settings/AutoUpdateSettings.tsx`
- `components/UpdateChecker.tsx`
- `lib/desktop-config-keys.ts`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json` (updater section)
- `package.json`
- `tests/integration/desktop-update-check-acl.test.tsx`

---

## Test Results

| Check | Result |
|---|---|
| `npm run test -- --run` | 824/824 PASS |
| `npx tsc --noEmit` | CLEAN (no errors) |
| Related tests | `desktop-update-check-acl.test.tsx` — 4 tests, all PASS |

---

## Findings

### Critical (must fix before merge)

#### [CRITICAL-1] Granular toggles have no runtime effect — UpdateChecker still reads only UPDATE_BEHAVIOR

`UpdateChecker.tsx:118–121` reads exclusively `cfg.keys?.UPDATE_BEHAVIOR` to decide whether to run the startup check and whether to auto-install. The three new granular settings (`AUTO_CHECK_ON_STARTUP`, `AUTO_DOWNLOAD`, `AUTO_INSTALL`) are persisted to config.json by the UI but are never consumed by any runtime code path.

A user who:
- Turns off "Auto-check on startup" → app still checks on startup (UPDATE_BEHAVIOR controls it)
- Turns on "Auto-download" → has no effect on download behavior
- Turns on "Auto-install" → has no effect on install behavior

This is the feature's core promise — it is not fulfilled by the current commit. The backend wiring into `UpdateChecker.tsx` to read the new keys (and map them to the check/download/install gates) is missing.

**Affected commit:** 5786ddf (design story). Backend story `auto-update-backend.md` not yet shipped (no done envelope in inbox).

**Fix required:** `UpdateChecker.tsx` must be updated to read `AUTO_CHECK_ON_STARTUP` (gate the `run()` call), `AUTO_DOWNLOAD` (gate the auto-download path), and `AUTO_INSTALL` (gate `autoInstallRef.current = true`). Until then the feature is UI-only.

---

#### [CRITICAL-2] WIN_INSTALL_MODE is stored but never applied to the install call

`AutoUpdateSettings.tsx:266–278` — `installRef.current` is set to call `update.downloadAndInstall(eventCallback)`. The `winMode` value (read from draft, displayed in the radio group) is **never passed** to `downloadAndInstall`. The Tauri updater JS API supports an optional options argument (`{ installMode }`) on Windows; without it the plugin defaults to `passive` regardless of user selection.

`UpdateChecker.tsx:216` has the same gap — `performInstall` calls `update.downloadAndInstall(callback)` with no installMode parameter.

Users who select `basicUi` or `quiet` will silently get `passive` behavior.

**Fix required:** Retrieve `WIN_INSTALL_MODE` from config and pass `{ installMode: winMode }` (or equivalent) as an argument to `downloadAndInstall`. Requires verifying the exact parameter shape for `@tauri-apps/plugin-updater@2.10.1`.

---

### Warnings (should fix)

#### [WARNING-1] lastCheckedAt uses localStorage (origin-scoped)

`AutoUpdateSettings.tsx:248–250` and `UpdateChecker.tsx:142` — the last-checked timestamp is stored via `localStorage.setItem(LAST_CHECKED_AT_KEY, ...)`. LocalStorage is origin-scoped; if DESKTOP_PORT 19782 is unavailable and the app falls back to an ephemeral port (STORY-121 scenario), the timestamp is invisible on the new origin. The user sees "Last checked: never" every launch in that fallback session.

Impact is display-only (not a functional regression), but it's inconsistent with the rest of desktop config, which explicitly moved to `config.json` on disk for stability against port drift. A future `config.json` key (e.g., `LAST_CHECKED_AT`) would survive origin changes.

---

#### [WARNING-2] No dismiss button on the update-available card in AutoUpdateSettings

`AutoUpdateSettings.tsx:394–425` — when `result.kind === 'available'`, the card shows "Download and install" + "Release notes" but no dismiss/close action. The card remains until the user performs another check or navigates away. The `UpdateChecker` banner (the separate overlay) does have a "Later" dismiss button and a `DISMISS_KEY` localStorage entry for per-version suppression; the settings panel card offers neither.

Minor UX concern — users may be confused about how to clear the card without installing.

---

### Info (noted, no action required)

#### [INFO-1] updater:default is a no-op — not a risk

`capabilities/default.json` includes `updater:default` alongside the four explicit `allow-*` grants. Per `src-tauri/gen/schemas/acl-manifests.json`, `updater:default` resolves to `{}` (empty set). The extra entry is harmless. The four explicit permissions do the actual ACL work.

#### [INFO-2] Security posture is solid

- `tauri.conf.json`: pubkey non-empty (minisign key present), `dialog: false` preserved, endpoint URL unchanged.
- `lib.rs`: `tauri_plugin_updater::Builder::new().build()` registered before `.run()` ✓. `tauri_plugin_store` and `tauri_plugin_process` both initialized ✓.
- `Cargo.toml`: `tauri-plugin-updater = "=2.10.1"` pinned exactly ✓.
- No wildcard permissions, no hardcoded fallback URLs, no unauthenticated check() surface.
- ACL denial (`BUG-ACL-005`) is handled gracefully with the calm "unavailable" state.

#### [INFO-3] Dark theme clean — no leaks

Every element uses dark-palette tokens (`zinc-*`, `#050505`, `#c5a062`, `#00e6ff`). The only `bg-white` is the toggle thumb (intentional, standard for toggle knobs). Install button `text-[#050505]` on `bg-[#00e6ff]` is correct contrast. Focus ring, disabled states, and progress bar all consistent with the design system.

#### [INFO-4] UI implementation quality is high

ToggleRow component is clean, typed, and accessible (`aria-pressed`, `aria-label`). Cascading disable logic (download requires check, install requires download) is correctly wired in the UI — `disabled={!autoCheck}` and `disabled={!autoDownload}`. Progress bar has correct `role="progressbar"` + `aria-valuenow`. Radio group has `role="radiogroup"`. No TypeScript errors. Default values match the research spec (check=on, download=on, install=off, mode=passive).

---

## Scope Check

- [IN-SCOPE] `components/Settings/AutoUpdateSettings.tsx` — new component, correctly extracted from DesktopSettingsPanel ✓
- [IN-SCOPE] `lib/desktop-config-keys.ts` — UPDATER_KEYS, AUTO_CHECK_ON_STARTUP, AUTO_DOWNLOAD, AUTO_INSTALL, WIN_INSTALL_MODE added ✓
- [IN-SCOPE] `src-tauri/capabilities/default.json` — updater + store permissions ✓
- [IN-SCOPE] `src-tauri/src/lib.rs` — plugin init ✓
- [OUT-OF-SCOPE — MISSING] `UpdateChecker.tsx` wiring to consume new granular settings (backend story)
- [OUT-OF-SCOPE — MISSING] `downloadAndInstall` call updated to pass `installMode` (part of backend story)

---

## Gate Decision

**[FAIL]** — Two critical gaps prevent merge:

1. The new toggle settings are stored but have no effect on startup update behavior — `UpdateChecker.tsx` exclusively reads the legacy `UPDATE_BEHAVIOR` key. Shipping this to users creates a dark-pattern: settings that look functional but do nothing.

2. `WIN_INSTALL_MODE` is persisted but never passed to the install call in either `AutoUpdateSettings.tsx` or `UpdateChecker.tsx`.

The design work itself is high quality — UI is clean, accessible, dark-theme correct, and fully typed. But the feature is incomplete. Both criticals will be addressed by the `auto-update-backend.md` developer story (not yet shipped as of this review).

**Recommended path:** hold this behind a feature flag or do not integrate `AutoUpdateSettings` into the settings page until the backend story ships and a re-review passes. The component code can land; the DesktopSettingsPanel integration should wait.
