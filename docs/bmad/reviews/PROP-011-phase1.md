---
name: PROP-011 phase 1 — vitest test harness + first smoke wave
description: Add vitest, npm test script, and pure-function smoke tests for lib/errors and resolvePiJsEntry
type: review
---
# PROP-011 phase 1 — vitest harness + first smoke wave

**Date:** 2026-04-15
**Author:** developer
**Files touched:**
- `package.json` (+3 lines: vitest devDep, two test scripts)
- `package-lock.json` (vitest tree, +32 packages)
- `vitest.config.ts` (NEW, 14 lines)
- `tests/lib/errors.test.ts` (NEW, 56 lines, 10 tests)
- `tests/lib/pi-setup.test.ts` (NEW, 71 lines, 7 tests)
**Status:** DONE

## Problem

The repo had zero automated tests. `package.json` had no `test`
script. Multiple recent stories (STORY-130/132/133) would have caught
their root causes earlier with even a thin smoke layer — for example,
the duplicate Leonardo settings field that shipped in production
because nobody ran the full settings flow end-to-end after the dual-
store refactor.

PROP-011 was lifted as the test-harness proposal; phase 1 is the
minimal-viable scaffold + the first wave of pure-function tests, no
React component testing yet.

## Fix shape

### Framework: vitest

Vitest over jest because:
- Native ESM (Next 15 is fully ESM, jest needs a CJS shim layer)
- Faster cold start (~285ms for 17 tests on the first run)
- Same `describe/it/expect` API jest devs expect, so no migration
  cost if we ever need to add a Next-aware framework on top
- Single dev dep (`vitest`), zero peer dep dance

### Scripts

```json
"test": "vitest run",
"test:watch": "vitest"
```

`vitest run` is the CI-friendly one-shot mode; `vitest` (with no
subcommand) is interactive watch mode for local dev.

### vitest.config.ts

```ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
```

Tests live under `tests/` (mirroring source layout) so they don't
pollute `lib/` / `app/` directories. The `@` alias matches the
project's tsconfig path, so test imports use the same shape as
runtime imports.

### First wave — `tests/lib/errors.test.ts` (10 tests)

Pinned the full surface of `getErrorMessage` and `isError`:
- Error instance → `.message`
- string → itself
- `{message: string}` → message field
- arbitrary object → `JSON.stringify`
- circular structures → `'Unknown error'` fallback
- `null` → `'null'`
- `{message: <non-string>}` → JSON.stringify of the whole object
- isError narrowing across Error/TypeError/string/null

### First wave — `tests/lib/pi-setup.test.ts` (7 tests)

`resolvePiJsEntry` is the pi installer's most failure-prone helper —
it has to navigate npm's two `bin` field shapes (scalar vs object)
and gracefully degrade when the package is absent. Tests cover:
- Missing `package.json` → null
- Scalar string `bin` → resolved entry path
- Object `bin` with `pi` key → uses that key
- Object `bin` without `pi` key → falls back to first value
- Missing `bin` field entirely → null
- Resolved entry doesn't exist on disk → null
- Malformed JSON in `package.json` → null

Each test uses a fresh `mkdtempSync` temp directory and cleans up in
`afterEach` — no shared state, no cross-test pollution.

## Discoveries

### KNOWN BUG: `getErrorMessage(undefined)` returns `undefined`

The function's declared return type is `string`, but for the
`undefined` input the JSON.stringify branch returns `undefined` (not
`'undefined'`), violating the type contract. Test pinned at the
buggy behavior so the fix commit will surface as a test diff.

Filed as a follow-up routine task. One-line fix:

```ts
return JSON.stringify(err) ?? 'Unknown error';
```

This is exactly the kind of bug the test harness exists to catch —
phase 1 found one within the first 17 tests written.

## Verification

- `npm test` → **2 files, 17 tests, all passing** in ~285ms
- `npx tsc --noEmit` → clean
- `npx eslint tests vitest.config.ts` → clean (no warnings)

## Out of scope (deferred)

- React component tests (jsdom + RTL setup is its own rabbit hole).
- API route handler tests (would need next/server mocking; defer
  until we have a clear win).
- CI wiring — phase 2 will add `npm test` to
  `.github/workflows/build-windows.yml` once we're confident the
  suite is stable on Windows.

## Follow-ups

- **DISCOVERY-2026-04-15:** Fix `getErrorMessage(undefined)` to
  return `'Unknown error'` instead of `undefined`. Routine 1-LOC fix.
- **PROP-011 phase 2:** CI integration (add `npm test` to
  build-windows.yml).
- **PROP-011 phase 3:** Second wave of pure-function tests
  (`humanizeWindowsError`, `quoteWinArg`, `parseJsonOrThrow`).

**Status:** DONE — phase 1 ready for QA.
