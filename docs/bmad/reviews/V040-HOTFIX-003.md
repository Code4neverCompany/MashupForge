---
id: V040-HOTFIX-003
title: V040-HOTFIX-003 — 6s ghost memory keeps approved/rejected images visible after parent re-render
status: done
date: 2026-04-18
classification: routine
relates_to: V040-DES-003
---

# V040-HOTFIX-003 — Approval flicker fix via ghost memory

## What was wrong

In `CarouselApprovalCard`, clicking Approve (or Reject) on an image:

1. Fires `setLocalStatus({ [id]: 'approved' })` — local checkmark on.
2. Fires `onApprovePost(post.id)` — parent flips
   `ScheduledPost.status` from `'pending_approval'` to `'scheduled'`,
   which removes the post from the parent's filtered approval-queue
   list.
3. Parent re-renders the card with `posts` minus that post → the
   `images` array (derived from `posts.map`) no longer contains the
   acted-on image → the row vanishes from the strip and the review
   panel.

Net result: the user clicks Approve, the checkmark flickers for one
frame, then the row disappears entirely. The action looks like a
silent no-op or a glitch — the very feedback the local optimistic
state was meant to provide is wiped out before it can render.

Designer's V040-DES-001 spec already flagged "per-image status
persistence" as PROP-gated complex work. So we can't fix this by
making the parent retain approved posts in its filtered list. The
hotfix-shaped answer is to keep an ephemeral "ghost" of the row in
the card itself for a few seconds after the action, then let it fade.

## What changed

### `lib/carousel-ghost.ts` (new)

Pure helpers, three exports:

- `GHOST_TTL_MS = 6000` — meets the 6s acceptance criterion.
- `pruneExpiredGhosts(ghosts, now)` — drops entries whose `expiresAt`
  is at or before `now`. Returns the input reference unchanged when
  nothing expired so callers (the card's React state setter) can use
  referential equality to skip re-renders.
- `nextGhostExpiry(ghosts)` — returns the soonest `expiresAt` or
  `null` when empty. The card uses this to schedule a single sweep
  timer per ghost set.

DOM-free / pure so the existing vitest suite covers them without
needing RTL or jsdom.

### `components/approval/CarouselApprovalCard.tsx`

Three new pieces of local state on top of the existing `localStatus`
and `expanded`:

- **`ghosts`** (`Record<imageId, CarouselGhost>`) — per-image record
  of `{ state: 'approved' | 'rejected', img, expiresAt }`. Populated
  by `addGhost(img, state)` inside `approveImage` / `rejectImage` /
  `rejectCarousel`. Pruned by a `useEffect` that schedules one
  `setTimeout` per ghost set, fires `pruneExpiredGhosts(prev, Date.now())`
  on expiry, then re-arms when `ghosts` changes.
- **`seenOrder`** (`Map<imageId, GeneratedImage>`) — append-only
  ordered cache of every image we've ever seen come through `posts`.
  Grown by a `useEffect` on `liveImages`. Used purely for ordering —
  the displayed `images` array is built by walking `seenOrder` and
  including each entry that's either still live OR currently ghosted.
  This preserves an acted-on image's position in the strip across the
  live → ghost → gone transition; without it, ghosts would jump to
  the end of the array as live images shrink.
- **`liveImages` / `liveIds`** — derived from `posts` exactly as the
  old `images` was. Renamed to make the live/ghost distinction
  explicit at the use site.

The display assembly is now:

```ts
images = walk seenOrder, keep id if liveIds.has(id) || ghosts[id]
statuses = for each image: live → localStatus | 'pending'
                           ghost → ghosts[id].state
counts = pending/approved/rejected over `images` (= live + ghosted)
```

The reject-floor guard (V040-HOTFIX-002) now reads `liveImages.length`
directly — ghosts are visual residue of completed actions, not posts
the user can still reject. Same numerical answer as before in steady
state; explicit intent.

`approveRemaining`, `approveCarousel`, and `rejectCarousel` were all
updated to iterate `liveImages` instead of `images` so they don't try
to act on already-acted-on ghosts.

### `tests/lib/carousel-ghost.test.ts` (new)

Three describe blocks:

- `GHOST_TTL_MS` value (1 test)
- `pruneExpiredGhosts` — past expiry dropped, equal-to-now expiry
  dropped, future expiry kept, empty input returns same reference,
  no-op returns same reference (5 tests)
- `nextGhostExpiry` — empty → null, picks the smallest, single-entry
  case (3 tests)

Suite total: 28 files / 292 tests (was 27 / 283 — net +1 file / +9
tests; no other test file touched).

## Why ghost memory and not state persistence

V040-DES-001 explicitly flags per-image status persistence as
PROP-gated:

- Persistence requires a schema-shape change on `CarouselGroup`
  (per-image approval state) or on `ScheduledPost` (an explicit
  `'approved'` status separate from `'scheduled'`).
- It requires a migration shim for existing 0.4.x users (similar in
  shape to V040-HOTFIX-001's `applyV040AutoApproveMigration`).
- It requires the parent (`ApprovalQueue` and the page that filters
  posts into the queue) to retain approved posts in the filter
  long enough for the queue to surface them.

Ghost memory side-steps all of that:

- Pure local React state, no schema changes.
- No migration needed — ghosts only exist for 6 seconds in volatile
  memory.
- The parent's filter is unaffected; the queue still drops approved
  posts immediately, the card just paints over the gap.
- Total addition: ~50 LOC (the helpers + the two new state hooks +
  two `useEffect`s) — within the routine task envelope.

When PROP work eventually adds true persistence, the ghost layer can
either stay (as a polish on top of persisted state) or be deleted
(if persistence renders the entire card from durable state). Either
way, today's ghost code lives entirely in one component file and is
trivial to remove.

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Approved images show checkmark for at least 6s after action | ✅ `GHOST_TTL_MS = 6000`; ghost row keeps the image in `images` and reports its state through `statuses[id]`, which `CarouselReviewPanel` and `CarouselThumbnailStrip` both consume |
| No visual flicker on re-render | ✅ `seenOrder` keeps the row in its original strip position across the live → ghost transition, so the parent re-render no longer wipes the row |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Persistent approval state** — explicitly PROP-gated per V040-DES-001.
- **Fade-out animation on ghost expiry** — would require Framer Motion
  exit animation wiring; the ghost expiry is currently a hard cut.
  The existing `motion-safe:animate-[fadeIn_200ms_ease-out]` on the
  amber DegradeNotice covers the appear case but there's no exit
  hook here. Polish for a follow-up.
- **Persisting ghosts across `expanded` toggle** — ghosts live in
  `CarouselApprovalCard` state, which survives `expanded` toggling.
  No special handling needed.
- **Ghost memory on the single-post (non-carousel) approval cards in
  `ApprovalQueue`** — those have the same flicker problem but a
  different fix shape (no per-image state to preserve). Could be
  another routine follow-up if Designer flags it.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 28 files / 292 tests passing (was 27 / 283 — net
  +1 file / +9 tests from the new ghost block; no other test file
  touched)

## Files touched

- `lib/carousel-ghost.ts` (new, 56 lines)
- `components/approval/CarouselApprovalCard.tsx` (ghost state, ghost
  sweep effect, seenOrder cache, displayImages reassembly,
  approveRemaining/rejectCarousel iterating `liveImages`)
- `tests/lib/carousel-ghost.test.ts` (new, 9 tests)
- `docs/bmad/reviews/V040-HOTFIX-003.md` (this file)
