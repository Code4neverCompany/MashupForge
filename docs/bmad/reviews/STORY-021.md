# STORY-021 Review — Tauri window title and menu

**Status:** CLOSED as done
**Agent:** Developer
**Decision:** Maurice, 2026-04-15 — Option A (close as title-satisfied,
menu deferred)
**Commit satisfying the story:** `fbf81a5` (Phase 1 Tauri config rewrite)

---

## Title half — already satisfied

`src-tauri/tauri.conf.json` at HEAD sets:

- line 3: `"productName": "MashupForge"`
- line 15 (inside `app.windows[0]`): `"title": "MashupForge"`

These land in fbf81a5 (Phase 1 Tauri config rewrite) and have been
stable since. On a fresh `.msi` install, the Windows window chrome,
Alt-Tab card, and taskbar all read "MashupForge" from first launch.
No code change is needed for the title half — it was already done
when the story was filed (the story predates fbf81a5 and was not
revisited after the Phase 1 config rewrite landed).

## Menu half — deferred

Tauri 2 does not ship a default window menu on Windows; menus are
opt-in feature work via `tauri::menu::Menu` + an `on_menu_event`
handler. The story provided no acceptance criteria for what the
menu should contain or why, and the plausible interpretations range
from trivial (File/Help stubs) to complex (tray icon with a new
plugin dependency).

Per decision A, the menu work is deferred. If a menu is filed as a
future story, the highest-value interpretation for MashupForge
specifically is "Settings / Open Config Folder / View Logs" — it
would give users a one-click path to
`%APPDATA%\MashupForge\config.json` for editing API keys, which
today is a manual paste into Explorer. That story would likely
classify **complex** (new menu subsystem, new IPC handlers,
capabilities.json entries) and should be lifted through the
proposals flow, not self-assigned.

## Why this isn't a follow-up

There is no open defect, no dangling config, no dead code from
STORY-021. The title is satisfied; the menu is not a bug, it's an
unimplemented feature. Closing the story leaves the codebase in
exactly the same state it was in before the story was filed, plus a
written record of the decision so the same question doesn't get
re-asked next sprint.

## Cleanup

The clarification artifact previously at
`docs/bmad/questions/STORY-021.md` (which walked through options
A-E for the menu scope) has been removed now that the decision is
captured here. If a future menu story is filed, start from scratch
with explicit acceptance criteria rather than reviving the old
interpretation matrix.

## Handoff

- STORY-021 marked `[x]` in `~/.hermes/queues/developer.md` with a
  pointer to fbf81a5 + this artifact + the Maurice 2026-04-15
  decision
- `docs/bmad/questions/STORY-021.md` deleted (was never committed)
- No code changes. No commit touches `main`'s behavior — only the
  queue bookkeeping and this review.
- Queue status after close: STORY-003 lifted (PROP-004), STORY-004
  blocked on Maurice manual pass, STORY-022 lifted (PROP-005),
  STORY-023 lifted (PROP-006). STORY-021 no longer open.
