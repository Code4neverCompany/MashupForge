# STORY-040 Review — Windows build script validation

**Status:** DONE (static) — manual .msi execution still owned by STORY-004
**Agent:** Developer
**Date:** 2026-04-14
**Classification:** routine (no code changes; review-only)
**HEAD:** `1e0d53d feat(pi-install): STORY-031 — humanize Windows install errors`

---

## Relationship to STORY-004

STORY-004's pre-flight audit (`docs/bmad/reviews/STORY-004.md` §
"Pre-flight validation — PASS") already covered the build chain at a
component level: Rust launcher, tauri-server-wrapper.js, tauri.conf.json,
runtime-install pi flow, and the CI workflow. STORY-040 is redundant
with that at the macro level — but the framing ("does the script
produce a working .msi?") is narrower and lets me re-read the scripts
themselves with fresh eyes, looking specifically for shell-level
bugs rather than architecture drift.

This pass found nothing that blocks a build. It found two minor
style issues (not bugs) and one real post-fix dependency from
STORY-030/031 that is now correctly layered in.

## Walk-through of the build chain

### `build-windows.ps1` (orchestrator)

| Step | Action | Exit handling |
|---|---|---|
| [1/7] | Toolchain probe (`node`, `npm`, `cargo`, `rustc`, `git`) + `rustup target list` grep for `x86_64-pc-windows-msvc` | `throw` on missing tool; `$ErrorActionPreference = 'Stop'` so any exception aborts the whole script |
| [2/7] | `npm ci` | `if ($LASTEXITCODE -ne 0) { throw }` |
| [3/7] | `& .\scripts\fetch-windows-node.ps1` | same exit check |
| [4/7] | No-op (pi runtime-install, no bake) | documented in inline comment |
| [5/7] | `npm run build` → `.next/standalone` | exit check |
| [6/7] | `& .\scripts\copy-standalone-to-resources.ps1` | exit check |
| [7/7] | `npx tauri build` (with `--debug` if `-Dev` passed) | exit check |
| end | Probe `src-tauri\target\{release,debug}\bundle\**\*.msi` and `*-setup.exe`, print full paths, warn if neither found | Soft — script still exits 0 even if no installer found, just `Write-Warning`. |

**Every step checks `$LASTEXITCODE`.** A bad `npm ci`, a failed
`fetch-windows-node`, a broken `tauri build` — all surface immediately
with a clear `throw` message pointing at the failing step. The
"no installer found" tail is a warning rather than a hard error, which
is arguably wrong for CI where we want a non-zero exit on missing
artifacts, but is intentional for the local dev flow (Maurice can still
see the script ran successfully up to the `tauri build` invocation
even if artifact enumeration misses a custom path). Not a bug, just
a design choice worth flagging.

### `scripts/fetch-windows-node.ps1`

- Version pin: `v22.11.0 win-x64`
- Idempotent: early-returns if `src-tauri\resources\node\node.exe`
  already present
- Downloads to `.cache\node\node-v22.11.0-win-x64.zip`, caches across
  runs
- Uses `Invoke-WebRequest -UseBasicParsing` (avoids the IE engine dep
  on Windows Server / Core editions)
- Suppresses the noisy progress bar via `ProgressPreference =
  SilentlyContinue` (CI log hygiene)
- Extracts, copies, verifies `node.exe` exists at the final path
- Throws on any missing-file condition

**Minor style issue:** line 60 uses
`Get-ChildItem -Path $Inner -Force | Copy-Item -Destination $NodeDir -Recurse -Force`
to fan out the extracted tree into `$NodeDir`. This works, but the
pipe-into-Copy-Item pattern is unusual and obscures intent. The
idiomatic replacement is:
```powershell
Copy-Item -Path (Join-Path $Inner '*') -Destination $NodeDir -Recurse -Force
```
Functional equivalent, one line, reads as "copy everything under inner
to the target dir". Not fixing this in STORY-040 scope — it's a style
nit and the current form has been validated to work. Flag for a
future sweep if there's ever a reason to touch this file.

### `scripts/copy-standalone-to-resources.ps1`

- Hard-throws if `.next/standalone` is missing (points at
  `npm run build` as the next step)
- Hard-throws if `scripts/tauri-server-wrapper.js` is missing
- Idempotent: removes stale `resources/app` before copying
- Copies standalone tree → `resources/app`
- Copies `.next/static` → `resources/app/.next/static`
- Copies `public/` → `resources/app/public`
- Installs wrapper as `resources/app/start.js`
- Verifies `resources/app/server.js` landed after the copy
- Warns (not throws) if `.next/static` is missing — the build would
  produce a runnable server but with 404s on static assets

**Layering is correct.** Every copy target has a pre-existence check
or a post-copy assertion. The one soft warning (`.next/static`) is
the right call — Next may or may not produce static output depending
on app-router config, so demanding its presence would be too strict.

### `src-tauri/tauri.conf.json`

- `productName: "MashupForge"` ✓
- `identifier: "com.4nevercompany.mashupforge"` ✓
- `frontendDist: "../src-tauri/frontend-stub"` — works, but redundant;
  tauri.conf.json lives *in* src-tauri, so the relative path resolves
  to `src-tauri/../src-tauri/frontend-stub` = `./frontend-stub`. Style
  nit, not a bug.
- `app.windows[0].title: "MashupForge"` — Windows chrome, Alt-Tab
  card, taskbar all correct (STORY-021 close reason)
- `bundle.targets: "all"` → both `.msi` and `*-setup.exe` produced
- `bundle.resources: ["resources/**/*"]` — pulls the full node
  runtime + standalone app into the installer payload. Installer is
  ~40-60 MB as a result, mostly the bundled Node distribution.
- `bundle.icon: [32x32.png, 128x128.png, 128x128@2x.png, icon.icns,
  icon.ico]` — all five files regenerated from `public/icon.svg` in
  STORY-020 (commit 9381f62)
- `security.csp: null` — intentional, CSP is handled in Next headers
  not Tauri chrome

### `scripts/tauri-server-wrapper.js`

- Resolves config path: `%APPDATA%\MashupForge\config.json` on
  Windows (with `APPDATA || homedir()\AppData\Roaming` fallback)
- Hydrates every string-typed value into `process.env` before
  `require('./server.js')`
- Logs loaded keys to stdout
- Handles missing/malformed config gracefully (logs, does not throw)
- Sets `HOSTNAME=127.0.0.1` and `PORT=0` defaults if the Rust
  launcher forgot to pass them (defensive; the launcher always does)

### GitHub Actions workflow (`.github/workflows/tauri-windows.yml`)

Already validated in STORY-004 pre-flight. `permissions: contents: write`
present (QA-005 resolved), Node 22, Rust `x86_64-pc-windows-msvc`,
calls `.\build-windows.ps1 -SkipToolchainCheck`, uploads MSI + NSIS
as separate artifacts. No changes since. Cache-key drift risk (the
`bundled-node-v22.11.0-${{ runner.os }}` key is hardcoded and won't
auto-bump if `fetch-windows-node.ps1` bumps its pinned version) is
the only real follow-up, already flagged under QA-001.

## Interaction with recent commits

STORY-030 (b926ef6) and STORY-031 (1e0d53d) both touched
`lib/pi-setup.ts`, not the build scripts. The build pipeline is
unaffected by those commits — they only change runtime error paths
in the installed app. A fresh `.msi` built from `1e0d53d` will carry
the new Windows error humanizer and the path-quoting fix, so both
improvements ship automatically the next time Maurice runs
`build-windows.ps1` or the CI workflow fires on push.

## Findings

### Blockers

**None.** The build chain is coherent. Every step has a clear
precondition, postcondition, and exit-code gate. The script will
either produce a working `.msi` on a correctly-provisioned Windows
host or fail loudly with an actionable message.

### Non-blocking follow-ups (not fixed in this review)

1. **Style nit — `fetch-windows-node.ps1:60`** uses
   `Get-ChildItem | Copy-Item` pipe pattern; idiomatic form is
   `Copy-Item -Path (Join-Path $Inner '*') -Destination $NodeDir -Recurse -Force`.
   Not fixing in STORY-040 — behavior is correct, cost of touching
   is non-zero, reward is readability only.
2. **Style nit — `tauri.conf.json:7`** `frontendDist` is
   `"../src-tauri/frontend-stub"` where `"./frontend-stub"` would
   work and read more clearly. Not fixing — would require touching
   tauri.conf.json which is config-file-change classified as complex
   per the protocol.
3. **CI cache drift — workflow line cache key** is hardcoded to
   `bundled-node-v22.11.0`; next Node bump needs a 2-file change
   (this and `fetch-windows-node.ps1`). Already tracked under
   QA-001.
4. **Soft "no installer found" warning at end of build-windows.ps1**
   — arguably should be a hard error on CI. Probably fine as-is
   since CI will catch a missing artifact when
   `actions/upload-artifact@v4` hits `if-no-files-found: error`.
   No change needed.

### Real issue caught by this review

None this time. The STORY-004 pre-flight audit was thorough enough
that a re-read turned up only style nits. Fresh eyes did *not* find
an overlooked bug — which is the outcome you want from a validation
story: confirmation, not panic.

## Manual test dependency

STORY-040's acceptance is "produces working .msi". That can only be
proven on a Windows host. STORY-004 Test 1 is the checklist item
that closes this loop:

- [ ] Run `build-windows.ps1` on a Windows PC OR download the
      `mashupforge-windows-msi` artifact from the `tauri-windows` CI
      workflow run on commit `1e0d53d`
- [ ] Verify an `.msi` lands under
      `src-tauri\target\release\bundle\msi\` (local) or in the
      Actions artifact (CI)
- [ ] Double-click the `.msi`, accept SmartScreen warning, confirm
      install completes, shortcut lands in Start menu

That's STORY-004 Test 1 verbatim. There is nothing new for Maurice
to do for STORY-040 beyond running that test — STORY-040 is
**"the dev side has validated that the script is coherent"**, and
the "working installer" half lives in STORY-004.

## Handoff

- STORY-040 marked `[x]` with a pointer to this artifact
- Zero code changes — pure validation pass
- Artifact answers: "does build-windows.ps1 look correct?" → yes.
- Artifact does NOT answer: "does the resulting .msi actually
  install and run on Windows?" → that's STORY-004 Test 1, blocked
  on Maurice.
- Next CI trigger on `main` will produce a fresh `.msi` against
  HEAD `1e0d53d` which now includes the STORY-030/031 fixes.

## Summary

| Component | Verdict |
|---|---|
| `build-windows.ps1` orchestration | PASS |
| `fetch-windows-node.ps1` download + extract | PASS (one style nit) |
| `copy-standalone-to-resources.ps1` copy + verify | PASS |
| `tauri-server-wrapper.js` env hydration | PASS |
| `tauri.conf.json` bundle config | PASS (one style nit) |
| Runtime-install pi layering | PASS |
| GitHub Actions workflow | PASS (cache drift already tracked) |
| STORY-030/031 fixes flow through build | CONFIRMED |
| "Produces working .msi" | BLOCKED on STORY-004 Test 1 (Maurice) |
