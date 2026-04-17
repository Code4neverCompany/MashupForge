# RELEASE-WORKFLOW-FIX — release.yml vs tauri-windows.yml

**Status:** Analysis + recommended fix. Workflow change = `complex` per autoloop rules; awaiting Hermes approval before apply.
**Reporter:** Maurice (via Hermes) — "Release workflow fails with `failed to determine base repo: failed to run git: fatal: not a git repository`"
**Scanned files:**
- `.github/workflows/release.yml` (58 lines, last touched `343b49b`)
- `.github/workflows/tauri-windows.yml` (107 lines, last touched `fec7630`)
- `scripts/` — only `.ps1` variants exist; no `.mjs` files

---

## Root cause (primary)

`release.yml` references Node scripts that do not exist in the repo.

| Line | release.yml invocation | File on disk |
|---|---|---|
| 40 | `node scripts/copy-standalone-to-resources.mjs` | Only `scripts/copy-standalone-to-resources.ps1` exists |
| 43 | `node scripts/fetch-windows-node.mjs` | Only `scripts/fetch-windows-node.ps1` exists |

`ls scripts/*.mjs` → no such file. These steps would fail with `Cannot find module` on any tag push.

## Root cause (secondary — the "not a git repository" error)

`release.yml` runs `cargo tauri build` with `working-directory: src-tauri` (line 47). The reported `gh`-style error most likely surfaces from one of two places:

1. **`softprops/action-gh-release@v2` with `generate_release_notes: true`** (line 57) — the action fetches prior tags via GitHub API, but `generate_release_notes` in combination with an empty/unset `tag_name` can trigger a git invocation. This is sensitive to prior-step `working-directory` bleed when the shell's pwd is changed indirectly.
2. **A Tauri plugin build script invoking `git describe`** from a cwd that cannot walk up to `.git`. Usually git walks up, but if a subprocess inherits a cwd outside the repo tree it fails exactly with `fatal: not a git repository`.

The primary missing-file issue would prevent reaching the `action-gh-release` step at all, so whichever tag run produced the reported error was a *different* failure mode — likely from an earlier revision of release.yml or a partial manual fix. Either way, both problems disappear once release.yml is aligned with the known-good pattern.

## Why tauri-windows.yml works

`tauri-windows.yml` delegates the entire build to `build-windows.ps1` (line 85) running from the repo root with `-SkipToolchainCheck`. That script invokes, in order:

1. `scripts/fetch-windows-node.ps1`
2. `npm ci && npm run build`
3. `scripts/copy-standalone-to-resources.ps1`
4. `cargo tauri build` (from the correct cwd)

No `.mjs` references, no `working-directory: src-tauri`, no imperative reinvention of steps already solved in PowerShell.

## Additional divergences worth noting

| Concern | tauri-windows.yml | release.yml |
|---|---|---|
| Rust cache (`Swatinem/rust-cache@v2`) | yes (L62-65) | missing — cold build every tag |
| Bundled-Node cache | yes (L71-75) | missing |
| Rust target specified | `x86_64-pc-windows-msvc` | default |
| `GITHUB_TOKEN` env on release action | explicit (L100-101) | relies on implicit passthrough |
| Concurrency group | yes (L20-22) | missing |
| Release mode | `draft: true` on tags | `draft: false` (auto-publish) |

## Recommended fix — consolidation (preferred)

**Delete `release.yml` entirely.** `tauri-windows.yml` already builds the MSI and drafts a release on every `v*.*.*` tag push (lines 97-106). The only behavioural delta is `draft: true` (review-before-publish) vs `draft: false` (auto-publish).

Proposed minimal change to `tauri-windows.yml` line 103 if Maurice wants auto-publish:

```diff
-          draft: true
+          draft: false
+          generate_release_notes: true
```

**Pros:** one workflow, one source of truth, one cache path, no duplicate version-parity check, no drift risk.
**Cons:** Every `main` push no longer produces a release — but that's already the case (main pushes upload artifacts only; tag pushes draft releases). No functional loss.

## Alternative fix — align release.yml to build-windows.ps1

If there's a reason to keep a separate release workflow (e.g. future NSIS bundle, signing step), rewrite release.yml's Build section to mirror tauri-windows.yml:

```yaml
      - name: Cache cargo build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target

      - name: Cache bundled Node download
        uses: actions/cache@v4
        with:
          path: .cache/node
          key: bundled-node-v22.11.0-${{ runner.os }}

      - name: Build
        shell: pwsh
        run: .\build-windows.ps1 -SkipToolchainCheck
```

Then drop lines 30-47 (the setup-node + rust-toolchain + three broken Build-Next/Copy/Fetch/Build-Tauri steps), keeping only Checkout + Version parity + the new Build step + Create Release.

## Verification plan (post-fix)

1. Push an annotated tag `v0.1.4-test` on a throwaway branch.
2. Confirm the selected workflow runs green end-to-end.
3. Confirm the draft/published release appears in GitHub Releases with an `.msi` attached.
4. Delete the test tag and release.

## Blast radius

- **Consolidation path:** deletes one workflow file, changes two lines in the other. Next tag push exercises it. Low risk, fully reversible.
- **Alignment path:** rewrites ~20 lines of release.yml. Same risk profile.

## Recommendation

Consolidation. `release.yml` was authored before `build-windows.ps1` existed (commits `f3b4ec6` / `343b49b` predate STORY-001's `fd93edb`). Keeping it around means maintaining two parallel Windows build pipelines in a codebase that already has one working, cached, tested path.

## Classification

`complex` — config file change (CI workflow). Per autoloop rules: lifted, not self-assigned. Awaiting Hermes decision between consolidation and alignment paths before implementation.
