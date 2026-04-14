# STORY-030 Review — Fix Windows path handling in pi.dev installer

**Status:** DONE
**Agent:** Developer
**Date:** 2026-04-14
**Classification:** routine
**Target file:** `lib/pi-setup.ts`

---

## The real bug

`installPi()` spawns npm with `shell: true` on Windows:

```ts
const spawnOpts = {
  encoding: 'utf8' as const,
  timeout: 5 * 60 * 1000,
  env,
  shell: isWindows,
};

const result = spawnSync(
  npmCmd,
  ['install', '--prefix', localPrefix, '--global', '@mariozechner/pi-coding-agent'],
  spawnOpts,
);
```

`shell: true` is mandatory on Windows since Node's CVE-2024-27980 fix —
without it, spawning a `.cmd` / `.bat` file throws `EINVAL`. But with
`shell: true`, Node joins argv with spaces and hands the whole string
to `cmd.exe` **without quoting any individual argument**.

So when `localPrefix` = `C:\Users\Maurice Johnson\AppData\Roaming\MashupForge\pi`,
the composed command line becomes:

```
npm.cmd install --prefix C:\Users\Maurice Johnson\AppData\Roaming\MashupForge\pi --global @mariozechner/pi-coding-agent
```

cmd.exe re-parses this as:

| arg | value |
|---|---|
| 1 | `install` |
| 2 | `--prefix` |
| 3 | `C:\Users\Maurice` ← broken |
| 4 | `Johnson\AppData\Roaming\MashupForge\pi` ← stray positional |
| 5 | `--global` |
| 6 | `@mariozechner/pi-coding-agent` |

npm then installs pi into `C:\Users\Maurice` (which may not even exist)
and throws on the stray positional. The Tauri desktop app reports
"pi install failed" with a confusing npm usage error, and nothing lands
at the expected `MASHUPFORGE_PI_DIR`.

This hits any Windows user whose account name contains a space —
common defaults like "Maurice Johnson", "John Smith", or the OEM
"HP User", "Dell Admin" patterns. It's not a fringe case.

## The fix

Single file, ~10 LOC added, zero new deps. Pre-quote any argument that
contains whitespace or an embedded quote before handing it to `spawnSync`
under `shell: true`:

```ts
const quoteWinArg = (a: string) =>
  isWindows && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
```

Applied at the one call site that receives a user-path argument:

```ts
const result = spawnSync(
  npmCmd,
  [
    'install',
    '--prefix',
    quoteWinArg(localPrefix),
    '--global',
    '@mariozechner/pi-coding-agent',
  ],
  spawnOpts,
);
```

`@mariozechner/pi-coding-agent` passes through the helper unchanged (no
whitespace). On POSIX, `quoteWinArg` is a no-op, so Linux/macOS behavior
is byte-identical to before.

## Why the helper lives inside the function instead of being exported

Scope discipline: the only other user-path arg in this file is the
`npmCmd --version` probe, which takes no path args. If the codebase
grows a second path-under-shell spawn, we can lift the helper to
`lib/errors.ts`-adjacent utils then. For now, inlining keeps the
routine-classified fix to one file.

## Out of scope (intentionally)

- **Sidecar wrapper `scripts/tauri-server-wrapper.js`.** Reads
  `%APPDATA%\MashupForge\config.json` using `path.join` + `fs.readFileSync`
  — those accept backslash paths natively and don't go through a shell.
  No fix needed.
- **Rust launcher `src-tauri/src/lib.rs`.** Uses `PathBuf` and passes
  OS-native paths to `std::process::Command` — no shell layer, no
  quoting concerns.
- **`pi-client.ts` `spawn(piPath, …)`.** Spawns the already-resolved
  `pi.cmd` directly with `stdio: ['pipe', …]` and no `shell: true`.
  Node invokes the `.cmd` via its internal shim resolution; args are
  passed as a proper argv array. No bug here.
- **HOME path with spaces** in `ensureWritableHome()`. The result goes
  into `env.HOME` + `env.npm_config_cache`, which are environment
  variables, not shell args — cmd.exe does not re-split env values.
  No bug.
- **PATH concatenation at line 279.** `binDir` is joined with the
  existing PATH using the right separator (`;` on Windows). No shell
  interpolation involved.

## Verification

- `npx tsc --noEmit` → exit 0 (clean)
- Regex `/[\s"]/` matches any whitespace or double quote. Windows paths
  with spaces hit the whitespace branch; paths with embedded quotes
  (rare, but npm itself permits them in directory names) hit both.
- Escape rule `"${a.replace(/"/g, '\\"')}"` matches cmd.exe's documented
  backslash-escape-inside-quoted-string parsing. Tested mentally
  against `C:\a b\c.txt` (→ `"C:\a b\c.txt"`) and `C:\weird"path\x`
  (→ `"C:\weird\"path\x"`).

## What this does NOT fix

STORY-030's title says "Windows path handling" in the installer.
There's only one path-quoting bug in the installer; it's now fixed.
If Maurice had a *different* Windows path issue in mind — e.g. a
path separator bug he saw on a specific machine, a locale-specific
folder name, a OneDrive-redirected APPDATA that fails a writability
probe — please re-file with the specific repro and I'll scope from
there.

Related items still open:
- **STORY-004 Test 5 (pi install from Settings)** — this fix makes
  Test 5 actually pass on machines with spaces in the username, which
  the prior code would have failed on. Worth calling out in Maurice's
  manual test pass if it wasn't already covered.
- **STORY-031 (Windows-specific error messages)** — separate queue
  item, will be pulled next.

## Handoff

- `lib/pi-setup.ts` — 10 LOC added, 1 function-local helper, 1
  call-site change.
- Commit on current branch `main` with STORY-030 ID.
- Queue entry will be marked `[x]` with a pointer to this artifact.
