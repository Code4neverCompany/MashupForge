# Branch strategy

This repo ships **two product surfaces** from one codebase:

- **Web** — Next.js 16 app deployed by Vercel.
- **Desktop** — Same Next.js app wrapped in Tauri 2 and shipped as a Windows NSIS installer with a self-updater.

Both surfaces share the bulk of the code (`app/`, `components/`, `lib/`, `hooks/`, `types/`). Only `src-tauri/`, the Tauri-specific scripts (`scripts/fetch-windows-node.ps1`, `scripts/copy-standalone-to-resources.ps1`, `build-windows.ps1`, `build-local.bat`), and a handful of `useDesktopConfig`-aware UI branches are desktop-only.

## Branches

| Branch | Role | Auto-deploy | Tag-driven release |
|---|---|---|---|
| `main` | Shared trunk. All feature work lands here first. | — | — |
| `web` | Web release branch. Tracks `main` plus any web-only patches. | Vercel "Production" deploys from this branch. | — |
| `desktop` | Desktop release branch. Tracks `main` plus any desktop-only patches. | — | `v*.*.*` tags pushed on this branch trigger `tauri-windows.yml` to build + sign + publish the NSIS installer and `latest.json`. |

### Why three branches and not two

`main` stays unblessed-by-deploys so feature work can land without immediately publishing. `web` and `desktop` are the "what's actually live" markers. The split lets us:

- Hotfix the web app without rebuilding/re-signing the Tauri bundle.
- Hold the desktop release while the web one ships, or vice versa.
- Run platform-specific CI checks per branch (e.g. Tauri `cargo check` only on `desktop`).

## Promotion flow

```
feature/* ──► PR ──► main ──► fast-forward ──► web      (auto-deploys)
                          ╰── fast-forward ──► desktop  (waits for tag)
```

- Feature PRs target `main`.
- A merge to `main` is followed by a fast-forward of `web` and `desktop` from `main` whenever the maintainer is ready to ship that surface.
- Web ships on every fast-forward (Vercel auto-deploys).
- Desktop ships only when the maintainer pushes a `v*.*.*` tag on `desktop`. The tag fires `tauri-windows.yml`.

### Hotfixing one surface without the other

- **Web-only hotfix:** branch off `web` → PR into `web` → cherry-pick into `main` afterwards so `main` doesn't drift.
- **Desktop-only hotfix:** same, but off `desktop`.

The cherry-pick-back step is mandatory. Drift between `main` and either release branch is the failure mode this strategy is most exposed to.

## CI per branch

| Branch | Workflow | What runs | Why |
|---|---|---|---|
| `main`, `web`, `desktop` (push + PR) | `.github/workflows/ci.yml` | `tsc --noEmit`, `vitest run`, `next build` | Catches regressions before they reach a release branch. Ubuntu runners — fast and cheap. |
| `desktop` (tag `v*.*.*`) | `.github/workflows/tauri-windows.yml` | Bun build → Tauri NSIS bundle → upload-artifact → release | Existing release flow. Unchanged by this task. |

Vercel's GitHub integration deploys `web` automatically — no GitHub Action needed.

## Decisions / tradeoffs

- **Why not trunk-based with platform detection in CI?** It works but couples release timing to `main` activity. Keeping `web` and `desktop` as branches gives the maintainer a "release gate" without extra tooling.
- **Why not branch protection from day 1?** Out of scope for this task. The strategy works without it; protection rules are easy to layer on later.
- **Why keep the existing `tauri-windows.yml` tag-triggered, not branch-triggered?** Tag-triggered releases are the existing, working flow. Switching to push-triggered would publish on every fast-forward, which is the opposite of the "hold the desktop release" affordance the split exists for.

## Open questions for Maurice

1. **Vercel branch.** Vercel currently deploys from `main` (per `.vercel/`). For this strategy to actually take effect, the Vercel project's "Production Branch" must be flipped to `web` in the Vercel dashboard. Until then, `web` is just a label.
2. **Branch protection.** Recommend protecting `web` and `desktop` so only fast-forwards from `main` (or hotfix PRs) can land. Defer until the strategy has been used a few times.
3. **`cleanup-branch`.** The repo has a stale `cleanup-branch` on origin. Out of scope here, but flagging for housekeeping.
