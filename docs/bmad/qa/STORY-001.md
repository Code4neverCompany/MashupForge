# QA Review: STORY-001
**Status:** warn
**Scope Drift:** minor — extras added beyond story spec (tag trigger, draft release, concurrency, caches, NSIS artifact); all additive and non-breaking
**Obsolete Items:** STORY-002 and STORY-003 are architecturally stale (see below)
**Test Coverage:** n/a — CI workflow; coverage is the CI run itself
**Security:** one latent issue (see below)
**Recommendation:** approve with notes

---

## What I checked

- Reviewed Developer's artifact at `docs/bmad/reviews/STORY-001.md`
- Read full diff of commit `fd93edb` against `.github/workflows/tauri-windows.yml`
- Read the resulting workflow file in full

---

## Acceptance criteria — all met

| Criterion | Verdict |
|---|---|
| `.github/workflows/tauri-windows.yml` exists | ✓ |
| Triggers on push to main | ✓ (line 12) |
| Builds and uploads `.msi` artifact | ✓ (line 69–74, `if-no-files-found: error`) |

---

## Issues found

### WARN 1 — Missing `permissions: contents: write` for the release step

`softprops/action-gh-release@v2` (line 88) uses `GITHUB_TOKEN` to create
a draft release. Repos created under GitHub orgs with restricted default
token permissions will get a 403 here. The job has no `permissions:` block.

This only fires on tag pushes (`if: startsWith(github.ref, 'refs/tags/v')`),
so the main-branch build path is unaffected. But the first tag release
attempt will fail silently at that step if the repo's token perms are
restricted.

**Fix:** add a `permissions:` block at the job level:
```yaml
permissions:
  contents: write
```
Developer flagged this as a known risk but did not pre-empt it. Recommending
it be added before the first tag push.

### WARN 2 — Node cache key hardcoded to `v22.11.0`

Line 58: `key: bundled-node-v22.11.0-${{ runner.os }}`

The comment says "bumping the version busts the cache" — but only if someone
also manually edits this line. If `scripts/fetch-windows-node.ps1` is updated
to a newer Node version, the cache key stays stale and the old zip will be
served from cache, causing a silent mismatch.

Low likelihood in the short term. Suggest using a lockfile or script-derived
key in a follow-up (not a blocker for this story).

### INFO — NSIS glob changed from `*.exe` to `*-setup.exe`

Old: `nsis/*.exe` → New: `nsis/*-setup.exe`

Tauri's default NSIS output filename ends in `-setup.exe`
(e.g. `MashupForge_0.1.0_x64-setup.exe`), so this is correct and
more specific. Not a bug — noting it because `if-no-files-found: error`
will surface any naming mismatch on the first run.

---

## Extras beyond story spec (acceptable)

All additive, no existing behavior removed:
- `tags: ['v*.*.*']` trigger + draft release step
- `workflow_dispatch`
- `concurrency` block (correct; tag and branch refs are in separate groups)
- `.cache/node` cache for bundled Node download
- `Swatinem/rust-cache@v2` for Rust build artifacts
- `timeout-minutes: 45`
- Node 20 → 22 (matches `scripts/fetch-windows-node.ps1` pin)

---

## Architectural observations (from Developer's review — QA concurs)

These are not STORY-001 issues but are load-bearing for Maurice's backlog:

**STORY-002 is obsolete.** The story targets a Vercel-URL webview
architecture. Commit `fbf81a5` replaced it with a local Next sidecar.
`tauri.conf.json` no longer contains a Vercel URL. Story should be rewritten
and marked satisfied.

**STORY-003 is half-obsolete.** "Install pi.dev from Settings" is gone (pi
is baked at build time via `scripts/bake-pi.ps1`). "Start pi from Settings"
is still real but unvalidated on Windows. Recommend splitting:
- Rewrite STORY-003 as a validation task: "verify bundled pi starts from Settings"
- STORY-004 (full Windows validation) remains blocked until CI produces a
  working `.msi` or Maurice runs `build-windows.ps1` locally

**First CI run may surface minor issues** (Developer's list):
- PowerShell path-separator edge cases
- `softprops` `contents: write` permission (see WARN 1 above)
- Tauri WiX download latency on first cold run
