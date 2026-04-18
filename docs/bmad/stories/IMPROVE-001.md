# IMPROVE-001 — Self-hosted NSIS CI (Ubuntu)

**Status:** research complete → recommendation: phased, not immediate
**Classification:** complex (CI workflow change, new build dependency, risk to release path)
**Date:** 2026-04-18

---

## Goal

Automated Windows `.exe` installer builds without a Windows CI runner
(or, locally, without a Windows toolchain). Motivation: `windows-latest`
GitHub Actions minutes cost 2× Linux minutes on private repos, cold
Tauri builds run ~15–20 min, and the current CI is the only path to a
signed release artifact.

The original task framing — "install NSIS on Ubuntu, run `makensis` on
the installer script, upload the `.exe`" — over-simplifies the build.
`makensis` alone cannot produce our installer; Tauri orchestrates the
Rust compile → resource pack → `installer.nsi` synthesis → `makensis`
invocation as one pipeline. So "self-hosted NSIS CI on Ubuntu" is
really "cross-compile the whole Tauri bundle on Ubuntu."

---

## Can it be done? — Yes, with caveats

Tauri v2 officially supports building the Windows NSIS installer from
Linux via `cargo-xwin` as the build runner.

### Packages needed on the runner

```bash
sudo apt install -y nsis lld llvm clang jq
cargo install --locked cargo-xwin
rustup target add x86_64-pc-windows-msvc
```

Ubuntu's `nsis` package includes the Stubs/Plugins Tauri needs
(Fedora does not — manual install required there).

### Build invocation

```bash
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
```

