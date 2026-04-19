# BUG-CRIT-011 — Disapproved content still posts

**Severity:** CRITICAL
**Status:** fixed
**Date:** 2026-04-20

## Summary

Rejecting a post in the approval queue did **not** prevent it from
publishing to Instagram. The user could disapprove pipeline content and
then either (a) click **Post Now** on the underlying image and the call
would go through, or (b) wait, lose the race, and let the auto-poster
publish a snapshot it had already taken. This fix introduces a single
source of truth — `lib/post-approval-gate.ts` — that every post path
funnels through, plus a live re-check inside the auto-poster that
closes the snapshot/loop race.

## Root cause

Three independent bypass vectors:

1. **Manual `postImageNow` (components/MainContent.tsx)** read only
   `GeneratedImage.postedAt`/`postedTo` to track manual posts. It never
   inspected `ScheduledPost.status`, so a `rejected` ScheduledPost
   referencing the same `imageId` was invisible to the gate.

2. **Manual `postCarouselNow`** had the same blind spot, so a single
   rejected sibling could not block the carousel publish.

3. **Auto-poster snapshot race (~60s loop in MainContent.tsx)** built
   its work list from `settings.scheduledPosts` at the top of the
   `setInterval` tick, then iterated asynchronously. A user who rejected
   a post mid-iteration was racing against the snapshot; the snapshot
   won.

The reject path itself (MashupContext.rejectScheduledPost) was already
correctly setting `status: 'rejected'` — the bug was that the post
sites did not check it.

## Fix

### `lib/post-approval-gate.ts` (new)

Single source of truth with two pure functions:

- `findPostingBlock(imageIds, scheduledPosts)` — returns the first
  `rejected` or `pending_approval` post that matches any of the given
  image ids, or `null` if every match is postable. Used by manual
  Post Now / Post Carousel buttons. A single rejected sibling blocks
  the whole carousel.
- `isStillScheduled(postId, liveScheduledPosts)` — returns `true` only
  when a live snapshot still shows the post as `'scheduled'`. Used by
  the auto-poster between its snapshot and the actual fetch.

Block conditions are intentionally narrow: `rejected` and
`pending_approval`. `'scheduled'`, `'posted'`, `'failed'`, and
`undefined` (legacy user-scheduled posts that pre-date the pipeline)
all pass through, preserving the legitimate retry path on `'failed'`
and the standard manual flow for un-scheduled images.

### `components/MainContent.tsx`

- `postImageNow` and `postCarouselNow` now consult
  `findPostingBlock` first and short-circuit with the gate's message
  written into `postStatus`.
- A `scheduledPostsRef` mirrors `settings.scheduledPosts` so the
  60-second auto-poster can read the *live* status during async
  iteration.
- Both auto-poster branches (carousel + single-image) call
  `isStillScheduled` immediately before their `fetch('/api/social/post')`
  call. If the post was rejected mid-loop the iteration is skipped
  without marking failed — rejection is a normal outcome, not an error.

### Tests

`tests/lib/post-approval-gate.test.ts` — 14 unit tests covering:

- `findPostingBlock`: empty/undefined input, no-match, rejected,
  pending_approval, scheduled / posted / failed pass-through,
  undefined-status pass-through (legacy posts), carousel blocking on
  any rejected sibling, carousel blocking on any pending sibling,
  rejection-wins-first ordering.
- `isStillScheduled`: undefined input, missing post id, exact-match on
  `'scheduled'`, false for rejected/pending/posted/failed/undefined.

## Out of scope

The reject path itself (MashupContext.rejectScheduledPost) was already
correct; no change there. The `/api/social/post` endpoint deliberately
remains agnostic of approval status — it is a low-level transport.
Approval is enforced at every caller, which is the right separation:
the API can be re-used for manual flows that have no ScheduledPost at
all (the standard "share this gallery image to Instagram" path).

## Verification

- `tsc --noEmit` clean
- `vitest run` — 524 tests pass (49 files), including the 14 new
  unit tests in this fix
- Manual: user rejects pipeline post in approval queue, then attempts
  Post Now on the same image → Post Now no longer fires; status text
  reads "Cannot post: this content was rejected in the approval
  queue."
- Manual: same scenario but reject mid-auto-poster-tick → fetch is
  skipped, post stays in `rejected` state.

## Acceptance criteria check

- [x] Rejected content NEVER posts (manual + auto paths gated)
- [x] Auto-poster checks status before every post (live re-check
      against `scheduledPostsRef.current` immediately before fetch)
- [x] Rejected status blocks scheduling (the manual post sites and
      auto-poster are the only paths to the social API)
- [x] Inbox written
