# FEAT-004 — Collection creation: simplified UX (DONE)

**Status:** done
**Classification:** routine (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 3
- `components/CollectionModal.tsx` — rewritten (single-input flow, ~165 LOC)
- `components/MainContent.tsx` — call site updated, dropped now-unused state, fixed dropped `savedImages` arg
- `types/mashup.ts` — `createCollection` signature widened to expose the existing 4th arg

---

## What changed

### Before — 5 things to look at, every time

The old `CollectionModal` was a 3-section sheet:
- Header bar with title + close button
- Body with **Name** input AND **Description** textarea (always-rendered, ~100px tall)
- Footer with Cancel + "Create Collection" buttons

To create a collection, the user had to:
1. Click + New Collection → modal opens
2. Decide whether to fill description (visible empty textarea = implicit pressure)
3. Type a name (no Enter-to-submit support — had to click button)
4. Click Create

Description had to be typed by hand even when the user had selected images and would have been happy with an AI-generated one. There was a `createCollection` parameter for AI auto-naming via pi.dev, but the call site never passed `savedImages`, so the AI fallback **never actually fired**.

### After — one input, one tap to create

- **Single auto-focused Name input.** Empty modal = caret in name field, no decision required.
- **Description hidden by default** behind an inline `▼ Add description (optional)` disclosure. Reveals a compact 64px textarea when needed; never gets in the way otherwise.
- **Enter to submit.** Esc to close. Cmd/Ctrl+Enter from inside the textarea also submits.
- **`✨ Suggest` button** appears next to the name input only when the user opened the modal from a batch selection. Calls the existing `autoGenerateCollectionInfo` (pi.dev `streamAIToString({mode:'collection-info'})`) against up to 5 sampled images and fills name + description (auto-expanding the description disclosure if non-empty).
- **"from N images" pill** in the header when batch-selection drove the open — orients the user without an extra paragraph of copy.
- **Blank submit allowed.** With selection: `createCollection` runs the pi.dev auto-name fallback (now actually wired — see "Bug fixed" below). Without selection: falls back to `Collection N`.
- **Compact size.** Same modal width on desktop, ~40% shorter visually because of the collapsed description and tightened paddings (`p-6` → `px-5 py-3`).
- **Click outside to close** (backdrop click).
- **Loading states** for both Suggest (spinner on the button) and Create (spinner + "Creating…" on the primary button + disabled inputs).

State that used to live on the parent (`newCollectionName`, `newCollectionDesc`, plus their setters) has moved into the modal. The parent only owns "is the modal open" and the create handler. Fewer moving parts on `MainContent`, four fewer state lines.

### Bug fixed (incidentally)

`createCollection` in `useCollections.ts` has had a 4th parameter `savedImages` since slice B of FIX-100, used to feed the pi.dev auto-name fallback when the user submits with a blank name and `imageIds` set. The MainContent call site was passing 3 args, so the fallback never ran. Now passes `savedImages`. The exposed type in `types/mashup.ts` was widened to match the implementation.

---

## tsc

```
$ npx tsc --noEmit
$  # exit 0 — clean
```

(Two TS errors caught and fixed mid-stream: `createCollection` signature mismatch, and a `Promise<T | undefined>` vs `Promise<T | null>` widening for the `onSuggest` return shape — coerced with `?? null`.)

---

## Acceptance checklist

| AC | Status | Notes |
|---|---|---|
| Fewer steps to create a collection | ✅ | From 4 deliberate actions → 2 (open + Enter). Description is opt-in. AI-generated name is one tap when selecting images. |
| Clear, intuitive UI | ✅ | One input visible, one disclosure for the optional bit, one primary button. Selection count surfaces context. Enter/Esc behave as expected. |
| Write FIFO when done | ✅ | After this writeup. |

---

## Out of scope (explicitly not touched)

- The collection popover hover-within-hover on gallery cards (DESIGN-003 §10 cleanup item — separate task).
- Editing existing collections (rename / re-describe / delete) — same flow on the manage-collections list, but not in scope for "creation simplification."
- Bulk-creation from multiple separate selections.

---

## How to verify

1. `npm run dev` → open the gallery, click `+ New Collection` (without selecting any images).
   - Expect: small modal with a single Name input focused, description hidden, no Suggest button.
   - Type "Heroes" + Enter → modal closes, collection "Heroes" appears in the sidebar.
2. Open the gallery, batch-select 3+ images (checkboxes on cards), then `+ New Collection`.
   - Expect: same modal but with `from 3 images` pill in the header AND a `✨ Suggest` button next to the name input.
   - Click Suggest → spinner; on resolve, name field fills with AI suggestion AND description disclosure auto-expands with the AI description.
3. Open with selection again, leave name blank, click Create directly.
   - Expect: pi.dev auto-name fallback fires; collection appears with an AI-generated name (not "Collection N").
4. Open the modal, click the backdrop OR press Esc → modal closes without creating.
