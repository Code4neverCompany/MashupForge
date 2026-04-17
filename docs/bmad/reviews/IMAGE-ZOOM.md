# Review: IMAGE-ZOOM

**Commit:** cf59fc4  
**Date:** 2026-04-17  
**Agent:** Designer  
**File:** `components/ImageDetailModal.tsx`

## What shipped

Scroll-wheel zoom on the image view inside `ImageDetailModal`:

- **Zoom range:** 1× – 5× in 0.25 steps per scroll notch
- **Transform origin:** computed from cursor position relative to image container on every wheel event, so you zoom into exactly where you're pointing
- **Smooth transitions:** 0.2s ease snapping back to 1× on reset; 0.08s ease-out during active zoom
- **Double-click reset:** resets zoom + origin back to `50% 50%`
- **Zoom badge:** gold `2.0× · dbl-click to reset` badge replaces the neutral "Scroll to zoom" hint in the hover overlay
- **Image change reset:** `useEffect([image.id])` resets zoom/origin whenever the viewed image changes
- **No-op for video:** ref is attached to the image branch only; video branch is untouched

## Implementation notes

- Used a non-passive `wheel` event listener via `useEffect` (not the React synthetic `onWheel`) because React 17+ registers wheel events as passive by default, blocking `preventDefault()`.
- Transform is applied to the `<img>` element via inline `style`, not Tailwind, to allow dynamic values.
- `overflow-hidden` on the outer `flex-1` panel already clips any bleed into the sidebar — no extra containment needed.

## Scope

Single file. No prop interface changes. No new dependencies. tsc clean.

## QA checklist

- [ ] Scroll zooms at cursor position on static image
- [ ] Double-click resets to 1×
- [ ] Switching images resets zoom
- [ ] Video tab unaffected (no zoom, no badge)
- [ ] Zoom badge shows gold when zoomed, hint text when at 1×
- [ ] No layout bleed into sidebar at max zoom
