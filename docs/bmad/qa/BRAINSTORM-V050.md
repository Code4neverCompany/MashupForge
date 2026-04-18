# Brainstorm: Top 3 priorities after v0.4.3

**Date:** 2026-04-19
**Author:** QA subagent
**Context:** 50+ features shipped v0.2→v0.4.3, 319 tests, 13 releases

---

## UX — what would delight users most

### 1. Credit-preserving resume (mid-step resume, for real)

`PipelineResumePrompt` already shows the interrupted idea and step.
The pain point is the warning it currently shows: "Leonardo will regenerate
images and re-spend credits." The checkpoint already saves `imageIds` of
images that were generated before the crash. `acceptResume` ignores them and
starts from scratch.

**Change:** When `imageIds.length > 0`, skip the image generation step in
`runOuterLoop` — find those images in the gallery by ID and hand them
directly to the captioning step. Zero new credits spent on resume.
This transforms the resume from "do you want to waste credits?" into
"pick up exactly where you left off." Infrastructure is 90% there.

### 2. Inline caption editing in the approval queue

Posts land as `pending_approval` (V040-008). The user can approve or
reject them but cannot edit the AI caption before approving. They must
approve as-is (trusting the AI) or navigate away to edit in a separate
surface — friction that breaks the "review → tweak → ship" flow.

**Change:** Make the caption in each approval card a click-to-edit
textarea. On approval, the edited caption goes with it. One `useState`
per card, persists on blur. This is the highest-friction point in the
post-production workflow.

### 3. Month-view heatmap

V040-001 delivered the week-view engagement heatmap. Month view is the
natural complement — per-day background tinting using the max slot score
for that day, turning the month calendar into a scheduling intelligence
surface instead of just a grid. The spec (§9) flagged this as a
follow-up. `computeWeekScores` already returns the per-slot data;
month view just needs a per-day aggregation pass.

---

## Code quality — what would prevent the most bugs

### 1. Approval-flow integration test in pipeline-processor

V040-008 fixed per-platform approval gating everywhere *except*
`CarouselGroup.status` (line 292, hardcoded `'scheduled'`). The 9 unit
tests for `isPlatformAutoApproved` and `resolvePipelinePostStatus` were
all correct — but no test walked the `processIdeaFn` carousel path
end-to-end and asserted the post structure.

**Add 2 tests to `tests/lib/pipeline-processor.test.ts`:**
- Carousel with Instagram → `ScheduledPost.status === 'pending_approval'`
  AND `CarouselGroup.status` is not `'scheduled'`
- Single-image with twitter-only → `ScheduledPost.status === 'scheduled'`

These tests would have caught the v0.4.0 bug. They close the class of
"helper correct, wiring wrong" regressions.

### 2. jsdom/happy-dom hook tests via per-file environment

Every hook test this session (V030-QA-002) required extracting a pure
function *just to test the hook*. `useIdeaProcessor.processIdea` wiring
— the AbortSignal binding, `perIdeaImageIds` accumulation, `writeCheckpoint`
delegation — can only be tested via `processIdeaFn` proxies today.

**Add `happy-dom` as a dev dep.** Enable per-file with
`// @vitest-environment happy-dom` + `@testing-library/react`.
Hook tests can then call `renderHook(() => useIdeaProcessor(deps))`
directly. The extraction proxy approach caught *most* bugs but is one
refactor away from a false negative.

### 3. `fanCaptionToGroup` WARN-1 guard test + shared fixtures

Two in one:

- The "don't overwrite manually-edited siblings" guard
  (`if (!force && ci.postCaption) continue`) has been flagged since
  QA-BUG-001 and carried through every gate. One targeted test:
  call `fanCaptionToGroup` with an image that already has a manually-set
  caption, assert it is NOT overwritten when `force=false`.

- `makeIdea`, `makeImage`, `makeSettings`, `makeEngagement`, `makeDeps`
  are copy-pasted across 4 test files (~200 lines of duplicate fixture
  code). Extract to `tests/fixtures/index.ts`. Prevents fixture drift
  (one file already uses a slightly different `makeImage` default)
  and drops new test boilerplate to near zero.

---

## Developer experience — what would speed up our workflow

### 1. Shared `tests/fixtures/index.ts`

The fixture duplication (4×) is the single highest tax on writing new
tests. Right now starting a new test file requires either copy-pasting
80 lines of boilerplate or writing worse tests with inline objects.

**Create `tests/fixtures/index.ts`** exporting `makeIdea`, `makeImage`,
`makeSettings`, `makeEngagement`, `makeDeps`, `makePost`,
`makeEngagement`, `makeSlot`. Single source of truth. Drop boilerplate
for any future test from ~80 lines to 1 import.

### 2. Pre-commit hook: `tsc --noEmit` + `vitest run` in ~2s

The test suite runs in 750ms. `tsc --noEmit` adds ~3s. A Husky/simple-git-hooks
pre-commit would have caught at least 50% of the session's bugs before
commit. The V040-008 status inconsistency still would have needed the
integration test (§1 above), but any future regression in existing tests
gets caught in the same terminal tab where you committed.

**Add `simple-git-hooks` + `"pre-commit": "npx tsc --noEmit && npx vitest run"`
to package.json.** Two lines. 4-second feedback loop before push.

### 3. jsdom per-file environment (DX angle)

Same as quality item #2 but viewed as workflow: the current "extract pure
function → test it → hope the wiring matches" pattern costs ~30 extra
minutes per hook QA gate. With `happy-dom`, hook tests are first-class
and future refactors (like V030-001's hook split) get full test coverage
naturally, not as a workaround.

---

## Summary table

| Priority | UX | Quality | DX |
|---|---|---|---|
| 1 | Credit-preserving resume | Approval-flow integration test | Shared test fixtures |
| 2 | Inline caption editing | jsdom/happy-dom hook tests | Pre-commit tsc+vitest |
| 3 | Month-view heatmap | fanCaptionToGroup WARN-1 + fixtures | jsdom per-file env |

Note: jsdom appears in both quality and DX because it delivers both.
The shared fixtures item appears in both quality and DX for the same reason.
Tackle them once; benefits compound.
