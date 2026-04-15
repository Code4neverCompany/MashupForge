# QA Review — STORY-125

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 6008a50

## Findings

### `next.config.ts`
- [INFO] `NEXT_PUBLIC_BUILD_SHA = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)` — correct pattern. `NEXT_PUBLIC_` prefix exposes to client bundle at build time, not runtime. ✓
- [INFO] `GITHUB_SHA` is the standard GH Actions env var for the triggering commit SHA. No custom magic, no CI-specific assumptions beyond the Actions environment. ✓
- [INFO] Fallback `'dev'` is a clean local dev experience — `slice(0, 7)` on `'dev'` yields `'dev'` (≤7 chars, no crash). ✓

### `components/UpdateBanner.tsx`
- [INFO] SHA shown in `up-to-date` state as `MashupForge v{version} ({sha}) — up to date`. Visually unobtrusive; useful for support triage.
- [INFO] SHA shown in `error` state — correct. Error state is exactly when users need to report their version.
- [INFO] SHA hidden in `available` state — correct. The update banner is already showing version info; SHA is noise there.
- [INFO] `process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'` — defensive null-coalesce in case the env var was somehow missing at build time. ✓

### Security
- [INFO] SHA is a commit hash, not a secret. Safe to expose in client bundle. ✓

### Scope
- [INFO] 2 files touched (next.config.ts, UpdateBanner.tsx). 14 lines total. Minimal, well-scoped.
- [INFO] TypeScript clean per commit message (no new type surface introduced — `string` env var).

## Gate Decision

PASS — Correct `NEXT_PUBLIC_` injection pattern. SHA displayed in the right states (up-to-date, error). Fallback is safe. Minimal change, zero risk.
