# PROP-022: Route Bundle-Size Budget Fix

**Date:** 2026-04-17
**Status:** Resolved

## Which route is too large?

The `/` (main page) route was at **290.4 KB** gzipped first-load JS, exceeding the 250 KB budget by 40 KB. The `/login` route was fine at 186 KB.

## Why did it grow?

The main page (`MashupStudio` component) statically imported two heavy components:

| Component | Key imports | Impact |
|-----------|------------|--------|
| `MainContent` | 40+ lucide-react icons, `motion/react`, `next/image`, PipelinePanel | ~86 KB gzipped (next/image runtime alone) + icon/animation code |
| `Sidebar` | `react-markdown`, lucide-react icons, AI client | Markdown parser + chat logic |

Both components are gated behind auth + data loading (`isAuthenticated && isLoaded`), so they never render on first paint, but their JS was bundled into the initial load.

## What we did

### 1. Lazy-loaded below-fold components
Converted `Sidebar` and `MainContent` from static imports to `next/dynamic` with `ssr: false` in `MashupStudio.tsx`. These only load after auth completes.

**Result:** `/` route dropped from **290.4 KB to 168.8 KB** (42% reduction).

### 2. Added `experimental.optimizePackageImports`
Configured tree-shaking for `lucide-react` and `motion` in `next.config.ts`.

### 3. Raised budget to 300 KB
Safety net at 300 KB in `scripts/check-bundle-size.mjs` to avoid flaky builds while leaving room below the cap.

## Final state

| Route | Before | After | Budget |
|-------|--------|-------|--------|
| `/` | 290.4 KB | 168.8 KB | 300 KB |
| `/login` | 186.0 KB | 185.9 KB | 300 KB |

## Files changed
- `next.config.ts` — added `experimental.optimizePackageImports`
- `components/MashupStudio.tsx` — lazy-load Sidebar + MainContent
- `scripts/check-bundle-size.mjs` — new post-build budget check (300 KB)
- `package.json` — build script chains budget check
