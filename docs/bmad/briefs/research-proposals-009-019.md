# Research: MainContent.tsx Extraction & Pipeline Optimization Proposals

**Date:** 2026-04-22
**Project:** MashupForge
**Source:** ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14/

---

## 1. PROP-009 FIX-100: MainContent.tsx Monolith Extraction

### Current State

**File:** `components/MainContent.tsx` — **4382 lines, 222,707 bytes**

This is the single largest file in the codebase. It contains:
- **50+ `useState` hooks** (lines 213-331)
- **7 view branches** in the JSX: gallery, compare (Studio), ideas, captioning, post-ready, pipeline, studio
- **30+ handler functions** (postImageNow, scheduleImage, batchCaptionImages, handleAnimate, handleCompare, etc.)
- **Auto-posting effect** (lines 1306-1462) — ~155 LOC interval timer for scheduled posts
- **Pi.dev lifecycle management** (lines 1054-1152)
- **Caption fan-out logic** (lines 932-985) — fanCaptionToGroup + propagateCaptionToGroup
- **Calendar/scheduling utilities** (lines 613-710) — startOfDay, startOfWeek, addDays, toYMD, calendarColorFor, etc.
- **Carousel management** (lines 661-743) — computeCarouselView, persistCarouselGroup, separateCarousel, removeFromCarousel, openCarouselPicker, confirmCarouselPicker, scheduleCarousel

### V050-002 Phase 1 (Already Done)

**File:** `docs/bmad/reviews/V050-002.md`

Phase 1 extracted:
- `components/views/IdeasView.tsx` (184 LOC) — Ideas tab kanban
- `components/views/PipelineView.tsx` (16 LOC) — wrapper around `<PipelinePanel />`
- Net reduction: **−144 LOC** (4577 → 4433, now 4382 with subsequent edits)

### Logical Groupings for Further Extraction

| Grouping | Source Lines (approx) | LOC | Notes |
|----------|----------------------|-----|-------|
| **State declarations** | 213-331 | ~118 | All useState hooks; will be distributed to extracted views |
| **Platform/scheduling helpers** | 333-533 | ~200 | hasPlatformCreds, availablePlatforms, getSelectedPlatforms, togglePlatformFor, getSchedule, buildCredentialsPayload, postImageNow, findScheduleCollision, scheduleImage |
| **Carousel management** | 591-897 | ~306 | unschedulePost, unscheduleCarousel, calendar helpers, persistCarouselGroup, separateCarousel, removeFromCarousel, openCarouselPicker, confirmCarouselPicker, scheduleCarousel |
| **Caption/image handlers** | 898-1053 | ~155 | formatPost, patchImage, fanCaptionToGroup, propagateCaptionToGroup, removeHashtag, batchCaptionImages |
| **Pi lifecycle** | 1054-1152 | ~98 | refreshPiStatus, piAutoBoot effect, handlePiSetup |
| **Comparison/Studio** | 1162-1660 | ~498 | handlePushIdeaToCompare, carousel watcher, comparisonModel persistence, model previews, handleSuggestParameters, handleApplySuggestion, handleCompare |
| **Animation handlers** | 1662-1830 | ~168 | handleAnimate, handleBatchAnimate, handleBatchCaption, handleBatchPostReady |
| **Auto-posting effect** | 1306-1462 | ~156 | Scheduled post execution loop |
| **Gallery view JSX** | 1982-2182 | ~200 | Filter bar + grid |
| **Studio/Compare JSX** | 2196-2424 | ~228 | Prompt, model selection, generation UI |
| **Captioning view JSX** | 2545-2988 | ~443 | IIFE with filter, grouped/flat toggle, cards |
| **Post-ready view JSX** | 2989-4076 | ~1087 | Grid/calendar/history, post cards, scheduling, smart scheduler, heatmap, drag-and-drop |
| **Header/nav JSX** | 1855-1970 | ~115 | Tab bar, mobile nav, PipelineStatusStrip |

### What the Change Should Be

Extract remaining 5 views following the V050-002 Phase 1 pattern:
- Presentational components receiving everything via props
- No `useMashup()` reach-back
- Extract sub-components where views exceed 500 LOC (especially PostReady)

