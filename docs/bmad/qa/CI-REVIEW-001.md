# CI-REVIEW-001: GitHub Actions Build & Release Pipeline

**Date:** 2026-04-17 (original) / 2026-04-18 (revised)
**Reviewer:** Developer (QA pass with actual CI log access)
**Context:** 5+ consecutive CI failures — Dev proposed porting to ubuntu-latest + NSIS
**Workflow:** `.github/workflows/build-and-release.yml` (RETIRED in commit `6d219ea`)

---

## REVISED VERDICT (2026-04-18)

**The workflow reviewed below no longer exists.** The concerns raised in §2 ("do not port to ubuntu-latest") were ultimately set aside and the portable+NSIS flow DID ship on `ubuntu-latest` — it worked, bundling the Next.js standalone + `makensis` via apt (commit `62d3941`). The cross-compile risks flagged in the original review did not materialize because the portable path never involved Rust/Windows compilation; it was a Node bundle wrapped by NSIS, which makensis handles natively on Linux.

Subsequently, a **separate native Tauri path** was introduced on `windows-latest` (`tauri-windows.yml`, commit `e5576f1`) and shipped a signed .exe on `v0.1.7`. Because the Tauri .exe supersedes the portable+NSIS deliverable, the reviewed workflow was retired entirely:

