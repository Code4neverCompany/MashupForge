# QA Review — STORY-093

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** b60b55f

## Findings

- [INFO] 17 routes audited. Two real gaps found and fixed:
  - `app/api/pi/status/route.ts` — no try/catch; handler could return HTML 500 on filesystem/spawn errors; polled on a timer from Settings panel; now returns `200` with zeroed-out status + `lastError` on error (correct contract — "unreachable pi" is a valid state, not a server bug).
  - `app/api/pi/models/route.ts` — no try/catch; `spawnSync` can throw on binary permission errors or timeout; now returns `500` JSON with `{error, models: []}` so client always sees a typed `models` array.
- [INFO] Three cosmetic fixes (`catch (error)` → `catch (e: unknown)`) are correct for PROP-003 convention consistency and behavior-identical under `useUnknownInCatchVariables`.
- [INFO] 12 already-correct routes confirmed (listed in review). No regressions.
- [INFO] `tsc --noEmit` → exit 0.
- [INFO] Client-side `fetch()` sites noted as already defensive (`res.ok` check before `res.json()` in PipelinePanel) — no client-side changes needed.

### Note on RACE-2
- [WARNING] `getPiModels()` still calls `spawnSync(pi, ['--list-models'], {timeout: 10_000})` synchronously in the models route — blocks the Node.js event loop for up to 10s if pi hangs. This is the RACE-2 issue from `docs/bmad/qa/pi-autosetup-review.md`. The try/catch fix is correct and necessary; the underlying sync block remains. Not a regression from this commit — pre-existing issue, separately tracked.

## Gate Decision

PASS — Two real error-handling gaps correctly patched. Codebase now has uniform `try/catch (e: unknown)` + JSON response across all 17 API routes. TypeScript clean.
