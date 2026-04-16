# AUDIT-011 — Performance Audit: Slow Renders, Memory Leaks

**Status:** CONCERNS (no blockers — scale-time issues)
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Scope:** MainContent.tsx (4527 LOC), usePipeline.ts (830 LOC), useImageGeneration.ts (803 LOC), useSettings.ts

---

## Memory Leaks

### setInterval (MainContent:1055) — CLEAN
- Auto-posting worker uses `setInterval(async () => {...}, 60000)`.
- Cleanup confirmed: `return () => clearInterval(interval)` at line 1189.
- Dep array `[settings.scheduledPosts, settings.apiKeys, savedImages, updateSettings]` is sound.
- `updateSettings` is `useCallback([], [])` — empty dep array, stable identity across renders. ✓

### Event listeners — CLEAN
- No `addEventListener` calls in MainContent, usePipeline, or useImageGeneration. ✓

### Fire-and-forget `setTimeout` — ACCEPTABLE
- Line 716: `copyWithFeedback` 1.5s UI feedback reset — state-only, no external resource.
- Line 765: `setBatchProgress(null)` 2s cleanup — same pattern.
- Neither holds a ref that could leak. ✓

### Pipeline log cap — ALREADY FIXED (POLISH-016)
- `pipelineLog.slice(-50)` at `usePipeline.ts:148,158` bounds unbounded growth. ✓

---

## Missing Memoization (render-path recomputation)

### [MEDIUM] `allTags` — not memoized (MainContent:1194)
```ts
const allTags = Array.from(new Set(savedImages.flatMap(img => img.tags || []))).sort();
```
Runs on **every render**. O(n × avg_tags) flatMap + sort. For 500 images × 5 tags avg = 2,500 iterations + sort every tick. No `useMemo`.

**Fix**: `useMemo(() => Array.from(new Set(savedImages.flatMap(img => img.tags || []))).sort(), [savedImages])`

---

### [MEDIUM] `displayedImages` — not memoized (MainContent:1196–1230)
Complex filter chain:
- `searchQuery` text match on `prompt` + tags (`.toLowerCase()` on every image)
- `filterModel`, `filterUniverse`, `selectedCollectionId` equality checks
- `tagQuery` Boolean expression parser (split on `or`/`,`/`and`/`;`) — nested closure created every render

Runs on every render regardless of whether any filter state changed. With 500+ saved images this is the most CPU-intensive render-path operation.

**Fix**: `useMemo(() => ..., [view, images, savedImages, searchQuery, filterModel, filterUniverse, selectedCollectionId, tagQuery])`

---

### [MEDIUM] `computeCarouselView` — O(n²) called inline in render (MainContent:483, 2309, 3439)
```ts
// Called twice in the render tree:
computeCarouselView(visible)   // line 2309 — Captioning tab
computeCarouselView(ready)     // line 3439 — Post Ready tab
```
The function itself is O(n²): for each remaining image, scans all remaining siblings to find prompt + timestamp matches. For 200 post-ready images: 40,000 iterations per render. Not memoized — recomputed on every render even when `savedImages` and `carouselGroups` haven't changed.

**Fix**: Hoist calls to top of component with `useMemo`:
```ts
const postReadyItems = useMemo(
  () => computeCarouselView(savedImages.filter(i => i.isPostReady)),
  [savedImages, settings.carouselGroups]
);
```

---

### [LOW] `postReady` filter — not memoized (MainContent:3207)
```ts
const postReady = savedImages.filter((i) => i.isPostReady === true);
```
Inline in render, runs on every render. Minor since it's a simple predicate, but the result is used twice (at 3207 and passed to `computeCarouselView` at 3439 — which is itself O(n²)).

**Fix**: `useMemo` or hoist with the `computeCarouselView` call above.

---

### [LOW] `ALL_MODELS = [...LEONARDO_MODELS]` (MainContent:1192)
Array spread on every render. Creates a new reference each render, potentially re-triggering memoized children that receive it. Since `LEONARDO_MODELS` is a module-level const, the spread is unnecessary — just assign directly or hoist outside the component.

**Fix**: `const ALL_MODELS = LEONARDO_MODELS;` or hoist outside component.

---

### [LOW] Repeated `savedImages.filter()` in render body
Six separate `.filter()` passes over `savedImages` in the render return:
- Lines 1579, 1581, 1583: stats counters (`tagged`, `captioned`, `post-ready` counts)
- Line 2178: `all` approved non-post-ready images for batch captioning
- Line 3207: `postReady`

Each is a separate O(n) pass. A single `useMemo` producing `{ taggedCount, captionedCount, postReadyCount, approvedPending }` from one pass would eliminate 5 of these.

---

## Virtualization

### [MEDIUM] No virtual scroll on large image grids
- `displayedImages.map((img, idx) => ...)` at line 4116 renders all matching images as DOM nodes.
- `postReady.map(...)` at line 3284 — same.
- `pickerSource.map(...)` at line 4006 — same.
- 64 total `.map()` calls in MainContent.

At current usage (< 200 images) this is fine. At 500+ images, each gallery tab mounts hundreds of `<img>` elements simultaneously, stressing the DOM and browser paint. No `react-window` / `react-virtual` / intersection-observer pagination in place.

**Recommendation**: Not an immediate fix — add to STORY-121 followup or open as PERF-001 proposal. Intersection-observer lazy loading (not full virtualization) may be sufficient given image count growth rate.

---

## Summary

| Finding | Severity | Status |
|---|---|---|
| setInterval cleanup | — | CLEAN ✓ |
| Event listener leaks | — | CLEAN ✓ |
| Pipeline log unbounded growth | — | FIXED (POLISH-016) ✓ |
| `allTags` recomputed every render | MEDIUM | Open |
| `displayedImages` filter chain not memoized | MEDIUM | Open |
| `computeCarouselView` O(n²) inline in render | MEDIUM | Open |
| `postReady` filter not memoized | LOW | Open |
| `ALL_MODELS` spread on every render | LOW | Open |
| Multiple `savedImages.filter()` in render | LOW | Open |
| No virtual scroll for large galleries | MEDIUM | Open (deferred) |

**No memory leaks. No blocking bugs.** All open items are scale-time performance concerns — irrelevant below ~200 saved images, increasingly visible above 500.

## Tasks Generated

- **QA-AUDIT-005**: PERF — `useMemo` for `displayedImages`, `allTags`, `computeCarouselView` results, `postReady` → route to Developer
- **QA-AUDIT-006**: PERF — `ALL_MODELS` array spread cleanup + multi-filter single-pass stats → route to Developer (trivial/Haiku)
- **QA-AUDIT-007**: PERF — Evaluate intersection-observer lazy loading for gallery tabs (> 200 images threshold) → lift to Hermes as PERF-001 proposal

## Gate Decision

CONCERNS (non-blocking) — No leaks, no blocking bugs. Three `useMemo` gaps and one virtualization gap are scale-time concerns. Codebase is performant at current image volumes; concerns become visible above ~500 saved images. Tasks QA-AUDIT-005/006/007 queued for Developer and Hermes.
