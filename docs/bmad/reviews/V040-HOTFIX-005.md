---
id: V040-HOTFIX-005
title: V040-HOTFIX-005 — AspectPreview tab labels render IG/PN/TW/DC instead of in/pi/tw/di
status: done
date: 2026-04-18
classification: routine
relates_to: V040-009
---

# V040-HOTFIX-005 — Readable platform labels in the Post Ready aspect preview

## What was wrong

V040-009's `AspectPreview` component built its tab strip with
`p.slice(0, 2)`, where `p` is a `PostPlatform` lowercase string.
The tabs rendered as `in`, `pi`, `tw`, `di` — silently truncated
prefixes that don't match any convention the user sees elsewhere
(the Pipeline panel pills already use `IG`, `PN`, `TW`, `DC`).

Flagged as the most embarrassing one-liner in the v0.4.0 self-debrief.

## What changed

### `lib/platform-aspect.ts`

- New required field on `PlatformAspect`: `shortLabel: string`.
- All four platforms in `PLATFORM_ASPECT` got their two-letter
  abbreviation: `IG`, `PN`, `TW`, `DC`. These match the
  conventional short forms users already see on the Pipeline
  panel platform pills.
- `getAspectFor`'s null/unknown fallbacks also got `shortLabel`
  values (`'—'` for null, `'?'` for an unknown platform) so a
  defensive caller never has to deal with `undefined`.

### `components/postready/AspectPreview.tsx`

- One-line change inside the tab strip: replaced
  `{p.slice(0, 2)}` with
  `{PLATFORM_ASPECT[p]?.shortLabel ?? p.slice(0, 2).toUpperCase()}`.
  The optional-chained map lookup keeps the field as the source of
  truth; the upper-cased slice fallback is defensive cover for any
  future `PostPlatform` value that gets added without updating the
  map (the `?.` guard is what makes that fallback reachable; the map
  itself is exhaustive over the current `PostPlatform` union).
- Added `PLATFORM_ASPECT` to the existing `getAspectFor` import.

### `tests/lib/platform-aspect.test.ts`

Two tests added to the existing file:
- `'exposes readable two-character shortLabels for the AspectPreview
  tab strip'` — asserts the four expected values.
- `'returns a non-empty shortLabel even on the null fallback'` —
  asserts the fallback values are non-empty so the UI never renders
  an empty tab.

Suite total: 28 files / 296 tests (was 28 / 294 — net +2; same files,
no new test files).

## Spec compliance

| Acceptance criterion | Status |
|---|---|
| Labels show IG/PN/TW/DC | ✅ `PLATFORM_ASPECT.{instagram,pinterest,twitter,discord}.shortLabel` returns the corresponding two-letter code; `AspectPreview` renders it directly |
| Write inbox | ✅ (after commit) |

## Out of scope (deliberate)

- **Aria labels for the tab buttons** — the `role="tablist"` /
  `role="tab"` / `aria-selected` plumbing is unchanged and already
  exposes the platform via the visible button text. If we want
  longer-form screen-reader labels (e.g. "Instagram crop preview"),
  that's a separate accessibility pass.
- **Color-mapping moved into platform-aspect** — `platformPillColor`
  is still a small helper inside `AspectPreview.tsx`. Centralizing
  every per-platform UI knob into one config is appealing but is
  beyond the hotfix scope; the existing helper isn't broken.
- **Renaming the field on other platform-related types (e.g.
  `PostPlatform`'s display name in PipelinePanel)** — those use ad-hoc
  capitalization and rendering; if we ever want one source of truth
  for "what the user sees when we name a platform," that's a
  cross-component refactor to schedule, not a hotfix.

## Verification

- `npx tsc --noEmit` → clean
- `npx vitest run` → 28 files / 296 tests passing (was 28 / 294 — net
  +2 tests in `tests/lib/platform-aspect.test.ts`; no other test file
  touched)

## Files touched

- `lib/platform-aspect.ts` (+1 required field on `PlatformAspect`,
  +4 `shortLabel` values in `PLATFORM_ASPECT`, +2 fallback values
  in `getAspectFor`)
- `components/postready/AspectPreview.tsx` (1-line label render swap
  + import extension)
- `tests/lib/platform-aspect.test.ts` (+2 tests)
- `docs/bmad/reviews/V040-HOTFIX-005.md` (this file)
