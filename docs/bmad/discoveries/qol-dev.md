# QoL Discovery — Dev Agent
**Research Date:** 2026-04-27
**Project:** Multiverse-Mashup-Studio | Stack: Next.js, TypeScript, Tailwind, Tauri, Python pipeline

---

## 1. Gallery Collection Visual Indicators

### What It Does
Shows users which images are already inside a collection at a glance — without opening the image or hovering.

### How It Works
Currently `GalleryCard` shows a gold model chip (`bg-[#c5a062]`) bottom-left and an Electric Blue ring (`ring-[#00e6ff]`) on `dragOverCollection`. There is **no persistent "in collection" badge** on cards that are already members of a collection.

Reference patterns:
- **Pinterest:** Folder icon overlay on pin thumbnails + "Saved" checkmark badge + board name chip
- **Figma:** "Component" badge (purple), "used in N files" count, library subscription dot
- **Notion:** Database property inline (icon + name), colored folder icon in collection header
- **CSS pattern:** Stacked card preview (bottom-left corner, offset -4px) showing collection thumbnail count

### Suggested Tech Stack
Pure Tailwind + React state. No new library needed.

### Implementation Complexity: **Low**

### Specific Ideas

**Idea 1 — "Folder" badge on gallery cards**
When `image.collectionId` is set, render a small `FolderCheck` or `Bookmark` icon chip in the card's top-right or bottom-right corner.
- Files likely touched: `components/GalleryCard.tsx`
- Adds `image.collectionId ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''` badge
- No state changes, purely derived from existing `image.collectionId` field

**Idea 2 — Collection count / stacked preview on gallery hover**
On card hover, the collection menu (already portaled via `createPortal`) shows which collection(s) own the image. For multi-collection (future), show a stacked card icon + count.
- Uses existing `collectionOpen` / `collectionMenuPos` state already in `GalleryCard`
- Low risk: same menu component, just richer content when `image.collectionId` is set

**Idea 3 — Filter bar "In Collection" toggle**
Add a filter toggle in `GalleryFilterBar` to show only images that belong to a selected collection. Currently `GalleryFilterBar` has platform/model/tag filters but no collection filter.
- Propagate `selectedCollectionId` down to `savedImages` filtering in `MainContent`
- Medium complexity: filter state lives in `GalleryFilterBar` but needs to flow through to `MainContent`'s render

---

## 2. Post-Ready Drag & Drop Between Carousels

### What It Does
Lets the user drag a single post card from one carousel group into another carousel, or drag an entire carousel card as a unit. Reorders within the same carousel (sort) is out of scope.

### Current State
The codebase uses **native HTML5 DnD API** (not `@dnd-kit`). Evidence:
- `draggable` prop on elements
- `onDragStart` / `onDragEnd` / `onDragOver` / `onDragLeave` / `onDrop` handlers
- `dataTransfer.setData('postId', ...)` / `getData('postId')` for payload
- Tauri config `dragDropEnabled: false` (WebView2 native DnD disabled to let React receive events)
- No imports of `@dnd-kit/core` or `react-dnd` anywhere in the codebase

Existing DnD:
- Gallery card → collection (gallery view): `GalleryCard.tsx:175-180`
- Post card → calendar slot: `MainContent.tsx:3466-3484`
- `dragOverCollection` / `dragPostId` state in `MainContent.tsx:226,315-316`

### Data Model Context
- Images with the same `carouselGroupId` are grouped into a `PostItem` by `computeCarouselView()` (`lib/carouselView.ts`)
- `PostReadyCarouselCard` receives `images: GeneratedImage[]` as its primary prop
- Dragging a single image from one carousel to another would need to: (1) remove it from source `carouselGroupId`, (2) assign it to target `carouselGroupId` (or create a new one)
- Dragging an entire carousel: all images in `carouselGroupId` move together

### Suggested Tech Stack
**@dnd-kit** — closest thing to a standard for complex multi-container drag in React. vs HTML5 DnD:
- HTML5 DnD: fine for simple A→B drops, poor for reordering within lists, no cross-container logic
- @dnd-kit: built for sortable + multi-container, accessible, touch support, collision detection
- Risk: adds a new dependency; the QA doc `docs/bmad/qa/QA-PROP-012.md` notes @dnd-kit was never imported and HTML5 DnD was used instead — likely intentional simplicity

