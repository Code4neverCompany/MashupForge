# FEAT-PORTABLE-ZIP — portable no-install bundle alongside NSIS .exe

**Status:** done (CI step shipped, requires Windows-side validation on next release)
**Classification:** complex (CI workflow + user expectation about premise)

## Premise correction

User asked for `bundle.targets: ["nsis", "portable"]`. Tauri v2 does
**not** have a `"portable"` bundle target. Verified against
`node_modules/@tauri-apps/cli/config.schema.json` —
`BundleType` enum is exactly:

```
deb, rpm, appimage, msi, nsis, app, dmg
```

No `"portable"`, no `"zip"`. Adding `"portable"` to `bundle.targets`
would fail JSON-schema validation at `tauri build`. The closest
existing options are:

- `"msi"` — still an installer (worse than NSIS for upgrades).
- `"app"` / `"dmg"` — macOS only.

So a real "extract and run" portable build has to be assembled
*outside* `tauri build`, by post-processing the raw cargo output.

## Approach

Add a CI step after `tauri build` that:
1. Takes the raw Rust binary at
   `src-tauri/target/release/app.exe` (cargo `[package].name = "app"`,
   so the binary keeps the cargo name; the NSIS bundler renames it to
   `MashupForge.exe` only during packaging).
2. Renames it to `MashupForge.exe` (user-facing name).
3. Copies the populated `src-tauri/resources/` tree alongside it
   (`node/node.exe`, `app/start.js`, `app/server.js`, `app/.next/`,
   `app/node_modules/`, etc — same layout the installed app uses).
4. Copies `WebView2Loader.dll` from `target/release/` next to the
   exe (best-effort: warn if missing, since Tauri 2.x sometimes
   statically links it).
5. Zips the staged tree and uploads to the GitHub release alongside
   the NSIS installer.

The result: `MashupForge_<version>_x64-portable.zip`. User downloads,
extracts anywhere (incl. USB stick), double-clicks `MashupForge.exe`.
No installer prompt, no registry entries, no uninstaller. Settings
land in `%APPDATA%\com.4nevercompany.mashupforge\` as usual (Tauri's
`app_data_dir()` is OS-level, not install-relative).

## Why this layout works

`src-tauri/src/lib.rs:520+` (the `setup` closure) calls
`app.path().resource_dir()` to find resources. On Windows release
builds Tauri returns the executable's parent directory. So extracting
the zip to *any* directory and running `MashupForge.exe` from there
makes `resource_dir()` point at the extract dir, where `resources/`
sits next to the exe — the same layout the installed app uses
(see `src-tauri/resources/README.md` for the on-disk tree).

The lib.rs `find_resource_subdir` helper tries both `<root>/<name>`
and `<root>/resources/<name>` (STORY-110), so we're insulated from
Tauri's globbing decision.

## Risks

I cannot test Windows installers or portable executables from Linux
WSL. Potential failure modes on first Windows-side run:

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing `WebView2Loader.dll` → webview won't init | Medium | Step copies it if present; warns loud if not |
| Missing VC++ redist on host → exe won't link | Low | Tauri requires WebView2 runtime which usually pulls VCRedist; documented as user prereq |
| Unsigned exe → SmartScreen "unrecognized app" prompt | Certain | Same as the NSIS installer today; signing applies to the .exe whether wrapped in NSIS or shipped raw |
| Tauri resource resolution differs in non-installed mode | Low | `lib.rs` uses `app.path().resource_dir()` which on Windows is always exe-relative; verified by reading the Tauri source. The `find_resource_subdir` probe covers both layouts |
| Missing files I'm not aware of | Medium | Log every staged file in CI; if launch fails on Windows, `startup.log` will show the missing file path |

The release upload is **best-effort**: a missing portable zip will
emit a CI warning but not fail the release. The NSIS installer is
the canonical distribution; portable is a convenience.

## Files touched

### CI
- `.github/workflows/tauri-windows.yml`:
  - Added "Stage and zip portable build" step between
    "Synthesize latest.json" and "Upload build artifacts" in the
    `build` job. PowerShell because the build runs on
    `windows-latest`. Renames `app.exe` → `MashupForge.exe`,
    copies `resources/` and `WebView2Loader.dll`, zips to
    `bundle/nsis/MashupForge_<version>_x64-portable.zip` so it
    rides along in the existing `tauri-nsis-bundle` artifact.
  - Added portable-zip upload to the existing `gh release upload`
    block in the `upload` job. Best-effort: missing zip → warning,
    not error.

### Docs
- `docs/bmad/reviews/FEAT-PORTABLE-ZIP.md` (this file).

## Verification

- **Local:** YAML linted by GitHub on push (no local lint runs).
  Existing CI structure unchanged; the new step is additive.
- **Cannot test Windows-side from Linux WSL.** First validation
  happens on the next tagged release. If the portable zip's
  `MashupForge.exe` fails to launch:
  1. Check that the staging dir copy succeeded (CI log shows
     `Get-ChildItem $zipPath`).
  2. Extract the zip on Windows; check `startup.log` after launch
     attempt — it'll point at the missing resource.
  3. Most likely fix: the portable zip needs an additional
     Tauri-emitted file from `target/release/` (e.g. a sidecar DLL
     I didn't account for). Add it to the staging Copy-Item block.

## Out of scope

- **Code-signing the portable .exe.** The cargo-built `app.exe` is
  signed during `tauri build` if the signing env vars are set
  (`TAURI_SIGNING_PRIVATE_KEY` is for the *updater* signature — a
  separate concern from Authenticode signing). Authenticode signing
  is not currently configured for either NSIS or portable; both
  trip SmartScreen on fresh Windows installs. Out of scope here.
- **Linux portable.** Tauri's `appimage` target already produces a
  single-file portable artifact on Linux. We don't currently build
  Linux releases (`runs-on: windows-latest` only).
- **macOS portable.** Tauri's `app` target produces a `.app` bundle
  that's already drag-to-extract. Not building macOS releases.
- **Updater integration with portable mode.** The in-app updater
  invokes the NSIS installer to update — it cannot in-place upgrade
  a portable extraction. A portable user who wants the latest
  version downloads the new portable zip manually. Documented as
  expected behavior; no fix needed.

## Hermes inbox envelope

```
{"from":"developer","task":"FEAT-PORTABLE-ZIP","status":"done","summary":"Premise correction: Tauri v2 does NOT have a 'portable' bundle target. Verified against config.schema.json BundleType enum: only deb, rpm, appimage, msi, nsis, app, dmg. Adding 'portable' to bundle.targets would fail tauri build. Real portable build is assembled OUTSIDE tauri build by post-processing raw cargo output. Shipped: new 'Stage and zip portable build' CI step in .github/workflows/tauri-windows.yml that takes src-tauri/target/release/app.exe (cargo binary), renames to MashupForge.exe, copies resources/ tree + WebView2Loader.dll into staging dir, zips to MashupForge_<version>_x64-portable.zip in the existing nsis bundle dir so it rides the existing artifact upload. Upload step adds best-effort gh release upload of the zip (missing → CI warning, not error; NSIS installer is canonical). Layout matches lib.rs resource_dir() expectation: exe + resources/ next to it; works because Tauri's resource_dir() returns exe parent on Windows release. CANNOT test from Linux WSL — first Windows-side validation happens on next tagged release. If launch fails, startup.log will identify the missing resource. Code signing remains separate concern (out of scope). Risk-mitigation table in the review doc."}
```
