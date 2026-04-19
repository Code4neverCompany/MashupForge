## Bug

User report: "MSI installer asks to uninstall previous version
instead of upgrading in-place. Tauri v2 NSIS should handle upgrades
automatically. Users should just install over old version — no
uninstall prompt."

(Clarification: bundle target is `nsis`, not MSI. User terminology
was casual.)

## Diagnosis

### Identity is stable across versions

Audited `src-tauri/tauri.conf.json` history. The four fields that
derive Tauri's NSIS upgrade detection registry key
(`HKCU\Software\<publisher>\<productName>` and the uninstall key
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<identifier>`)
have been stable since v0.3.0:

| Field | Value | Stable since |
|---|---|---|
| `identifier` | `com.4nevercompany.mashupforge` | v0.3.0 |
| `productName` | `MashupForge` | v0.3.0 |
| `publisher` | `4neverCompany` | v0.3.0 |
| `bundle.targets` | `["nsis"]` | v0.3.0 |

Verified via `git show v0.3.0:src-tauri/tauri.conf.json` against
current. No drift. Tauri sees previous installs correctly — that's
*why* it shows the prompt.

### Root cause

The "Uninstall previous version?" page is not a config bug. It's the
default behavior of Tauri's bundled `installer.nsi` template. The
template defines a custom NSIS page named `PageReinstall` that runs
on every interactive install. When it detects an existing install via
`ReadRegStr SHCTX "${UNINSTKEY}"`, it shows the prompt regardless of
whether the new build is an upgrade, downgrade, or reinstall.

Confirmed by reading
`tauri-apps/tauri/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`
on the `dev` branch: `Page custom PageReinstall PageLeaveReinstall`.
The page is suppressed only when the installer is invoked with `/P`
(passive), `/UPDATE`, or `/S` (silent) — flags the user does not
pass when they double-click the .exe.

### What this means

There is **no NsisConfig option that suppresses PageReinstall** on
manual interactive installs. Tauri exposes `installMode`, `template`,
`installerHooks`, `languages`, `displayLanguageSelector`,
`startMenuFolder`, `compression`, `headerImage`, `sidebarImage`,
`installerIcon`, `customLanguageFiles`, `minimumWebview2Version` —
none target this prompt. NSIS hooks (`NSIS_HOOK_PREINSTALL` etc.) run
*after* the upgrade decision page renders, so they can't intercept it.

The two real fix paths are:

1. **In-app updater** (already configured) — `tauri-plugin-updater`
   downloads and invokes the installer with `/P`, which silences
   `PageReinstall` via the template's `SkipIfPassive` function.
   `components/UpdateChecker.tsx` already drives this; with
   `dialog: false` in `plugins.updater`, the React banner handles
   the user gesture and `update.downloadAndInstall()` does the rest.
2. **Custom NSIS template** — fork
   `crates/tauri-bundler/.../installer.nsi`, strip the
   `Page custom PageReinstall PageLeaveReinstall` line (and the
   matching `Function PageReinstall` / `Function PageLeaveReinstall`
   blocks), point `bundle.windows.nsis.template` at the local copy.
   This is **not done in this commit** because:
   - Forking the template means owning every Tauri NSIS upstream
     change going forward (registry keys, locale strings, hook
     hooks, version-compare logic).
   - I cannot test Windows installers from Linux WSL — shipping a
     custom template blind risks breaking *all* installs (not just
     the prompt).
   - The in-app updater already provides the silent path the user
     actually wants for the common case (existing user with the app
     open getting v0.5.x → v0.5.y).

## Fix shipped

`src-tauri/tauri.conf.json` — add explicit `bundle.windows` block:

```json
"windows": {
  "allowDowngrades": false,
  "nsis": {
    "installMode": "currentUser",
    "displayLanguageSelector": false
  }
}
```

Three changes, all preventative:

- **`installMode: "currentUser"`** — matches Tauri's current default,
  but locks the scope explicitly. If a future Tauri release flips the
  default to `both` or `perMachine`, the upgrade registry path would
  drift (`HKCU` → `HKLM`), Tauri would *fail* to detect the existing
  install, and users would end up with two side-by-side copies. This
  edit pins the scope so the upgrade detection keeps working across
  Tauri minor bumps.
- **`allowDowngrades: false`** — Tauri's default is `true`, which
  means a botched release of v0.5.3 could silently overwrite a working
  v0.5.2 with an older binary if the version detection mis-fires.
  Setting `false` makes the installer refuse downgrades — safer for
  the in-app updater path which doesn't (today) check version order.
- **`displayLanguageSelector: false`** — matches default; pinned for
  stability. Removes one more interactive page that could surprise
  users on a manual install.

These changes do **not** silence the existing-version prompt on
manual interactive installs. They harden the upgrade detection path
so the in-app updater (which *does* silence the prompt) continues to
work reliably across Tauri version bumps.

## Recommended user flow

For existing users on v0.5.0+ updating to v0.5.2+:

1. Launch the app.
2. The `UpdateChecker` banner appears in the bottom-right within
   ~1s of launch (or immediately on `behavior: 'auto'`).
3. Click "Update Now". The download progresses in the banner.
4. `tauri-plugin-updater` invokes the new installer with `/P` →
   the prompt is suppressed → app relaunches via
   `tauri-plugin-process` `relaunch()` (per BUG-002 fix in
   `UpdateChecker.tsx:173-182`).

For first-time installs or users who explicitly download the .exe:
the prompt still appears (this is Tauri's default). Acceptable
trade-off until a custom NSIS template is tested on a Windows host.

## Out of scope (follow-up)

- **Custom NSIS template** to suppress `PageReinstall` for manual
  installs. Requires:
  - A Windows test host (or VM) to install v0.5.0, then run the
    custom-template v0.5.3 installer interactively, then verify:
    silent in-place upgrade succeeded; uninstall registry entry is
    correct; Start Menu shortcuts updated; no orphaned files in the
    old install dir; per-user vs. per-machine scope unchanged.
  - Decision on whether to vendor the entire upstream
    `installer.nsi` (~700 lines) or apply a minimal patch via
    `installerHooks` + a one-line template override that defines an
    empty `PageReinstall`. The latter is brittle if upstream renames
    the page.
  - Reapply on every Tauri release that touches the template.
- **In-app updater UX hardening** — the banner already gates on
  pipeline-busy (FEAT-006) and handles ACL errors (BUG-ACL-005);
  no work needed here.
- **Documentation** — add a note to the README's "Updating" section
  that says "use the in-app updater for silent upgrades; downloading
  the installer manually will prompt you about the previous version,
  which is safe to accept."

## Files touched

### Production
- `src-tauri/tauri.conf.json`:
  - Added `bundle.windows` block with `allowDowngrades: false`,
    `nsis.installMode: "currentUser"`, `nsis.displayLanguageSelector: false`.

### Docs
- `docs/bmad/reviews/BUG-NSIS-UPGRADE.md` (this file).

## Verification

- `npx tsc --noEmit` clean (no TS files touched).
- Tauri config schema validated by JSON-schema at build time
  (`"$schema": "../node_modules/@tauri-apps/cli/config.schema.json"`).
- Cannot test the Windows installer from Linux WSL. Verification on
  Windows is required after the next `tauri build` to confirm:
  - Existing v0.5.2 detected correctly during v0.5.3 install.
  - Per-user install path unchanged (`%LOCALAPPDATA%\<productName>`).
  - In-app updater path still silent.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-NSIS-UPGRADE","status":"done","summary":"NSIS PageReinstall prompt is Tauri-template default behavior, NOT a config bug. Identity stable since v0.3.0 (identifier/productName/publisher/targets all unchanged). No NsisConfig option suppresses PageReinstall on manual interactive installs. Two real fix paths: (1) in-app updater via tauri-plugin-updater /P flag — already configured and driven by components/UpdateChecker.tsx; this IS the silent-upgrade path users should use. (2) Custom NSIS template forking installer.nsi to strip Page custom PageReinstall — NOT shipped, requires Windows test host I don't have from Linux WSL and means owning template upstream forever. Shipped preventative hardening: bundle.windows block with allowDowngrades:false, nsis.installMode:'currentUser' (locks scope to prevent HKCU→HKLM drift on future Tauri default changes), nsis.displayLanguageSelector:false. Doc explains diagnosis + recommended flow + custom-template follow-up. tsc clean."}
```