Output lands at
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`.

### Confirmed-working pieces

- **Minisign updater signing** (`TAURI_SIGNING_PRIVATE_KEY` + password):
  minisign is cross-platform. The `.exe.sig` is produced identically
  on Linux. Our updater endpoint consumes this signature verbatim,
  so no release-format change.
- **`npm install --os=win32 --cpu=x64 @img/sharp-win32-x64 @next/swc-win32-x64-msvc`:
  npm's `--os`/`--cpu` flags already work on Linux. The existing
  workflow step ports as-is.
- **Next.js standalone build**: platform-agnostic.

### Not supported / out of scope

- **Authenticode code-signing** (EV cert via `signtool.exe`) — Linux
  cannot run `signtool`. Currently we don't code-sign anyway (SmartScreen
  warning is accepted; Phase 3 in `WINDOWS-BUILD.md`), so this is not
  a regression.
- **`.msi` via WiX** — Linux cannot run WiX. We don't ship `.msi`
  either (see `tauri.conf.json` → `bundle.targets: ["nsis"]`), so
  again not a regression.

---

## Project-specific blockers

Our `tauri-windows.yml` has two steps that are PowerShell-only and
must be ported before a Linux runner can succeed:

1. **`scripts/fetch-windows-node.ps1`** — downloads Node.js 22 LTS
   Windows portable into `src-tauri/resources/node/`. Needs a bash
   equivalent that `curl`s the `node-v22.x.x-win-x64.zip` tarball
   and `unzip`s it.
2. **`scripts/copy-standalone-to-resources.ps1`** — copies
   `.next/standalone/*`, `.next/static/*`, `public/*` into
   `src-tauri/resources/app/` and drops in `tauri-server-wrapper.js`.
   Trivial bash port (`cp -r`).

The strip-non-Windows-sharp step is already a generic shell snippet
in spirit — just re-expressed from `Get-ChildItem` to `find … -delete`.

Estimated port effort: **half a day**, one PR.

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Cross-compile produces subtly broken binary (e.g. mismatched CRT, WebView2 interop) | High | Dual-build for N releases: ship windows-latest artifact, archive ubuntu-latest artifact, diff + smoke-test side-by-side before cutover |
| `cargo-xwin` pulls Microsoft SDK headers on first run (license click-through) | Low | `cargo-xwin` handles EULA acceptance non-interactively via `XWIN_ACCEPT_LICENSE=1` |
| NSIS plugin compatibility (`tauri` auto-injects plugins into `installer.nsi`) | Medium | Covered by Ubuntu's `nsis` package per Tauri docs; validate with a real bundle before trusting |
| `makensis` version drift between Ubuntu LTS and what Tauri expects | Low | Tauri pins the minimum; `apt` gives 3.08+ on 22.04+ |
| Future code-signing requirement (Phase 3) forces windows-latest anyway | Medium | Keep windows-latest workflow intact as a dormant fallback, don't delete it |

---

## Recommendation

**Do not switch the release path to Ubuntu right now.** Instead:

1. **Keep `tauri-windows.yml` as the source of truth for releases.**
   It works, it's signed, it's shipping.
2. **Add a parallel experimental workflow** `tauri-linux-nsis.yml`
   that runs on `ubuntu-latest` against `main` pushes (not tag pushes),
   produces a `.exe` artifact, and uploads it as a CI artifact only
   (no GitHub Release). This lets us:
   - Exercise the Linux path on every merge
   - Compare installer binaries between the two paths
   - Build confidence over ~5–10 releases before flipping
3. **Port the two PowerShell scripts to bash** as a prerequisite PR.
   Both shells can co-exist; the Linux workflow uses the bash versions,
   the Windows workflow keeps using the PowerShell versions, until we
   pick a winner.
4. **Revisit after 10 successful parallel builds** — at that point,
   either swap `tauri-windows.yml` for the Linux one (keeping Windows
   as fallback) or close this out as "Linux path works but not worth
   the cutover risk."

This is **complex** work per the autonomic-loop rubric (CI changes,
new dependency, affects release path), so it gets proposed to Hermes
rather than self-assigned. The runbook stub referencing this story
is already in place at `docs/runbook/nsis-release.md` §6.

---

## Implementation sketch (for the parallel workflow, not executed yet)

```yaml
# .github/workflows/tauri-linux-nsis.yml  (draft — DO NOT MERGE YET)
name: Tauri Linux NSIS (experimental)
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - name: Install NSIS + cross-compile toolchain
        run: |
          sudo apt update
          sudo apt install -y nsis lld llvm clang jq unzip
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: x86_64-pc-windows-msvc }
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - name: Install cargo-xwin
        run: cargo install --locked cargo-xwin
      - run: npm ci
      - run: npm run build
      - name: Fetch Windows Node runtime (bash port)
        run: bash scripts/fetch-windows-node.sh           # TODO: port
      - name: Copy standalone into Tauri resources (bash port)
        run: bash scripts/copy-standalone-to-resources.sh # TODO: port
      - name: Strip non-Windows sharp bindings
        working-directory: src-tauri/resources/app/node_modules/@img
        run: find . -maxdepth 1 -type d \( -name '*linux*' -o -name '*darwin*' \) -exec rm -rf {} +
      - name: Install Windows-native deps
        working-directory: src-tauri/resources/app
        run: npm install --force --os=win32 --cpu=x64 @img/sharp-win32-x64 @next/swc-win32-x64-msvc
      - name: Tauri build (cross-compile)
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          XWIN_ACCEPT_LICENSE: '1'
        run: npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
      - uses: actions/upload-artifact@v4
        with:
          name: tauri-nsis-bundle-linux-experimental
          path: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis
          retention-days: 7
```

Note: no `upload` job yet — experimental runs do not publish releases.

---

## Sources

- [Tauri v2 — Windows Installer docs](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri v1 — Cross-platform compilation](https://v1.tauri.app/v1/guides/building/cross-platform/)
- [tauri#6743 — NSIS bundle on Linux (v2 alpha bug, since fixed)](https://github.com/tauri-apps/tauri/issues/6743)
- [tauri#12312 — cross-platform compilation issues in v2](https://github.com/tauri-apps/tauri/issues/12312)
- [`cargo-xwin` crate](https://github.com/rust-cross/cargo-xwin)
