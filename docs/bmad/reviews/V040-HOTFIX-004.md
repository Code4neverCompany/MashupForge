---
id: V040-HOTFIX-004
title: V040-HOTFIX-004 — CarouselGroup.status now reflects per-post approval state instead of being hardcoded
status: done
date: 2026-04-18
classification: routine
relates_to: V040-008, V040-HOTFIX-001
---

# V040-HOTFIX-004 — Stop hardcoding CarouselGroup.status to 'scheduled'

## What was wrong

`lib/pipeline-processor.ts` line 292 (carousel branch of `processIdea`)
wrote `status: 'scheduled' as const` into the new `CarouselGroup`
unconditionally — even when the per-post `carouselStatus` resolved to
`'pending_approval'` (which happens whenever any platform on the post
has `pipelineAutoApprove.<platform> === false`).

Net effect: the per-`ScheduledPost` records correctly carried
`status: 'pending_approval'` (V040-008's per-platform gating did its
job), but the parent `CarouselGroup` immediately claimed
`status: 'scheduled'`. Anything reading the carousel group's status
to drive UI (status pill colors, post-ready filters, "draft vs
scheduled" counts on the gallery side) saw a scheduled carousel that
was actually still pending approval. QA flagged the divergence in the
v0.4.0 debrief.

## What changed

### `lib/pipeline-processor.ts`

In the carousel-mode scheduling block (inside `processIdea`):

- After `carouselStatus = resolvePipelinePostStatus(platforms, autoApprove)`
  computes the per-post status, derive a matching
  `carouselGroupStatus`:
  - `'scheduled'` when `carouselStatus === 'scheduled'`
  - `'draft'` otherwise (i.e. when posts are `'pending_approval'`)
- Pass `carouselGroupStatus` into the `CarouselGroup` payload instead
  of the literal `'scheduled' as const`.

`'draft'` was the right choice over inventing a new value: the
`CarouselGroup.status` type only allows
`'draft' | 'scheduled' | 'posted' | 'failed'` (no `'pending_approval'`),
and user-built carousel groups in the gallery (`MainContent.tsx:582`)
already enter as `'draft'` until they get scheduled. Reusing the
existing convention keeps the field's semantics consistent across
both pipeline-built and user-built groups: "not yet scheduled, may
need user action."

### `tests/lib/pipeline-processor.test.ts`

Two new tests inserted into the `processIdea — carousel mode`
describe block:

- `'sets CarouselGroup.status = scheduled when every platform
  auto-approves'` — explicit `pipelineAutoApprove: { twitter: true,
  discord: true }` config with both platforms in
  `pipelinePlatforms`. Asserts the captured `updateSettings` patch
  has `carouselGroups[0].status === 'scheduled'` AND every scheduled
  post is `'scheduled'` (sanity check for consistency).
- `'sets CarouselGroup.status = draft when any platform requires
  manual approval'` — explicit `{ instagram: false, twitter: true }`.
  Asserts the patch has `carouselGroups[0].status === 'draft'` AND
  every scheduled post is `'pending_approval'`.

Both extract the function-form `updateSettings` argument from the
mock's call list and invoke it with an empty prev to inspect the
patch shape — a pattern the existing test file already uses for
`scheduleCalls.length` assertions.

Suite total: 28 files / 294 tests (was 28 / 292 — net +2; same files,
no new test files).

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| `CarouselGroup.status` reflects actual post state | ✅ Derived directly from `carouselStatus` (which is in turn derived from `platforms` + `pipelineAutoApprove`) |
| Not hardcoded to `'scheduled'` | ✅ Hardcoded literal removed; replaced with conditional value |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Adding `'pending_approval'` to `CarouselGroup.status`** — that's
  a schema-shape change; if we ever want true parity with
  `ScheduledPost.status`, it should land in a PROP that also reasons
  about migration of any persisted `'scheduled'` records that should
  be `'pending_approval'` in retrospect.
- **Backfilling existing carousel groups** — there's no migration
  shim to retroactively flip persisted `'scheduled'` records that
  were created under the old hardcoded behavior. Users would need to
  re-run the pipeline to get correctly-statused carousel groups.
  Acceptable for v0.4.x: the per-post `'pending_approval'` status is
  what actually gates auto-posting, so the bug was cosmetic for the
  carousel group itself.
- **Single-mode pipeline path** — the per-post `status` field is set
  correctly there already (line 366-369 uses `resolvePipelinePostStatus`
  directly); single mode doesn't write a `CarouselGroup` row, so
  there's no parallel bug to fix.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 28 files / 294 tests passing (was 28 / 292 — net
  +2 tests in the carousel-mode describe block)

## Files touched

- `lib/pipeline-processor.ts` (one literal → conditional, +6 lines
  of comment explaining the `'draft'` choice)
- `tests/lib/pipeline-processor.test.ts` (+2 tests inserted into the
  existing carousel-mode describe block)
- `docs/bmad/reviews/V040-HOTFIX-004.md` (this file)
