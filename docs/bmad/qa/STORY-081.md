# QA Review — STORY-081

**Status:** WAIVED
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 5c6c5ff

## Findings

- [INFO] One real fix landed: `start.bat` now sets `MASHUPFORGE_PI_DIR` to the portable build's app dir. Without it, `getLocalPrefix()` fell back to `%TEMP%\mashupforge-pi-install`, which Windows Disk Cleanup/Storage Sense can wipe between runs — causing spurious "pi not installed" states on relaunch.
- [INFO] Fix is correct: `MASHUPFORGE_PI_DIR` is what `lib/pi-setup.ts:getLocalPrefix()` reads. The Tauri `.msi` path already set this in `lib.rs`; the portable path now matches.
- [INFO] Story execution (pi.dev install → start → chat response → cache reuse) owned by Maurice on a real Windows host. Cannot be run from WSL.
- [INFO] Test plan is clear and correctly maps to pi.dev acceptance criteria.

## Gate Decision

WAIVED — Handoff artifact with one supporting fix. The fix is correct (single env var addition to start.bat). Story completion depends on Maurice's Windows manual pass, same as STORY-061.
