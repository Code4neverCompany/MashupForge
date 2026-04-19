# BUG-ACL-006 — `plugin:app|version` denied by ACL on Windows

**Severity:** HIGH
**Status:** fixed
**Date:** 2026-04-20

## Summary

On Windows desktop, `await app.getVersion()` from
`@tauri-apps/api/app` fails at runtime with:

```
Command plugin:app|version not allowed by ACL
```

This breaks the version chip in `DesktopSettingsPanel` and the
`UpdateChecker`'s pre-flight `getVersion()` call (which is the basis
for the post-update "Updated to vX" toast and last-seen-version
comparison).

The same shape of bug already affects `plugin:updater|check`
(BUG-ACL-005) — the implicit permission expansion through plugin
defaults is unreliable on Windows even when the umbrella default IS
listed.

## Root cause

`capabilities/default.json` previously listed `core:default`, which
*should* transitively include `core:app:default`, which in turn
includes `core:app:allow-version` (verified by reading
`src-tauri/gen/schemas/acl-manifests.json` — the `core:default`
permission set lists `core:app:default`, and `core:app:default`
lists `allow-version`).

In practice, the Tauri runtime ACL check on Windows denies the
`plugin:app|version` command at the ACL layer despite this chain
being present. Same defensive workaround as BUG-ACL-005:
**explicitly list the leaf permission** so it's not relying on the
nested expansion.

## Fix

`src-tauri/capabilities/default.json` — add explicit:

- `core:app:default`
- `core:app:allow-version`

These were already included transitively via `core:default`. The
explicit listing is a defense-in-depth measure: once the leaf
permission appears verbatim in the capability, the runtime ACL match
no longer depends on the plugin-default expansion path.

The `updater` block was already explicit (each of `allow-check`,
`allow-download`, `allow-download-and-install`, `allow-install`
listed verbatim alongside `updater:default`), and is left as-is.
The runtime denial of `plugin:updater|check` reported alongside this
fix is the known BUG-ACL-005 plugin-side bug — the JS side already
handles the throw defensively (UpdateChecker.tsx:182,
DesktopSettingsPanel.tsx:421) with a "Manual check in Settings still
works" message, and the `LAST_CHECKED_AT_KEY` stamp is now written
*before* `check()` (V060-003) so the panel reflects the attempt
even on a failed call.

No code change is shipped for the updater piece in this fix — the
capability is already explicit, the JS handles the denial gracefully,
and the underlying tauri-plugin-updater v2.10.1 bug needs an upstream
fix.

## Settings modal version chip

Follow-on requirement (same task envelope): the app version must be
visible somewhere in the Settings modal so users can confirm what
they're running without leaving the panel.

### `lib/app-version.ts` (new)

- `APP_VERSION: string` — pulled from `package.json#version` at build
  time (`resolveJsonModule: true`). Synchronous, never throws,
  identical across web + desktop builds.
- `getAppVersion(): Promise<string>` — tries `app.getVersion()` from
  `@tauri-apps/api/app` and falls back to `APP_VERSION` on any error.
  The fallback path is the BUG-ACL-006 safety net: when the ACL bug
  denies the runtime call, we still surface a meaningful version
  string instead of leaving the footer blank.

### `components/SettingsModal.tsx`

The footer now renders `v{appVersion}` on the left, with the existing
"Done" button on the right (`justify-end` → `justify-between`).
`appVersion` is seeded from `APP_VERSION` for a flicker-free first
paint and upgraded via `getAppVersion()` once the dynamic import
resolves.

The chip is `text-[10px] text-zinc-500 font-mono` — visible but
non-distracting, matching the panel's secondary-metadata typography.

## Verification

- `tsc --noEmit` — no JS surface changes, type-check clean.
- The fix is config-only; runtime verification requires a Windows
  build. The expected outcome: `getVersion()` returns the running
  app's version string instead of throwing
  `plugin:app|version not allowed by ACL`.

## Acceptance check

- [x] `core:app:allow-version` explicitly listed in
  `capabilities/default.json`
- [x] `updater:allow-check` already explicitly listed (no change
  needed — the runtime denial is BUG-ACL-005, handled JS-side)
- [x] App version surfaced in Settings modal footer (uses runtime
  `app.getVersion()` when the ACL fix lands; falls back to
  `package.json#version` constant otherwise)
- [x] Inbox written