### Implementation Complexity: **Medium/High**

### Specific Ideas

**Idea 1 — Drag single image between carousel containers (HTML5 DnD upgrade)**
Extend the existing `onDrop` handler in `PostReadyCarouselCard` or its wrapper to accept `imageId` payloads from other carousel containers. Requires:
- `onDragOver` on carousel container zones to highlight valid drop targets
- `dataTransfer.setData('imageId', img.id)` on individual image drag
- A new handler `moveImageBetweenCarousels(imageId, sourceGroupId, targetGroupId)` in `MainContent`
- Visual: Electric Blue (`#00e6ff`) dashed ring on valid drop targets (reuse existing color token)
- Files: `components/postready/PostReadyCarouselCard.tsx`, `components/MainContent.tsx`

**Idea 2 — Drag entire carousel card (requires new state)**
Introduce `draggingCarouselGroupId: string | null` state. The `PostReadyCarouselCard` itself becomes `draggable`. On drop onto another carousel card or a "drop zone" between cards:
- Move all images with `sourceGroupId` to `targetGroupId`
- If target is "new group", assign fresh `carouselGroupId`
- Files: `components/postready/PostReadyCarouselCard.tsx`, `components/MainContent.tsx`
- Cross-carousel insert position: append to end of target carousel (no position reordering in v1)

**Idea 3 — Add @dnd-kit for sortable cross-container drag**
Evaluate @dnd-kit if HTML5 DnD proves insufficient for the two-carousel case. Use `@dnd-kit/sortable` + `@dnd-kit/core`. The `SortableContext` wraps each carousel's image list; `DndContext` wraps the entire Post Ready grid.
- Upside: proper collision detection, keyboard accessibility, touch support
- Downside: ~8KB gzipped added bundle, refactor of existing DnD handlers
- Risk: medium — existing HTML5 DnD for calendar already works; only add if cross-carousel UX is demonstrably broken

---

## 3. Simplify Batch-Adding to Collections

### What It Does
Reduce the number of steps to add multiple related images to a collection. Currently: select each image → open kebab → Add to Collection → pick collection. Proposed: select multiple → "Add to Collection" once, or "Add Similar" auto-detection.

### Current Patterns
- `selectedForBatch: Set<string>` state already drives batch operations in gallery (animate, approve, save, batch-tag, bulk delete)
- `GalleryFilterBar` renders `{selectedForBatch.size} selected` bar when batch is non-empty
- `CollectionModal` accepts `selectionCount` prop and renders a ✨ Suggest button from `selectedForBatch`
- `hooks/useCollections.ts` has `proposeTagGroups()` (auto-group by tag) and `findMatchingImages()` (find images sharing tags with a collection) — these are the building blocks

### Implementation Complexity: **Low/Medium**

### Specific Ideas

**Idea 1 — "Add to Collection" action in GalleryFilterBar batch bar**
When `selectedForBatch.size > 0`, show an "Add to Collection" button in the batch action bar (currently only has Animate / Post Ready / Caption / Delete).
- Uses existing `addImageToCollection(imageId, collectionId)` signature
- Needs a collection picker (reuse the portaled `KebabMenu` pattern from `GalleryCard`)
- Files: `components/GalleryFilterBar.tsx`
- Complexity: low — just adds a button that opens the existing collection picker

**Idea 2 — "Add Similar" auto-add using existing `findMatchingImages`**
A button on each collection card: "Auto-add matching". Uses `findMatchingImages(pool, collectionImages, collectionId)` from `hooks/useCollections.ts` to surface similar untagged images, then offers "Add N matching" as a confirm step.
- Existing `findMatchingImages` already does the tag-based matching logic
- Files: `components/GalleryCard.tsx` (collection menu item), `hooks/useCollections.ts`
- Complexity: low — `findMatchingImages` is already exported and tested

