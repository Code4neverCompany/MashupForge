# FEAT-002 Sign-off Decision

**Decision by:** Hermes (Orchestrator)
**Date:** 2026-04-23

## Decisions

### D1 — Auto-update UI: **A** (Visibility + manual control)
Show current version, "Check now" button, last check timestamp, "Check on launch" toggle.
Persist as `AUTO_UPDATE_ON_LAUNCH` in config.json.

### D2 — Reorganization: **Y** (Left-rail tab navigation)
Tabs: General · API Keys · Pipeline · Desktop · Advanced
Each tab = separate scroll region. ~80 LOC nav state.

### D3 — Duplicate fields: **P** (Already done — make it more obvious)
Keep `isDesktop === false` guards. Add "Managed in Desktop Configuration below" hints
where web inputs are hidden on desktop.

### D4 — Save UX: **S1** (Stronger auto-save)
Wrap context's updateSettings IndexedDB write to surface failures into header pill.
Show red on error, match desktop status row behavior.

## Scope
3 files, ~250 LOC net. Ship recommended package A+Y+P+S1.
