# MUSTFIX-005 — Delete orphan v0.2.2 tag

**Status:** done · **Branch:** main · **Classification:** routine

## TL;DR
The `v0.2.2` git tag pointed at commit `2d65f8e` ("chore: bump version to 0.2.2") and triggered CI run `24604871387`, which failed at "Build Tauri bundle" because `npx tauri` couldn't resolve under Bun's install layout (root cause documented in MUSTFIX-001). No GitHub release was ever published for v0.2.2 — the tag was a dead pointer to a non-shippable build. Deleted locally and on origin so the next release can cleanly take `v0.2.3` (or re-take `v0.2.2` if desired) without confusion.

## Pre-checks
- `git ls-remote --tags origin` confirmed `v0.2.2` present on remote at `2d65f8e`.
- `gh release view v0.2.2` returned "release not found" — no release artifact, so deleting the tag does not orphan or break a release.
- The version bump commit (`2d65f8e`) itself is **not** rolled back — it remains in `main` history. Subsequent commits already moved past it (current HEAD has the MUSTFIX-001/002/003/004 fixes on top). Rolling the bump back would require also bumping again to ship; leaving it means the next push of `v0.2.2` (or any later tag) will run against the fixed CI.

## Action
```
git tag -d v0.2.2                 # local: Deleted tag 'v0.2.2' (was 2d65f8e)
git push origin --delete v0.2.2   # remote: - [deleted]         v0.2.2
```

## Post-checks
- Local tag list: `v0.2.0`, `v0.2.1` (no `v0.2.2`).
- Remote tag list: same. Both gone.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Tag deleted locally | done — `git tag -d v0.2.2` exit 0 |
| Tag deleted remotely | done — `git push origin --delete v0.2.2` exit 0 |
| No GitHub release orphaned | done — confirmed no release existed pre-delete |
| Write FIFO when done | pending (this commit) |

## Follow-up
The next release tag (Hermes intends `v0.2.3` per the debrief) will run against the post-MUSTFIX-001 CI workflow. If desired, `v0.2.2` could now be re-cut against the fixed CI — same version label, fixed build — but `v0.2.3` is the cleaner choice since the version bump commit is already merged and three subsequent fix commits would otherwise be lumped into a "v0.2.2" that doesn't match the "0.2.2" string in `package.json`/`tauri.conf.json`/`Cargo.toml` (which still say `0.2.2`). Bumping to `0.2.3` in those files is part of the v0.2.3 release prep, not this task.
