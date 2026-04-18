# TEST-001 — Unit tests for `computeCarouselView` (DONE)

**Status:** done
**Classification:** routine (per Hermes dispatch)
**Executed:** 2026-04-18
**Files touched:** 3
- `lib/carouselView.ts` — **new** (~85 LOC) — extracted pure function + `PostItem` type + `CAROUSEL_AUTO_WINDOW_MS`
- `components/MainContent.tsx` — replaced inline closure with import + thin wrapper (−54 LOC)
- `tests/lib/carouselView.test.ts` — **new** (~190 LOC, 13 tests)

---

## Why

QA debrief on BUG-001 + WARN-1 noted the codebase had **zero** automated tests on UI helpers. `computeCarouselView` is the highest-value target: it's pure-ish, sits at the center of the captioning + post-ready flows, and a unit test on its window/explicit-group precedence rules would have caught BUG-001's "iterating the flat list" mistake before it shipped.

## What changed

### 1. Extract `lib/carouselView.ts` (pure, testable)

The function previously lived as a `useCallback` closure inside `MainContent.tsx`, capturing `settings.carouselGroups`. To unit-test it without spinning up React + the MashupContext mock graph, I lifted the body verbatim into a free function with the explicit-groups slice promoted to a parameter:

```ts
export function computeCarouselView(
  ready: GeneratedImage[],
  explicitGroups: readonly CarouselGroup[] = [],
): PostItem[]
```

`PostItem` and `CAROUSEL_AUTO_WINDOW_MS` moved with it (the constant is a behavior boundary tests need to assert against; exporting it lets the boundary case test reference the actual value rather than hard-coding 300_000).

### 2. Wrapper in `MainContent.tsx`

The closure shrinks to a one-liner that supplies the settings slice:

```ts
const computeCarouselView = useCallback(
  (ready: GeneratedImage[]): PostItem[] =>
    computeCarouselViewPure(ready, settings.carouselGroups || []),
  [settings.carouselGroups],
);
```

Both call sites (line ~818 in `batchCaptionImages`, line ~2434 in the captioning view) keep their existing one-arg call signature — no changes needed downstream.

### 3. `tests/lib/carouselView.test.ts` — 13 tests

Organized into three `describe` blocks matching the AC categories. The fixture helpers (`makeImage`, `makeGroup`, `asCarousel`, `asSingle`) keep each test readable as "data + expected diff" rather than scaffolding noise.

| Block | Cases |
|---|---|
| **(top-level)** | empty input → `[]`; single image → 1 single PostItem |
| **explicit groups** | (a) cross-prompt explicit group still groups; (b) orphan group (all imageIds missing) is dropped; (c) partial group resolves only the present ids; (d) image in both an explicit group AND an auto-eligible same-prompt batch is consumed by the explicit group, leaving the other image as a single (regression-guard for "no double counting") |
| **auto-grouping window** | (a) same-prompt within window → grouped; (b) same-prompt 1ms past window → both single; (c) **boundary inclusive** at exactly `CAROUSEL_AUTO_WINDOW_MS` → grouped (codifies `<=` not `<`); (d) different prompts within window → both single; (e) `savedAt: undefined` defaults to 0 → still groups when prompts match |
| **mixed batches** | (a) explicit + auto + single in one pass produces all three; (b) output ordering is newest-first by max savedAt within each item |

Two tests directly cover the bug classes that would have caught BUG-001 / WARN-1:

- The "no double counting" test covers the precedence invariant (`handled` set must prevent an explicit-group image from re-appearing in an auto group). BUG-001's flat-iteration bug would have passed here only because that bug lived in `batchCaptionImages`, not in the grouper itself — but the same precedence reasoning is what protects the grouper.
- The boundary-inclusive test pins the `<=` comparison so a future "off by one" rewrite to `<` gets caught.

### Verification

```
$ npx tsc --noEmit
$  # exit 0

$ npx vitest run
 Test Files  12 passed (12)
      Tests  129 passed (129)
```

`carouselView.test.ts` is the new file; the other 11 files were already passing and continue to pass (the extraction is behavior-preserving, so the suite that didn't exercise this path is also unaffected).

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| Test file created for `computeCarouselView` | ✅ | `tests/lib/carouselView.test.ts` |
| Test cases: explicit groups, auto-grouping, mixed batches | ✅ | 4 explicit-group cases, 5 auto-window cases, 2 mixed-batch cases, 2 baseline cases — 13 total |
| All tests pass | ✅ | `npx vitest run` → 129/129 pass (including the existing 116 in 11 other files) |
| Write FIFO when done | ✅ | After this writeup |

---

## Out of scope

- **Tests for `batchCaptionImages` / `fanCaptionToGroup`** (REFACTOR-001's helper). Those depend on `generatePostContent` + `patchImage` closures — they need a mock or another extraction round before they're cheaply testable. Filing as a follow-up is a Hermes call.
- **Tests for the `persistCarouselGroup` / `addImageToCarousel` mutators** in MainContent — same closure-binding problem; would need extraction first.
- **Property-based tests** (e.g. fast-check) for the precedence + window invariants. The case-based tests cover the named edge conditions; property tests would catch unexpected interactions but add a dependency for marginal value at this scale.
- **Coverage reporting** — vitest is configured for run/watch but no v8/istanbul reporter is wired up. Adding it is its own task.

---

## How to verify

1. `npx tsc --noEmit` → exit 0.
2. `npx vitest run tests/lib/carouselView.test.ts` → 13 pass.
3. `npx vitest run` → 129 pass across 12 files (full suite).
4. Sanity check the wrapper still works in the app: `npm run dev`, generate 2 same-prompt images within 5 minutes, mark both post-ready, open Post Ready tab — they should appear as a single carousel card. Manually create a `carouselGroups` entry via Settings → carousel manager (if exposed) — that group should appear in addition to / instead of the auto group, per the precedence rules now codified in tests.
