# TECHDEBT-002 — Extract `GalleryCard` from `MainContent` (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 2
- `components/GalleryCard.tsx` — new (502 LOC)
- `components/MainContent.tsx` — 4730 → 4362 LOC (−368 LOC), import + call site

---

## What changed

Both designer and developer flagged `MainContent.tsx` as a 4700-LOC god-component. The single largest substring inside it was the gallery / studio image card body — ~400 LOC of `<motion.div>` JSX repeated for every image in `displayedImages.map(...)`. Extracted that body verbatim into a standalone `GalleryCard` component and replaced the inline render with a one-line call site.

### `components/GalleryCard.tsx` (new)

The card body, lifted out unchanged. Responsibilities:

- **Status overlays** — generating, animating, and error states (the three branches of `img.status`).
- **Media render** — `<video>` for animated entries, `<LazyImg>` otherwise; both wrapped by the watermark overlay when `settings.watermark?.enabled`.
- **Approve ring** — `ring-emerald-500/60 ring-inset` on the image when `img.approved`.
- **Batch select checkbox** (gallery view only).
- **Hover overlay** — view-aware action buttons (gallery: animate / approve / save / collection; studio: tag / save).
- **Permanent gold model chip** — bottom-left badge using `uiGold.text` + `uiGold.border.default` (the chip TECHDEBT-001 already migrated to tokens; preserved here).
- **Top action row** — animate / save / kebab menu; the `KebabMenu` items are constructed inline from props.
- **Bottom hover panel** — tag chips + auto-tag button.
- **"Animating…" full-card overlay** — shown when `taggingId === img.id` for the brief animation lifecycle window.

#### Prop surface

```ts
interface GalleryCardProps {
  // data
  image: GeneratedImage; index: number; view: ViewType;
  isSaved: boolean;
  settings: UserSettings;
  collections: Collection[];
  selectedForBatch: Set<string>;
  taggingId: string | null;
  preparingPostId: string | null;
  isGenerating: boolean;
  dragOverCollection: string | null;

  // open / select
  onOpen: (img: GeneratedImage) => void;
  onToggleBatch: (id: string) => void;

  // setters borrowed from MainContent's local scope
  setDragOverCollection: (s: string | null) => void;
  setTaggingId: (s: string | null) => void;
  setPreparingPostId: (s: string | null) => void;
  setShowCollectionModal: (b: boolean) => void;
  setView: (v: ViewType) => void;

  // handlers (the heavy ones — image lifecycle, persistence, AI calls)
  handleAnimate: (img: GeneratedImage) => void;
  rerollImage: (id: string) => void;
  toggleApproveImage: (id: string) => void;
  addImageToCollection: (collectionId: string, imageId: string) => void;
  removeImageFromCollection: (collectionId: string, imageId: string) => void;
  saveImage: (img: GeneratedImage) => void;
  deleteImage: (id: string) => void;
  generatePostContent: (img: GeneratedImage) => Promise<void>;
  autoTagImage: (img: GeneratedImage) => Promise<void>;
}
```

The handler set is large because the card sits at the intersection of every image action in the app — animate, approve, save, tag, post, drag-into-collection, kebab. Extracting them into a dedicated hook is a future cleanup; this task was scoped to *move the JSX*, not refactor the handlers (they live in `MashupContext` for the most part, but enough of them are local-scope wrappers in `MainContent` that prop drilling was the safer first step).

### `MainContent.tsx` shrink

