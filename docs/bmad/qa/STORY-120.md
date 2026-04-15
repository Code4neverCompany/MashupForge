# QA Review — STORY-120

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** ff7560e

## Findings

- [INFO] Root cause correctly identified: CVE-2024-27980 Node fix causes `spawn()` to refuse `.cmd`/`.bat` targets without `shell: true`. `shell: true` is not viable here (would break the RPC stdio pipe). Bypass is the right approach.
- [INFO] `resolvePiJsEntry(piCmdPath)` reads pi's actual `package.json` for the `bin.pi` entry point — no hardcoded paths. If pi's package layout changes, the resolver adapts. ✓
- [INFO] Graceful fallback: if `resolvePiJsEntry` returns `null`, old spawn path runs — no POSIX regression, no non-shim-path regression. ✓
- [INFO] Fix applied in both `pi-client.ts:start()` (chat spawn) and `pi-setup.ts:getPiModels()` (models list spawn) — consistent treatment of the same root cause.
- [INFO] `process.execPath` for the node binary is correct inside the Tauri sidecar — the sidecar itself runs under bundled `node.exe`, so `execPath` resolves to the same binary. ✓
- [INFO] `npx tsc --noEmit` clean.

### Race condition note
- [INFO] STORY-120 does not fix RACE-1 (no install lock in `pi/install` route). That issue remains open but is independent of this chat-spawn fix.

## Gate Decision

PASS — Correct root-cause fix. Shim bypass via `process.execPath + js-entry` preserves stdio pipe integrity and RPC protocol. Graceful fallback ensures no regression on POSIX or non-shim install layouts. TypeScript clean.
