# QA Review — QA-PROP-011 (vitest test harness — pure functions)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** vitest.config.ts (framework setup), 260ac75 (CI gate), 38458b9 (phase 3 — aiClient), 801447f (phase 4 — smartScheduler + modelOptimizer)

## Findings

### Framework setup
- [INFO] `vitest.config.ts` — `include: ['tests/**/*.test.ts']`, `environment: 'node'`,
  `@` alias resolved to repo root. Correct for Next.js server-side utilities. ✓
- [INFO] No jsdom, no React Testing Library — first wave is pure-function only as scoped.
  Component tests correctly deferred. ✓

### Test files (7 files, 78 tests — all passing)
- [INFO] `tests/lib/errors.test.ts` — `getErrorMessage()` edge cases including `undefined`
  input (was a real bug, now regression-tested). ✓
- [INFO] `tests/lib/pi-setup.test.ts` — `resolvePiJsEntry()` path resolution logic
  (the CVE-2024-27980 bypass helper). High-value test for a Windows-specific code path. ✓
- [INFO] `tests/lib/aiClient.test.ts` — `extractJsonArrayFromLLM` + `extractJsonObjectFromLLM`
  typed helpers, including crash-on-malformed-input regression (38458b9 adds the crash fix
  and the pin that covers it). ✓
- [INFO] `tests/lib/fetchWithRetry.test.ts` — retry logic, backoff, abort signal. ✓
- [INFO] `tests/lib/modelOptimizer.test.ts` — model selection logic. ✓
- [INFO] `tests/lib/smartScheduler.test.ts` (220 lines) — slot scoring, engagement weighting,
  edge cases. Largest test file; good coverage of the scheduling logic. ✓
- [INFO] `tests/api/proxy-image-allowlist.test.ts` — SSRF allowlist validation (from
  AUDIT-010 SEC-001 fix). Tests reject disallowed hosts and pass allowed ones. ✓

### CI gate (260ac75)
- [INFO] `npm test` inserted as step 3 of 8 in `build-windows.ps1` — before the heavy
  Tauri pipeline. Regressions caught in <1s before a 5–8 min .msi build runs. ✓
- [INFO] No workflow YAML change needed — `tauri-windows.yml` already calls this script. ✓

### Live run
- [INFO] `npm test` at HEAD: **7 files, 78 tests, all passing**. 356ms. ✓

## Gate Decision

PASS — Correct framework choice (vitest, Node environment, no component-test scope creep).
7 test files covering the highest-ROI pure functions. CI gate positioned correctly in the
build pipeline. 78/78 passing.
