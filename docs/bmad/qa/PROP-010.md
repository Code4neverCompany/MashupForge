# QA Review — PROP-010

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 5df7495

## Findings

### Root cause (confirmed)
- [INFO] Prior `updateSettings()` implementation called `setSettings(updater)` then immediately `await set('mashup_settings', latest!)`. The bug: React 18 batches state updates — the `updater` function does NOT run synchronously at `setSettings` call time in concurrent mode. So `latest` was often `undefined` when the IDB write fired, persisting `undefined` and causing a complete settings reset on next load. Classic closure-timing race. Correct diagnosis. ✓

### Fix: `useEffect`-based persistence (`hooks/useSettings.ts`)

- [INFO] Persistence moved to `useEffect([settings, isSettingsLoaded])`. This effect fires after every committed state change — React guarantees `settings` is the current committed value when the effect runs. The race is structurally eliminated, not papered over. ✓
- [INFO] `if (!isSettingsLoaded) return` guard prevents writing the default settings to IDB before the load effect has populated them. Without this guard, the persist effect would race against the load effect on mount. Correct. ✓
- [INFO] `updateSettings` is now synchronous (no `async`, no `await`, no `try/catch`). Simpler API surface. Error handling moved to the persist effect's `.catch()`. ✓
- [INFO] `typeof idbSettings === 'object'` guard on the load path rejects any corrupted `undefined` value that the previous race may have written. Defensive recovery. ✓

### Edge cases
- [INFO] Multiple rapid calls to `updateSettings` — React batches the `setSettings` calls in 18+, so the effect fires once with the final merged state, not once per call. Single IDB write per render cycle. ✓
- [INFO] Settings not yet loaded (`isSettingsLoaded = false`) — persist effect bails immediately. Prevents the default settings object from overwriting valid persisted state. ✓
- [INFO] IDB write failure — `.catch()` logs to console and swallows. Matches prior behavior. Settings still update in-memory; only persistence fails. Acceptable.

### Scope
- [INFO] Single file (`hooks/useSettings.ts`). 27 lines changed. No API shape change for callers — `updateSettings` signature unchanged, return type unchanged.

## Gate Decision

PASS — Correct structural fix for the settings reset race. Effect-based persistence eliminates the `setSettings`-then-capture anti-pattern. Load guard prevents default-overwrite race on mount. Recovery guard on the load path handles corrupted IDB state from prior race writes.
