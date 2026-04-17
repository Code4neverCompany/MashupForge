# Release runbook

## 1. Bump version

Three files must agree — CI fails on mismatch.

```bash
bash scripts/increment-version.sh   # bumps package.json + tauri.conf.json + Cargo.toml
```

## 2. Build portable Windows bundle (from WSL)

```bash
bash scripts/build-portable.sh
# Output: dist/portable/MashupForge-portable.zip
```

## 3. Wrap portable into NSIS installer

```bash
TAG=v$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
makensis \
  -DAPP_DIR=$PWD/dist/portable/MashupForge \
  -DOUT_EXE=$PWD/dist/portable/MashupForge-${TAG}-setup.exe \
  -DVERSION=${TAG#v} \
  scripts/installer.nsi
```

## 4. Upload to GitHub release

```bash
gh release create $TAG --title "MashupForge $TAG" --notes-file CHANGELOG-${TAG}.md || true
gh release upload $TAG \
  dist/portable/MashupForge-portable.zip \
  dist/portable/MashupForge-${TAG}-setup.exe \
  --clobber
```

## 5. Verify

```bash
gh release view $TAG --json assets --jq '.assets[] | {name, size}'
```
Expect both `.zip` (~330 MB) and `-setup.exe` (~180 MB).

## Troubleshooting

- **Standalone bloat (>100 MB)**: check `outputFileTracingExcludes` in `next.config.ts` still excludes `src-tauri/`, `docs/`, `tests/`.
- **`gh release upload` rejects `--asset-name`**: that flag doesn't exist; rename the file before upload.
- **CI Windows runner dies in <10s**: free-plan Actions quota exhausted. Use the local path above.
