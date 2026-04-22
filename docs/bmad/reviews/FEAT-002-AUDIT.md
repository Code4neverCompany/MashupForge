# FEAT-002 — Audit Report

**Task:** FEAT-002 Settings modal reorganization + auto-update integration + save UX
**Audited by:** designer, 2026-04-23
**Dispatched as:** "Implement the full FEAT-002 feature — A+Y+P+S1"
**Outcome:** ALREADY IMPLEMENTED — no new code written. Verified against the sign-off.

---

## Summary

The feature was landed in a prior refactor batch before today's dispatch. Tag
`FEAT-002b` appears throughout `SettingsModal.tsx`, `DesktopSettingsPanel.tsx`,
`UpdateChecker.tsx`, and `hooks/useSettings.ts`. Git trail:

- `5c4d6ed refactor: … SettingsModal tabs, carouselView.ts extraction` — the tab restructure
- `9efa375 feat(settings): per-platform toggle in Desktop tab …` — later polish on the Desktop tab
- `UpdateChecker.tsx:38` — `LAST_CHECKED_AT_KEY` exported with explicit
  `// FEAT-002: surfaced in the Updates subsection of DesktopSettingsPanel.`

All four sign-off decisions (D1–D4) have coded counterparts. 696/696 tests pass
on a clean tree; typecheck clean.

---

## Acceptance-criteria scorecard

| AC | Location | Status | Note |
|---|---|---|---|
| Left-rail tab navigation, 5 tabs | `SettingsModal.tsx:43–50, 248–273` | **PARTIAL** | 4 tabs (General · API Keys · AI Engine · Desktop), top bar — not left rail |
| Updates: version, check button, last check, toggle | `DesktopSettingsPanel.tsx:354–580` | **MET** | Full `UpdatesSection` with all four elements |
| `AUTO_UPDATE_ON_LAUNCH` config key works | — | **SUPERSEDED** | Key never added; `UPDATE_BEHAVIOR` (tri-state `auto/notify/off`, FEAT-006) covers the same intent strictly more capably |
| Web-only fields show "Managed in Desktop Configuration" hint on desktop | `SettingsModal.tsx:283–300` | **MET** | Hint card + "Open Desktop tab →" button, gated by `isDesktop === true` |
| Header pill shows Error if IndexedDB write fails | `SettingsModal.tsx:213–238` + `hooks/useSettings.ts` `SettingsSaveState` | **MET** | Red-on-error pill, `role="alert"`, truncated message + title tooltip |

---

## Deviations from spec (decisions for Hermes)

### 1. Tab count: 4 vs 5

Sign-off prescribed `General · API Keys · Pipeline · Desktop · Advanced`
(five). Implementation has `General · API Keys · AI Engine · Desktop` (four).

- No **Pipeline** tab. Pipeline settings still live in `MainContent`'s Pipeline
  tab (not the settings modal). The FEAT-002 story itself flagged this lift as
  "its own mini-project (Hermes should sanction)" at line 80 — so this is a
  deliberate scope reduction, not an oversight.
- No **Advanced** tab. System Prompt + Personalities live in **AI Engine**.
  Functionally equivalent; the label is different.

**Recommendation:** either (a) accept 4 tabs and update the AC, or (b) order a
follow-up FEAT-002c to lift pipeline settings and split Advanced out. Option (a)
is cheaper and the current grouping is defensible.

### 2. Layout: top-bar tabs, not left-rail

Sign-off specified "left-rail tab navigation". Implementation uses a sticky
horizontal tab strip (`SettingsModal.tsx:248–273`). On mobile (per STORY-012's
full-height modal), left-rail would fight viewport width; top bar works at all
sizes. Defensible, but a visible deviation.

**Recommendation:** accept the top-bar layout. Left-rail would cost another
responsive pass.

### 3. Config key: `UPDATE_BEHAVIOR` vs proposed `AUTO_UPDATE_ON_LAUNCH`

FEAT-006 landed after the FEAT-002 story was drafted (2026-04-18) and added a
tri-state `UPDATE_BEHAVIOR` (`auto` / `notify` / `off`) to
`lib/desktop-config-keys.ts`. Adding a second binary `AUTO_UPDATE_ON_LAUNCH`
key now would duplicate state and regress functionality — `UPDATE_BEHAVIOR=off`
already gates the launch-time check (`UpdateChecker.tsx:119–122`), and `auto`
unlocks silent install (unreachable with a binary toggle).

**Recommendation:** update the sign-off AC to reference `UPDATE_BEHAVIOR`
instead of `AUTO_UPDATE_ON_LAUNCH`. The latter doesn't exist and shouldn't.

---

## Verification

```
$ npx tsc --noEmit        # exit 0
$ npx vitest run          # 58 files, 696/696 passed, 3.87s
$ git status              # clean (no designer-side changes)
```

No code written. No commit made.

---

## Next actions (suggested)

1. **Hermes:** decide on tab count (accept 4 vs. order 5th) and layout
   (accept top-bar vs. order left-rail). Update FEAT-002 AC to replace
   `AUTO_UPDATE_ON_LAUNCH` with `UPDATE_BEHAVIOR`.
2. **Orchestrator hygiene:** the FEAT-002 sign-off was generated today with
   scope matching the (already-implemented) feature — worth checking whether
   sign-off emission is re-firing on already-closed tasks. This is the second
   "phantom task" pattern hit in this session (prior: `/tmp/task-designer.json`,
   garbled `/tmp/designer-task.txt`). A task-closure check before emitting
   sign-off documents would prevent the pattern.
