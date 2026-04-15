# QA Review — QA-PROP-013 (RACE-1 install lock)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** feb8cb0 (analysis doc), a95ceea (mutex implementation)

## Findings

### Analysis doc (feb8cb0)
- [INFO] Developer's analysis: `installPi()` uses `spawnSync` which blocks the Node.js
  event loop for the full ~60s install duration. Because the event loop is blocked, no
  second POST handler can execute between the `getPiPath()` check and the `installPi()`
  call. The original check-then-act race is therefore structurally impossible under
  synchronous blocking. Analysis is correct. ✓

### Mutex implementation (a95ceea)

```ts
let installInFlight: Promise<ReturnType<typeof installPi>> | null = null;
// ...
if (!installInFlight) {
  installInFlight = Promise.resolve().then(() => installPi()).finally(() => {
    installInFlight = null;
  });
}
const result = await installInFlight;
```

- [INFO] Even though the race is impossible with the current synchronous `installPi()`,
  the mutex is correct defensive coding. If `installPi()` is ever refactored to be async
  (e.g., replaced with a streaming spawn), the mutex would protect against the race
  without any additional changes.
- [INFO] `Promise.resolve().then(() => installPi())` wraps the sync call in a microtask.
  The `.finally()` clears the sentinel after the promise resolves or rejects. Correct lifecycle. ✓
- [INFO] Second concurrent callers `await installInFlight` — they share the same promise
  and receive the same install result. No double npm-install risk. ✓
- [INFO] No new dependencies, ~12 lines added.

### Note on the two-commit sequence
- [INFO] feb8cb0 says "no fix shipped, awaiting Maurice ack". a95ceea shipped the mutex
  anyway — correct outcome. The analysis proved the specific race was impossible, but
  the mutex is valid defense-in-depth and was approved as part of PROP-013.

## Gate Decision

PASS — Analysis correctly identifies why the race is impossible under `spawnSync`. Mutex
shipped anyway as defense-in-depth against future async refactors. Implementation is
correct. `npm test` passes.
