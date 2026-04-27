# Review: QOL-FE01 — Gallery Collection Visual Indicators

**Task:** qol-fe01-gallery-badge
**Date:** 2026-04-27
**Agent:** developer
**Status:** COMPLETE
**Confidence:** 0.95
**Commit:** 1039e04

## What was done

Added a gold FolderOpen pill badge to gallery cards that belong to a collection. The badge sits bottom-left above the model/style chip row, showing the collection name truncated to 12 characters.

## Changes

### `components/GalleryCard.tsx`
- Added `FolderOpen` to lucide-react imports
- Added conditional badge block: when `img.collectionId` is set AND the collection exists in the `collections` array, renders a gold pill at `bottom-9 left-2`
- Orphan handling: if `collections.find()` returns null (collection deleted but `collectionId` not cascade-cleared), the badge simply doesn't render — no crash, no ghost label
- Badge styles: `bg-[#c5a062]/15 text-[#c5a062] border-[#c5a062]/40`, `text-[9px] font-bold uppercase tracking-wide`, `opacity-80` default → `opacity-100` on card hover

### `tests/components/GalleryCard.test.tsx`
4 new tests in `QOL-FE01 — Collection badge` describe block:
1. Badge renders when image has a valid collectionId
2. Badge hidden when collectionId is absent
3. Badge hidden for orphan collectionId (collection deleted)
4. Long collection names truncated to 12 chars with ellipsis

## Cascade-clear note

`deleteCollection` in `hooks/useCollections.ts` does NOT cascade-clear `collectionId` on images. The badge handles this gracefully (orphan = no badge), but a future cleanup task should add cascade-clear to `deleteCollection` for data hygiene.

## Verification
- `tsc --noEmit` — clean
- `vitest run` — 828/828 tests passing (was 824)
- Pre-commit hook passed
