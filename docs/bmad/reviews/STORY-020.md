# STORY-020 Review — Tauri app icon and branding

**Status:** DONE
**Agent:** Developer
**Date:** 2026-04-14
**Classification:** routine
**Commit:** (see below)

---

## Scope

Rebrand the Tauri desktop icon set from the Tauri template defaults
(blue Tauri logo) to the 4neverCompany emerald-starburst identity so
the Windows `.msi` ships with proper MashupForge branding in the Start
menu, taskbar, window title bar, and .exe icon.

## Source asset

`public/icon.svg` — the existing PWA/web brand mark:

- 512×512 viewBox with a rounded-square dark zinc background
  (`#09090b → #18181b` linearGradient, 96px corner radius)
- Emerald 4-point starburst (`#34d399 → #059669` linearGradient)
  centered at 256,256
- Four subtle emerald orbit-dot accents at varied radii

This is the same mark already used in `public/manifest.json` for the
Vercel PWA install path (shipped in `b7b21d3`), so the desktop app now
matches the web app on icon identity — single source of truth.

## What shipped

`npx tauri icon public/icon.svg --output src-tauri/icons` regenerated
the full Tauri 2 icon set from the brand SVG. Modified files (all
were already tracked, all are now branded):

| File | Purpose | Size |
|---|---|---|
| `src-tauri/icons/icon.png` | master 512×512 RGBA | 512×512 |
| `src-tauri/icons/32x32.png` | small Linux/Windows | 32×32 |
| `src-tauri/icons/128x128.png` | standard | 128×128 |
| `src-tauri/icons/128x128@2x.png` | hi-DPI standard | 256×256 |
| `src-tauri/icons/icon.ico` | Windows .exe/.msi icon (6-entry ICO: 16, 32, 48, 64, 128, 256) | multi |
| `src-tauri/icons/icon.icns` | macOS app bundle | multi |
| `src-tauri/icons/Square*Logo.png` (9 files) | Windows Store / UWP tile assets | various |
| `src-tauri/icons/StoreLogo.png` | Windows Store listing | 50×50 |

All five icons referenced in `src-tauri/tauri.conf.json` →
`bundle.icon` (the authoritative list that actually ships in the .msi)
are included in the regeneration: `32x32.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns`, `icon.ico`. The Square tiles + StoreLogo
are not in `bundle.icon` but tauri-cli regenerates them alongside
anyway; they now match the brand so a future UWP/Store path is
pre-branded for free.

## Out-of-scope artifacts removed

`tauri icon` also generated full iOS and Android icon sets
(`src-tauri/icons/ios/` and `src-tauri/icons/android/`) plus a new
`64x64.png`. STORY-020 is explicitly "branding on Windows" — the
mobile assets aren't referenced in `tauri.conf.json`, aren't part of
any shipping bundle, and would bloat the tree with ~30 untracked
files. Removed them pre-commit. They can be regenerated in ~3s from
the same SVG if a mobile target gets picked up later.

`64x64.png` was also pruned. Adding it to the bundle would require
editing `src-tauri/tauri.conf.json` → `bundle.icon`, which crosses
from "routine" into "complex" per the autoloop classification rubric
(config file change). Keeping scope tight: 5 icons in, 5 icons out
(re-skinned), no config touch.

## Verification

- `file src-tauri/icons/icon.ico` → "MS Windows icon resource - 6
  icons, 32×32 with PNG image data" — confirms a valid multi-entry
  Windows ICO is produced.
- `file src-tauri/icons/icon.icns` → "Mac OS X icon, 92761 bytes,
  'ic12' type" — valid Apple ICNS container.
- Visual spot-check of `src-tauri/icons/128x128.png` in the review
  session confirmed the emerald 4-point starburst centered on the
  dark zinc rounded square. Color matches `public/icon.svg` gradients.
- Hash comparison before/after confirms every tracked icon file
  changed content (no stale template leftover).
- No source code touched → no `tsc --noEmit` run needed; the change
  is pure filesystem asset swap.

## Windows .msi acceptance

The actual on-Windows verification (shortcut icon in Start menu,
taskbar icon, Alt-Tab icon, window title-bar icon, Add/Remove
Programs entry icon) happens in STORY-004 Test 1, which is blocked on
Maurice running `build-windows.ps1`. This story's acceptance is
"source icons match the brand"; proving it lands correctly in the
installer is downstream of the `.msi` rebuild.

The first CI run on `main` after this commit will produce a fresh
`.msi` artifact on `tauri-windows` workflow — Maurice can grab that
and validate in one step.

## Prerequisite handling

The story declared `requires: docs/bmad/briefs/tauri-windows.md` —
that brief **does not exist** (`docs/bmad/briefs/` contains only
`pipeline-polish.md`). I proceeded anyway because:

1. Scope is unambiguous from the story title + `why` line.
2. Source asset (`public/icon.svg`) is already in-tree and
   authoritative for 4neverCompany branding.
3. The work is a single deterministic command (`npx tauri icon`).

Flagging as a data point for the PROP-004-adjacent `requires:`
contract discussion: this is the first real test of "what should the
autoloop do when a prerequisite artifact is missing but scope is
trivially inferable?" My answer for this instance: proceed, record in
the review, don't block. If the brief had declared *different* brand
choices (typography, colors), I'd have blocked instead.

## Handoff

- STORY-020 marked `[x]` in `~/.hermes/queues/developer.md`.
- Push to `main` triggers `tauri-windows` CI → fresh `.msi` with the
  rebranded icons will land in the Actions artifacts ~10 min later.
- STORY-021 (window title + menu) is the natural next task in this
  epic and does not depend on this commit.
