# BUG-CRIT-006 — posted/scheduled status now persists across reloads

**Status:** done
**Classification:** complex (debug + persistence-layer fix)
**Severity:** critical
**Why:** "Status not persisting across reloads" had a multi-fault
shape that took an audit to untangle:
1. **Read-side gap** in the carousel branch of Post Ready —
   already fixed under BUG-DES-001 (carousel branch now reads
   `latestScheduleFor(anchor.id)` so the auto-poster's
   `ScheduledPost.status` contributes to the badge, not just the
   manual `postedAt`/`postError` path).
2. **Write-side gap** in `useImages` — the IDB write was debounced
   200ms with no `beforeunload` flush. A `Post Now` that resolved
   <200ms before the user hit reload lost `postedAt` to the
   debounce, so the badge "reset on reload."

This task ships the fix for #2 (#1 already shipped under BUG-DES-001).

## Root cause — the 200ms gap

`hooks/useSettings.ts` had both:
- 300ms debounced IDB write
- `beforeunload` listener flushing synchronously to localStorage; the
  next session's load path migrates localStorage → IDB on first
  render

`hooks/useImages.ts` only had the debounced IDB write. No
`beforeunload` flush. Sequence that loses data:

```
T+0ms     user clicks Post Now → postImageNow resolves
T+0ms     patchImage → setSavedImages → 200ms debounce starts
T+50ms    user hits Cmd-R
T+~50ms   tab unloads → debounce fires too late → IDB never written
T+next    new session loads from IDB → no postedAt → badge "resets"
```

## Fix

`hooks/useImages.ts` — added the same `beforeunload` flush pattern
already used by `useSettings`:

```tsx
const savedImagesRef = useRef(savedImages);
savedImagesRef.current = savedImages;

useEffect(() => {
  if (!isImagesLoaded) return;
  const flush = () => {
    try {
      localStorage.setItem(
        'mashup_saved_images',
        JSON.stringify(savedImagesRef.current),
      );
    } catch { /* storage quota — silent */ }
  };
  window.addEventListener('beforeunload', flush);
  return () => window.removeEventListener('beforeunload', flush);
}, [isImagesLoaded]);
```

Three things to note:

1. **`savedImagesRef`** is updated synchronously on every render so
   the listener sees the latest value without re-subscribing on every
   `savedImages` change. Same pattern as `useSettings`.
2. **Effect deps `[isImagesLoaded]`** — the listener registers once
   when the load completes, not on every state change. Critical:
   registering before load completes would let an empty `[]` flush
   stomp a legitimate IDB value.
3. **The load path was already complete on the read side** —
   `useImages.ts:25-31` already reads `localStorage.getItem` first,
   migrates to IDB via `set('mashup_saved_images', images)`, then
   removes the localStorage key. We didn't need to touch the load
   path; the flush plugs into infrastructure that already existed.

## Why this is filed as "complex"

The bug report read like one fault but the investigation found two:
the carousel read gap (BUG-DES-001) doing most of the visible damage,
plus this narrow write gap. Rolling them into one task would have
buried the carousel piece. They're both "indicators reset on reload"
to a user but they have entirely different code shapes and ship in
different files. Documented separately so the next person who touches
this surface doesn't re-derive the audit.

The persistence chain is now traced clean for both update sites:

| Field                                     | Update site                          | Persistence path                                 | Survives reload? |
|-------------------------------------------|--------------------------------------|--------------------------------------------------|------------------|
| `ScheduledPost.status`                    | Auto-poster cron (MainContent.tsx)   | `useSettings` (300ms debounce + beforeunload flush + IDB) | ✅ |
| `GeneratedImage.postedAt` / `postError`   | `postImageNow` / `postCarouselNow`   | `useImages` (200ms debounce + **new** beforeunload flush + IDB) | ✅ |

## Acceptance criteria

| Criterion        | Status |
|------------------|--------|
| Status persists  | ✓ (both update sites now have a flush-on-unload safety net; load path migrates localStorage → IDB on next session start) |
| Write inbox      | ✓ (envelope below) |

## Files touched

### Production
- `hooks/useImages.ts`:
  - Added `useRef` import.
  - Added `savedImagesRef` updated on every render.
  - Added the `beforeunload` flush effect (~14 LOC).
  - Inline docblock pinning the BUG-DES-002 contract.

### Tests
- `tests/integration/useImages-flush.test.tsx` (NEW, 3 tests):
  - `'writes savedImages to localStorage when beforeunload fires'` —
    end-to-end: render hook → saveImage → fire beforeunload → assert
    localStorage has the latest value with all fields preserved
    (including `postedAt`).
  - `'flush always writes the latest value (savedImagesRef pattern)'`
    — pins the ref pattern so a future "let's just close over
    savedImages directly" refactor would fail this case.
  - `'does not register the listener until isImagesLoaded is true'`
    — pins the load-gate so an early flush can't stomp legitimate
    IDB data with `[]`.
  - jsdom env, `idb-keyval` mocked, uses `@testing-library/react`
    `renderHook` (already in the dev deps).

### Docs
- `docs/bmad/stories/BUG-DES-002.md` (NEW, was untracked): the full
  audit doc covering both fault legs, why they look identical from
  the user's seat, and the two follow-ups (FU-1: auto-poster doesn't
  patch CarouselGroup.status; FU-2: useImages first-load redundant
  IDB write).
- `docs/bmad/reviews/BUG-CRIT-006.md` (this file).

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run tests/integration/useImages-flush.test.tsx` — 3/3
  pass in isolation.
- `npx vitest run` — full suite green via pre-commit hook.
- Manual reproduction: with this branch, `Post Now` → instant
  Cmd-R → `postedAt` survives, badge shows on reload. On the
  parent commit, the same sequence (sub-200ms reload) loses
  `postedAt`.

## Out of scope (follow-up — already documented in BUG-DES-002)

- **FU-1**: auto-poster patches per-post `ScheduledPost.status` but
  doesn't update the parent `CarouselGroup.status` (still sitting at
  whatever was set at scheduling time). Doesn't affect the Post Ready
  badge (reads per-post via `latestScheduleFor`), but any future
  surface reading `CarouselGroup.status` directly sees a stale value.
  Borderline-routine, ~10 LOC, propose before implementing.
- **FU-2**: `useImages` doesn't have a `skipFirstSaveRef` (which
  `useSettings` does), so the first persist effect after load writes
  the just-loaded value back to IDB. Wasted round-trip, not a
  correctness bug. Pure perf cleanup, defer.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-CRIT-006","status":"done","summary":"Two-fault bug. Read-side (carousel branch ignored auto-poster ScheduledPost.status) was already fixed under BUG-DES-001. Write-side (useImages 200ms debounce had no beforeunload flush, so a Post Now followed by an immediate reload lost postedAt) is fixed in this commit. hooks/useImages.ts now mirrors useSettings: savedImagesRef + beforeunload listener writing latest savedImages to localStorage; existing load path migrates localStorage → IDB on next session. 3 jsdom tests pin the contract (saveImage → flush → assert localStorage; ref-pattern; load-gate). tsc clean, 416/416 pass."}
```
