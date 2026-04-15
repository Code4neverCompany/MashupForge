# QA Review — QA-PROP-015 (extractJsonFromLLM type narrowing)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** 0e833f0 (phase 1), ac1a0e9 (phase 2), 4566a7e (phase 3), 7747055 (phases 3+4 + delete)

## Findings

### Phase 1 — Typed sibling functions (0e833f0)
- [INFO] Added `extractJsonArrayFromLLM(raw): unknown[]` and
  `extractJsonObjectFromLLM(raw): Record<string, unknown>` as typed wrappers around the
  existing `extractJsonFromLLM(raw): any`. New callers get proper types immediately;
  existing callers are untouched. Correct incremental migration strategy. ✓
- [INFO] No behavior change — both helpers delegate to the same underlying parser. ✓

### Phase 2 — useImageGeneration migration (ac1a0e9)
- [INFO] `parseGeneratedItems(raw)` helper introduced — a typed boundary function that
  runs `extractJsonArrayFromLLM` then filters/maps to `GeneratedItem[]`. Clean pattern:
  typed entry point + explicit field narrowing per property. ✓
- [INFO] Tag extraction simplified: `extractJsonArrayFromLLM` returns `unknown[]`,
  `.filter((t): t is string => typeof t === 'string')` applied inline. Correct narrowing,
  no `as string[]` cast needed. ✓

### Phase 3 — complete migration (4566a7e)
- [INFO] Remaining `extractJsonFromLLM` call sites in `MainContent.tsx` and `usePipeline.ts`
  migrated to typed helpers.
- [INFO] Object call sites use `extractJsonObjectFromLLM` + per-field narrowing
  (`typeof field === 'string' ? field : undefined`). Correct — no speculative casting. ✓

### Phases 3+4 — delete `any` helper (7747055 commit context + 4566a7e code)
- [INFO] Original `extractJsonFromLLM` (returning `any`) renamed to `parseJsonFromLLM`
  (private, not exported). No external callers remain. The public API surface is now
  fully typed. ✓
- [INFO] Verified in current `lib/aiClient.ts`: only `extractJsonArrayFromLLM` and
  `extractJsonObjectFromLLM` are exported. `parseJsonFromLLM` is unexported. ✓

### TypeScript
- [INFO] All 4 phases include tsc clean confirmation in commit messages.
  Current HEAD: `npm test` passes (78/78) — test suite imports from aiClient, which
  validates the exported types are correct at runtime. ✓

## Gate Decision

PASS — Clean 4-phase migration. Original `any` return type eliminated from the public
export surface. Callers use typed helpers with explicit per-field narrowing. No behavior
change. TypeScript clean across all phases.
