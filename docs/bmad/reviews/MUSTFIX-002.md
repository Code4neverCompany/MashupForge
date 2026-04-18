# MUSTFIX-002 — Migrate AUTO_UPDATE_ON_LAUNCH='off' → UPDATE_BEHAVIOR='off'

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
FEAT-006 replaced the binary `AUTO_UPDATE_ON_LAUNCH` (`on`/`off`) key with the tri-state `UPDATE_BEHAVIOR` (`auto`/`notify`/`off`). The new key defaults to `notify` when missing. That means any user who had explicitly opted out on v0.2.1 (`AUTO_UPDATE_ON_LAUNCH=off` in `config.json`) would, after upgrading, silently regress to seeing update banners — the exact opposite of what they chose. Fix: one guarded assignment in the GET handler that carries the opt-out forward in the response payload.

## Root cause
- FEAT-006 removed `AUTO_UPDATE_ON_LAUNCH` from `DESKTOP_CONFIG_KEYS` with no back-compat shim (per instruction "no production users yet" at the time).
- Real v0.2.1 installations that followed the docs' "disable auto-update" path wrote `AUTO_UPDATE_ON_LAUNCH=off` to `config.json`.
- `GET /api/desktop/config` surfaces every string key it finds on disk, but the frontend and the launch-time `UpdateChecker` only read `keys.UPDATE_BEHAVIOR`. Absent → `UPDATE_BEHAVIOR_DEFAULT = 'notify'`.
- Net effect on upgrade: opt-out gets silently undone.

## Fix
`app/api/desktop/config/route.ts` (GET handler):

```ts
if (keys.UPDATE_BEHAVIOR === undefined && keys.AUTO_UPDATE_ON_LAUNCH === 'off') {
  keys.UPDATE_BEHAVIOR = 'off';
}
```

Applied after reading the on-disk file, before the JSON response. Three lines plus a comment block explaining the migration.

## Design notes

**Why only transform the response, not rewrite the file?**
- Keeps GET read-only — simpler, no filesystem write on every launch.
- PATCH already writes only `DESKTOP_CONFIG_KEYS` entries and drops unknown keys implicitly (allowlist at line 109). The first time a user touches any setting in the desktop panel, `AUTO_UPDATE_ON_LAUNCH` gets pruned and `UPDATE_BEHAVIOR` is persisted. Natural transition, no dedicated write path required.
- Until then, the legacy key sits on disk as dead data but never surfaces to the UI (since we project it into `UPDATE_BEHAVIOR`).

**Why not also migrate `AUTO_UPDATE_ON_LAUNCH='on'` → `UPDATE_BEHAVIOR='auto'`?**
- `on` was the previous default and the semantics matched `'notify'` (old behavior was "show banner at launch"), not `'auto'` (new silent install). Mapping `on` → `auto` would be an unintended behavior escalation — a quiet user suddenly gets silent background installs. Doing nothing leaves them on the new `'notify'` default, which is closer to their prior experience. The only user group that's *actively worse off* by doing nothing is the opt-outs, and that's what this migration addresses.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Old `AUTO_UPDATE_ON_LAUNCH='off'` maps to `UPDATE_BEHAVIOR='off'` in GET response | done — `route.ts:58-60` |
| No effect when `UPDATE_BEHAVIOR` already present | done — guarded by `=== undefined` |
| No effect for `AUTO_UPDATE_ON_LAUNCH='on'` (avoid behavior escalation) | done — only `'off'` branches |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| Write FIFO when done | pending (this commit) |

## Files touched
- `app/api/desktop/config/route.ts` (+11 / -0 including comment)

## Verification path
Cannot exercise on WSL without the bundled app. Runtime check for when v0.2.3 ships:
1. On a machine with v0.2.1 that had "disable auto-update" chosen, `%APPDATA%\com.4nevercompany.mashupforge\config.json` will contain `"AUTO_UPDATE_ON_LAUNCH": "off"`.
2. Install v0.2.3 over the top, launch.
3. No update banner should appear. Settings → Updates shows "Off" selected.
4. Toggle to any other option and back to "Off" — on-disk file now has `"UPDATE_BEHAVIOR": "off"` and no `AUTO_UPDATE_ON_LAUNCH` key (PATCH prunes unknowns via `DESKTOP_CONFIG_KEYS` allowlist).
