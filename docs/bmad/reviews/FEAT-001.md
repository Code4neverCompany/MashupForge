# FEAT-001 — Post Ready: persistent posted/failed indicators

**Why:** Posted content sat in Post Ready forever with no indication of success or failure — the existing `postStatus` Record was component-local and lost on every tab switch / reload.
**Classification:** complex (touches `types/mashup.ts` schema)
**Executed:** 2026-04-18 (developer subagent)

## Design choices

The acceptance criteria allowed either "remove on success" OR "mark visually". I chose **mark, don't remove**:

- Conservative — no item silently disappears.
- Lossless — user history visible; user can manually `Unready` to clear.
- Persistent across reloads (criterion #3) is satisfied by the schema additions, not by hiding state.

Schema delta is **3 optional fields** on `GeneratedImage`. Purely additive — no breaking changes, no migration needed, every existing image just has `undefined` for all three.

Manual `postImageNow` / `postCarouselNow` already updated an ephemeral `postStatus` Record for in-flight feedback ("Posted to instagram ✓"). I kept that for the live moment-of-action UX and **layered persistence on top** by writing the same outcome to the image's persistent fields. Source-of-truth precedence for the badge:

1. `img.postedAt` / `img.postError` — manual Post Now (this PR's new fields)
2. `latestScheduleFor(img.id)?.status` — scheduled-post worker outcome (already existed)
3. `Ready` — fallback

Manual posts win because they're newer information about the same image.

## Files changed

- **`types/mashup.ts`** — added `postedAt?: number`, `postedTo?: string[]`, `postError?: string` to `GeneratedImage`. Documented in a single JSDoc block.
- **`components/MainContent.tsx`**:
  - `postImageNow` — on success: `patchImage(img, { postedAt, postedTo, postError: undefined })`. On fail: `patchImage(img, { postError: reason })`.
  - `postCarouselNow` — same, but loops every image in the carousel (postCarouselNow already updates the whole group atomically).
  - Single-card badge (line ~3759) — checks `img.postedAt` / `img.postError` first, falls through to existing `latestScheduleFor` logic.
  - Carousel-card body — new persistent banner above the caption block: emerald "Posted to X ✓" if posted, red "Failed: <reason>" if errored. Anchor's persistent fields drive it (every image in the carousel shares them by construction).

## Acceptance criteria

| Criterion | Status |
|---|---|
| Successfully posted items visually marked | ✅ — emerald "Posted to X" badge (single + carousel) |
| Failed items show error reason on the card | ✅ — red "Failed: <reason>" badge with the actual error string |
| Posted status persists (survives tab switch) | ✅ — fields live on `GeneratedImage`, persisted via existing `saveImage` flow |
| FIFO message on completion | ✅ — sent after this report |

## Verification

- `npx tsc --noEmit` → clean.
- `git diff --stat`: `types/mashup.ts +14 / -0`, `components/MainContent.tsx +130 / -20` (the bigger MainContent number includes my prior uncommitted BUG-001 + FIX-WARN-001 work; FEAT-001 alone is ~48 lines).
- No new dependencies, no API route changes, no schema migration needed.

### Manual test plan (handoff to QA)

1. **Single image, success path:** open Post Ready, click "Post Now" on a single-card image with valid IG creds. Card should render an emerald "Posted to instagram" badge in the top-left status chip. Switch tabs, switch back — badge still there. Reload the page — badge still there.
2. **Single image, failure path:** disable IG creds (or pick a platform with bad creds). Click Post Now. Card should render a red "Failed: <reason>" badge. Switch tabs / reload — badge persists.
3. **Carousel, success path:** group 3 images, click "Post Now" on the carousel card. A green banner appears above the shared-caption block: "Posted to instagram ✓". Reload — banner persists.
4. **Carousel, failure path:** same with bad creds. Red "Failed: ..." banner appears, persists across reload.
5. **Recovery / retry:** after a failure, click Post Now again with corrected creds. The red banner should clear and the green banner should appear. (Success clears `postError`; failure does NOT clear `postedAt` — so a card that posted yesterday and fails today shows green Posted but the in-flight `postStatus` shows the new error. Open question for design: should failure ALSO clear postedAt? Current choice is no, because past success is real and failed retry doesn't undo it. Easy to flip if QA disagrees.)
6. **Mixed carousel state:** unlikely, since postCarouselNow patches all images atomically. But if QA wants to stress-test, manually edit one carousel image's `postedAt` away in DevTools — the carousel banner reads from anchor only, so anchor wins. (Acceptable.)

## Open questions for Hermes

- **Auto-remove on post?** Not implemented. The AC allowed it. If you want it, that's a one-line change in `postImageNow` / `postCarouselNow`: add `isPostReady: false` to the success patch. Easy follow-up.
- **Schema change:** I added 3 optional fields without consulting first. Per CLAUDE.md, schema changes are normally "complex → propose, do not run", but this dispatch was human-directed by you with explicit "execute" instruction, so I went ahead. The change is purely additive — easy to roll back if you'd prefer a different shape (e.g., `lastPost?: { at: number; to: string[]; error?: string }` instead of three flat fields).
