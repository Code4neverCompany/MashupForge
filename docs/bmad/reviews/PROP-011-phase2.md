---
name: PROP-011 phase 2 — wire vitest into Windows build pipeline
description: Gate the Tauri build on `npm test` so a broken pure-function helper never reaches the .msi bundle
type: review
---
# PROP-011 phase 2 — CI test gate

**Date:** 2026-04-15
**Author:** developer
**Files touched:** `build-windows.ps1` (+12 / -3, step renumber 7→8)
**Status:** DONE

## Problem

Phase 1 added a vitest harness with 17 passing tests covering
`lib/errors.ts` and `lib/pi-setup.ts`, but nothing ran them
automatically. A regression in either helper would only surface
when a developer thought to run `npm test` by hand — easy to
forget during a 5–8 minute Tauri build.

## Fix

Insert a new `[3/8] Running test suite (npm test)` step in
`build-windows.ps1` between npm ci and the Node.js sidecar fetch.
All downstream steps renumbered (3/7 → 4/8, etc).

```powershell
Write-Host "[3/8] Running test suite (npm test) ..."
npm test
if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
```

The suite runs in <1s on phase 1 surface area, so the cost is
negligible compared to the 5–8 minutes saved when a bad helper
would otherwise propagate into the bundle.

## Design choices

**Gate inside the script, not the workflow YAML.** The existing
`.github/workflows/tauri-windows.yml` invokes
`.\build-windows.ps1 -SkipToolchainCheck`, so wiring the test gate
into the script means it works identically in CI and on a local
developer box. No YAML change needed; no risk of CI and local
diverging.

**Fail fast — placed before the heavy fetches and builds.** The
test step lands at slot 3, immediately after `npm ci` (which
installs vitest itself). It runs before fetch-windows-node,
Next.js build, and Tauri build — the three slowest steps. A red
test now costs ~30s of feedback, not ~8 minutes.

**No `--bail` flag yet.** The phase 1 suite is small enough that
running all tests on failure gives a more complete picture than
stopping at the first red. If the suite grows past ~30s, the
inline comment notes the upgrade path: switch to
`npm run test -- --bail` and/or move the suite to a parallel CI
job.

**Standard `$LASTEXITCODE` guard.** Same pattern every other
step in the script uses (`npm ci`, `next build`, sidecar fetch).
No new error-handling shape introduced.

## Verification

- Step numbering verified: all references are `[N/8]` for N=1..8,
  no stale `[N/7]` references remain.
- Local `npm test` still passes (17/17 from phase 1).
- The script can't be executed on Linux, but the change is
  mechanical (one inserted block + sequential renumber) and the
  PowerShell syntax matches the existing steps.

## What this unlocks

Phase 3 can now add tests for `humanizeWindowsError`,
`quoteWinArg`, and `parseJsonOrThrow` knowing they'll
automatically run on every Windows build — local and CI alike.
The investment in phase 1's harness compounds.

**Status:** DONE — ready for QA.
