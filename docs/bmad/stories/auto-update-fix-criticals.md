# Story: Auto-Update — Fix 2 Critical QA Failures

## Context
QA review (commit 5786ddf) found 2 critical bugs that block merge:

### CRITICAL-1: Granular toggles have no runtime effect
`UpdateChecker.tsx` reads exclusively `UPDATE_BEHAVIOR` to decide startup check and auto-install. The 3 new granular settings (`AUTO_CHECK_ON_STARTUP`, `AUTO_DOWNLOAD`, `AUTO_INSTALL`) are stored but never consumed.

**Fix:** `UpdateChecker.tsx` must read the new keys from config and gate:
- `AUTO_CHECK_ON_STARTUP` → gate the `run()` call on startup
- `AUTO_DOWNLOAD` → gate the auto-download path after check
- `AUTO_INSTALL` → gate `autoInstallRef.current = true`

### CRITICAL-2: WIN_INSTALL_MODE never applied to install call
`AutoUpdateSettings.tsx:266–278` and `UpdateChecker.tsx:216` call `downloadAndInstall()` without passing `installMode`. Tauri updater JS API supports `{ installMode }` option on Windows. Default is `passive` regardless of user selection.

**Fix:** Retrieve `WIN_INSTALL_MODE` from config and pass `{ installMode: winMode }` to `downloadAndInstall()` in both files.

## Files to Modify
- `components/UpdateChecker.tsx` — read new keys, wire gates, pass installMode
- `components/Settings/AutoUpdateSettings.tsx` — pass installMode to downloadAndInstall

## Steps
1. Read `lib/desktop-config-keys.ts` to understand the key names
2. Read `components/UpdateChecker.tsx` to understand the current flow
3. In UpdateChecker:
   - Import `AUTO_CHECK_ON_STARTUP`, `AUTO_DOWNLOAD`, `AUTO_INSTALL` keys
   - Read them from config at startup
   - Gate `run()` call on `AUTO_CHECK_ON_STARTUP`
   - Gate auto-download on `AUTO_DOWNLOAD`
   - Gate `autoInstallRef.current = true` on `AUTO_INSTALL`
   - Read `WIN_INSTALL_MODE` from config and pass to `downloadAndInstall()`
4. In AutoUpdateSettings: pass `winMode` to `downloadAndInstall()`
5. Verify the Tauri updater JS API accepts `{ installMode }` — check `@tauri-apps/plugin-updater` types
6. Run `npm run test -- --run` — all must pass
7. Write completion report to `docs/bmad/reviews/auto-update-fix-criticals.md`

## Acceptance Criteria
- [ ] `AUTO_CHECK_ON_STARTUP=false` disables startup check
- [ ] `AUTO_DOWNLOAD=false` disables auto-download after check succeeds
- [ ] `AUTO_INSTALL=false` disables auto-install (user must confirm)
- [ ] `WIN_INSTALL_MODE=basicUi` → `downloadAndInstall({ installMode: 'basicUi' })` called
- [ ] 824/824 tests pass
