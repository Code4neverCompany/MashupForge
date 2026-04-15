# QA Review — QA-PROP-005 (Tauri auto-launch on startup)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** 39ede19

## Findings

### `src-tauri/src/lib.rs`
- [INFO] `tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None)` registered in
  the plugin chain. `None` = no args passed to the app on autostart. ✓
- [INFO] Plugin is registered unconditionally — Tauri handles no-op on unsupported
  platforms. On Windows it writes to HKCU run key (user-space only, no UAC). ✓

### `src-tauri/capabilities/default.json`
- [INFO] Three permissions added: `autostart:allow-enable`, `autostart:allow-disable`,
  `autostart:allow-is-enabled`. Minimal — only the three operations the UI needs. ✓
- [INFO] No wildcard capability (`autostart:default` or `autostart:*`) used. ✓

### `components/DesktopSettingsPanel.tsx` — `useAutolaunch` hook
- [INFO] Dynamic import: `import('@tauri-apps/plugin-autostart')` wrapped in try/catch.
  If import fails (web build, Vercel, dev without Tauri), `getAutostartPlugin()` returns
  `null` and all operations no-op silently. Web build never bundles the plugin. ✓
- [INFO] `if (!isDesktop) return` guard in `useEffect` — plugin query never fires outside
  Tauri context. ✓
- [INFO] `cancelled` flag in `useEffect` prevents state update after component unmount
  (isMounted pattern). ✓
- [INFO] Toggle renders only when `autolaunch.enabled !== null` — hides the control until
  the initial `isEnabled()` query resolves. No flickering "off" state before the real
  state is known. ✓
- [INFO] `aria-pressed` + `aria-label` on toggle button — accessibility correct. ✓
- [INFO] Default off: `enabled` starts as `null` (hidden), then reflects whatever
  `plugin.isEnabled()` returns (which will be `false` on first run). Model C UX satisfied —
  opt-in, never silently auto-enabled. ✓

### Security
- [INFO] Auto-launch modifies HKCU (user-space only). No privilege escalation. ✓
- [INFO] Matches security review from AUDIT-010 — no new privilege surface introduced.

## Gate Decision

PASS — Correct Model C implementation. Dynamic import prevents web-build bundling.
`isDesktop` guard prevents plugin calls outside Tauri. Default off, opt-in toggle, correct
accessibility. Capabilities minimal. No privilege escalation.
