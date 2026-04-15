---
name: PROP-011 phase 4 — smartScheduler + modelOptimizer test coverage
description: 23 new tests pinning the slot picker and per-model metadata helper; no bugs surfaced this round (both modules verified solid)
type: review
---
# PROP-011 phase 4 — smartScheduler + modelOptimizer tests

**Date:** 2026-04-16
**Author:** developer
**Files touched:**
- `tests/lib/modelOptimizer.test.ts` (new, 8 tests)
- `tests/lib/smartScheduler.test.ts` (new, 15 tests)

**Status:** DONE

## Why these two

Phase 1 covered `lib/errors` + `resolvePiJsEntry`. Phase 3 covered
`lib/aiClient` JSON helpers. The remaining exported pure-ish modules
in `lib/` were `smartScheduler.ts` (slot picker, engagement
loading) and `modelOptimizer.ts` (per-model metadata). Both are
hot-path: the scheduler runs on every `findBestSlot()` call from
the UI's auto-schedule button, and `enhancePromptForModel` runs
before every Leonardo submission.

## Coverage

**`modelOptimizer.test.ts`** (8 cases):
1. Base prompt unchanged
2. **gpt-image-1.5 strips `negativePrompt`** even when caller supplies one
3. Other models pass `negativePrompt` through
4. Caller `style` passed through
5. Caller `aspectRatio` passed through
6. Falls back to model's first aspectRatio when caller omits
7. Unknown model + no caller hint → `aspectRatio: undefined`
8. No synthetic style injected when caller omits one

**`smartScheduler.test.ts`** (15 cases — split across 3 describes):

`findBestSlots`:
1. Returns the requested count
2. Skips taken slots
3. Sorts by score descending
4. Never picks today (search starts tomorrow)
5. **Per-platform daily caps** — full day skipped when target platform at cap
6. **`posted` and `failed` posts excluded** from cap counting (so historic
   successes can't permanently lock a day)
7. `count: 0` returns empty array
8. `reason` mentions "IG data" when `source === 'instagram'`
9. `reason` mentions "research" when `source === 'default'`

`findBestSlot`:
10. Returns `{date, time}` with the right shape
11. Falls back to tomorrow @ 19:00 when engagement has no usable hours

`loadEngagementData / saveEngagementData`:
12. Returns defaults when localStorage is empty
13. Round-trips through `saveEngagementData`
14. **Falls back to defaults when cache is older than 24h TTL**
15. Returns defaults on malformed JSON in localStorage

## Test infrastructure choices

**`vi.useFakeTimers()` + `vi.setSystemTime()`** — pin the clock to a
known Wednesday so weekend bonuses, day-of-week multipliers, and
"start from tomorrow" semantics are deterministic across runs.

**localStorage stub via `vi.stubGlobal()`** — vitest's `node`
environment has no `localStorage`. A 7-line in-memory `Map`-backed
stub covers everything `loadEngagementData`/`saveEngagementData`
touch. Restored via `vi.unstubAllGlobals()` in `afterEach`.

**Dynamic baseline pattern for cap tests** — instead of hardcoding
"tomorrow's date" (which would drift), we run `findBestSlots`
once with no constraints to learn what the picker thinks the best
date is, then use that date in the next call's constraint. Robust
across any system clock, any TZ.

## Result: no bugs found this round

Phases 1 and 3 each surfaced a real latent bug. Phase 4 didn't —
both modules were already correct. That's still useful information:
it means the scheduler and metadata helper are stable enough to
refactor against without fearing silent regressions.

The harness is now 64/64 in ~330ms, covering five `lib/` modules:
`errors`, `pi-setup`, `aiClient`, `fetchWithRetry`, `modelOptimizer`,
and `smartScheduler`. The remaining `lib/` files (`desktop-config-keys`,
`desktop-env`, `masterpromptTemplate`, `pi-client`) are either pure
constants or wrapper shims — low EV for further test coverage.

## Verification

- `npx tsc --noEmit` → clean for touched files (one unrelated
  in-progress error in `SettingsModal.tsx` from a concurrent agent
  — not mine, not touched)
- `npx eslint <new test files>` → clean
- `npm test` → 64/64 (was 41, +23 new)
- Suite runtime ~330ms — still well under the 1s threshold the
  build gate (PROP-011 phase 2) was sized for

**Status:** DONE — ready for QA.
