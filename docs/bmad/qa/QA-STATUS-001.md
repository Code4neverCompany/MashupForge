---
task_id: QA-STATUS-001
type: status-scan
agent: qa
date: 2026-04-29
project: MashupForge
release: v0.9.13
commit: 1dbf8f3
---

# QA Status Scan — QA-STATUS-001

**Verdict:** PASS with noted CONCERNS (baseline lint debt)
**Confidence:** 0.88
**Branch:** main @ 1dbf8f3 (v0.9.13)
**Working tree:** clean

## Test Suite Health

| Gate | Result |
|---|---|
| `vitest run` (88 files) | **987 / 987 pass** — 20.8s |
| `tsc --noEmit` | **clean** (0 errors) |
| `eslint .` | **248 errors / 37 warnings** (baseline — not regression) |
| CI main (release) | green — 1m45s |
| Tauri Windows build | green — 33m30s |

## Recent Commits Reviewed (since 2026-04-28)

| Commit | Subject | QA Status |
|---|---|---|
| 1dbf8f3 | chore(release): v0.9.13 (3-file version bump) | release-only, verified |
| 5a8306d | docs(qa): PR #4 review | docs-only |
| 157195b | PR #4 — buildEnhancedPrompt wired (mmx image route) | **PASS** (PR4-MMX-PROMPT-WIRE.md @ ee236d1) |
| e546bac | PR #5 — pi-ai / pi-coding-agent / lucide-react bumps | patch bumps; test suite unaffected |
| fc313a5 | fix: DnD auto-carousel no-op + failed-post sort skew | **un-reviewed** — see below |
| 64a2e76 | docs(changelog): seed v0.9.12 | docs-only |
| 427cbcd | chore: exclude hermes-agent from git/tsc | tooling — clean tsc |
| 74e28b3 | chore(release): v0.9.12 | release-only |
| 132341e | PR #3 — clear W1–W5 from MMX/calendar QA gates | gated PASS at 987/987 |
| 7c81652 | PR #2 — remove instant Delete from edit popover | follows CALENDAR-DESIGN-QA W2 |
| fa55781 | fix(autopost): surface failure reasons | **un-reviewed** — see below |

## Findings

### CRITICAL
_None._

### CONCERNS
- **[CONCERN-1] Un-reviewed direct-to-main fixes.** `fc313a5` (MainContent + post-ready-sort) and `fa55781` (autopost hardening) landed on main without a QA artifact. Both are bug-fix scope, both ship with passing tests, and `fc313a5` adds an explicit auto-carousel branch that is non-trivial. Recommend a follow-up gate review (low priority — release already cut, tests green).
- **[CONCERN-2] ESLint baseline at 248 errors.** Largely `react-hooks/refs` ("Cannot access refs during render", e.g. `hooks/useSettings.ts:69`) plus `react-hooks/exhaustive-deps` across long-lived files (FirstRunBanner, GalleryCard, KebabMenu, MainContent, PipelineStatusStrip, …). This is chronic and pre-dates the current release window — not introduced by recent commits. Worth a cleanup sprint (propose `LINT-DEBT-001`).
- **[CONCERN-3] MMX provider quota reality.** Per MMX-INT-1 + MMX-INT-FULL: image-01 / Hailuo-2.3 are still quota-locked on the current MiniMax plan (error code 4). Pipeline default stays Leonardo by design (no auto-fallback), but MmxQuotaError → 402 path should be exercised against a real account before flipping any default.

### INFO
- 987-test suite is up +25 since MMX-INTEGRATION-QA (962 → 987) — coverage moving in the right direction.
- Working tree clean on `main`; `feat/mmx-prompt-wire` already merged.
- Release v0.9.13 = 3-file version bump only (package.json, Cargo.toml, tauri.conf.json) — no code risk.

## Scope Check
- IN-SCOPE — release health, recent-commit triage, suite/typecheck/lint, MMX quota status.
- OUT-OF-SCOPE — design polish review (handled by designer envelopes), vault page synthesis (vault-keeper).

## Gate Decision
**PASS** — v0.9.13 is healthy: tests + typecheck green, CI + Tauri Windows builds green, and the only recent un-reviewed work is small bug-fix scope with passing tests. Two non-blocking follow-ups: (1) retroactive gate on `fc313a5` + `fa55781`, (2) attack the 248-error ESLint baseline as `LINT-DEBT-001`.
