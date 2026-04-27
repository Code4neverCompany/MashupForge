# QA Discovery — QoL Improvements

**Agent:** QA (Quinn)
**Date:** 2026-04-27
**Version base:** v0.9.5
**Scope:** Gallery collection indicators, drag-and-drop, batch collections, web search, performance/a11y

---

## 1. Gallery Collection Visual Indicators

### What exists

**Component:** `components/GalleryCard.tsx`

Collection membership is driven by a single field: `img.collectionId?: string` (from `types/mashup.ts:14`). An image can belong to **at most one collection** — there is no multi-collection membership model.

- **"In collection" indicator:** Lines 387 — collection menu items get `bg-emerald-500/20 text-emerald-400` styling when `img.collectionId === col.id`. This is inside a portaled dropdown, not a persistent badge on the card itself.
- **Drag-over feedback:** `dragOverCollection === col.id` applies `bg-emerald-500 text-white scale-105` on the drop target (line 386), and `ring-2 ring-[#00e6ff]` on the card (line 173).
- **Remove action:** A "Remove from Collection" button appears when `img.collectionId` is set (lines 393–403).

### Test gaps

No tests cover collection badge visual states. `tests/components/GalleryCard.test.tsx` only covers batch-checkbox behaviour (V080-DEV-001). The following cases are **fully untested:**

| Case | Risk |
|---|---|
| Badge appears when `collectionId` is set | Medium — regression-silent |
| Badge disappears after remove | Medium |
| Card in collection A dropped onto collection B | High — state mutation |
| Image added to collection while portal is open | Medium — stale closure |

### Edge cases to design tests for

- **One collection only:** No multi-collection membership. If a future story adds multi-collection support, the `collectionId: string` type becomes the first casualty — tests should pin this shape.
- **Collection deleted while image still assigned:** No cascade-clear logic visible in GalleryCard; the image retains a stale `collectionId`. The collection menu would show no match, but the remove button may still render with an orphan ID. Needs an explicit test + fix.
- **Portal position drift:** The dropdown portal recalculates position on scroll/resize via `getBoundingClientRect` (lines 131–151). If the gallery scrolls rapidly, the portal can appear at the wrong position for one frame. Visual-only issue but worth a snapshot test.

---

## 2. Drag and Drop Between Carousels

### What exists

**Implementation:** Native HTML5 drag-and-drop — **no @dnd-kit** (not in `package.json`).

- Drag is enabled **only in gallery view**: `draggable={view === 'gallery'}` (GalleryCard.tsx:175).
- `onDragStart` sets `dataTransfer.setData('imageId', img.id)` and `effectAllowed = 'move'` (lines 176–180).
- Drop targets are **collection menu items only** — there is no carousel-to-carousel drag. Carousels themselves cannot be reordered by drag.

### Test gaps

Zero drag-and-drop tests exist. All scenarios below are untested:

| Test case | Concern |
|---|---|
| Single image drag to collection | Core path — no coverage |
| Drop on invalid target (outside menu) | Should no-op; no guard verified |
| `dragoverCollection` state cleared on drag cancel | Memory leak if not cleaned up |
| Rapid successive drags | Race on `setDragOverCollection` calls |

### @dnd-kit migration impact

Switching from HTML5 DnD to `@dnd-kit` would require:

1. Replacing `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragLeave` event handlers — all concentrated in `GalleryCard.tsx:173–384`.
2. Replacing `dataTransfer.setData/getData` with `@dnd-kit`'s `useDraggable` / `useDroppable` context.
3. Rewriting the `dragOverCollection` state — currently a `string | null` passed as prop; would become a dnd-kit active/over context.
4. The portal-based dropdown drop targets would need special handling — `@dnd-kit` portals can lose context without `DndContext` wrapping.

No existing tests would survive the migration as written (all are rendered with mock props, not interaction events). A dedicated DnD test layer would be needed before attempting the switch.

