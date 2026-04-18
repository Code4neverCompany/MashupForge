# MUSTFIX-004 — Pipeline log pluralization + untrack next-env.d.ts

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
Two unrelated nits called out in the release debrief. Pipeline log lines printed `"1 image(s) ready"` for the single-image case — looks lazy in user-facing copy. And `next-env.d.ts` keeps showing up in `git status` because Next.js rewrites the file when you switch between `next dev` and `next build`, but it's still tracked. Both fixed in one commit.

## What changed

### Pluralization
`hooks/usePipeline.ts`:

- L361 (carousel branch):
  - `${readyImages.length} image(s) ready — carousel mode` → `${readyImages.length} image${readyImages.length === 1 ? '' : 's'} ready — carousel mode`
- L447 (multi-model branch):
  - `${readyImages.length} image(s) ready from ${allModelIds.length} models` → properly pluralizes both `image` and `model` independently.

Inline ternary, no helper. Two call sites doesn't justify a `pluralize()` import.

Other `(s)` patterns in the codebase left alone:
- `scripts/check-bundle-size.mjs:97` — `${violations.length} route(s) over` is a CI-only error message (`console.error`); not user-facing copy.
- `lib/pi-setup.ts:427` — `images?: boolean` (a TS optional field, not a string).

### `next-env.d.ts` always-dirty
- Added `next-env.d.ts` to `.gitignore` (next to `.next/`) with a comment explaining the cause.
- `git rm --cached next-env.d.ts` to drop the tracked copy without deleting it on disk.

The Next.js docs explicitly say "This file should not be edited" — Next regenerates it. Most Next projects either gitignore it or commit it once and accept the dirty state. Gitignoring is the cleaner choice for a project where developers routinely toggle between dev and build modes (this repo does so during the Tauri build workflow).

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Proper pluralization | done — `usePipeline.ts:361,447` |
| `next-env.d.ts` not dirty | done — gitignored + untracked |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| Write FIFO when done | pending (this commit) |

## Files touched
- `hooks/usePipeline.ts` (+2 / -2)
- `.gitignore` (+4 / -0, including comment)
- `next-env.d.ts` (deleted from git index, file remains on disk for Next to regenerate)
