# QA Review — QA-PROP-012 (8 unused npm packages removed)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** fa1b729

## Findings

### Packages removed
| Package | Was used in |
|---|---|
| `clsx` | `lib/utils.ts` only — deleted in faa4de2 |
| `tailwind-merge` | `lib/utils.ts` only — deleted in faa4de2 |
| `class-variance-authority` | never imported anywhere |
| `@hookform/resolvers` | never imported anywhere |
| `@google/genai` | never imported anywhere |
| `google-auth-library` | never imported anywhere |
| `@dnd-kit/core` | never imported — HTML5 DnD used instead |
| `@dnd-kit/utilities` | never imported — same |

- [INFO] All 8 packages confirmed zero imports in `app/`, `components/`, `lib/`, `hooks/`.
  TypeScript clean at HEAD (tsc validates import resolution at build time). ✓
- [INFO] `package.json` and `package-lock.json` are the only files touched. No source changes. ✓

### Non-removed (intentional)
- [INFO] `@mariozachner/pi-coding-agent` kept — intentional pin, documents the runtime
  dep installed globally by `pi-setup.ts`.
- [INFO] `@tauri-apps/api` kept — dynamically imported in `UpdateBanner.tsx`.
- [INFO] `tw-animate-css` kept — CSS `@import` in stylesheet, not a TS import.

## Gate Decision

PASS — 8 confirmed-zero-import packages removed. No source file changes. Verified not in
any script or build tool. `npm test` passes (78/78). Clean dependency surface.