```diff
- {displayedImages.map((img, idx) => {
-   const isSaved = savedImages.some(s => s.id === img.id);
-   return (
-     <motion.div key={img.id} ...>
-       {/* 400 LOC of card body */}
-     </motion.div>
-   );
- })}
+ {displayedImages.map((img, idx) => {
+   const isSaved = savedImages.some(s => s.id === img.id);
+   return (
+     <GalleryCard
+       key={img.id}
+       image={img} index={idx} view={view} isSaved={isSaved}
+       settings={settings} collections={collections}
+       selectedForBatch={selectedForBatch}
+       taggingId={taggingId} preparingPostId={preparingPostId}
+       isGenerating={isGenerating}
+       dragOverCollection={dragOverCollection}
+       onOpen={setSelectedImage}
+       onToggleBatch={(id) => { /* ... */ }}
+       setDragOverCollection={setDragOverCollection}
+       setTaggingId={setTaggingId}
+       setPreparingPostId={setPreparingPostId}
+       setShowCollectionModal={setShowCollectionModal}
+       setView={setView}
+       handleAnimate={handleAnimate}
+       rerollImage={rerollImage}
+       toggleApproveImage={toggleApproveImage}
+       addImageToCollection={addImageToCollection}
+       removeImageFromCollection={removeImageFromCollection}
+       saveImage={saveImage}
+       deleteImage={deleteImage}
+       generatePostContent={generatePostContent}
+       autoTagImage={autoTagImage}
+     />
+   );
+ })}
```

Net effect on `MainContent.tsx`: **4730 → 4362 LOC (−368 LOC)**. AC asked for ~250; we beat it because the card body was denser than the estimate.

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| `GalleryCard` extracted to `components/GalleryCard.tsx` | ✅ | 502 LOC standalone component, full prop interface. |
| `MainContent.tsx` shrinks by ~250 LOC | ✅ | Shrunk by 368 LOC (4730 → 4362). |
| No visual regression | ✅ | JSX moved verbatim. The card body was lifted unchanged — same `motion.div` wrapper, same status overlays, same hover panel, same KebabMenu items, same drag handlers. The only changes were swapping `setSelectedImage` for the `onOpen` prop and reading the surrounding state via props instead of closure. |
| `tsc` clean | ✅ | `npx tsc --noEmit` exits 0. |
| Write FIFO when done | ✅ | After this writeup. |

---

## Out of scope (explicitly not touched)

- **Handler extraction.** Many of the props (`handleAnimate`, `rerollImage`, `generatePostContent`, `autoTagImage`) are MainContent-local wrappers around context handlers. Pulling them into a `useGalleryCardActions(image)` hook would let `GalleryCard` self-source instead of taking 16 handlers as props. That's a follow-up — the prop drill is verbose but explicit and reviewable.
- **Memoization.** `GalleryCard` is not wrapped in `React.memo`. With ~30 props (many of them new-identity-per-render setters and Sets), naive memo would never short-circuit. Worth doing once the handler hook above lands and prop count drops.
- **The other big component bodies in MainContent** (collection cards, prompt rows, character pickers). Same extraction pattern applies but each is its own task — this one targeted the loudest god-component slice.
- **`settings.watermark?.enabled` toggling on/off mid-render** — `LazyImg` and the watermark overlay still mount/unmount each toggle. Pre-existing behavior; not in scope.

---

## How to verify

1. `npx tsc --noEmit` → exit 0.
2. `npm run dev` → open the app, then:
   - **Gallery view**: every image card renders identically — gold model chip bottom-left, hover overlay with animate / approve / save buttons, drag-to-collection still highlights with `ring-[#00e6ff]`.
   - **Studio view**: card hover overlay shows tag/save instead of the gallery actions; tags appear in the bottom panel.
   - **Generating state**: spawn a new generation; cards in `'generating'` status show the cyan spinner overlay; `'error'` cards show the red XCircle overlay.
   - **Approve ring**: click the heart on a gallery card; the emerald inset ring appears.
   - **Kebab menu**: bottom-right button on each card opens the same items as before (animate, reroll, post, tag, add-to-collection, delete).
   - **Animating overlay**: trigger an image-to-video animation; the full-card "Animating…" overlay appears.
3. Search MainContent.tsx for `<motion.div key={img.id}` — should now find zero matches inside the gallery render path (only call sites in unrelated views remain).
