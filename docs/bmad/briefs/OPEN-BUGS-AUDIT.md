# OPEN-BUGS-AUDIT — sweep for v0.9.11

**Date:** 2026-04-28
**Auditor:** dev (Developer agent)
**Scope:** the 6 bug IDs surfaced by Hermes's codebase grep
**HEAD at audit:** `153473b` (= `v0.9.10` = `origin/main`)
**Test state at audit:** 892/892 passing, `tsc --noEmit` clean

## TL;DR

All 6 bug IDs are **already closed**. Each has:
- a completion review at `docs/bmad/reviews/<BUG-ID>.md` (status `done` / `fixed`),
- a fix commit on `main`,
- a release tag that shipped it,
- regression coverage in the test suite (and the cited tests pass).

The grep that surfaced these IDs hit comments like `// BUG-CRIT-013: markPostReady drives Post Ready tab membership…` — those are **contract-pinning** notes left by the original fixes (so a future reader doesn't accidentally re-break the invariant). They are **not** open-bug markers.

Recommendation: **nothing in this list blocks v0.9.11**. If Hermes wants the next release's bug pool, the methodology should switch from "grep BUG-* in source" to: open issues in the tracker, failing tests, or new findings from QA.

## Classification

### MUST FIX (block v0.9.11)
*(empty)*

### SHOULD FIX
*(empty)*

### CAN WAIT
*(empty — none of these are open)*

### ALREADY DONE — no action

| Bug | Severity | Fix commit | Released in | Review doc | Test gate |
|-----|----------|------------|-------------|------------|-----------|
| **BUG-CRIT-010** — GalleryCard z-30 dropdown clips parent row | critical | `5c93d06` | `v0.5.1` (`df02178`) | `docs/bmad/reviews/BUG-CRIT-010.md` | visual; component comment at `components/GalleryCard.tsx:336` |
| **BUG-CRIT-011** — auto-poster snapshot loop regression | critical | `e35ea43` | `v0.6.2` (`a064adb`) | `docs/bmad/reviews/BUG-CRIT-011.md` | `tests/lib/post-approval-gate.test.ts` (passes) |
| **BUG-CRIT-012** — carousel approve-all sequential-call invariant | critical | `cdbcadd` | `v0.6.2` (`a064adb`) | `docs/bmad/reviews/BUG-CRIT-012.md` | `tests/lib/approval-actions.test.ts` (passes) |
| **BUG-CRIT-013** — markPostReady Post Ready tab membership | critical | `a44a8a5` | `v0.6.2` (`a064adb`) | `docs/bmad/reviews/BUG-CRIT-013.md` | `tests/lib/pipeline-finalize.test.ts` (passes) |
| **BUG-DEV-003** — finalize pipelinePending on reject | medium | `2fafb52` | `v0.5.2` (`7d51d4d`) | `docs/bmad/reviews/BUG-DEV-003.md` | `tests/integration/reject-finalize.test.ts` (passes) |
| **BUG-DEV-004** — per-image catch surfaces unexpected failures | low | `610433a` | `v0.5.2` (`7d51d4d`) | `docs/bmad/reviews/BUG-DEV-004.md` | `approval-gate-watermark.test.ts` regression (passes) |

## Per-bug verification trail

### BUG-CRIT-010 — GalleryCard z-30 dropdown clips parent row
- `components/GalleryCard.tsx:336` — comment pins the contract: *"z-30 keeps the row (and its KebabMenu dropdown…) above the bottom prompt overlay (also z-[20])"*. The bumped class is in place.
- Review envelope (in review doc): `{"status":"done","summary":"GalleryCard top-action row bumped from z-20 → z-30 so its KebabMenu dropdown paints above the bottom prompt overlay…"}`.

### BUG-CRIT-011 — auto-poster snapshot loop regression
- The fix introduces `lib/post-approval-gate.ts` as the single source of truth for "may this content be posted". Comments at `components/MainContent.tsx:461,1005,1479,1560,1610` pin live re-checks at every approval-gated site.
- Review doc lists status `fixed`, dated 2026-04-20.
- `tests/lib/post-approval-gate.test.ts` is the regression gate (file header line 8: *"BUG-CRIT-011 regression gate"*).

### BUG-CRIT-012 — carousel approve-all sequential-call invariant
- Fix splits per-carousel-sibling reads of the *rendered* settings (closure-timing fix) at `components/MashupContext.tsx:217,249`.
- Review doc status `fixed`, 2026-04-20.
- `tests/lib/approval-actions.test.ts:107` describe block: *"BUG-CRIT-012 — carousel approve-all sequential-call invariant"*.

### BUG-CRIT-013 — markPostReady Post Ready tab membership
- `lib/pipeline-finalize.ts:51` — `markPostReady` now flips `isPostReady: true`. Comments at `components/MainContent.tsx:625,985` show every surfacing site.
- Review doc status `fixed`, 2026-04-20.
- `tests/lib/pipeline-finalize.test.ts:105` regression case.

### BUG-DEV-003 — finalize pipelinePending on reject
- Both reject paths in `components/MashupContext.tsx:242,305` now call `finalizePipelineImagesForPosts` with the actually-rejected posts captured inside `updateSettings`.
- Review doc status `done`. Envelope summary: *"Both reject paths now capture the actually-rejected posts inside updateSettings and call finalizePipelineImagesForPosts after, same pattern as bulkApprove…"*.
- Pinned by `tests/integration/reject-finalize.test.ts` and `tests/lib/gallery-visibility.test.ts:11`.

### BUG-DEV-004 — per-image catch surfaces unexpected failures
- `components/MashupContext.tsx:192` — per-image `await` is now wrapped in `try/catch` inside `Promise.all`, with `console.warn('[MashupContext] finalize/save failed for…')`. `lib/pipeline-finalize.ts` watermark catch also bound + logged.
- Review doc status `done`. Envelope: *"Two layers of silent watermark error swallowing now surface to console.warn…"*.
- Regression: existing `approval-gate-watermark.test.ts` BUG-CRIT-001 describe block was extended (455th passing test at the time of fix; suite is now 892/892).

## Methodology note for next sweep

`grep -E "BUG-(CRIT|DEV)-[0-9]+"` over source returns hits from three categories that look identical syntactically:

1. **Open bug** — header comment / TODO claiming the bug.
2. **Pinned contract** — comment at the *fixed* call site documenting the invariant. *(All 6 hits here.)*
3. **Test name** — describe/it block referencing the regression gate.

For an open-bugs sweep, prefer: `grep -rE "BUG-(CRIT|DEV)-[0-9]+" docs/bmad/reviews/ -L --include="*.md"` (review doc *missing* = potentially open) or list issues from the tracker. Source-comment grep over-collects.

## Recommendation

Nothing to schedule for v0.9.11 from this list. If we want a real bug pool for the next release, two cheaper sources:

- failing tests (`npx vitest run` is currently green — none),
- TODO/FIXME/HACK grep in source (separate sweep),
- whatever QA flagged in `docs/bmad/qa/` after v0.9.10 ships to TestFlight equivalents.

Closing this audit task.
