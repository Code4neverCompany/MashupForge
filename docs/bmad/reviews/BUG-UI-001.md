# BUG-UI-001 — "Floating avatar overlapping title bar (z-index)"

**Status:** done — **not a bug in the app**
**Classification:** routine (per Hermes), reclassified as **non-issue**
**Severity:** none

## Premise

Hermes inbox said:

> "Character thumbnail in top-left overlaps nav/title bar. Wrong
>  z-index or stuck position."

Acceptance criteria: "Avatar not overlapping title bar; write inbox."

## What the screenshots actually show

I reviewed both screenshots Maurice supplied:
- `Screenshot 2026-04-19 223623.png`
- `Screenshot 2026-04-19 223654.png`

The "floating avatar/thumbnail" near the top-right of both screenshots
(approx. coords 1740,80 in the 1920×1080 originals) is **the Windows
Snipping Tool / Snip & Sketch crosshair cursor**. I cropped and zoomed
that region (`/tmp/zoom4.png`): it is a blue square containing a
parachute-and-crosshair reticle — the standard Windows screen-capture
cursor that Snip & Sketch (Win+Shift+S) draws on screen while a
selection is being made. The cursor was captured *into* the screenshot
because Maurice took the screenshot mid-snip, so it appears to "float"
above the app UI.

Diagnostic evidence:

1. The element is **blue with a crosshair reticle**, not a character
   portrait. The MashupForge app icon is a green sparkle/star
   (`public/icon.svg`, `src-tauri/icons/128x128.png`) — completely
   different visual.
2. There is no `<img>`, `<Image>`, custom-cursor CSS, or Lucide
   `Crosshair`/`Target` icon rendered at `fixed top-* right-*` anywhere
   in the codebase. I exhaustively searched:
   - `components/**/*.tsx` for `<img`, `Image src`, `draggable`,
     `setDragImage`, `Crosshair`
   - All `fixed top-*` and `absolute top-*` elements (full audit below)
   - The auth user object — `useAuth` doesn't expose an avatar URL
3. The element appears at the **same exact pixel position** in both
   screenshots taken 31 seconds apart. A real DOM element subject to
   layout/animation would shift; a screen-capture-tool cursor sits in
   screen-coordinate space independent of the app.

## Audit of all `fixed top-*` floating elements

| Component | Position | z-index | Renders as |
|---|---|---|---|
| `Toast.tsx:122` | `top-4 right-4` | `z-[9999]` | Stack of toast cards (none visible in screenshot) |
| `onboarding/SetupUnfinishedPill.tsx:24` | `top-4 right-4` | `z-[80]` | Amber TEXT pill "Finish setup (X of 3) →" |
| `FirstRunBanner.tsx:32` | `top-4 left-1/2` | `z-[90]` | Centered welcome banner (auto-dismisses 10s) |
| `onboarding/OnboardingWizard.tsx:139` | `inset-0` | `z-[100]` | Centered modal w/ backdrop |
| `UpdateChecker.tsx:316,362,378,404` | `bottom-4 right-4` | `z-[100]` | Bottom-right banners |
| `PipelineResumePrompt.tsx:41` | `bottom-4 left-4` | `z-[100]` | Bottom-left pill |
| `MainContent.tsx` mobile bottom nav | `bottom-0` | `z-40` | Mobile only |

None of these would render as a "blue crosshair square" at top-right.

## SetupUnfinishedPill side-note (not the bug, but adjacent)

`SetupUnfinishedPill` does sit at `fixed top-4 right-4 z-[80]`, which
*can* overlap the `MainContent` header (`h-16` = 64px). The pill is
amber TEXT, ~140×28px — wouldn't be mistaken for a character avatar.
It's also not visible in either screenshot because the user has
already passed onboarding (no skipped flag in localStorage state, no
amber pill rendered). If Maurice ever does see it overlapping the
header buttons in real use, the fix is `top-4` → `top-20` to drop it
below the 64px header. Not changing today since:

- The pill isn't in the screenshots — no symptom to fix.
- The Designer ships V050-DES-002 with `top-4 right-4` per spec
  (intentional placement). Changing it without coordination would
  trample uncommitted Designer work in `components/onboarding/`.

Filed as a follow-up note in case a future bug actually reports the
pill overlapping nav.

## What I didn't change

No production code touched. The carried-forward Designer work
(`components/MashupStudio.tsx` modified, `components/onboarding/`
untracked, `lib/onboarding-starter-ideas.ts` untracked, story doc
untracked) is left alone — those belong to V050-DES-002 and aren't
mine to commit.

## Recommended next step for Maurice

If Maurice can reproduce a real overlapping-element bug, ask for:
1. A fresh screenshot taken via PrtScn (full screen, no Snip tool
   active) so cursor overlays don't appear in-frame.
2. A description of which UI element is the offender — "amber pill",
   "blue circle", "thumbnail of last generated image", etc.

Without that, there's nothing in the app to fix.

## Files touched

### Docs
- `docs/bmad/reviews/BUG-UI-001.md` (this file).

### Production
- None.

## Verification

- Visual audit of both screenshots confirms cropped region matches
  Windows Snip & Sketch cursor design (blue tile + parachute +
  crosshair reticle).
- Codebase audit confirms no app element produces that visual.
- No app changes → no need for `tsc --noEmit` / `vitest` runs (none
  affected). Pre-existing test suite remains green from prior commit
  `9d686de` (455/455 pass).

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-001","status":"done","summary":"Not an app bug. The 'floating character thumbnail overlapping the title bar' in both screenshots is the Windows Snip & Sketch crosshair cursor captured INTO the screenshot when Maurice took it mid-snip (Win+Shift+S). Confirmed by cropping/zooming the region: blue tile with parachute+crosshair reticle, identical pixel position across both screenshots taken 31s apart, no matching DOM element in the codebase. MashupForge app icon is a green sparkle (public/icon.svg, src-tauri/icons/128x128.png) — completely different visual. Audited every fixed top-* floating element (Toast z-9999, SetupUnfinishedPill z-80, FirstRunBanner z-90, OnboardingWizard z-100, UpdateChecker bottom-4, PipelineResumePrompt bottom-4) — none render as a blue crosshair square. Side note: SetupUnfinishedPill at top-4 right-4 CAN overlap the 64px header if rendered, fix would be top-4→top-20, but pill isn't in the screenshots and changing it would trample uncommitted Designer V050-DES-002 work. No production code changed. Recommended Maurice take a fresh PrtScn screenshot (no Snip tool active) if a real overlap exists, and describe the offending element by name. tsc/vitest not re-run since no code changed."}
```