### Accessibility gap (keyboard users)

HTML5 drag is **pointer-only**. Keyboard users currently have no way to reorder or move images to collections without the mouse. The collection assignment fallback (the folder-button → dropdown menu) is keyboard-accessible (`aria-haspopup="menu"`, `aria-expanded` on the trigger, `role="menu"` on the list — GalleryCard.tsx:352–362), so keyboard users can add to collections but not via drag.

If drag-and-drop is extended (e.g., carousel reordering), a keyboard fallback must ship alongside it.

---

## 3. Batch-Adding to Collections

### What exists

**Two code paths:**

1. **Manual batch via CollectionModal** (`MainContent.tsx:4366–4379`): After collection creation, iterates `imageIds` and calls `addImageToCollection(id, created.id)` for each — sequential, client-side, no batch API endpoint.

2. **Auto-organize** (`MainContent.tsx:1918–1931`): Groups similar images into new collections, same sequential loop, guards against reassigning already-assigned images with `!img.collectionId`.

**No batch API route exists.** `addImageToCollection` calls are one-by-one from the client.

### Race condition risks

The sequential `for` loop calling `addImageToCollection` per image is fire-and-forget — there's no `Promise.all` or error aggregation. If one call fails mid-batch:

- Partial assignment (some images assigned, some not) with no user feedback
- No retry logic
- No transaction — the collection exists but is incomplete

For small galleries this is invisible. At scale (50+ images in auto-organize), the risk rises. A `Promise.allSettled` pattern with a failure summary would be the minimum safe fix.

### State consistency

- The collection modal shows the created collection immediately (optimistic) — consistent.
- Individual `addImageToCollection` updates propagate via the existing state mutation pattern; the gallery re-renders per call.
- If the user navigates away mid-batch, in-flight calls complete silently (no abort). No visible inconsistency, but image list may be stale until next load.

### Test gaps

| Case | Status |
|---|---|
| Batch add 1 image | Untested |
| Batch add 50 images (partial failure) | Untested |
| Auto-organize skips already-assigned images | Untested |
| Collection modal pre-selects images correctly | Untested |

---

## 4. pi.dev Web Search Quality

### What exists

**File:** `lib/web-search.ts` (328 lines) + `app/api/web-search/route.ts`

**Provider chain:**
1. **Brave Search API** — used when `BRAVE_API_KEY` env var is set. Preferred.
2. **DuckDuckGo** — free fallback, no API key. Used on any Brave failure or missing key.

**Rate limiting:** Token bucket at `app/api/web-search/route.ts:43–74` — capacity 2, refill 2/sec. Returns HTTP 429 on exhaustion. **No rate limiting on the Brave/DDG calls themselves** — only on the API route entry.

**Timeout:** `AbortSignal.timeout(10000)` (10 s) applied to both Brave and DDG fetches (web-search.ts:192, 228).

**Error handling:** Both providers catch all exceptions and return `[]`. Failures are silent — the caller gets an empty array and continues.

### Test gaps against the QA plan areas

| Scenario | Status |
|---|---|
| No results returned (empty array) | Untested at integration level |
| Timeout fires after 10s | Untested — timeout path not covered |
| Malformed Brave JSON response | Untested |
| Malformed DDG HTML | Partially tested (`parseDdgHtml` unit tested) |
| Citation/URL extraction correctness | Untested |
| Rate limit — 429 returned correctly | Untested |
| Brave → DDG fallback on Brave failure | Untested |
| `extractTrendingTags` heuristic accuracy | Untested |

**Unit tests that do exist** (`tests/lib/web-search.test.ts`): `parseDdgHtml`, `validateQuery`, `clampCount`, Brave JSON parse shape, HTML entity decoding. Good low-level coverage but no integration or failure-mode tests.

### Key quality risks

