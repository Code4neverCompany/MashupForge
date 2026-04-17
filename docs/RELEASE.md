# Release runbook

Builds run on GitHub Actions — `.github/workflows/tauri-windows.yml`.
The workflow has two jobs:

- `build` (windows-latest, ~20 min) — compiles Tauri + NSIS bundle,
  signs with the updater key, uploads the bundle as a CI artifact.
- `upload` (ubuntu-latest, ~1 min) — downloads the artifact and
  publishes `.exe`, `.exe.sig`, and `latest.json` to the GitHub
  Release for the tag.

Splitting like this means upload-only fixes (release notes, URL
tweaks) can rerun just the `upload` job without re-paying the build.

## 1. Bump version

Three files must agree — CI fails on mismatch.

```bash
bash scripts/increment-version.sh   # bumps package.json + tauri.conf.json + Cargo.toml + commits
```

## 2. Tag and push

```bash
TAG=v$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
git tag "$TAG"
git push origin main "$TAG"
```

The `push` of the tag triggers `.github/workflows/tauri-windows.yml`.

## 3. Watch the build

```bash
gh run list --workflow=tauri-windows.yml --limit 1
gh run watch $(gh run list --workflow=tauri-windows.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

## 4. Verify release assets

```bash
gh release view "$TAG" --json assets --jq '.assets[] | {name, size}'
```

Expect three assets:

| Asset | Purpose |
|---|---|
| `MashupForge_<ver>_x64-setup.exe` | NSIS installer (~133 MB) |
| `MashupForge_<ver>_x64-setup.exe.sig` | Minisign signature for the updater |
| `latest.json` | Updater manifest served at `/releases/latest/download/latest.json` |

## Manual re-run (upload only)

If the bundle built but the release upload failed (e.g. wrong notes,
missing token), rerun just the `upload` job via
`gh run rerun <run-id> --job upload` — the `build` artifact persists
for 7 days.

## Local dev builds

```bash
npm run build           # Next.js standalone
npm run tauri:dev       # Tauri dev shell
```

Local builds do NOT sign and do NOT emit `latest.json` — use the CI
workflow for release builds.

## Troubleshooting

- **Version parity check fails**: run `bash scripts/increment-version.sh`
  — don't hand-edit the three version strings.
- **Signature missing in bundle**: `TAURI_SIGNING_PRIVATE_KEY` or
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret is missing in the repo.
- **`latest.json` not emitted by Tauri**: the workflow synthesizes one
  from the `.exe.sig` via `jq` — should be automatic.
- **NSIS installer bloated (>150 MB)**: the strip-non-Windows-sharp
  step in the workflow may have failed. Check
  `src-tauri/resources/app/node_modules/@img/` for `*linux*` or
  `*darwin*` directories — they should be removed before
  `tauri build` runs.
