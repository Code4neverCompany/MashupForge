---
id: V040-HOTFIX-002
title: V040-HOTFIX-002 — Degrade-guard prevents reject from dropping a carousel below 2 images
status: done
date: 2026-04-18
classification: routine
relates_to: V040-DES-003
---

# V040-HOTFIX-002 — Carousel reject can no longer degrade to a 1-image post

## What was wrong

V040-DES-003 shipped `CarouselApprovalCard` with per-image Approve and
Reject buttons that fire `onRejectPost(post.id)` directly into the
parent's reject handler. That handler removes the `ScheduledPost` from
the schedule, but it has no awareness of the carousel as a whole.

If a user had a 2-image carousel and clicked Reject on one image, the
remaining post was left orphaned in the carousel group with `count = 1`.
The auto-poster later refused to fan it out (Instagram and Pinterest
both require ≥2 images for a carousel), and the post sat in limbo —
not a single, not a carousel, not posted.

`DegradeNotice` shipped at the same time but was wired to a
parent-controlled prop (`degradeVisible`) that the parent
(`ApprovalQueue`) never set. So the warning UI existed in the bundle
and never rendered. Dead code.

## What changed

### `lib/carousel-degrade-guard.ts` (new)

Pure helper, two exports:

- `CAROUSEL_MIN_IMAGES = 2` — the floor below which a carousel is no
  longer a carousel. Named constant so future platform additions
  (TikTok carousels?) can refer to one source of truth.
- `canRejectMoreInCarousel(nonRejectedCount)` — returns `true` only
  when `nonRejectedCount > 2`. Guards against the next reject dropping
  the carousel to a single.

Pure / DOM-free so it slots into the existing vitest suite without
needing RTL or jsdom (which the project doesn't run).

### `components/approval/CarouselApprovalCard.tsx`

- Computes `nonRejectedCount = counts.pending + counts.approved`
  and `rejectGuarded = !canRejectMoreInCarousel(nonRejectedCount)`.
- `rejectImage` early-returns when `rejectGuarded` (defense in depth —
  the UI also disables the buttons, but the helper is the source of truth).
- `rejectCarousel` was rewritten to bypass the per-image guard and
  call `onRejectPost` directly per image. Whole-carousel reject is an
  explicit kill action; the floor only applies to per-image rejects
  that would silently degrade a still-wanted carousel.
- Dropped the unused `degradeVisible` prop (the parent never passed it).
  `DegradeNotice` is now driven by the locally-derived `rejectGuarded`.
- Passes `rejectGuarded` down to `CarouselReviewPanel`.

### `components/approval/CarouselReviewPanel.tsx`

- New optional `rejectGuarded` prop (defaults to `false` so any
  hypothetical other caller still gets the old behavior).
- When `true`: per-image Reject buttons render with `disabled`,
  `disabled:` Tailwind classes, and a `title` tooltip
  ("Carousel needs at least 2 images") so the affordance is
  understandable on hover.
- Renders `DegradeNotice` above the bottom action bar so the warning
  is visible inside the expanded review panel, not just on the
  collapsed thumbnail card.
- Whole-carousel `Reject carousel` button stays enabled — same
  rationale as in the parent.

### `components/approval/DegradeNotice.tsx`

- Default message updated from the old speculative
  "Degrading to single-image post…" (which described an auto-degrade
  that was never wired) to the constraint that's actually true today:
  "Carousel needs at least 2 images — reject disabled".
- New optional `message` prop so the notice can be reused if we ever
  do wire a true auto-degrade transition (which would still need PROP
  per the V040-DES-001 spec).

### `tests/lib/carousel-degrade-guard.test.ts` (new)

Five-test block covering:
- exported `CAROUSEL_MIN_IMAGES` value
- guard returns true when above the floor (3, 4, 10)
- guard returns false at the floor (2 — rejecting would drop to 1)
- guard returns false defensively below the floor (0, 1)

Suite total: 27 files / 283 tests (was 26 / 278 — net +5 from this
block, no other file touched).

## Why "disable reject" instead of "auto-degrade"

The task spec offered both routes. Disable was the right call here:

- Auto-degrade requires mutating `CarouselGroup.imageIds` and
  flipping the orphan post from a carousel-grouped to a single-post
  shape. Designer's V040-DES-001 spec explicitly flagged that work as
  PROP-gated complex (schema-shape change). A hotfix should not pull
  in PROP work.
- Disable + tooltip + visible warning gives the user three clear
  signals (greyed button, hover tooltip, amber banner) so the gate is
  legible. They can still kill the whole carousel via "Reject carousel"
  if that's what they actually wanted.
- Auto-degrade would be the *right* UX long term, but it should land
  with a PROP that designs the transition (animation, undo, what
  happens to the second post's `carouselGroupId`).

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Reject disabled when count would drop below 2 | ✅ Per-image Reject buttons in `CarouselReviewPanel` are `disabled` when `rejectGuarded` is true; the underlying `rejectImage` handler also early-returns as defense in depth |
| OR auto-degrade to single post | N/A — we picked the disable route (auto-degrade is PROP-gated work) |
| `DegradeNotice` wired and visible | ✅ Rendered on both the collapsed card and the expanded review panel when `rejectGuarded` is true |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Auto-degrade transition** — see "Why disable" above; needs PROP.
- **Persistence of per-image local status across page reload** — still
  PROP-gated per V040-DES-001. The guard works on the local optimistic
  state, which is the same state the rest of the card already uses.
- **Bulk-reject path in `ApprovalQueue`** — bulk reject can still
  fully reject all selected posts; if those happen to span a carousel,
  the user is explicitly killing it. Same logic as whole-carousel reject.
- **Other carousel minimums** — Instagram is 2, Pinterest carousels
  are 2, Twitter has no native carousel, Discord webhooks have no
  carousel concept. The single `CAROUSEL_MIN_IMAGES = 2` constant
  covers every platform we currently fan out to.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 27 files / 283 tests passing (was 26 / 278 — net
  +1 file / +5 tests from the new degrade-guard block; no other test
  file touched)

## Files touched

- `lib/carousel-degrade-guard.ts` (new, 28 lines)
- `components/approval/CarouselApprovalCard.tsx` (guard wiring,
  `rejectCarousel` rewrite, drop unused prop)
- `components/approval/CarouselReviewPanel.tsx` (new prop, disabled
  state on per-image Reject, embed DegradeNotice in expanded view)
- `components/approval/DegradeNotice.tsx` (default message + optional
  override prop)
- `tests/lib/carousel-degrade-guard.test.ts` (new, 5 tests)
- `docs/bmad/reviews/V040-HOTFIX-002.md` (this file)