**Idea 3 — Multi-select checkboxes in Post Ready carousel view**
Enable `selectedForBatch` mode in Post Ready tab (currently `postReadySelected: Set<string>` parallel state exists but only for promoting singles to a carousel). Extend to allow checking multiple carousel cards and a "Add to Collection" bulk action.
- `PostReadyCarouselCard` needs checkboxes added (parallel to `GalleryCard` checkbox pattern)
- Files: `components/postready/PostReadyCarouselCard.tsx`, `components/MainContent.tsx`
- Complexity: medium — new checkbox UI in carousel card + batch action flow

---

## 4. pi.dev Web Search Improvements

### Current Implementation
- Route: `app/api/pi/prompt/route.ts` (POST, SSE stream)
- Mode `idea` does 3-query web search (2 niche-shuffled + 1 fallback pool) via `lib/web-search.ts`
- `lib/web-search.ts`: DuckDuckGo HTML scrape (default) + Brave Search API (opt-in via `BRAVE_API_KEY`), with 2 req/s rate limit, FIFO URL dedup across runs, `extractTrendingTags()` for heuristic tag extraction
- Results are injected as `[TRENDING CONTEXT — OPTIONAL INSPIRATION ONLY]` block in the prompt, NOT surfaced to the user
- `app/api/web-search/route.ts`: desktop-only (serverless guard), 2 req/s token bucket, returns `{ results, provider }` JSON

### pi.dev Context
pi.dev is a local coding agent (runs as a sidecar subprocess in the Tauri desktop shell). It handles all text AI. The `/api/pi/prompt` route pipes prompts to `piPrompt()` from `lib/pi-client.ts`. pi.dev itself is not a search tool — it is a reasoning agent that can *call* search tools.

### Reference: Perplexity AI Research Mode
Perplexity Pro has two modes:
- **Quick Search:** Single query, fast, inline citations `[1]` with expandable source cards
- **Deep Research:** Multi-source synthesis, 30-60s, structured report with footnotes, cross-source verification

### Implementation Complexity: **Medium**

### Specific Ideas

**Idea 1 — Citation extraction + inline footnote formatting**
For `idea` mode: parse the streamed LLM response for citation markers (e.g., `[source 1]` patterns) and render sources as numbered footnotes below the ideas list.
- Files: `app/api/pi/prompt/route.ts` (inject citation instruction into system prompt), UI for citation rendering in `MainContent.tsx`
- Complexity: medium — requires LLM instruction tuning (system prompt directive) + UI footnote rendering
- Risk: LLM citation accuracy is unreliable without explicit fine-tuning or tool-use prompting

**Idea 2 — Perplexity-style "Deep Research" mode toggle**
Add a `searchDepth: 'quick' | 'deep'` parameter to `/api/pi/prompt`. In `'deep'` mode:
- Run 3 queries simultaneously (already implemented) + 2 additional lateral queries ("what's the opposite/trending inverse?")
- Return structured `sources: WebSearchResult[]` alongside the text delta in the SSE stream
- Client renders a collapsible "Sources" panel below ideas
- Files: `app/api/pi/prompt/route.ts`, `lib/web-search.ts`, `MainContent.tsx` (IdeasView)
- Complexity: medium — already has multi-query; needs SSE schema change to include sources

**Idea 3 — pi.dev packages for multi-engine search (advanced)**
pi.dev has a package ecosystem (`pi.dev/packages`). A `multi-engine-ai-search` package exists that wraps Perplexity, Bing Copilot, and Google AI. This could replace the manual DDG/Brave implementation with a unified pi-sidecar tool call.
- Upside: higher quality results, built-in citation, no rate limit concerns (local)
- Downside: requires pi.dev subscription + package installation, adds external dependency
- Risk: medium — not guaranteed to be stable; pi.dev packages are community-maintained

---

## 5. Additional QoL Ideas

### Keyboard Shortcuts

