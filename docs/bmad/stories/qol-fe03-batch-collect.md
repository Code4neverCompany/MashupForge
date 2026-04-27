# Story: FEAT-3 — Simplify Batch-Adding to Collections

## Feature
Faster workflow to add similar content to a collection. Activates existing but underused code.

## Current State (Dev found)
- `hooks/useCollections.ts` has `findMatchingImages()` and `proposeTagGroups()` — not wired to UI
- `selectedForBatch: Set<string>` already drives 5 batch operations
- `CollectionModal.tsx` has pi.dev "Suggest" flow

## Implementation Options (pick one or combine)

### Option A: "Add Similar" in Collection Modal
- When a user opens a collection's add-panel, show an "Add Similar" button
- Calls existing `findMatchingImages(collectionId)` to auto-suggest similar images
- User reviews suggested images, confirms → batch add
- Low new code — mostly wiring existing functions to UI

### Option B: Gallery FilterBar → "Add to Collection"
- Add "Add to Collection" button in `GalleryFilterBar` (next to existing platform/model/tag filters)
- When images are filtered, button says "Add [N] to Collection" 
- Opens collection picker → adds all filtered images in one click

### Option C: Post Ready batch selection
- Add checkbox selection to `PostReadyCarouselCard` items
- "Add selected to collection" floating action button
- Select multiple images across carousels, add all to collection in one action

## Recommended
Start with Option A (lowest complexity, activates unused code) + Option B (high impact, existing batch infrastructure).

## Implementation
1. Wire `findMatchingImages()` to CollectionModal "Add Similar" button
2. Add "Add to Collection" button to GalleryFilterBar
3. Handle loading state (matching is async)
4. Handle empty results gracefully

## Hard Acceptance Criteria
1. "Add Similar" returns and displays matching images before adding
2. Batch add is atomic — all succeed or all fail (no partial state)
3. Race condition: two simultaneous batch adds don't corrupt state
4. Loading/disabled states shown during async operations
5. 824/824 tests pass — add tests for batch operations

## Files
- `components/GalleryFilterBar.tsx` (add button)
- `components/CollectionModal.tsx` (add "Add Similar" button)
- `hooks/useCollections.ts` (wire `findMatchingImages`, `proposeTagGroups`)

## Complexity: LOW/MEDIUM