- **Silent fallback masking:** If Brave fails and DDG also fails, the route returns `{ results: [], provider: 'ddg' }` — indistinguishable from a legitimate empty result. The pi prompt enrichment path would silently get no trending data, producing weaker captions/ideas with no diagnostic signal.
- **DDG HTML parsing fragility:** DDG provides no official API — the HTML parser in `parseDdgHtml` will break if DuckDuckGo changes their markup. No canary test or version pinning.
- **`extractTrendingTags` heuristic:** Pulls hashtags + Title-Case phrases from result snippets. No test for franchise-name false positives or multi-word tag collisions.

---

## 5. Additional QoL Quality Concerns

### Performance

**Lazy loading:** `components/LazyImg.tsx` — IntersectionObserver-based, `rootMargin="200px"` look-ahead. Used in gallery cards and carousel thumbnails. Adequate for moderate galleries.

**No virtualization:** No windowing library in dependencies. For a gallery of 200+ images, all `GalleryCard` DOM nodes exist simultaneously (only images are lazy-loaded). At extreme scale, this becomes a layout/paint bottleneck. The IntersectionObserver delay masks it for now.

**Re-render surface:**
- `MainContent.tsx` memoizes computed data with `useMemo` (`displayedImages`, `allTags`, `galleryStats`) and handlers with `useCallback`.
- `GalleryCard` itself has **no `React.memo` wrapper**. Each parent state update (e.g., `dragOverCollection` changing) re-renders every visible card. For large galleries during an active drag, this could produce jank. Recommend `React.memo(GalleryCard)` with a stable prop comparator.
- `dragOverCollection` state lives in the card that owns the dragged image, not in a shared context — meaning all sibling cards do not re-render on drag, which is correct. Risk is limited to drag-source card re-renders.

### Accessibility

**What works:**
- `GalleryCard` has `role="button"`, `tabIndex={0}`, `aria-label`, Enter/Space keyboard handler.
- Carousel thumbnails are `<button>` elements with `aria-label`.
- Collection menu: `role="menu"`, `aria-haspopup`, `aria-expanded` on trigger.
- Modal close buttons have `aria-label`.

**What's missing:**
- Drag-and-drop is pointer-only — no keyboard drag alternative.
- No `aria-live` region announcing when an image is added to a collection (the portal menu closes after add, but no confirmation announcement for screen readers).
- `dragOverCollection` visual feedback has no `aria-dropeffect` or equivalent announcement.
- No skip-link or focus-trap in the collection dropdown portal.

### Failure modes for proposed QoL features

| Feature | Failure mode | Mitigation needed |
|---|---|---|
| Collection badge on card (persistent) | Badge persists after collection deleted | Cascade clear on collection delete |
| Carousel reorder by drag | Drop on non-drop-zone doesn't cancel correctly | `onDragEnd` cancel guard |
| @dnd-kit migration | Portal drop targets lose DndContext | Wrap portals in DndContext or use sensors |
| Batch add with progress | Partial failure invisible to user | `Promise.allSettled` + failure toast |
| Web search rate limit surfacing | 429 swallowed in pi prompt enrichment | Log and surface 429 count in diagnostic trace |
| Auto-organize on large gallery | Sequential loop blocks UI | Move to `Promise.allSettled` + progress indicator |

---

## Summary — Coverage Gaps by Priority

| Area | Gap | Priority |
|---|---|---|
| Collection badge — render/hide tests | None exist | High |
| Collection deleted, image still assigned | No cascade, no test | High |
| Batch add partial failure | No guard, no test | High |
| Web search — timeout + fallback tests | No integration tests | Medium |
| Drag-and-drop — any test | Completely uncovered | Medium |
| GalleryCard `React.memo` | Missing, re-renders on every parent update | Medium |
| Screen reader announcement on collection add | No aria-live | Medium |
| DDG HTML parser canary | No version-lock or canary | Low |
| Gallery virtualization | Not implemented | Low (current scale OK) |