**Idea 1 — Global shortcut for "New Collection from Selection"**
Currently `selectedForBatch` enables batch ops but there is no keyboard shortcut to create a collection. Add `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) when `selectedForBatch.size > 0` to open `CollectionModal`.
- File: `MainContent.tsx` — add `useEffect` with `keydown` listener checking `selectedForBatch.size`
- Complexity: low

**Idea 2 — Carousel navigation keyboard shortcuts**
In Post Ready carousel view: `←`/`→` to navigate between carousel cards, `Enter` to expand/open, `D` to drag.
- `PostReadyCarouselCard` already receives `onPreviewClick` — extend with keyboard handler at grid level
- Complexity: low

### Batch Operations

**Idea 3 — "Select All with Tag" shortcut**
In gallery filter bar: clicking a tag filter chip could offer "Select all N images with this tag" as a sub-action.
- Uses existing `proposeTagGroups` logic but inverts: select all images *with* a given tag, not group them
- File: `components/GalleryFilterBar.tsx`
- Complexity: low

**Idea 4 — Bulk move between carousels**
After Idea 1 of section 2 (cross-carousel drag), expose a "Move to..." kebab action on `PostReadyCarouselCard` that opens the same carousel picker modal used for manual grouping.
- Reuses existing `CarouselPicker` modal infrastructure
- File: `components/postready/PostReadyCarouselCard.tsx` (kebab item), `MainContent.tsx` (modal state)
- Complexity: medium

### Offline / Error Recovery

**Idea 5 — Pending action queue for offline pi.dev**
When pi.dev is unreachable (503 from `/api/pi/prompt`), queue the prompt locally and retry when pi becomes available. Currently any idea generation failure is silent (trending is optional enrichment).
- Add `pendingPrompts:[]` to `PipelineMemory` or a new `lib/pending-queue.ts`
- Show a subtle "AI queued — will run when ready" toast instead of silent failure
- File: `lib/pi-client.ts`, `lib/pipeline-memory.ts`
- Complexity: medium

**Idea 6 — Failed post retry queue**
Failed scheduled posts (`status: 'failed'`) could be retried individually or as a batch. Currently `PostReadyCarouselCard` shows failed status but only allows "Move all out of Post Ready".
- Add "Retry" button to the kebab menu for failed carousels
- Re-invoke `postNow()` for each image in the carousel
- File: `components/postready/PostReadyCarouselCard.tsx`
- Complexity: low

### Smart Defaults

**Idea 7 — Auto-scroll to newest carousel in Post Ready**
When a new carousel is created (via grouping or promotion), auto-scroll the Post Ready grid to bring it into view.
- After `createCarouselGroup()` call, find the DOM node for the new card and `scrollIntoView()`
- File: `MainContent.tsx`
- Complexity: low

---

## Summary Table

| Feature | Complexity | Files Touched | Risk |
|---------|-----------|---------------|------|
| 1a. "In Collection" folder badge | Low | `GalleryCard.tsx` | Minimal |
| 1b. Collection filter toggle | Medium | `GalleryFilterBar.tsx`, `MainContent.tsx` | Low |
| 2a. Drag image between carousels (HTML5) | Medium | `PostReadyCarouselCard.tsx`, `MainContent.tsx` | Medium |
| 2b. Drag entire carousel | Medium | `PostReadyCarouselCard.tsx`, `MainContent.tsx` | Medium |
| 2c. @dnd-kit evaluation | Medium | `MainContent.tsx` (refactor) | Medium |
| 3a. Batch add to collection (FilterBar) | Low | `GalleryFilterBar.tsx` | Minimal |
| 3b. "Add Similar" auto-add | Low | `GalleryCard.tsx`, `hooks/useCollections.ts` | Minimal |
| 3c. Post Ready batch selection | Medium | `PostReadyCarouselCard.tsx`, `MainContent.tsx` | Low |
| 4a. Citation footnote formatting | Medium | `app/api/pi/prompt/route.ts`, `MainContent.tsx` | Medium |
| 4b. Deep research mode toggle | Medium | `app/api/pi/prompt/route.ts`, `lib/web-search.ts` | Medium |
| 4c. pi.dev search packages | Medium | `lib/pi-client.ts` | Medium |
| 5a. Ctrl+Shift+C new collection | Low | `MainContent.tsx` | Minimal |
| 5b. Pending prompt queue | Medium | `lib/pi-client.ts`, `lib/pipeline-memory.ts` | Medium |
| 5c. Failed post retry queue | Low | `PostReadyCarouselCard.tsx` | Minimal |
