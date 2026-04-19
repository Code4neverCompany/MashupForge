# BUG-CRIT-001 — Pipeline approval gate enforced; watermark-on-approval contract pinned

**Status:** done
**Classification:** complex
**Severity:** critical
**Why:** Pipeline-produced posts were skipping the approval queue when
every platform was auto-approved (the default after V040-HOTFIX-001),
*and* the watermark step was tied to the same gate, so auto-approved
posts also went out un-watermarked. Two production-impacting holes
sharing one root cause.

## Root cause

`resolvePipelinePostStatus(platforms, config)` returned `'scheduled'`
whenever every platform in the post was in the auto-approve set. After
the V040-HOTFIX-001 default flip (`DEFAULT_AUTO_APPROVE = { instagram:
true, pinterest: true, twitter: true, discord: true }`), that
fast-path applied to every legacy user and every fresh install — so
the approval queue effectively became opt-in.

The watermark pass is performed inside
`MashupContext.approveScheduledPost` via
`finalizePipelineImagesForPosts` → `finalizePipelineImage`. Posts that
took the scheduled fast-path never hit that approval handler, so they
also never got watermarked. The `pipelinePending` flag on
`GeneratedImage` (which gates Gallery visibility *and* the watermark
pass) was only set when the post status was `pending_approval` —
making the same gate dual-purpose.

Net effect: AI-generated posts could publish to live channels with
zero human review and no watermark. A bad caption, mistagged image, or
model hallucination went straight to the audience, unbranded.

## Fix

`resolvePipelinePostStatus` now unconditionally returns
`'pending_approval'`. One line of behavior change at the gate, but it
closes the safety hole and the watermark hole simultaneously because
the two were already coupled — every pipeline post now flows through
`approveScheduledPost`, which is exactly where the watermark already
lives.

```ts
// lib/pipeline-daemon-utils.ts
export function resolvePipelinePostStatus(
  _platforms: string[],
  _config: AutoApproveMap | undefined,
): 'scheduled' | 'pending_approval' {
  return 'pending_approval';
}
```

The signature is preserved (params kept, prefixed `_` to silence
unused-parameter warnings) so existing call sites and the
`pipelineAutoApprove` config plumbing stay intact for the
PipelinePanel UI. `isPlatformAutoApproved` is still exported and
unchanged — the per-platform checkboxes in the panel still render and
persist user choices, they just no longer affect the output gate.

## Acceptance criteria — all met

| Criterion                                                   | Status |
|-------------------------------------------------------------|--------|
| Pipeline stops at approval gate (does NOT auto-schedule)    | ✓ |
| Only approved content moves to scheduling                   | ✓ |
| Watermark applied on approval                               | ✓ (already wired through `finalizePipelineImage`; now reachable for every post) |
| Write inbox                                                 | ✓ (envelope below) |

## Files touched

### Production
- `lib/pipeline-daemon-utils.ts` — `resolvePipelinePostStatus`
  rewritten to always return `'pending_approval'`. Long docstring
  explaining the safety + watermark rationale and the back-compat
  decision to keep the params + the `pipelineAutoApprove` setting.

### Tests
- `tests/lib/pipeline-daemon-utils.test.ts` — consolidated the
  6-case `describe('resolvePipelinePostStatus')` block (which
  exercised the old per-platform fast-path) down to 4 cases under a
  new `describe('resolvePipelinePostStatus (BUG-CRIT-001 — always
  pending_approval)')` block. The four cases pin the contract:
  single auto-approved platform, multi-platform, ignored config map,
  empty array.
- `tests/lib/pipeline-processor.test.ts` — flipped 2 tests:
  - `'sets CarouselGroup.status = scheduled when every platform
    auto-approves'` → `'always gates carousels through approval'`
    (asserts `carouselGroups[0].status === 'draft'` and posts are
    `pending_approval`).
  - `'leaves saved images pipelinePending=undefined'` → `'always
    marks saved images pipelinePending=true'` (asserts every saved
    pipeline image has `pipelinePending === true` so Gallery hides
    it and the watermark pass waits).
- `tests/integration/approval-gate-watermark.test.ts` (NEW, 6 cases)
  pinning the BUG-CRIT-001 contract end-to-end:
  - 4 cases under `describe('BUG-CRIT-001 — pipeline always gates
    through approval')`:
    - all-true `pipelineAutoApprove` → still pending_approval
    - undefined config (legacy default) → still pending_approval
    - carousel mode → posts pending_approval, group status `draft`
    - every saved image carries `pipelinePending: true`
  - 2 cases under `describe('BUG-CRIT-001 — watermark-on-approval
    contract')` exercising `finalizePipelineImage` directly:
    - watermark enabled → `applyWatermark` called with original URL,
      output URL replaced, `pipelinePending` cleared
    - watermark disabled → `applyWatermark` NOT called, original URL
      preserved, `pipelinePending` still cleared (Gallery lights up
      either way)

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — 385/385 passing across 37 files (was 379 before
  this task; +6 new cases, net +6 because of the two pipeline-processor
  test name flips and the test-block consolidation in
  pipeline-daemon-utils.test.ts).

## Out of scope (follow-up)

The `pipelineAutoApprove` per-platform UI in `PipelinePanel` is now
vestigial — the checkboxes still persist, but the gate ignores them.
Two reasonable cleanups for a future task:

1. Delete the UI checkboxes and the `pipelineAutoApprove` field on
   `UserSettings` once we're confident no one wants the per-platform
   override back.
2. OR: re-introduce the fast-path behind an explicit "I understand
   my pipeline output is unwatermarked" warning, with the watermark
   step decoupled from the approval gate (apply on save instead of
   on approve).

Both are deferred — the immediate priority was closing the safety +
watermark hole, not redesigning the panel.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-001","status":"done","summary":"Pipeline approval gate enforced unconditionally. resolvePipelinePostStatus now always returns 'pending_approval'; closes the dual safety + watermark hole in one change because watermark already runs inside approveScheduledPost. Updated 2 pipeline-processor tests + consolidated daemon-utils test block; added tests/integration/approval-gate-watermark.test.ts (6 cases). tsc clean, 385/385 pass."}
```
