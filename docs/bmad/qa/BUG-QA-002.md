# QA Gate: BUG-QA-002 — Captioning tab: delete card, not just text

**Date:** 2026-04-19
**Status:** PASS
**Tests before:** 392 passing | **Tests after:** 392 passing

---

## Root cause

The Captioning tab shows `savedImages.filter((i) => !i.isPostReady && i.approved)`.

The single-image card "Remove" confirmation at `MainContent.tsx:2633` called:
```typescript
patchImage(img, { postCaption: '', postHashtags: [], tags: [] })
```
This cleared the text fields but left `approved: true`, so the card remained
visible in the Captioning filter. The card stayed — only its content was erased.

## Fix — `components/MainContent.tsx`

Added `approved: false` to the confirm-remove patch:
```typescript
patchImage(img, { approved: false, postCaption: '', postHashtags: [], tags: [] })
```

Setting `approved: false` removes the image from the Captioning filter
(`i.approved` gate) while the image remains in `savedImages` and is still
visible in the Gallery tab. This matches the existing button tooltip:
"Remove from Captioning (image stays in Gallery)".

## Acceptance criteria

| Criterion | Result |
|---|---|
| Can delete card from Captioning | PASS — `approved: false` removes card from Captioning filter |
| Write inbox | PASS |
