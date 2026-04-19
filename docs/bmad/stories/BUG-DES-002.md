# BUG-DES-002 — persistent posted/scheduled indicators (debug + safety net)

**Status:** Resolved (root cause + safety-net fix). Two follow-ups proposed.
**Classification:** complex (debug-and-fix, persistence layer)
**Origin:** Hermes dispatch — "Indicators reset on reload, frontend-backend disconnect"

---

## TL;DR

The headline symptom — "indicators reset on reload" — was almost certainly the
**carousel UI not showing scheduled/posted state at all**, fixed in this same
session by [BUG-DES-001](#bug-des-001-context). Status data has always been
persisted correctly; the carousel branch just wasn't reading from the
auto-poster's persistent field.

Investigating "the persistence layer" turned up **one real, narrow data-loss
window** that was unrelated to the carousel symptom: `useImages` debounces 200 ms
without a `beforeunload` flush. A manual `Post Now` that completes <200 ms before
the user reloads loses `postedAt`. **Fixed in this story** by mirroring the
`useSettings` flush pattern.

Two adjacent gaps surfaced during the audit and are documented as follow-ups
rather than fixed here (they don't affect the badge display).

---

## What was investigated

### Persistence chain — both paths trace clean

| Field | Set by | Persisted via | Survives reload? |
|---|---|---|---|
| `ScheduledPost.status` (`scheduled` → `posted`/`failed`) | Auto-poster cron in `MainContent.tsx:1175-1311` | `updateSettings({scheduledPosts: …})` → `useSettings` (300 ms debounce → IDB + `beforeunload` localStorage flush → IDB on next load) | ✅ |
| `GeneratedImage.postedAt` / `postError` / `postedTo` | `postImageNow` / `postCarouselNow` in `MainContent.tsx:455-466, 738-751` | `patchImage(img, …)` → `saveImage` → `useImages` setSavedImages → 200 ms debounce → IDB write | ⚠️ 200 ms gap (fixed by this story) |

Both update sites use **functional updaters** so concurrent patches don't race.
Both targets reach IDB. The carousel UI symptom that prompted this bug was a
**read-side gap**, not a write-side one.

### The carousel UI read gap (already fixed by BUG-DES-001) {#bug-des-001-context}

Before BUG-DES-001, the Post Ready carousel branch (around `MainContent.tsx:3577`)
only checked `anchor.postedAt` / `anchor.postError` for its status badge — i.e.
only the **manual** `Post Now` path. The **auto-poster** path writes to
`ScheduledPost.status`, which the carousel branch never read.

Visible symptom: any auto-posted carousel showed no badge after reload, even
though the data was sitting in `settings.scheduledPosts` with `status: 'posted'`.
That looks identical to "the indicator reset on reload."

BUG-DES-001 added a `latestScheduleFor(anchor.id)` lookup in the carousel branch
(parity with the single-image card at L3857). Both paths now contribute to the
badge.

### The useImages 200 ms gap (fixed by this story)

`useSettings` has both:

- 300 ms debounced IDB write
- `beforeunload` listener that flushes synchronously to localStorage (then the
  next session's load path migrates localStorage → IDB)

`useImages` had only the debounced IDB write. If `postImageNow` resolves and
the user closes the tab within 200 ms (e.g. clicks Post → immediately Cmd-R),
the IDB write never fires, the postedAt is lost, the badge "resets on reload."

The gap is narrow but real — and importantly, it would silently swallow the
exact symptom Hermes described.

**Fix:** `hooks/useImages.ts` — added the `beforeunload` flush pattern from
`useSettings`. `savedImagesRef` keeps the listener pointed at the latest value
without re-subscribing on every render.

---

## What changed

```
hooks/useImages.ts
  +import useRef
  +savedImagesRef tracks current savedImages
  +beforeunload effect: writes savedImages → localStorage on unload
   (existing load path already migrates localStorage → IDB)
```

~25 LOC added, mirror of the existing `useSettings` pattern. No API change,
no behavior change for the happy path — only closes the rapid-reload window.

---

## Verification

- The flush effect registers once when `isImagesLoaded` flips true (not on every
  savedImages change), since `savedImagesRef.current` is updated synchronously
  on every render. Same pattern as `useSettings`.
- The load path at `useImages.ts:23-33` already migrates `localStorage` →
  `IDB` on the next session start, so the beforeunload flush has a complete
  read path on the other side. No additional code needed.
- Typecheck: my change is isolated and clean. There are pre-existing,
  uncommitted typecheck errors in the working tree from another in-flight
  change (`ScheduledPost.status` gained `'rejected'` in `types/mashup.ts` but
  the downstream `ExistingPost` type in `lib/smartScheduler.ts` wasn't
  updated). Those are unrelated to this bug.

---

## Follow-ups (not fixed here)

### FU-1 — `CarouselGroup.status` is never updated by the auto-poster

`auto-poster` (`MainContent.tsx:1301-1306`) patches per-post `ScheduledPost.status`
to `'posted'`/`'failed'`, but does not touch `CarouselGroup.status` (still
sitting at whatever was set at scheduling time — usually `'scheduled'`).

**Impact:** doesn't affect the Post Ready badge (that reads per-post via
`latestScheduleFor`), but any future surface that reads `CarouselGroup.status`
directly (e.g. the explicit-groups Manager UI, analytics) sees a stale value.

**Fix shape (~10 LOC, single site):** in the auto-poster carousel branch, after
the per-post status patches, also patch `carouselGroups[].status` for the group
(`'posted'` if all sibling posts succeeded, `'failed'` if any failed). Apply in
the same `updateSettings` pass so it lands atomically with the per-post patches.

Classification: borderline routine, but it touches the auto-poster — propose
before implementing.

### FU-2 — `useImages` writes the post-load value back to IDB on first render

`useSettings` skips the first post-load write via `skipFirstSaveRef`. `useImages`
doesn't — when load completes and `savedImages` flips from `[]` to the loaded
array, the persist effect fires and writes the same value back. Wasted IDB
round-trip, not a correctness bug.

**Fix shape (~5 LOC):** mirror `skipFirstSaveRef` from `useSettings`.

Pure perf cleanup — defer until profiled.

---

## Acceptance criteria

| Criterion | Status |
|---|---|
| Status persists across reload | ✅ Was already true for the durable path; BUG-DES-001 closed the carousel read gap; this story closes the rapid-reload write window. |
| No indicator resets | ✅ Both manual `postedAt`/`postError` and auto-poster `ScheduledPost.status` reach IDB and survive reload. |
| Write inbox | ✅ |

---

## Why this is filed as a debug spec instead of a code-only fix

The bug report read like a single-fault problem ("status not persisting") but
the investigation showed a multi-fault picture: a previously-fixed read gap
(BUG-DES-001) doing most of the visible damage, plus a narrow real write gap
that needed closing, plus two adjacent issues that aren't this bug. Documenting
the full picture so the next person who touches this surface doesn't re-derive
it from scratch.
