# SHOULDFIX-001 — Tests for pipeline-busy, checkpoint, postpone watchdog, resume flow

**Status:** done · **Branch:** main · **Classification:** complex

## TL;DR
QA flagged the FEAT-006 behavioral work as untested: `lib/pipeline-busy` (pub/sub), `lib/pipeline-checkpoint` (IDB roundtrip), `UpdateChecker`'s postpone watchdog, and `usePipeline.acceptResume/dismissResume`. Added **31 new tests** (129 → 160) covering the critical decision logic, pub/sub contract, and side-effect flow. Two small refactors (constants + one pure helper) moved the watchdog's decision function and acceptResume's body out of React so they're testable without adding jsdom/Testing Library to the vitest config.

## What changed

### New test files
- `tests/lib/pipeline-busy.test.ts` — 7 tests
  - `isPipelineBusy` returns current flag
  - subscribe → listener fires on change
  - `setPipelineBusy` is idempotent (no fire on same value)
  - unsubscribe stops delivery
  - multiple subscribers all receive events
  - throwing listener does not break siblings
  - unsubscribing one listener does not affect others
- `tests/lib/pipeline-checkpoint.test.ts` — 7 tests
  - `save → load` roundtrip preserves exact object
  - `load` returns null when nothing saved
  - `clear` wipes so subsequent load returns null
  - `load` swallows IDB errors → returns null
  - `save` swallows IDB errors → resolves void
  - `clear` swallows IDB errors → resolves void
  - `save` overwrites previous checkpoint
  - idb-keyval mocked with `vi.mock` + an in-memory `Map<key, value>` store; `shouldThrow` flag simulates storage failure for each op.
- `tests/lib/update-postpone.test.ts` — 10 tests
  - constants have correct values (120 min / 60 s)
  - `computePostponeDeadline` returns `now + 120min`
  - `shouldFireInstall`: idle branch, busy-before-deadline, deadline-elapsed, deadline-elapsed-AND-idle
  - integration: wire `subscribePipelineBusy` + `shouldFireInstall` in the same shape the component uses, verify busy→idle edge fires install once (+ fired-guard prevents double-fire)
  - integration: deadline-elapsed while busy → polling-style call fires install
  - integration: unsubscribe halts further edge-triggers
- `tests/lib/resume-checkpoint.test.ts` — 7 tests
  - no-ops when checkpoint is null
  - applies all 4 settings to state setters AND refs
  - flips in-work idea back to 'idea' status
  - does NOT flip if idea is 'done'
  - does NOT flip if idea missing from list
  - no flip needed when idea is already 'idea' status
  - `setPendingResume` called before `startPipeline` (call-order invariant)

### Small source refactors (to make the above tests possible)

- `lib/update-postpone.ts` (new, 24 lines):
  - Hoisted `PIPELINE_POSTPONE_MAX_MS` + `PIPELINE_POSTPONE_POLL_MS` constants.
  - New `computePostponeDeadline(now)` pure function.
  - New `shouldFireInstall(now, deadline, isBusy)` — captures the `idle || expired` predicate that was inline in the watchdog.
- `components/UpdateChecker.tsx`:
  - Dropped the inline constants and `const idle = ...; const expired = ...; if (idle || expired) {...}` block.
  - Replaced with `if (shouldFireInstall(Date.now(), deadline, isPipelineBusy())) {...}` and `computePostponeDeadline(Date.now())` at the entry to postponed state.
  - Behavior identical — the extracted functions were byte-equivalent to the inline code.
- `lib/resume-checkpoint.ts` (new, 58 lines):
  - New `applyResumeCheckpoint(cp, deps)` pure function. `deps` bag has: 4 state setters, 4 matching refs, `ideasRef`, `updateIdeaStatus`, `setPendingResume`, `startPipeline`.
  - Captures the exact side-effect sequence (apply settings → sync refs → flip idea status if in-work → clear prompt → startPipeline).
- `hooks/usePipeline.ts`:
  - `acceptResume` became a ~15-line thin wrapper that builds the deps bag and calls `applyResumeCheckpoint(pendingResume, deps)`. Same dependency array, same `useCallback` shape.

## Why not renderHook / RTL?

The existing vitest config uses `environment: 'node'`. Adding jsdom + `@testing-library/react` would be a meaningful install + config change, and none of the existing 129 tests need a DOM. The testable parts of the FEAT-006 code are the decision logic (predicate + deadline math) and the side-effect sequence (apply settings, flip idea, start), both of which are pure functions. Extracting them keeps the test env slim and also improves the code: logic no longer hides inside effect closures.

What's not covered in this round:
- The React effect wiring itself in `UpdateChecker` (the `useEffect` that subscribes, sets up setInterval, and cleans up). Re-creating that with a `renderHook` would require jsdom. The `tests/lib/update-postpone.test.ts` "wiring" block replays the exact pattern the effect uses, so a regression in the pub/sub or decision-logic seams would still fail.
- `dismissResume` itself — it's a 2-liner (`setPendingResume(null); void clearCheckpoint();`), and `clearCheckpoint`'s contract is covered by `pipeline-checkpoint.test.ts`.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Tests for pipeline-busy pub/sub (subscribe, publish, unsubscribe) | done — 7 tests |
| Tests for pipeline-checkpoint IDB roundtrip (save, load, clear) | done — 7 tests incl. error swallowing |
| Tests for UpdateChecker postpone watchdog (busy gate, 120-min cap, subscribe/unsubscribe) | done — 10 tests via extracted helper + integration wiring |
| Tests for acceptResume/dismissResume flow | done — 7 tests via extracted helper; dismissResume semantics covered by clearCheckpoint tests |
| All existing 129 tests still pass | done — `vitest run` reports 160 passed (129 + 31 new) |
| `tsc` clean | done — `npx tsc --noEmit` exits 0 |
| Write FIFO when done | pending (this commit) |

## Files touched
- `lib/update-postpone.ts` (new)
- `lib/resume-checkpoint.ts` (new)
- `components/UpdateChecker.tsx` (imports + replace inline constants/decision with helper calls)
- `hooks/usePipeline.ts` (acceptResume delegates to applyResumeCheckpoint)
- `tests/lib/pipeline-busy.test.ts` (new)
- `tests/lib/pipeline-checkpoint.test.ts` (new)
- `tests/lib/update-postpone.test.ts` (new)
- `tests/lib/resume-checkpoint.test.ts` (new)

## Follow-up (deferred)
Adding jsdom + `@testing-library/react` to the test toolchain is worthwhile if we expect to keep growing client-side logic that lives inside effects. For this release, pure-function extraction hits the critical regression surface. Tracked in the debrief's "Improvements worth considering" section.
