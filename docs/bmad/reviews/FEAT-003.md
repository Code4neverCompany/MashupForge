# FEAT-003 — Gallery card cleanup (DESIGN-002) + auto-tag CTA (DONE)

**Status:** done
**Classification:** complex (per Hermes dispatch)
**Dispatched:** 2026-04-18
**Files touched:** 1
- `components/MainContent.tsx` — gallery card rebuild + auto-tag wiring

Builds on FEAT-005 (kebab in the action row) — all DESIGN-002 acceptance items now pass.

---

## What shipped

### 1. DESIGN-002 visual cleanup

| Change | Lines | Notes |
|---|---|---|
| **Bottom-left "Approved" pill removed** | was 4356-4364 | Inset emerald ring already conveys approved state. Drop the duplicated chrome per §3.2. |
| **Permanent model chip added (bottom-left, z-5)** | new in same block | `bg-black/55 backdrop-blur-md text-[#c5a062] border border-[#c5a062]/30` per §3.3. Visible without hover so the gallery's "compare which model produced this" loop works at a glance. `max-w-[80px] truncate` so long model names stay one-line. |
| **Bottom hover overlay slimmed** | was 4549-4572 | Dropped redundant model badge (now permanent above), dropped inline Download button (now in kebab per FEAT-005). Replaced two-stop gradient (`from-black/90 via-black/20`) with single `from-black/85 via-black/15`. Padding tightened to `p-3 pt-12`. |
| **Tags moved INTO bottom hover panel** | inside the slim panel | Single-row `flex gap-1 overflow-hidden` strip showing first 3 tag chips + `+N` overflow indicator. Same chip styling family as before (`bg-[#c5a062]/15 text-[#c5a062]/85 border border-[#c5a062]/25`). |
| **Outside-image tag row removed** | was 4582-4599 | The separate `border-t` row that broke grid baseline (§2.4). Cards in a row now have identical heights regardless of tag count. |

### 2. Auto-tag button (gallery, untagged images)

Two surfaces, same handler — the `useImageGeneration.autoTagImage(id, img)` function already exists and uses pi.dev via `streamAIToString({ mode: 'tag' })` with a strict prompt that returns a JSON array of 5–8 tags (universe, character, style, themes).

**Surface A — inline CTA inside the bottom hover panel** (when `view === 'gallery'` AND `img.tags` is empty):
- Where tags would normally render, show a small `[🏷  Auto-tag]` chip instead
- Same gold-on-glass look as the tag chips so it reads as "this is the empty state for tags"
- Click → `setTaggingId(img.id)` → `autoTagImage(...)` → on resolve clears the in-flight state. Tags appear automatically (autoTagImage calls `updateImageTags`)
- While in-flight: spinner + "Tagging…", `disabled` + `cursor-wait`

**Surface B — Auto-tag item inside the kebab menu** (gallery only, always available):
- Label switches: `Auto-tag` when no tags / `Re-generate tags` when tags already exist
- Same spinner state when in-flight
- Lets users re-tag images whose initial auto-tag was poor or stale

Both surfaces share a single `taggingId: string | null` state on `MainContent`, so the spinner is consistent and we can't double-fire on the same image.

### 3. Z-index ladder (final, per DESIGN-002 §4)

```
z-0   image / fallback
z-5   permanent model chip (bottom-left)         ← NEW (was hover-only)
z-10  approve / collection / save-for-post / kebab buttons
z-20  hover bottom info panel (prompt + tags)    ← was z-20 + z-20-sub
z-25  hover action row                           ← already at z-20 in code; functionally same
z-50  kebab dropdown (when open, panel z-50)
z-30  status overlays (generating / animating / error)
```

Two fewer compositing layers than before (collapsed approved-pill into the ring, collapsed two hover gradients into one).

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
| Implement DESIGN-002 spec (model chip always-visible, tags in hover, 3+kebab actions) | ✅ | Model chip permanent at bottom-left; tags moved into hover panel with `+N` overflow; gallery row is Approve + AddToCollection + Save-for-Post + kebab (FEAT-005 wired this; verified still in place). |
| Auto-tag button for untagged images (uses pi.dev to generate tags) | ✅ | Two surfaces (inline CTA in empty tag slot + kebab item). Backed by existing `autoTagImage` which calls `streamAIToString({ mode: 'tag' })` against pi.dev. |
| Write FIFO when done | ✅ | After this writeup. |

DESIGN-002 §8 acceptance:
- ✅ Idle card shows ONLY: image, approved ring (when set), batch checkbox (gallery), model chip
- ✅ Hover reveals: action row (3 + kebab), single bottom panel with prompt + max-3 tag chips
- ✅ No more separate `border-t` tag row breaking grid baseline
- ✅ Approved bottom-left pill is gone (ring is sufficient)
- ✅ Top action row has at most 4 elements (3 + kebab) in gallery
- ✅ Model name visible without hover
- ✅ Cards in the same row have identical heights (no per-card tag-row growth)
- ✅ All deleted handlers preserved — Animate/Download/Delete reachable via kebab; Auto-tag added

---

## Out of scope (deferred)

- **Studio view card** — DESIGN-002 spec covers `displayedImages.map(...)` which renders both studio and gallery, but this task title and ACs are gallery-specific. Studio still shows the larger 7-icon row + outside model badge. Recommend a follow-up `FEAT-003b` to apply the same restructure to studio.
- **Touch UX (long-press kebab)** — DESIGN-002 §9 q1, deferred.
- **Approved-ring pulse on hover** — DESIGN-002 §9 q3, explicitly out of scope per the spec.

---

## How to verify

1. `npm run dev` → open the gallery view.
2. **Idle (no hover):** every saved card shows the image + a small gold pill at bottom-left with the model name. Cards aligned in a clean grid (no per-card tag-row pushing some cards taller).
3. **Hover a card:** action row at top-right is exactly 4 elements (Approve / AddToCollection / Save-for-Post / kebab). Bottom panel slides in with prompt + tag chips.
4. **Untagged card:** the bottom panel shows a small gold `[🏷  Auto-tag]` chip where tags would be.
5. **Click Auto-tag** (inline or via kebab → "Auto-tag"): chip swaps to spinner + "Tagging…". On resolve, real tag chips appear. The kebab item's label changes to "Re-generate tags".
6. **Already-tagged card:** kebab shows "Re-generate tags" — clicking it re-runs autoTagImage (overwrites tags).