| Commit | Action |
|---|---|
| `62d3941` | Ported `build-and-release.yml` to `ubuntu-latest` (against this review's §2 recommendation) |
| `e5576f1` | Added `tauri-windows.yml` on `windows-latest` — native Tauri build |
| `6d219ea` | Deleted `build-and-release.yml`, `scripts/build-portable.sh`, `scripts/installer.nsi` |
| `3ab6b59` | Signed the Tauri bundle end-to-end via `TAURI_SIGNING_PRIVATE_KEY` secrets |

**Revised recommendation table:**

| Item | 2026-04-17 verdict | 2026-04-18 revised verdict |
|---|---|---|
| Workflow YAML syntax | ✅ Valid | n/a — workflow deleted |
| Runner (windows-latest) | Reject ubuntu-latest | **Reversed.** Portable path ran fine on ubuntu-latest; the real win was retiring portable entirely in favor of native Tauri on windows-latest |
| NSIS bundle path | ✅ Correct | n/a — portable NSIS replaced by Tauri-emitted NSIS |
| `--asset-name` flag | ✅ Fixed in `73fa8e7` | Historical — fix shipped, workflow later retired |
| Release upload steps | ✅ Correct post-fix | Superseded by `tauri-windows.yml` upload step |
| Post-fix fast-fail runs | ⚠️ Unknown cause | No longer relevant — those runs belonged to the retired workflow |

**The original review's technical findings on the `--asset-name` bug and YAML structure were correct.** The runner-choice recommendation was overtaken by events: the portable path was not the long-term deliverable, and the right move turned out to be retiring it, not protecting it.

---

## Original review content (historical, retained for traceability)

## 1. Workflow Syntax Validity

**Status: PASS**

- YAML is syntactically valid (confirmed with `yaml.safe_load`)
- All action versions are current: `checkout@v4`, `setup-node@v4`, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`, `actions/cache@v4`
- PowerShell blocks use correct `$env:GITHUB_OUTPUT` syntax
- `workflow_dispatch` requires `release_tag` input — correctly wired to `steps.tag.outputs.value`
- `permissions: contents: write` is set, required for `gh release create/upload`
- Version parity check reads all three version sources correctly

Minor: `build-windows.ps1` header says "emits a .msi installer" but `tauri.conf.json` targets NSIS. Documentation drift only.

---

## 2. Runner Choice

**Status: KEEP windows-latest — DO NOT port to ubuntu-latest**
**(REVISED 2026-04-18: this recommendation was not followed and that turned out to be fine — see top of doc)**

The ubuntu-latest + NSIS proposal carries significant risk:

- Tauri does **not** officially support cross-compiling Windows targets from Linux
- Would require: LLVM MinGW, Wine, the `nsis` apt package, and `x86_64-pc-windows-gnu` Rust target (not MSVC)
- WebView2 headers and linking are Windows-native; cross-compile toolchains for this are fragile
- Silent ABI mismatch between GNU and MSVC would produce a broken installer with no CI signal

`windows-latest` runners include VS 2022 Build Tools pre-installed. **Reject the ubuntu-latest proposal.**

(Revised note: the concerns above apply to Tauri/Rust cross-compilation. The portable workflow did NOT cross-compile Rust — it packaged a Next.js standalone with makensis, which works on Linux. The review conflated the two paths.)

---

## 3. NSIS Bundle Path

**Status: PASS — confirmed by CI logs**

Workflow glob: `src-tauri/target/release/bundle/nsis/*.exe`

CI log confirms the NSIS bundle was produced at:
```
D:\a\MashupForge\MashupForge\src-tauri\target\release\bundle\nsis\MashupForge_0.1.4_x64-setup.exe
```

The path in the workflow matches what Tauri actually emits. Correct.

---

## 4. Release Asset Upload Steps

**Status: FIXED in commit 73fa8e7 — was the confirmed root cause of 16-minute failures**

### Confirmed Failure (runs 24579307001, 24579569057, 24577983735)

The **old** workflow used:
```powershell
gh release upload $tag $exe.FullName --asset-name "MashupForge-$tag-setup.exe" --clobber
```

CI log error:
```
unknown flag: --asset-name

Usage:  gh release upload <tag> <files>... [flags]

Flags:
  --clobber   Delete and re-upload existing assets of the same name
```

`gh release upload` does not support `--asset-name`. The flag does not exist.

### Fix Applied (commit 73fa8e7, 2026-04-17 18:28 UTC)

Current workflow correctly:
1. Renames the file to the desired asset name before uploading (`Copy-Item`)
2. Uploads by path (filename becomes the asset name automatically)
3. Uses `--clobber` to overwrite on re-run

```powershell
$setupExe = "MashupForge-$tag-setup.exe"
Copy-Item $exe.FullName -Destination $setupExe
gh release upload $tag $setupExe --clobber
```

This is the correct approach. ✅

### Remaining Issue: Fast-Fail Runs (runs 24582333339, 24581884467 — AFTER the fix)

Two runs dispatched at 19:00 and 19:11 UTC (after the 18:28 UTC fix) still fail in **4-6 seconds with zero steps executed** and no runner assigned. This is distinct from the 16-minute build failures above.

**Likely causes (unconfirmed — log data unavailable for these runs via API):**
- GitHub Actions transient platform issue (queue/provisioning failure)
- Possible pre-validation failure in GitHub's workflow parser (not caught by YAML linter) — the `with: { node-version: '22', cache: 'npm' }` flow-mapping shorthand is valid YAML but unusual for GHA; some versions of the validator may reject it
- Quota exhaustion on the `windows-latest` pool after rapid successive dispatches

**Recommendation:** Re-trigger one fresh dispatch now. If it succeeds, the fast-fails were transient. If it still fails with 0 steps, expand `with:` to standard multi-line syntax and check the Actions tab for "workflow validation failed" messages.

---

## 5. Summary of All Failures (10 runs)

| Run ID | Duration | Failure Point | Status |
|---|---|---|---|
| 24577983377 | 16m50s | — | **SUCCESS** (main branch push) |
| 24577983735 | 16m27s | Create Release (`--asset-name`) | Root cause confirmed |
| 24579307001 | 16m14s | Create Release (`--asset-name`) | Root cause confirmed |
| 24579569057 | 16m52s | Package and upload (`--asset-name`) | Root cause confirmed |
| 24580591698 | 7s | No steps (pre-run failure) | Unknown |
| 24580654185 | 4s | No steps | Unknown |
| 24580743304 | 6s | No steps | Unknown |
| 24580855872 | 8s | No steps | Unknown |
| 24581884467 | 6s | No steps (post-fix) | Unknown |
| 24582333339 | 5s | No steps (post-fix) | Unknown |

---

## Original recommendations (historical)

| Item | Status | Action |
|---|---|---|
| Workflow YAML syntax | ✅ Valid | None |
| Runner (windows-latest) | ✅ Correct | Reject ubuntu-latest proposal |
| NSIS bundle path | ✅ Correct (log-confirmed) | None |
| `--asset-name` flag | ✅ Fixed in 73fa8e7 | None |
| Release upload steps | ✅ Correct post-fix | None |
| Post-fix fast-fail runs | ⚠️ Unknown cause | Re-trigger one dispatch; if fails, expand `with:` shorthand |

**The workflow is structurally correct post-fix.** The `--asset-name` bug was the confirmed root cause of all 16-minute failures. The post-fix fast-fails are likely transient GHA platform issues. No architecture changes needed.

*(Revised 2026-04-18: superseded by retirement — see top of doc.)*
