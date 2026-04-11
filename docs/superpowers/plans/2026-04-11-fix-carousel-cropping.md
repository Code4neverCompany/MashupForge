# Fix Post Ready Carousel Image Cropping

> **For agentic workers:** REQUIRED SUB-SKILL: Use skill-specific tools (@frontend-design, @tailwind-patterns) to implement. Steps use checkbox syntax for tracking.

**Goal:** Fix the Post Ready carousel card image strip so pictures show their full original content including watermarks, instead of being center-cropped to a fixed square.

**Architecture:** The carousel strip in the Post Ready grid view uses `h-36 w-36 object-cover` which forces a square crop on every image regardless of original aspect ratio. The fix is to switch to a flexible display that preserves aspect ratio while keeping the strip visually clean and horizontally scrollable.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS

---

## Problem Analysis

The affected code is in `components/MainContent.tsx`, line ~3440-3446:

```tsx
<img
  key={ci.id}
  src={ci.url}
  alt={ci.prompt}
  onClick={() => setSelectedImage(ci)}
  className="h-36 w-36 object-cover rounded-lg cursor-zoom-in shrink-0"
/>
```

**Root cause:** `object-cover` on a fixed `h-36 w-36` (144x144px) square means any non-square image gets center-cropped. Watermarks positioned near edges (bottom corners, top corners) are clipped.

**Watermark positioning context:** The watermark system (visible in Studio/Gallery views) positions logos at `bottom-2 right-2`, `bottom-2 left-2`, `top-2 right-2`, or `top-2 left-2` — all edge positions that get cut first when cropping.

---

## Tasks

### Task 1: Fix carousel strip image display

- [ ] Change the carousel image strip in the Post Ready grid view (L3436-3448)
- [ ] Replace `h-36 w-36 object-cover` with a flexible approach:
  - Fixed height (h-36 is fine as the strip height)
  - Width auto-calculated from aspect ratio (`w-auto` + `aspect-auto`)
  - `object-contain` instead of `object-cover` to show full image
  - OR: use a max-width constraint with `object-cover` but with proper padding to avoid edge clipping
- [ ] Ensure the horizontal scroll still works (`overflow-x-auto` on parent)
- [ ] Ensure `shrink-0` stays so images don't compress
- [ ] Keep `rounded-lg cursor-zoom-in` styling

**Recommended approach:** Fixed height + auto width + object-contain:
```tsx
<img
  key={ci.id}
  src={ci.url}
  alt={ci.prompt}
  onClick={() => setSelectedImage(ci)}
  className="h-36 w-auto object-contain rounded-lg cursor-zoom-in shrink-0 bg-zinc-950"
/>
```

This preserves aspect ratio, shows the full image including watermarks, and the strip stays horizontally scrollable. The `bg-zinc-950` fills any letterboxing.

### Task 2: Fix the same issue in other carousel pickers

- [ ] Check L2546-2565 (carousel picker modal) — uses `aspect-square object-cover`
- [ ] Check L3277-3288 (another carousel card view) — uses `aspect-square object-cover`  
- [ ] Check L2212 (inline carousel thumbnails) — uses `h-32 w-32 object-cover`
- [ ] Apply the same `object-contain` + flexible sizing fix where carousel preview images are shown

### Task 3: Verify watermark visibility in the lightbox/modal

- [ ] Check the image lightbox/modal (around L4340-4370) which uses `object-contain` already — verify it's correct
- [ ] Verify the watermark overlay in the lightbox is positioned correctly and not clipped

### Task 4: Visual consistency check

- [ ] Ensure carousel strip looks good with mixed aspect ratios (portrait + landscape + square images in one carousel)
- [ ] Verify hover effects still work (`cursor-zoom-in` → opens full view)
- [ ] Verify the carousel badge ("Carousel · N images") is still visible and not overlapping
- [ ] Test with both square and wide images to confirm nothing is clipped

---

## Files to Modify

| File | Section | Change |
|------|---------|--------|
| `components/MainContent.tsx` | L3436-3448 (Post Ready carousel strip) | `object-cover` → `object-contain`, fixed height + auto width |
| `components/MainContent.tsx` | L2546-2565 (carousel picker) | Same fix |
| `components/MainContent.tsx` | L2212 (inline thumbnails) | Same fix |
| `components/MainContent.tsx` | L3277-3288 (carousel card view) | Same fix |

## Design Constraints

- Dark theme (bg-zinc-950 for any letterboxing)
- Keep existing `rounded-lg` border radius
- Keep horizontal scroll behavior on the carousel strip
- All interactive elements (hover, click-to-zoom) must still work
- Mobile-responsive — the strip should scroll on small screens

## Acceptance Criteria

1. All carousel preview images show the FULL original image, including watermarks at any edge
2. No center-cropping on non-square images
3. The carousel strip remains horizontally scrollable
4. Mixed aspect ratios in one carousel look visually consistent
5. No regressions on click-to-zoom, hover effects, or badge overlays
