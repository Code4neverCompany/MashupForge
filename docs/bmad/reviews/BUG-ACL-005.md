# BUG-ACL-005 — Defensive handling for updater ACL error

## Summary
Maurice reports `plugin:updater|check not allowed by ACL` still fires on
v0.3.1, despite `updater:allow-check` being explicitly listed in
`src-tauri/capabilities/default.json` AND implicitly granted by
`updater:default`. The permission is correct in source, in every tagged
release since v0.2.4, and in the compiled ACL manifest. Suspected
upstream bug in **tauri-plugin-updater v2.10.1** on Windows.

Rather than hack the capability config (which is already correct),
this fix makes the two `updater.check()` call sites defensive: log
loudly with a distinctive prefix, and surface a user-friendly message
in the Settings "Updates" subsection instead of the raw
`plugin:updater|check not allowed by ACL` string.

## Tauri config verification
`tauri.conf.json` `plugins.updater` block — **no `"active": true`
needed**. That was a Tauri v1 field. In v2, the plugin is enabled
solely by being registered in `src-tauri/src/lib.rs:481`
(`.plugin(tauri_plugin_updater::Builder::new().build())`). Current
config is correct:

```json
"plugins": {
  "updater": {
    "endpoints": [ "<github-release-latest-url>" ],
    "dialog": false,
    "pubkey": "<minisign-key>"
  }
}
```

## Changes

### `components/UpdateChecker.tsx`
Launch-time catch now detects `/not allowed by ACL/i` and logs with
`[UpdateChecker]` prefix + explanation. Non-ACL errors log with the
same prefix but without the bug-note paragraph. Behavior downstream
is unchanged — the banner returns `null` on `{kind: 'error'}` either
way, so the user never sees a broken launch-time banner. Manual
Settings → Check Now remains the recovery path.

### `components/DesktopSettingsPanel.tsx` (`UpdatesSection.handleCheckNow`)
Manual-check catch detects ACL errors and swaps the raw message
(`plugin:updater|check not allowed by ACL`) for:

> Auto-update check unavailable — please check for a new release manually.

Non-ACL errors continue to pass through verbatim (network timeout,
plugin missing, etc. are legitimately actionable). Raw detail is
still logged to the console with `[UpdatesSection]` prefix for
debugging.

## Does not crash the panel
- Error state already lives in `result: CheckResult` discriminated
  union; the panel's render path already handles `{kind: 'error'}`
  without a throw. Lines 424-429.
- No `throw` propagates past either try/catch.
- Settings panel remains fully interactive: user can still change
  UPDATE_BEHAVIOR, toggle launch-at-startup, retry Check for updates.

## Tests
- `tsc --noEmit`: clean
- `vitest run`: 271/271 pass (no test changes — the regex is a
  two-line guard around a catch that's already exercised by
  existing tests via the downstream state handling)

## Rationale for not extracting a helper
The detection is a single regex used at exactly two sites. Extracting
to `lib/updater-errors.ts` with a test would be three files for
`/not allowed by ACL/i.test(detail)`. Inlined per "bug fix doesn't
need surrounding cleanup".

## Next steps (not in this commit)
- Wait for Maurice to install v0.3.1 and confirm whether the friendly
  message appears instead of the raw ACL string.
- If the ACL error is reproducible, file an issue with
  `tauri-apps/plugins-workspace` referencing plugin-updater v2.10.1.