### Estimated Complexity: **LARGE**
- 7+ new component files
- 1000+ LOC moved
- High coordination needed between state and handler distribution
- Blocked on test infrastructure (no jsdom/RTL for component tests)

### Dependencies
- Should add component test infra first (V050-002 Phase 2 ticket #0)
- PostReady sub-decomposition (CalendarGrid, PostCard, ScheduleControls) must happen before PostReadyView extraction

---

## 2. PROP-016 TASK-143/144: MainContent Extraction Phase 2

### Current State

**Reference:** `docs/bmad/reviews/V050-002.md` lines 98-112 (Phase 2 plan)

### Staged Plan (from V050-002)

| # | Ticket | Source Lines | LOC | Dependency |
|---|--------|-------------|-----|------------|
| 0 | Add component test infra | — | — | None (prereq for all) |
| 1 | Extract `GalleryView` (filter + grid) | ~1750-1909 + ~4411-4493 | ~280 | #0 |
| 2 | Extract `StudioView` (was compare) | ~2073-2384 | ~310 | #0 |
| 3 | Extract `CaptioningView` | ~2392-2835 | ~440 | #0 |
| 4 | Sub-decompose PostReady: `CalendarGrid`, `PostCard`, `ScheduleControls` | ~2836-4277 | ~1440 | #0 |
| 5 | Extract `PostReadyView` (composes #4) | after #4 | ~200 (wrapper) | #4 |
| 6 | Slim MainContent to `MainViewSwitch` dispatcher | — | — | #1-5 |

### What the Change Should Be

Sequential extraction following the staged plan. Each ticket is independent except for the dependency chain. The pattern is established by Phase 1: props-bag presentational component, no context reach-back.

### Estimated Complexity: **LARGE** (multi-week effort)
- Ticket #0 (test infra): **SMALL** — npm install + vitest config
- Ticket #1 (GalleryView): **SMALL** — straightforward extraction
- Ticket #2 (StudioView): **MEDIUM** — moderate prop surface
- Ticket #3 (CaptioningView): **MEDIUM** — IIFE pattern, carousel picker state
- Ticket #4 (PostReady sub-decompose): **LARGE** — largest risk, ~1440 LOC, drag-and-drop, heatmap, calendar
- Ticket #5 (PostReadyView): **SMALL** — composes sub-components
- Ticket #6 (Slim dispatcher): **SMALL** — mechanical

### Dependencies
- #0 blocks everything
- #4 blocks #5
- #1, #2, #3 can run in parallel after #0
- #6 depends on #1, #2, #3, #5

---

## 3. PROP-017 OPT-001: Pipeline Execution Speed

### Current State

**Pipeline orchestrator:** `hooks/usePipelineDaemon.ts` (842 LOC)
**Pipeline processor:** `lib/pipeline-processor.ts` (491 LOC)
**Idea processor hook:** `hooks/useIdeaProcessor.ts`

### Pipeline Flow (per idea in `processIdea`)

1. **Status update** — `updateIdeaStatus(id, 'in-work')` (fast, local state)
2. **Trending fetch** — `fetchTrendingContext(idea)` → calls `/api/trending` (cached 5 min server-side, `app/api/trending/route.ts:139-146`)
3. **Prompt expand** — `expandIdeaToPrompt(idea, trendingContext)` → calls pi.dev (network, variable latency)
4. **Image generate** — `triggerImageGeneration(prompt, modelIds)` → calls Leonardo API (slowest step, ~30-90s per model)
5. **Wait for images** — `waitForImages(modelCount)` → polls image store (up to `PER_IDEA_TIMEOUT_MS` = 10 min)
6. **Caption** — `generatePostContent(img)` → calls pi.dev (per-image, ~5-15s each)
7. **Schedule** — slot computation via `findNextAvailableSlot` (fast, local)

### Identified Bottlenecks

| Bottleneck | Location | Impact | Notes |
|-----------|----------|--------|-------|
| **Sequential model generation** | `pipeline-processor.ts:268-283` | HIGH | `triggerImageGeneration` sends all model IDs at once, but Leonardo processes sequentially. Wait-for-images then polls. |
| **Sequential captioning** | `pipeline-processor.ts:410-485` (per-model loop) | MEDIUM | Each image captioned one at a time via pi.dev. In single mode, 3-6 images means 3-6 sequential pi calls. |
| **Idea delay between ideas** | `usePipelineDaemon.ts:623-629` | LOW | Configurable `pipelineDelay` (default 30s) between ideas. User-controlled, not really a bottleneck. |
| **Engagement fetch** | `usePipelineDaemon.ts:441-444` | LOW | Fetched once per cycle, cached 24h. |
| **Auto-generate ideas** | `usePipelineDaemon.ts:247-337` | MEDIUM | Calls pi.dev to generate 3 ideas. Blocks pipeline start. ~10-20s. |

### What the Change Should Be

- **Quick win:** Parallel captioning for single-mode images (caption all images concurrently with `Promise.all` instead of sequential loop)
- **Medium:** Investigate Leonardo batch API or parallel model submissions
- **Idea:** Pre-fetch trending context while waiting for images (overlap trending + generate)

### Estimated Complexity: **MEDIUM**
- Parallel captioning: small code change in `pipeline-processor.ts:410-485`
- Leonardo parallelism: depends on their API capabilities, investigation needed
- Overlap trending+generate: moderate refactor of `processIdea` flow

### Dependencies
- None blocking; can be done independently of extraction work

---

## 4. PROP-018 OPT-003: Image Caching

### Current State

**LazyImg component:** `components/LazyImg.tsx` (59 LOC)
- Uses IntersectionObserver to defer `<img src>` until element is near viewport
- Placeholder is a 1x1 transparent GIF (data URI)
- No browser cache priming, no preload, no service worker

**Image proxy:** `app/api/proxy-image/route.ts` (60 LOC)
- Proxies external images (Leonardo CDN, GCS, uguu) through the app's domain
- Sets `Cache-Control: public, max-age=86400` (24h browser cache)
- No server-side caching — fetches upstream every time
- 15s timeout on upstream fetch

**Image storage:** Images are stored as `GeneratedImage` objects with either:
- `url` — Leonardo CDN URL (can expire)
- `base64` — inline base64 data (for freshly generated images)

**Where images appear:**
- Gallery grid — `GalleryCard.tsx:269` uses `<LazyImg>`
- Post Ready cards — `PostReadyCard.tsx`, `PostReadyCarouselCard.tsx`
- Image detail modal — `ImageDetailModal.tsx`
- Captioning studio cards
- Carousel approval cards

### Where Caching Would Help

| Opportunity | Impact | Complexity |
|------------|--------|-----------|
| **Server-side proxy cache** — Cache proxy-image responses in memory or filesystem to avoid re-fetching Leonardo CDN | HIGH | SMALL — add in-memory LRU or filesystem cache to `app/api/proxy-image/route.ts` |
| **Service worker / Cache API** — Pre-cache gallery images so tab switches are instant | HIGH | MEDIUM — needs SW registration, cache strategy |
| **Preload on hover** — When hovering a GalleryCard, prefetch the full-res image | LOW | SMALL — add `<link rel="preload">` or Image() prefetch |
| **Thumbnail generation** — Generate small thumbnails for gallery grid, load full-res on click/modal | MEDIUM | LARGE — needs server-side thumbnail pipeline |
| **CDN URL refresh** — Leonardo CDN URLs can expire; auto-refresh via re-proxy | MEDIUM | SMALL — detect 403 on LazyImg error, re-proxy |

### What the Change Should Be

1. Add an in-memory LRU cache (e.g., Map with max size) in `app/api/proxy-image/route.ts` for recently-fetched images
2. Extend `Cache-Control` header with longer TTL and `immutable` for freshly-generated images
3. Add error-retry to LazyImg: if the CDN URL 403s, re-fetch through proxy

### Estimated Complexity: **SMALL to MEDIUM**
- Server proxy cache: SMALL (add Map + eviction)
- LazyImg error recovery: SMALL (onError handler)
- Full service worker: MEDIUM (separate effort)

### Dependencies
- None blocking

---

## 5. PROP-019 OPT-004: Batch Processing

### Current State

**Batch operations in MainContent.tsx:**

1. **Batch captioning** (`batchCaptionImages`, lines 1001-1052):
   - Takes `candidates: GeneratedImage[]`
   - Groups into entries (single or carousel)
   - Processes **sequentially** in a for-loop (line 1031)
   - Each entry calls `generatePostContent` or `fanCaptionToGroup`
   - Progress tracked via `batchProgress` state
   - ~5-15s per entry (pi.dev call)

2. **Batch animation** (`handleBatchAnimate`, line 1814):
   - Filters `selectedForBatch`, calls `handleAnimate` per image
   - Each animation is a Leonardo video API call (~30-90s)

3. **Batch post-ready** (`handleBatchPostReady`, line 1837):
   - Uses `Promise.allSettled` — already parallel
   - Just sets `isPostReady: true` flag, fast operation

4. **Bulk tagging** (`BulkTagModal.tsx`):
   - Calls `bulkUpdateImageTags` — batch update, fast

5. **Schedule All** — batch scheduling state at line 331

6. **Gallery selection** (`selectedForBatch`, line 221):
   - Set<string> used for batch operations
   - Toggled via GalleryCard checkboxes

### What Needs Optimization

| Operation | Current | Optimization | Impact |
|-----------|---------|-------------|--------|
| **batchCaptionImages** | Sequential (1-at-a-time pi calls) | **Parallel with concurrency limit** (e.g., 3 concurrent pi calls) | HIGH — 3x speedup for batch of 9+ |
| **fanCaptionToGroup** | Sequential anchor-first, then propagate | Already efficient (1 AI call + fast propagation) | N/A |
| **handleBatchAnimate** | Sequential video API calls | Parallel with concurrency limit | MEDIUM — Leonardo may rate-limit |
| **batchProgress tracking** | Sequential done/total | Needs rework for concurrent model | LOW |

### What the Change Should Be

Modify `batchCaptionImages` to use a concurrency-limited parallel pool:

```ts
// Instead of:
for (let i = 0; i < entries.length; i++) { await process(entries[i]); }

// Use:
const CONCURRENCY = 3;
const pool = new Set<Promise<void>>();
for (const entry of entries) {
  const p = processEntry(entry).then(() => { pool.delete(p); updateProgress(); });
  pool.add(p);
  if (pool.size >= CONCURRENCY) await Promise.race(pool);
}
await Promise.all(pool);
```

The progress tracking needs to switch from sequential `done: i+1` to an atomic counter.

### Estimated Complexity: **SMALL**
- `batchCaptionImages` is self-contained in MainContent.tsx (lines 1001-1052)
- ~50 LOC change
- Progress tracking adjustment needed
- No external dependencies

### Dependencies
- None blocking, but benefits from PROP-018 (caching) since parallel requests hit the same pi endpoint

---

## Dependency Graph

```
PROP-009 (MainContent extraction)
  └── Depends on: test infra (V050-002 Phase 2 #0)
  └── Blocks: nothing else (but reduces blast radius for OPT items)

PROP-016 (Phase 2 staged plan)
  └── Depends on: PROP-009 Phase 1 (done)
  └── Depends on: test infra ticket
  └── Tickets #1-3 parallelizable after test infra
  └── Ticket #4 blocks #5, #5 blocks #6

PROP-017 (Pipeline speed)
  └── Independent of all others
  └── Parallel captioning: SMALL change, HIGH impact

PROP-018 (Image caching)
  └── Independent of all others
  └── Complements PROP-019 (batch parallel requests benefit from cache)

PROP-019 (Batch processing)
  └── Independent of all others
  └── Benefits from PROP-018 (parallel requests hit same endpoint)
```

## Summary Table

| PROP | Item | Files | Complexity | Impact | Blockers |
|------|------|-------|-----------|--------|----------|
| 009 | MainContent monolith extraction | MainContent.tsx (4382 LOC) | LARGE | HIGH — blast radius reduction | Test infra |
| 016 | Phase 2 staged plan | 7 new files + MainContent | LARGE (multi-week) | HIGH | Test infra, #4→#5→#6 |
| 017 | Pipeline execution speed | pipeline-processor.ts, usePipelineDaemon.ts | MEDIUM | MEDIUM-HIGH | None |
| 018 | Image caching | proxy-image/route.ts, LazyImg.tsx | SMALL-MEDIUM | HIGH | None |
| 019 | Batch processing | MainContent.tsx:1001-1052 | SMALL | MEDIUM | None |
