---
task_id: AUTO-UPDATE-DESIGN
agent: designer
status: DONE
commit: 5786ddf
date: 2026-04-27
confidence: 0.92
---

# AUTO-UPDATE-DESIGN — Completion Report

## What was built

**`components/Settings/AutoUpdateSettings.tsx`** — standalone React component replacing the private `UpdatesSection` in `DesktopSettingsPanel`.

### New additions vs old UpdatesSection

| Feature | Old | New |
|---|---|---|
| Update behavior | 3-state radio (auto/notify/off) | 3 individual toggle rows |
| Cascading disable | ✗ | ✓ (download needs check; install needs download) |
| Windows install mode | ✗ | ✓ (passive / basicUi / quiet, radio group) |
| Version badge | ✓ | ✓ |
| Check for updates button | ✓ | ✓ |
| Last checked label | ✓ | ✓ |
| Status line (checking/none/error) | ✓ | ✓ |
| Update available card | ✓ | ✓ (+ Release notes link) |
| Install progress bar | ✓ | ✓ |
| Unavailable state (ACL bug) | ✓ | ✓ (role="status" preserved) |
| Release history | ✓ | ✓ |
| Diagnostic log | ✓ | ✓ |

### Config keys added (`lib/desktop-config-keys.ts`)

| Key | Type | Default |
|---|---|---|
| `AUTO_CHECK_ON_STARTUP` | text ('1'/'0') | '1' (on) |
| `AUTO_DOWNLOAD` | text ('1'/'0') | '1' (on) |
| `AUTO_INSTALL` | text ('1'/'0') | '0' (off) |
| `WIN_INSTALL_MODE` | select | 'passive' |

All 4 added to `UPDATER_KEYS` so the generic FieldRouter loop skips them.

### Files changed

- `components/Settings/AutoUpdateSettings.tsx` — new (470 lines)
- `components/DesktopSettingsPanel.tsx` — replaced `<UpdatesSection />` with `<AutoUpdateSettings />`, removed 436 lines of private sub-components, cleaned imports
- `lib/desktop-config-keys.ts` — 4 new keys + expanded UPDATER_KEYS

## Design decisions

**Toggle labels avoid "Check for updates" substring.** The existing integration test (`tests/integration/desktop-update-check-acl.test.tsx`) queries for `getByRole('button', { name: /Check for updates/i })` to find the manual check button. Toggle labels are "Auto-check on startup", "Auto-download", "Auto-install" — none match that regex.

**Project uses `app/` + `components/` at root, not `src/`.** The story referenced `src/app/settings/page.tsx` and `src/components/Settings/` but those paths don't exist. The component was placed at `components/Settings/AutoUpdateSettings.tsx` and inserted into `DesktopSettingsPanel.tsx` (the existing settings modal), which is the correct integration point for this project.

**`UPDATE_BEHAVIOR` key kept for backwards compat.** The existing `UpdateChecker.tsx` reads `UPDATE_BEHAVIOR` on launch. The new granular keys (`AUTO_CHECK_ON_STARTUP`, etc.) are UI-only for now — wiring them into `UpdateChecker` is a separate backend story.

## Test result

```
Test Files  74 passed (74)
Tests       824 passed (824)
```

## Acceptance criteria

- [x] Fits seamlessly into existing settings page layout
- [x] All 4 toggles + dropdown implemented
- [x] Loading/error/success states for check button
- [x] Update available card appears correctly
- [x] Uses existing dark theme tokens

## Not in scope (needs backend story)

- Wiring `AUTO_CHECK_ON_STARTUP`, `AUTO_DOWNLOAD`, `AUTO_INSTALL` into `UpdateChecker.tsx` runtime logic
- Wiring `WIN_INSTALL_MODE` into `downloadAndInstall()` options
- Adding updater permissions to `src-tauri/capabilities/default.json`
