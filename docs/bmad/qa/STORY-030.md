# QA Review — STORY-030

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** b926ef6

## Findings

- [INFO] Fix is correct and minimal: `quoteWinArg()` helper (1 function, 1 line) pre-quotes any arg containing whitespace or `"` before `cmd.exe` receives it. No-op on POSIX.
- [INFO] Applied at exactly one call site (`quoteWinArg(localPrefix)`). `@mariozechner/pi-coding-agent` and `--global` are static strings with no whitespace — correctly passed through unmodified.
- [INFO] `shell: true` retention is correct — CVE-2024-27980 requires it for `.cmd`/`.bat` targets on modern Node. The review explains this constraint clearly.
- [INFO] Escape rule `"${a.replace(/"/g, '\\"')}"` is correct for cmd.exe backslash-escape-inside-quoted-string parsing.
- [INFO] `tsc --noEmit` → exit 0 per review. Change is type-safe (string in, string out).
- [INFO] Scope discipline: helper is function-local, not exported. Correct for a one-call-site fix.
- [INFO] Fixes WIN-1 from `docs/bmad/qa/pi-autosetup-review.md`. STORY-004 Test 5 can now proceed for users with spaces in their Windows username.

## Gate Decision

PASS — Correct minimal fix for the path-quoting bug. Single file, zero new deps, POSIX unchanged, TypeScript clean.
