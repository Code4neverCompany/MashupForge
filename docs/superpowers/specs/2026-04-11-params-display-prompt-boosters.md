# AI Parameters Display + Prompt Quality Boosters

**Date:** 2026-04-11
**Status:** Approved (auto — user timeout, Hermes best judgement)
**Scope:** MainContent.tsx (UI), modelOptimizer.ts (prompt), types/mashup.ts (style guide)

## Overview

1. Replace small pills with expandable parameter blocks showing all optimization details per model
2. Add image generation quality boosters (8K, ray tracing, lighting techniques) to the modelOptimizer prompt — pi chooses which fit the subject

---

## Feature 1: Expandable AI-Optimized Parameters

### Current Behavior
AI-Optimized Parameters are small pill badges (e.g. "16:9", "Dynamic") below each model preview. No way to see the full enhanced prompt or negative prompt.

### New Behavior
Each model's parameter section becomes an expandable block:

**Collapsed (default):**
- One-line summary: "Style: Dynamic | 16:9 | Negative: yes"
- Click to expand

**Expanded:**
- Full enhanced prompt text (scrollable, max 200px height)
- Style name
- Aspect ratio
- Negative prompt (if present)
- Each field with a label in zinc-500

### Implementation

In `components/MainContent.tsx`, replace the current pill-based parameter display (around line 1890) with:

```tsx
{/* Per-model expandable parameter block */}
{preview && (
  <details className="mt-2 text-xs border border-zinc-800 rounded-lg overflow-hidden">
    <summary className="px-3 py-2 cursor-pointer hover:bg-zinc-800/50 flex items-center gap-2 text-zinc-400">
      <span className="text-indigo-400">AI Optimized</span>
      <span className="text-zinc-600">|</span>
      <span>{preview.style || 'Auto'}</span>
      <span className="text-zinc-600">|</span>
      <span>{preview.aspectRatio || '1:1'}</span>
      {preview.negativePrompt && (
        <>
          <span className="text-zinc-600">|</span>
          <span className="text-red-400/70">Negative: yes</span>
        </>
      )}
    </summary>
    <div className="px-3 py-2 space-y-2 border-t border-zinc-800 bg-zinc-900/30">
      {preview.prompt && (
        <div>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Enhanced Prompt</span>
          <p className="text-zinc-300 mt-0.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">{preview.prompt}</p>
        </div>
      )}
      {preview.style && (
        <div>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Style</span>
          <p className="text-zinc-300 mt-0.5">{preview.style}</p>
        </div>
      )}
      {preview.aspectRatio && (
        <div>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Aspect Ratio</span>
          <p className="text-zinc-300 mt-0.5">{preview.aspectRatio}</p>
        </div>
      )}
      {preview.negativePrompt && (
        <div>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Negative Prompt</span>
          <p className="text-zinc-300 mt-0.5">{preview.negativePrompt}</p>
        </div>
      )}
    </div>
  </details>
)}
```

Uses native `<details>/<summary>` — no extra state, no React complexity, accessible by default.

---

## Feature 2: Prompt Quality Boosters in modelOptimizer

### Current Behavior
modelOptimizer tells pi to "enhance with specific visual detail — lighting, atmosphere, textures, composition" but doesn't mention specific image generation quality keywords.

### New Behavior
Add a "Quality Booster" section to the modelOptimizer prompt. Pi chooses which apply to the specific image concept — not a blind append.

### Implementation

In `lib/modelOptimizer.ts`, update the prompt text. After the existing instruction line ("Enhance the prompt with specific visual detail..."), add:

```
QUALITY BOOSTERS — include the ones that fit the subject. Do NOT blindly append all of them:
- Resolution: 8K, ultra detailed, high resolution, intricate details
- Lighting: volumetric lighting, cinematic lighting, golden hour, dramatic shadows, rim lighting, subsurface scattering
- Rendering: ray tracing, global illumination, path tracing, ambient occlusion
- Camera: depth of field, bokeh, lens flare, fisheye, tilt-shift
- Texture: photorealistic textures, micro-details, material fidelity
- Composition: rule of thirds, dynamic angle, low angle, bird's eye view
```

This replaces the generic "lighting, atmosphere, textures, composition" line with specific keywords pi can selectively include.

---

## Files Changed

| File | Change |
|------|--------|
| `components/MainContent.tsx` | Replace pill-based parameter display with expandable details/summary block |
| `lib/modelOptimizer.ts` | Add quality booster keywords to enhancement prompt |

## Out of Scope
- Changes to Leonardo API parameters (style_ids, etc. already working)
- Changes to Sidebar/Content tab
- modelOptimizer caching or skip-enhance logic
