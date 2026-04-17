# BACKLOG-CLEAR: QA-001, QA-002, QA-003

**Date:** 2026-04-18  
**Reviewer:** Developer  
**Purpose:** Clear 3 old QA queue items — verify shipped, close formally.

---

## QA-001 — STORY-001 (GitHub Actions workflow)

**Backlog status: CLOSED ✅**

**Existing QA artifact:** `docs/bmad/qa/STORY-001.md` (WARN — two issues flagged)

### Were the WARNs resolved?

**WARN 1 — Missing `permissions: contents: write`**

**RESOLVED.** Current `tauri-windows.yml` has the permissions block at the top level:
```yaml
permissions:
  contents: write
```
This was added in a subsequent workflow rewrite. The v0.1.7 and v0.1.8 releases both uploaded successfully, confirming the permission is working.

**WARN 2 — Hardcoded Node cache key (`bundled-node-v22.11.0`)**

**NO LONGER APPLICABLE.** The workflow was completely rewritten since QA-001 was written. The current `tauri-windows.yml` no longer has a bundled-Node cache step — it installs deps via `npm ci` and uses `Swatinem/rust-cache@v2` for Cargo. The specific cache key drift risk is gone.

### Ship confirmation

Multiple successful CI runs: v0.1.7 (signed Tauri bundle) and v0.1.8 (version bump). All acceptance criteria satisfied. **Close.**

---

## QA-002 — STORY-002 (Tauri config)

**Backlog status: CLOSED ✅**

**Existing QA artifact:** `docs/bmad/qa/STORY-002.md` (WAIVED — covered by QA-001)

### Current state check

The rewritten acceptance criteria confirmed in QA-001 are still met in HEAD:
- Loading screen stub via `frontendDist: "../src-tauri/frontend-stub"` ✓
- Ephemeral port picker in `src-tauri/src/lib.rs` ✓
- Window navigates on sidecar ready ✓
- Sidecar killed on `CloseRequested` ✓
- `PI_BIN` wired so Settings can start bundled pi ✓

Original spec criteria ("App opens with Vercel URL") correctly remain marked obsolete — architecture shifted to local sidecar before this story was picked up. No regression. **Close.**

---

## QA-003 — AUTO-D003 (Settings Modal Brand Consistency)

**Backlog status: CLOSED ✅**

**Existing QA artifact:** `docs/bmad/qa/AUTO-D003.md` (PASS)

### Current state check

The `ad016c0` diff replacing `indigo`/`emerald` with gold tokens in the Settings-modal sections of `MainContent.tsx` is still present in HEAD. No revert.

**Remaining emerald tokens in codebase (out of AUTO-D003 scope):**

`SettingsModal.tsx` has 4 `emerald-400` survivors on pi status indicators ("pi.dev running", pip install output, pi setup link). These are **semantic** (green = running/healthy) and postdate AUTO-D003 — they are not covered by that story.

`MainContent.tsx` has 55 remaining `indigo`/`emerald` hits, all in non-Settings areas (scheduling view, idea grid, calendar, approval badges). These were explicitly deferred to AUTO-D004 in the original review.

Neither category represents a regression against AUTO-D003's scope. **Close.**

---

## NET NEW OBSERVATION — AUTO-D004 still open

AUTO-D003's review identified follow-on work: 55 `indigo`/`emerald` violations in `MainContent.tsx` outside the Settings modal, flagged as AUTO-D004. This work has not been picked up. The `SettingsModal.tsx` pi-status emerald tokens are an additional candidate.

Not blocking any of the three QA items above, but noting so it surfaces for Designer/Developer triage.

---

## Summary

| Item | Original Status | Current Status | Action |
|---|---|---|---|
| QA-001 (STORY-001 workflow) | WARN | ✅ WARNs resolved — shipped v0.1.7/0.1.8 | CLOSED |
| QA-002 (STORY-002 Tauri config) | WAIVED | ✅ Still satisfied | CLOSED |
| QA-003 (AUTO-D003 brand) | PASS | ✅ No regression | CLOSED |

Backlog clear. AUTO-D004 (remaining indigo/emerald sweep) is the one open follow-up.
