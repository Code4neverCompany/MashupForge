# QA Review — Latest Changes (2026-04-14)

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-14
**Range:** e63983b → 1e70c9a (4 commits)

---

## Commits reviewed

| Hash | Message | Files changed |
|---|---|---|
| `1e70c9a` | fix(ui): DESIGN-002 — sync overlay exit timing to border (300ms) | MainContent.tsx +1, DESIGN-002.md |
| `8b25874` | feat(ui): DESIGN-002 — gallery grid hover scale/glow effects | MainContent.tsx +4/-1 |
| `204f1b5` | feat(ui): DESIGN-001 — per-phase colored progress dots | stages.ts, PipelinePanel.tsx |
| `e63983b` | feat(tauri): pi.dev runtime auto-install on first launch | lib/pi-setup.ts, app/api/pi/*, MainContent.tsx, lib.rs |

---

## 1. `204f1b5` — DESIGN-001: Colored pipeline dots

**Gate: PASS** (see full report `docs/bmad/qa/DESIGN-001.md`)

- className-only, 2 files, zero logic changes
- All 4 spec colors (search=blue, prompt=purple, generate=green, post=gold) confirmed
- TypeScript clean, no re-render implications

---

## 2. `8b25874` + `1e70c9a` — DESIGN-002: Gallery hover effects

**Gate: PASS**

### Code quality
- `8b25874`: 5 lines changed in `MainContent.tsx`. Card shadow string replaced inline (1 line), gradient overlay div added (3 lines + comment). Scope is tight.
- `1e70c9a`: Single className change (`duration-500` → `duration-300`) to fix timing inconsistency flagged by UX review. Correct and minimal.
- No logic changes. `pointer-events-none` on overlay preserves all click/keyboard targets. ✓

### Z-index audit (from UX review, confirmed)
```
z-40  state overlays        above overlay ✓
z-20  action buttons        above overlay ✓
z-10  approved badge        above overlay ✓
z-[6] gradient overlay      correct position ✓
```
No stacking regressions.

### Brand tokens
- `rgba(197,160,98,...)` — Metallic Gold `#c5a062` ✓
- `#00e6ff` — Electric Blue ✓
- Gradient opacities (12%, 6%) are subtle; approved badge and action buttons remain legible ✓

### Issues
- [INFO] `prefers-reduced-motion` is not respected for `whileHover` spring or CSS transitions. Pre-existing project-wide pattern, not a DESIGN-002 regression. Tracked as DESIGN-004 candidate.

---

## 3. `e63983b` — pi.dev runtime auto-install

**Gate: CONCERNS** (see full report `docs/bmad/qa/pi-autosetup-review.md`)

High-severity issues remain unresolved in HEAD `1e70c9a`:

| ID | Severity | Description | Blocks |
|---|---|---|---|
| WIN-1 | **HIGH** | `localPrefix` with spaces breaks `npm install` (`shell: true` + no quoting). Affects majority of Windows users (spaces in username). | STORY-004 manual pass |
| RACE-1 | **HIGH** | No install lock — concurrent `POST /api/pi/install` calls corrupt the pi prefix. | STORY-004 manual pass |
| SEC-1 | Medium | `piPath` interpolated raw into shell strings. Mitigated by MASHUPFORGE_PI_DIR in Tauri but pattern is wrong. | — |
| SEC-2 | Low | Dead `PI_BIN` candidate in `piCandidates()` — bake-era holdover. | — |
| RACE-2 | Medium | `getPiModels()` blocks event loop up to 10s on every status poll. | — |

---

## Summary

| Commit | Story | Gate |
|---|---|---|
| `204f1b5` | DESIGN-001 colored dots | PASS |
| `8b25874` + `1e70c9a` | DESIGN-002 gallery hover | PASS |
| `e63983b` | pi runtime auto-install | CONCERNS — WIN-1 + RACE-1 unresolved |

**Required before STORY-004 close:**
1. Fix WIN-1: remove `shell: true` from `spawnSync` in `lib/pi-setup.ts` (or quote `localPrefix` arg)
2. Fix RACE-1: add install lock file in `app/api/pi/install/route.ts`

DESIGN-001 and DESIGN-002 are clear to ship. The pi install path is not.
