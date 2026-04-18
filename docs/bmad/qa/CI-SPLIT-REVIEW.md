# CI-SPLIT-REVIEW: tauri-windows.yml build+upload split (e94d75c)

**Date:** 2026-04-18  
**Reviewer:** Developer  
**Commit:** e94d75c — split build + upload into two jobs  
**Fixes applied:** yes — see commit following this review

---

## 1. Artifact upload/download between jobs

**Finding: BUG — FIXED**

### The bug

The build job uploaded the NSIS bundle using three separate glob patterns:

```yaml
path: |
  src-tauri/target/release/bundle/nsis/*.exe
  src-tauri/target/release/bundle/nsis/*.exe.sig
  src-tauri/target/release/bundle/nsis/latest.json
```

`actions/upload-artifact@v4` stores files from **multi-glob paths relative to the workspace root**, preserving the full path. After `download-artifact@v4 path: bundle`, the files would land at:

```
bundle/src-tauri/target/release/bundle/nsis/MashupForge_0.1.8_x64-setup.exe
bundle/src-tauri/target/release/bundle/nsis/MashupForge_0.1.8_x64-setup.exe.sig
bundle/src-tauri/target/release/bundle/nsis/latest.json
```

The upload job then searched `bundle/*.exe`:

```bash
EXE=$(ls bundle/*.exe 2>/dev/null | head -n1)   # → empty string
```

`gh release upload "$TAG" "" --clobber` would have failed on the first CI run.

### The fix

Changed the artifact upload path from multi-glob to a **single directory path**:

```yaml
path: src-tauri/target/release/bundle/nsis
```

`upload-artifact@v4` stores files from a directory path **relative to that directory**, so filenames land flat. After download to `bundle/`:

```
bundle/MashupForge_0.1.8_x64-setup.exe
bundle/MashupForge_0.1.8_x64-setup.exe.sig
bundle/latest.json
```

`ls bundle/*.exe` now finds the file. ✅

---

## 2. Job dependency declared properly?

**Finding: PASS**

```yaml
upload:
  needs: build
```

Correct. The upload job will not run unless `build` completes successfully. The TAG is passed from build to upload via a job output:

```yaml
# build job:
outputs:
  tag: ${{ steps.tag.outputs.value }}

# upload job:
TAG="${{ needs.build.outputs.tag }}"
```

Output wiring is correct. ✅

---

## 3. latest.json generation — right job?

**Finding: PASS**

Synthesis happens in the **build** job, before the artifact upload step:

```yaml
- name: Synthesize latest.json if Tauri didn't emit one
  shell: bash
  run: |
    ...
    jq -n --arg signature "$(cat "$SIG")" ...
```

This is correct — the `.sig` file and the `jq` tool are only available in the build job (windows-latest, where Tauri ran). The synthesized `latest.json` is then included in the artifact and downloaded by the upload job. The upload job does not need to regenerate it. ✅

---

## 4. Signing env vars — right job?

**Finding: PASS**

```yaml
# build job only:
- name: Build Tauri bundle
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  run: npx tauri build
```

The private key is scoped to the single step that needs it. The upload job receives only `GITHUB_TOKEN`. The private key is never present on the ubuntu-latest runner. ✅

---

## 5. Upload job standalone with workflow_dispatch?

**Finding: PASS WITH NOTE**

`workflow_dispatch` triggers the **entire** workflow. Both `build` and `upload` run (`needs: build` ensures ordering). You cannot dispatch just `upload` — that's not how GHA works.

For the intended use case (rerunning the upload after a failed release publish, without re-paying the 20-minute Windows build):

```bash
gh run rerun <run-id> --job upload
```

This reruns only the `upload` job, using the previous `build` job's artifact (retained for 7 days). This is documented correctly in `docs/RELEASE.md`. ✅

---

## Additional finding: missing existence checks in upload job (fixed)

The upload job had no guards before calling `gh release upload`. If artifact paths were wrong (as they would have been with the multi-glob bug), `$EXE` and `$SIG` would be empty strings, and `gh` would fail with a confusing path error.

Added explicit checks:

```bash
if [ -z "$EXE" ] || [ ! -f "$EXE" ]; then
  echo "::error::NSIS .exe not found in downloaded artifact"
  echo "Artifact contents:"; ls -la bundle/ || true
  exit 1
fi
```

Same pattern for `$SIG` and `$LATEST`. The `ls -la bundle/` dump on failure makes path issues immediately diagnosable. ✅

---

## Summary

| Check | Finding | Action |
|---|---|---|
| Artifact upload/download paths | ❌ Bug — multi-glob preserves full workspace path | **Fixed** — directory path |
| Job dependency (`needs: build`) | ✅ Correct | None |
| latest.json in build job | ✅ Correct | None |
| Signing env vars scoped to build | ✅ Correct | None |
| Upload-only rerun via workflow_dispatch | ✅ Works via `gh run rerun --job upload` | None |
| Upload job existence checks | ⚠️ Missing — silent empty-path failure | **Added** |

The split design is sound. The two fixes prevent this from silently failing on the first CI run after this commit.
