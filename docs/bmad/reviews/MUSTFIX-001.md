# MUSTFIX-001 — Fix CI: bunx tauri build + real tauri-step fallback

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
v0.2.2 CI run `24604043919` v0.2.1 succeeded, but v0.2.2 run `24604871387` failed at the `Build Tauri bundle` step with `npm error could not determine executable to run`. CI-001 introduced Bun as the primary install path; Bun does not populate `node_modules/.bin` the way npm does, so `npx tauri` cannot resolve the CLI. Fix: switch the Tauri build step to `bunx tauri build`, add a real npm fallback that catches `tauri build` failures (not just install failures), and keep CI failing if both paths fail.

## Root cause
- CI-001 swapped install + JS build to Bun primary with an npm fallback.
- That fallback's guard is `if: steps.bun_build.outcome == 'failure'`.
- `bun install` and `bun run build` both succeeded for v0.2.2 (visible in the run log: install completed at 12:40:57, packages added).
- The next step, `Build Tauri bundle`, ran `npx tauri build`. `npx` looks in `node_modules/.bin/` for the `tauri` shim — which Bun does not create. `npx` then fell through to a registry lookup, found no executable named `tauri`, and exited 1.
- The original npm fallback never fired because the failure was in a different, non-fallback step.

## Fix
`.github/workflows/tauri-windows.yml`:

1. **Rename** `Build Tauri bundle` → `Build Tauri bundle (Bun)` with `id: tauri_bun` and `continue-on-error: true`. Change the command from `npx tauri build` to `bunx tauri build`. `bunx` resolves the Bun-installed CLI without touching `node_modules/.bin`.
2. **Add** `Build Tauri bundle (npm fallback)`. Fires if `tauri_bun` failed OR `bun_build` failed (covers both possible Bun-path regressions). Runs `npm ci` to rebuild `node_modules` in the npm-shaped layout (so `npx` can resolve `tauri`), then `npx tauri build`. No `continue-on-error` — if this fails, the job fails and the release does not publish.
3. **Loud warning** in the fallback step explains which Bun outcome triggered it, so a regression is visible in the Actions UI summary instead of being silently masked.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Bun path uses `bunx` for tauri build | done — line 142 |
| Real fallback catches both failure types | done — `steps.tauri_bun.outcome == 'failure' \|\| steps.bun_build.outcome == 'failure'` |
| Write FIFO when done | pending (this commit) |

## Verification path
Cannot run windows-latest locally. Confirmation requires re-tagging:

1. Either delete the orphan `v0.2.2` git tag and re-push it, OR jump to `v0.2.3` (cleaner — the v0.2.2 bump commit is already in main, just bump 0.2.2 → 0.2.3 and push).
2. CI runs. Expected paths:
   - **Happy path:** Bun installs, `bunx tauri build` produces the .msi/.exe + .sig, latest.json synthesizes, upload job publishes the release.
   - **Bun broken (rare):** `bun_build` fails → npm fallback installs + builds → `bunx tauri build` runs against npm-shaped `node_modules` (still works because bunx reads `node_modules/.bin`) → upload publishes. If `bunx` somehow fails here, the new tauri npm fallback fires and re-runs `npm ci` + `npx tauri build`.
   - **Tauri build broken under Bun:** `tauri_bun` fails → npm fallback runs `npm ci` + `npx tauri build`. If THIS fails, job fails — no release artifact, no silent regression.

## Why not also use bunx in the fallback?
The fallback's whole point is to defend against a Bun-shaped breakage. Using `npx` after a fresh `npm ci` proves the build works in the toolchain that didn't fail. If we used `bunx` in the fallback and it succeeded, we'd never know if the original Bun-path failure was transient or systemic.

## Files touched
- `.github/workflows/tauri-windows.yml` (+26 / -2)

## Follow-ups
- Once a release ships under the fixed CI, verify Maurice can actually download + install + auto-update from the published .msi (BUG-002, BUG-003, FEAT-006 are all unverified at runtime).
- Consider adding a CI smoke test that runs `bunx tauri --version` immediately after Bun install, so a `node_modules/.bin` regression surfaces in seconds rather than after a 3-minute build.
