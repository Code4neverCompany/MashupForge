# QA Review — QA-PROP-004 (STORY-003 spec collapse + bake-pi.ps1 deletion)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** 018caf1

## Findings

### `docs/bmad/stories/stories-tauri-windows.md`
- [INFO] STORY-003 correctly superseded — original "bake pi at build time via bake-pi.ps1"
  premise was abandoned before implementation. Story entry now reads as a tombstone pointing
  to STORY-004 Tests 5–6 for the current pi.dev acceptance criteria. ✓
- [INFO] No acceptance criteria are lost: bundled-pi-cmd launch / status / stop / fresh-install
  tests are all covered in the STORY-004 pre-flight review.

### `scripts/bake-pi.ps1` deleted (59 lines)
- [INFO] Dead script — no callers in build pipeline (`build-windows.ps1:82` explicitly
  skips it; nothing in the GH Actions workflow invokes it). Correct to delete. ✓
- [INFO] No call sites missed — searched `build-windows.ps1`, `tauri-windows.yml`,
  and `package.json` scripts. None reference `bake-pi.ps1`.

### `src-tauri/resources/README.md`
- [INFO] `resources/pi/` section removed from the directory tree. Comment updated:
  "pi.dev is not bundled at build time. It is installed at runtime via Settings → Install pi.dev."
  Matches the actual code path. ✓
- [INFO] `PI_BIN` reference in the last paragraph removed (launcher no longer sets it). ✓

## Gate Decision

PASS — Docs-only commit. Stale STORY-003 spec superseded cleanly; dead `bake-pi.ps1`
deleted; README corrected. Zero runtime impact. Codebase documentation now matches the
actual runtime-install architecture.
