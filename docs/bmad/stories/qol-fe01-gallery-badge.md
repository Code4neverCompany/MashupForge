# Story: FEAT-1 — Gallery Collection Visual Indicators

## Feature
Show a "folder" badge on gallery cards that belong to a collection. No hover needed — visible at a glance.

## Design Spec (from designer discovery)
Corner accent pill, bottom-left of card:
```
bg: #c5a062/15   border: #c5a062/40   text: #c5a062
icon: FolderOpen (lucide), 10px
font: text-[9px] font-bold uppercase tracking-wide
```
- Default: `opacity-80`
- Card hover: `opacity-100 scale-1.02`
- Drag-over: `ring-1 ring-[#00e6ff]` pulse

ASCII sketch:
```
┌─────────────────────────────┐
│  [image content]            │
│ ┌────────────────┐         │
│ │ 📁 Favorites   │         │  ← gold pill, collection name truncated to 12ch
│ └────────────────┘         │
└─────────────────────────────┘
```

## Implementation
- File: `components/GalleryCard.tsx`
- Add conditionally rendered pill inside image wrapper when `img.collectionId` is set
- Derive collection name from `collections.find(c => c.id === img.collectionId)?.name`
- If collection was deleted but `img.collectionId` still set → badge shows collection name from stored ID (or renders nothing — must NOT crash)

## Hard Acceptance Criteria
1. Badge appears when `img.collectionId` is set, disappears when cleared
2. Badge shows correct collection name (truncated to 12 chars)
3. Cascade-clear: if a collection is deleted, all images with `collectionId === deletedId` must have `collectionId` cleared (or badge handles orphan gracefully — no crash, no ghost label)
4. Dark theme: WCAG AA contrast on zinc-900 background
5. No regression: existing gallery-to-collection drag still works
6. 824/824 tests pass

## Files
- `components/GalleryCard.tsx` (modify)
- `hooks/useCollections.ts` (check cascade-clear logic)

## Complexity: LOW
