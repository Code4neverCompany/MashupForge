# QA Review — Calendar Design Fixes (Fix 3 + Fix 4)

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-28
**Commits:** c37d9fd (Fix 3 — drop-to-delete trash zone) · 2f48ef1 (Fix 4 — chip thumbnails + inline image preview)

---

## Files Reviewed

- `components/MainContent.tsx` (lines 321–360, 3425–3660, 3776–3870, 4238–4330)

---

## Findings

### Critical (must fix before merge)

_None._

### Warnings (should fix)

- **[WARNING] Delete confirmation dialog has no Escape key handler.**
  `MainContent.tsx:4262–4328` — the modal closes via backdrop click (`onClick={close}`) or the Cancel button (`autoFocus`), but there is no `onKeyDown` on the overlay or `useEffect` to catch `Escape`. Every other dialog pattern in this file (heatmap tooltip: line 438) handles Escape. Keyboard-only and screenreader users expect Escape to dismiss a modal. Fix: add `onKeyDown={(e) => e.key === 'Escape' && close()}` to the backdrop div.

- **[WARNING] Popover Delete is instant; trash-zone Delete requires confirmation — inconsistent UX.**
  `MainContent.tsx:3639–3649` — the edit popover still has a Delete button that removes the scheduled post immediately with no confirmation step. The new trash zone (`Fix 3`) requires an explicit confirm. Both destroy the same object. A user who learns "delete asks for confirmation" will be surprised by the silent popover delete. Options: (a) apply the same confirm pattern to the popover Delete, or (b) remove the popover Delete entirely and direct users to the trash zone for destructive actions. Either is acceptable; the current split is confusing.

- **[WARNING] No new tests for Fix 3 or Fix 4.**
  Both features involve non-trivial state and interactions (drag/drop → pendingTrashId → confirm → settings mutation; imageId lookup → chip thumbnail → scroll-into-view) but neither commit adds unit or integration tests. `data-testid="calendar-trash-zone"` is present (good), suggesting tests were intended. Recommend adding:
  - Fix 3: a pin test asserting `pendingTrashId` is set on drop, and `scheduledPosts` is filtered on confirm.
  - Fix 4: a pin test asserting `imgById` lookup renders the thumbnail when url is present, and falls back to a muted square when absent.

### Info (noted, no action required)

- **[INFO] Three-state trash zone visual is well-designed.**
  No drag → muted zinc dashed border (discoverable but unobtrusive). Drag active → subtle red tint (`border-red-500/40 bg-red-500/5`). Hover over zone → full red glow + `scale-[1.01]` + text changes to "Release to delete". Text also transitions: "Drag a scheduled post here to delete" → "Drop here to delete" → "Release to delete". Progressive disclosure done correctly.

- **[INFO] Confirmation dialog preview is thorough.**
  Shows image thumbnail (if available), `date · time`, platforms, and 2-line caption — enough to verify the user is deleting the right post. Cancel is `autoFocus` (safer default), Delete is the only red affordance. The "This removes the schedule. The image stays in your gallery." copy correctly sets user expectations about what is and isn't destroyed.

- **[INFO] Fix 3 is week-view only — correct scope.**
  Drag-and-drop is wired exclusively in the week-view chip buttons (line 3787–3793). Month view is a summary that drills down on click; no chips, no DnD. Trash zone is correctly absent from month view.

- **[INFO] Chip thumbnail is glanceable and mobile-safe.**
  16×16px (`w-4 h-4`) with `loading="lazy"` and `object-cover`. Platform names compressed to first-letter initials (line 3815) — frees room for the thumbnail without overflowing the narrow column. Falls back to `bg-zinc-800/80` muted square on expired/pruned images. No additional responsive rules needed at this size.

- **[INFO] `imgById` map scope is correct.**
  Built once inside the week-view branch (`const imgById = new Map(savedImages.map(...))` at line 3425). Both the popover `editingImg` (line 3517) and chip `chipImg` (line 3783) reference the same map — no duplication or stale-lookup risk.

- **[INFO] Scroll-into-view is rAF-guarded.**
  `useEffect` on `editingPostId` defers `scrollIntoView` by one frame via `requestAnimationFrame` (line 356), giving the popover one paint cycle to mount before measurement. `block: 'nearest'` avoids jarring jumps when the popover is already visible.

- **[INFO] Popover full-image click works correctly.**
  64×64 header thumbnail has a hover overlay (`Maximize2` icon, opacity-0 → opacity-100) and calls `setSelectedImage(editingImg)` on click — opens the existing full-screen viewer. The removed "View Image" footer button is explicitly noted in a comment (line 3636–3638). Round-trip eliminated as intended.

---

## Scope Check

- **[IN-SCOPE] Fix 3:** trash zone + dragOverTrash highlight + pendingTrashId confirmation dialog. All as specified.
- **[IN-SCOPE] Fix 4:** chip-level 16px thumbnail, edit popover 64px header image, popover scroll-into-view, "View Image" button removed.
- **[OUT-OF-SCOPE] Month view thumbnails:** by design — month view is summary-only. Not a gap.
- **[OUT-OF-SCOPE] Trash zone in month view:** month view has no draggable chips. Correct.

---

## UX Assessment

**Fix 3 — Drop-to-delete:**
Intuitive. The zone is always visible so users can discover it without triggering a drag. The progressive red highlight on drag-over gives clear affordance feedback. The confirmation dialog prevents accidental deletion and the preview card lets users verify the target. The `autoFocus` on Cancel is the right default for a destructive flow. Only concern: the Escape key gap and the inconsistency with the popover Delete (see Warnings).

**Fix 4 — Chip thumbnails + inline preview:**
Solves the stated problem cleanly. Scheduled content is now identifiable at a glance in the week grid without opening anything. Opening a chip immediately shows the 64px image; clicking it goes full-screen. The scroll-into-view means chips near the bottom of the grid no longer require manual scrolling. Works at 390px mobile widths — the 16px chip thumbnail and first-letter platform tags are compact enough to fit the narrow columns.

---

## Test Suite

| Scope | Count | Status |
|---|---|---|
| Full suite | 962 / 962 | ✓ PASS |
| New tests for Fix 3 | 0 | — no coverage added |
| New tests for Fix 4 | 0 | — no coverage added |

---

## Gate Decision

**[CONCERNS]** — No blockers. Three warnings:

1. Delete confirmation dialog missing Escape key handler (standard modal pattern, easy fix).
2. Popover Delete is instant while trash-zone Delete confirms — inconsistent and discoverable.
3. No tests for either fix (both involve stateful interactions worth pinning).

Both features work as described and match the brief. UX is well-considered and the visual design is consistent with the brand palette. Merge acceptable with warnings tracked.

**Confidence: 0.82**
