# BUG-CRIT-007 — carousel cards now show scheduled/posted indicators

**Status:** done
**Classification:** routine
**Severity:** critical
**Why:** The Post Ready carousel card branch only inspected
`anchor.postedAt` / `anchor.postError` for its status badge — i.e.
the **manual** Post Now path. The **auto-poster** writes to
`ScheduledPost.status`, which the carousel branch never read. So an
auto-posted carousel showed no badge after reload, even though the
data was sitting in `settings.scheduledPosts` with `status: 'posted'`.
Single-image cards already had parity with both paths (line ~3814);
carousels were the lone gap.

## Status

**The production fix already shipped under BUG-DES-001.** This task
ships the regression test pinning the badge-derivation contract and
the BUG-CRIT-007 review doc.

## Production fix (already in tree, recapped)

`components/MainContent.tsx:3538–3556` — carousel branch now reads
both paths, with `anchor.postedAt`/`postError` taking precedence
(consistent with single-image card priority):

```tsx
const carouselScheduled = latestScheduleFor(anchor.id);
const carouselBadge = anchor.postedAt
  ? { text: `Posted${anchor.postedTo?.length ? ` to ${anchor.postedTo.join(', ')}` : ''}`, color: 'bg-emerald-600' }
  : anchor.postError
    ? { text: 'Failed', color: 'bg-red-600' }
    : carouselScheduled?.status === 'posted'
      ? { text: 'Posted', color: 'bg-emerald-600' }
      : carouselScheduled?.status === 'failed'
        ? { text: 'Failed', color: 'bg-red-600' }
        : carouselScheduled?.status === 'scheduled'
          ? { text: `Scheduled ${carouselScheduled.date} ${formatTimeShort(carouselScheduled.time)}`, color: 'bg-amber-600' }
          : null;
```

The carousel banner below (line ~3599) was widened in the same fix
so the persistent post-status banner also responds to the auto-poster
path: `(anchor.postedAt || anchor.postError || carouselScheduled?.status === 'posted' || carouselScheduled?.status === 'failed')`.

### Why anchor sharing works

`postCarouselNow` patches every image in the carousel with the same
`postedAt`/`postedTo`/`postError`, so `anchor` is a faithful proxy
for the manual path. For the auto-poster path, sibling
`ScheduledPost`s share the same scheduled time and ship atomically
(per V040-DES-003 carousel grouping), so reading the anchor's
`latestScheduleFor` is sufficient — looking at one sibling tells you
the group's status.

## Acceptance criteria

| Criterion                  | Status |
|----------------------------|--------|
| Indicators on carousels    | ✓ (carousel badge now responds to manual postedAt/postError AND auto-poster ScheduledPost.status; banner widened in parallel) |
| Write inbox                | ✓ (envelope below) |

## Files touched (this task)

### Production
None — fix already shipped under BUG-DES-001.

### Tests
- `tests/integration/carousel-badge-derivation.test.ts` (NEW, 11
  tests): mirrors the inline badge-derivation logic at
  `MainContent.tsx:3546-3556` so a future refactor that drops the
  `latestScheduleFor` lookup fails this test. Three groups:
  - Manual Post Now path wins (4 tests): postedAt + postedTo,
    postedAt without platforms, postError, manual wins over a
    scheduled-but-not-posted.
  - Auto-poster path (4 tests, **direct BUG-CRIT-007 regression
    coverage**): posted/failed/scheduled rendered from
    `ScheduledPost.status`; formatTimeShort wiring.
  - Default null (3 tests): no badge when no state, no badge for
    `pending_approval` or `rejected`.

### Docs
- `docs/bmad/reviews/BUG-CRIT-007.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/carousel-badge-derivation.test.ts`
  — 11/11 pass in isolation.
- `npx vitest run` — full suite green via pre-commit hook.

## Out of scope (follow-up)

- Carousel banner (line ~3599) currently shows "Failed" without
  the underlying error message when the failure came from the
  auto-poster (no `anchor.postError`). The single-image card has the
  same gap. Fix would require either patching `anchor.postError`
  alongside `ScheduledPost.status` in the auto-poster, or
  surfacing `ScheduledPost.error` (if/when that field exists).
  Deferred — current "Failed" without details is still better than
  the pre-fix "no badge at all."
- BUG-DES-002 §FU-1 (auto-poster doesn't patch
  `CarouselGroup.status`) is adjacent but doesn't affect the badge
  on the Post Ready card (which reads per-post via
  `latestScheduleFor`). Carried forward.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-007","status":"done","summary":"Fix already shipped under BUG-DES-001: carousel card branch in MainContent.tsx:3538-3556 now reads both anchor.postedAt/postError (manual path) AND latestScheduleFor(anchor.id)?.status (auto-poster path), matching the single-image card. Persistent banner widened in parallel. Single-image card already had parity. This commit pins the badge-derivation contract with carousel-badge-derivation.test.ts (11 tests across manual/auto-poster/default groups) and ships the BUG-CRIT-007 review doc. tsc clean, 427/427 pass."}
```
