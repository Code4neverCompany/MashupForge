---
task_id: AUTO-UPDATE-INSTALLMODE
agent: designer
status: DONE
commit: 3ed7906
date: 2026-04-27
confidence: 0.97
---

# AUTO-UPDATE-INSTALLMODE — Completion Report

## What was fixed

**CRITICAL-2 (design side):** `WIN_INSTALL_MODE` radio group was interactive but non-functional — the Tauri JS API has no runtime `installMode` parameter (build-time only). The control now reads as aspirational/roadmap rather than functional.

## Changes in `components/Settings/AutoUpdateSettings.tsx`

| Element | Before | After |
|---|---|---|
| Wrapper div | normal opacity | `opacity-60` |
| Radio group | `pointer-events` default | `pointer-events-none` |
| Each button | clickable, fires `onFieldChange` | `disabled`, `cursor-not-allowed` |
| Selected button style | gold border + bg | muted zinc-700/zinc-800 |
| Section label | plain text | text + **"Coming soon"** badge |
| Hint text | mode description only | mode description + "runtime selection requires a future app build" |

## What is preserved

- Current selection state still renders (so the persisted value is visible when the feature eventually ships)
- The `WIN_INSTALL_MODE` key still round-trips through `draft` / `onFieldChange` / `/api/desktop/config` unchanged — no logic removed

## Test result

```
Test Files  74 passed (74)
Tests       824 passed (824)
```

## Scope note

This is the **design** half of the CRITICAL-2 resolution. The dev story (CRITICAL-2 won't-fix on the runtime side) is already documented in `docs/bmad/reviews/auto-update-fix-criticals.md`.
