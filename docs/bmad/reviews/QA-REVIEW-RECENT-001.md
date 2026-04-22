# QA Review — Recent Commits (STORY-012 + DESIGN-001/002/003)

**Task:** QA-REVIEW-RECENT-001  
**Reviewer:** QA Agent  
**Date:** 2026-04-22  
**Confidence:** 0.92

---

## Commits Reviewed

| Commit | Scope | Verdict |
|--------|-------|---------|
| `41474aa` STORY-012 | fix(pipeline): mobile responsive breakpoints | ✅ PASS (with note) |
| `3d34c58` DESIGN-001 | style(post-ready): posted/failed overlays + error banner | ✅ PASS |
| `7038c51` DESIGN-002 | style(gallery): drop duplicate gradient + action row trim | ✅ PASS |
| `7ff54ca` DESIGN-003 | refactor(postready): migrate inline kebabs to `<KebabMenu>` | ✅ PASS |

Full detailed QA checklist for DESIGN-001/002/003 is in `docs/bmad/qa/DESIGN-VISUAL-STATES.md` (same session). This document covers all four commits at code-review level, with STORY-012 receiving full analysis here.

---

## STORY-012 — fix(pipeline): mobile responsive breakpoints

**File:** `components/PipelinePanel.tsx`  
**Change:** 4 Tailwind class substitutions; zero logic changes.

### Diff analysis

**Change 1 — Controls header row (line 289)**

```diff
-<div className="flex flex-wrap items-center justify-between gap-3">
+<div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
```

At `< 640 px`: `flex-col` stacks the Pipeline toggle group and the Start/Stop button row vertically. `items-stretch` (default, no explicit mobile alignment) — each child fills container width, which is correct for a full-width panel. `gap-3` (12px) separates the two rows.

At `≥ 640 px`: `sm:flex-row sm:flex-wrap sm:items-center sm:justify-between` — identical to the previous single-breakpoint behavior.

No regression in desktop layout. Mobile stacking is the intended fix. ✅

**Change 2 — Stage toggles (line 402)**

```diff
-<div className="grid grid-cols-2 gap-2">
+<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
```

3 items (Auto-tag, Auto-caption, Auto-schedule). At `< 768 px`: 2-col grid leaves a lone item in row 2. At `≥ 768 px`: 3-col grid — all three items in one row, no orphan. ✅

**Changes 3 & 4 — Auto-Approve and Daily Caps grids (lines 517, 561)**

```diff
-<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
+<div className="grid grid-cols-2 md:grid-cols-4 gap-2">
```

4 items (instagram, pinterest, twitter, discord). `sm:grid-cols-4` at 640 px forces 4 columns into ~640 px — each column ~148 px before gap, too narrow for the toggle + label layout. `md:grid-cols-4` defers the 4-col layout to 768 px where columns have ~176 px each. At 640–767 px the grid stays at 2 cols (2 rows of 2), which is readable. ✅

### Security / performance

No API calls, no state changes, no event handlers introduced. Pure CSS token swap. No security surface. No performance impact. ✅

### TypeScript

`npx tsc --noEmit` exits 0. ✅

### Test coverage

No tests exist or are appropriate for Tailwind class names. All 695 tests pass (layout changes do not affect behaviour tests). ✅

### Outstanding item ⚠️

The commit message explicitly states: **"Unverified in browser (no display). Typecheck passes."** The changes are low-risk (4 Tailwind class swaps, well-understood breakpoint semantics), but visual regression at 390 px, 640 px, and 768 px has not been confirmed. Before the next production build this should be spot-checked in DevTools mobile emulation or a real device.

---

## DESIGN-001 — posted/failed overlays + persistent error banner

**Verdict: ✅ PASS** — see `docs/bmad/qa/DESIGN-VISUAL-STATES.md` for full checklist.

Key findings:
- Tint divs (`absolute inset-0 pointer-events-none`) inside `AspectPreview`'s `overflow-hidden` container. Correct stacking via DOM order; no z-index conflicts.
- Error banner is persistent (`kind === 'failed'` is always true when card is in failed state), not dismissable.
- Inline transient status correctly suppressed when banner is showing (`kind !== 'failed'`).
- Acknowledged limitation: falls back to generic error message when transient `status` string expires (requires `ScheduledPost.error` type field; flagged for separate proposal).

---

## DESIGN-002 — drop duplicate gradient + action row trim

**Verdict: ✅ PASS** — see `docs/bmad/qa/DESIGN-VISUAL-STATES.md` for full checklist.

Key findings:
- One gradient remains (bottom prompt overlay `from-black/85`). Warm-gold/cool-blue glow overlay is gone.
- Gallery view: Approve + Add to Collection + Prepare for Post + KebabMenu = 3 + kebab ✅
- Studio view (non-video): Reroll + Approve + Save to Gallery + KebabMenu = 3 + kebab ✅
- Delete action passes `true` (gallery, confirm dialog) vs `false` (studio, direct) — matches prior per-view semantics.

---

## DESIGN-003 — migrate inline kebabs to `<KebabMenu>`

**Verdict: ✅ PASS** — see `docs/bmad/qa/DESIGN-VISUAL-STATES.md` for full checklist.

Key findings:
- `createPortal` + `useRef/useEffect` + private `KebabItem` export fully removed from both `PostReadyCard` and `PostReadyCarouselCard`. Zero inline duplication remaining.
- `PostReadyCard` root is `overflow-visible` — no dropdown clipping risk from the switch to `absolute z-50`.
- Keyboard/ARIA preserved; close-on-activate now returns focus to trigger (improvement).
- Cosmetic note: `copyHighlighted` Check icon loses `text-emerald-400` color (renders zinc-400); functional confirmation (icon swap) preserved. No story filed.
- 12/12 PostReady integration tests pass.

---

## Cross-commit observations

1. **Breakpoint consistency gap.** STORY-012 uses `sm:` (640 px) for the controls row and `md:` (768 px) for the 4-col grids. The mix is intentional (different content densities), but there is no 640–767 px design review. Browser verification at exactly 640 px should confirm the controls row horizontal layout does not conflict with the stage-toggle 2-col grid sitting below it.

2. **`ScheduledPost.error` field still pending.** DESIGN-001's persistent error banner degrades to a generic message when the transient status expires. A follow-up proposal for adding `error?: string` to `ScheduledPost` (types-shape change → routes through Hermes) would complete the feature.

3. **All 695 tests pass.** TypeScript clean. No security issues across all four commits.

---

## Action items

| Item | Priority | Owner |
|------|----------|-------|
| Browser-verify STORY-012 at 390/640/768 px (DevTools mobile emulation) | P1 | Developer or QA |
| Proposal for `ScheduledPost.error` field to complete DESIGN-001 persistent error | P2 | Hermes / Developer |
