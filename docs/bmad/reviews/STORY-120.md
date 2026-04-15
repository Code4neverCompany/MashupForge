# STORY-120 Review — Chat EINVAL on Windows: bypass npm `.cmd` shim

**Status:** SHIPPED — awaiting CI build + Maurice retest
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine (human-directed from Maurice)
**Blocks:** STORY-121, STORY-122

## Symptom

Maurice installed the STORY-110 `.msi`, pi.dev showed "connected" in the
UI, but chat messages never produced a response. No visible error at
first; a subsequent probe surfaced `spawn EINVAL`.

## Root cause

`lib/pi-client.ts:start()` calls:

```ts
const child = spawn(piPath, args, { env: cleanEnv, stdio: ['pipe', ...] });
```

On Windows, `piPath` is the npm shim `<prefix>\pi.cmd`. Since **Node
18.20.2 / 20.12.2 / 22.x** shipped the fix for **CVE-2024-27980**,
`child_process.spawn()` refuses to spawn `.cmd` / `.bat` files without
`shell: true` and emits an async `error: EINVAL` on the child.

That error arrives AFTER `start()` has already returned (`setImmediate`
resolves first), so the state machine looked like this:

1. `piStart()` resolves — `proc` points at the child object.
2. `isRunning()` returns true: `proc !== null`, `proc.killed === false`,
   `proc.exitCode === null`. The spawn failure has not propagated yet.
3. The prompt route enters the `ReadableStream` and calls
   `piPrompt(message)` → `proc.stdin.write(cmd)`.
4. `child.on('error')` fires. `lastError` is set. But `proc` is NOT
   nulled until `on('exit')` also fires — and in the EINVAL case,
   `exit` either fires simultaneously or not at all depending on
   timing. Either way, `stdin.write` has already landed on a dead
   pipe and no data will ever come back.
5. The SSE stream hangs forever. Chat "doesn't respond."

STORY-093's pi/status route was NOT affected because it only calls
`piStatusSnapshot()` → `isPiAuthenticated()` (file read) + file-existence
checks + `getPiModels()` (spawnSync, also broken but returns `[]`
silently). The UI shows "connected" because that's driven by
`installed && authenticated`, not by whether models list worked.

Nothing in `src-tauri/src/lib.rs` is broken. The Tauri launcher spawns
`node.exe` (bundled), not `pi.cmd`, and that spawn demonstrably succeeds
because the Next.js sidecar is running — otherwise chat would never
even reach `/api/pi/prompt`. Maurice's hypothesis that `lib.rs` needed
fixing was a reasonable first guess from the error string alone, but
the EINVAL is emitted from the Node child-process layer two hops deeper.

## Fix — bypass the `.cmd` shim, spawn `node.exe` directly

`shell: true` would "fix" the spawn call but break the stdio pipe:
under a cmd.exe wrapper, stdin/stdout get shell-interposed and the RPC
JSONL protocol we rely on becomes unreliable. Argv with spaces and
embedded quotes (the long system prompt) would also need hand-quoting
— fragile.

The cleaner fix is to skip the shim entirely. `pi.cmd` just execs:

```
"%_prog%" "%dp0%\node_modules\@mariozechner\pi-coding-agent\<bin>" %*
```

We can replicate that directly: resolve pi's real `.js` entry from its
own `package.json` and spawn the bundled `node.exe` (=
`process.execPath` inside the Tauri sidecar, because the sidecar
itself was launched under bundled node) against that file.

### Three changes

**1. `lib/pi-setup.ts` — new export `resolvePiJsEntry(piCmdPath)`**

Reads `<prefix>/node_modules/@mariozechner/pi-coding-agent/package.json`,
extracts `bin.pi` (or scalar `bin`, or first entry fallback), returns
the absolute path to the `.js` file. Returns `null` if any step fails
so callers can fall back to the old path.

**2. `lib/pi-client.ts` — spawn node.exe against the .js entry on Windows**

Before the `spawn()` call in `start()`:

```ts
let spawnCmd = piPath;
let spawnArgs = args;
if (process.platform === 'win32' && piPath.toLowerCase().endsWith('.cmd')) {
  const jsEntry = resolvePiJsEntry(piPath);
  if (jsEntry) {
    spawnCmd = process.execPath;
    spawnArgs = [jsEntry, ...args];
  }
}
```

No shell involved. Clean argv. Stdio pipes behave normally. Long
system prompt with arbitrary content passes through untouched.

**3. `lib/pi-setup.ts` — same bypass applied inside `getPiModels()`**

`spawnSync(piPath, ['--list-models'])` had the same latent EINVAL on
Windows. Applied the identical `resolvePiJsEntry` + `process.execPath`
swap so models list populates after install instead of always
returning `[]`. This also unblocks the `modelsAvailable` field of
`/api/pi/status`.

## Why this is the right shape of fix

1. **Root cause, not symptom.** The bug is that npm shims don't spawn
   cleanly from node on Windows post-CVE-2024-27980. We bypass the
   shim; every future spawn call is immune.
2. **No shell.** Stdio pipes stay native. RPC protocol integrity
   preserved.
3. **No hardcoded paths.** Entry is read from pi's own `package.json`,
   so future pi package layout changes don't break us.
4. **Graceful fallback.** If `resolvePiJsEntry()` returns null (unusual
   install layout), the old `spawn(piPath, args)` code path runs — so
   we never regress POSIX dev boxes or any non-npm-shim install.
5. **No Rust changes.** STORY-110 + the Tauri launcher are untouched.
   This is a purely JS/Node fix.

## Files touched

- `lib/pi-setup.ts` — +45 LOC (add `resolvePiJsEntry`, wire into
  `getPiModels`, add `dirname` import)
- `lib/pi-client.ts` — +14 LOC (import `resolvePiJsEntry`, Windows
  spawn bypass in `start()`)
- `docs/bmad/reviews/STORY-120.md` — this artifact

## Typecheck

`npx tsc --noEmit` — clean.

## Exit criteria

1. CI builds a new `.msi` from the commit containing this fix.
2. Maurice installs, launches, sees pi.dev "connected" (unchanged).
3. Maurice types a chat message → streaming response arrives.
4. `%APPDATA%\com.4nevercompany.mashupforge\logs\sidecar.log` shows
   no EINVAL lines for pi spawn.

If chat still hangs after this build:
- Capture `sidecar.log` + `startup.log` and the exact pi path the
  sidecar resolved.
- Next suspect would be `resolvePiJsEntry` returning null for some
  package layout we don't anticipate — we'd add a log line showing
  which branch ran.

## Followups (not shipping now)

- **STORY-121** (settings lost on restart): likely `appData` vs `tmp`
  write path. Queued next.
- **STORY-122** (auto-update): Tauri updater plugin wire-up. Queued
  after 121.
- Long-term cleanup: once Windows is stable, consider replacing
  `resolvePiJsEntry` with a `pi --print-entry` flag upstream so we
  don't need to read their `package.json` ourselves.
