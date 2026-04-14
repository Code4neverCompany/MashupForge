# QA Review: pi-autosetup (commit e63983b)

**Status:** warn
**Scope Drift:** no — implementation matches the Hermes directive to replace bake-at-build-time with runtime install
**Obsolete Items:** `PI_BIN` env var in `piCandidates()` is a dead-code holdover from the bake era (see Security §3)
**Test Coverage:** none — no automated tests for any of the install/setup paths; smoke tested Linux only per commit message
**Security:** three issues, one medium-severity (see below)
**Recommendation:** request-changes — two bugs must be fixed before Windows validation (spaces-in-path, PI_BIN holdover); security hardening is lower priority but should follow

---

## Files reviewed

- `lib/pi-setup.ts` (full file, post-commit state)
- `app/api/pi/setup/route.ts` (full file, post-commit state)
- `app/api/pi/install/route.ts` (full file, post-commit state)
- `app/api/pi/status/route.ts` (full file, post-commit state)
- `src-tauri/src/lib.rs` (diff hunks)
- `components/MainContent.tsx` (diff hunks, piAutoBootRef effect)

---

## 1. Security

### SEC-1 — MEDIUM: `piPath` interpolated raw into shell strings (both platforms)

**Windows branch** (`setup/route.ts:61`):
```ts
spawn(
  `start "MashupForge — pi.dev Sign In" cmd /k "\"${piPath}\" /login"`,
  { shell: true, detached: true, stdio: 'ignore' },
).unref();
```
**POSIX branch** (`setup/route.ts:75`):
```ts
`tmux new-session -d -s pi-setup -x 120 -y 30 ` +
`'${piPath} /login'`
```
`piPath` comes from `getPiPath()` which falls back to `where`/`which` PATH lookup. A `piPath` containing `"` (Windows) or `'` (POSIX) breaks the shell quoting and could execute arbitrary shell tokens. The `where` fallback is the dangerous path — it returns whatever is first in `PATH`, which an attacker with write access to `PATH` directories could poison.

**Risk level:** Medium. In the Tauri deployment, `MASHUPFORGE_PI_DIR` is always set by the Rust launcher so `where`/`which` is never reached; on dev boxes, PATH is controlled by the developer. The risk window is small but the pattern is wrong.

**Fix:** Use an args array instead of string interpolation, or at minimum assert that `piPath` matches the known `MASHUPFORGE_PI_DIR` prefix before executing it.

---

### SEC-2 — LOW: `PI_BIN` env var still first in `piCandidates()`

`lib/pi-setup.ts:74`:
```ts
process.env.PI_BIN,
```
`PI_BIN` was the bake-at-build-time mechanism. The Rust launcher no longer sets it (it was replaced by `MASHUPFORGE_PI_DIR`). The candidate entry is now dead code — but it's dead code that will execute any binary pointed to by `PI_BIN` if that env var is set for any reason (leftover shell config, CI environment, external tooling). Any process that can set environment variables can redirect `getPiPath()` to an arbitrary executable.

**Fix:** Remove `process.env.PI_BIN` from `piCandidates()`.

---

### SEC-3 — LOW: `npm install` runs without `--ignore-scripts`

`lib/pi-setup.ts:247-251`. npm lifecycle scripts (`preinstall`, `postinstall`, etc.) in `@mariozechner/pi-coding-agent` or any of its transitive dependencies run as the Next.js server process user, with full access to the inherited environment (API keys, tokens). On Windows with `shell: true`, these scripts have cmd shell access.

This is an inherent supply-chain risk of runtime npm installs. The package is authored by a known maintainer, so the risk is low today — but there is no pin on the package version, so a compromised future release would auto-execute on first launch of a new install.

**Fix (optional):** Add `--ignore-scripts` to the install command and verify pi still works. If pi relies on postinstall scripts, document why they are trusted.

---

## 2. Race conditions

### RACE-1 — HIGH: No server-side install lock

`app/api/pi/install/route.ts:36-44`:
```ts
const existing = getPiPath();
if (existing) { /* return alreadyInstalled */ }
const result = installPi();
```
The check-then-act is not atomic. Two concurrent `POST /api/pi/install` requests both call `getPiPath()`, both see `null` (pi not yet installed), and both proceed to `installPi()`, which calls `spawnSync('npm install')`. Two concurrent npm installs into the same prefix (`MASHUPFORGE_PI_DIR`) will race on the file system. npm does not expect concurrent writers to the same prefix and can produce a corrupt install (partial `node_modules`, truncated `.cmd` shim).

In practice the autoboot effect fires once per component mount and `piAutoBootRef` prevents React double-fire. But two browser windows, a hot-reload remount during an install, or any external caller can trigger the race.

**Fix:** Write a lock file (`<prefix>/.installing`) before spawning npm and remove it in a `finally` block. The route should return `202 / installing: true` if the lock exists.

---

### RACE-2 — MEDIUM: `piStatusSnapshot()` blocks on `getPiModels()` (10s timeout)

`lib/pi-setup.ts:352-361`:
```ts
modelsAvailable: piPath && authed ? getPiModels().length : 0,
```
`getPiModels()` calls `spawnSync(piPath, ['--list-models'], { timeout: 10_000 })`. `spawnSync` is synchronous — it blocks the Node.js event loop for up to 10 seconds if pi hangs or is unresponsive. The status route (`/api/pi/status`) calls `piStatusSnapshot()` on every request.

The autoboot effect calls `refreshPiStatus()` twice — before and after install. During a 30-60s npm install, the second status call hits a `pi` binary that may not be fully set up yet, potentially triggering a 10-second hang each time. During that hang, all other Next.js server routes are blocked.

**Fix:** Call `getPiModels()` only when explicitly requested (add a `?models=true` param to the status route), or move it to a separate async route. At minimum, log a warning if the call exceeds 2s.

---

### RACE-3 — LOW: `piAutoBootRef` resets on component unmount/remount

`components/MainContent.tsx:785`:
```ts
const piAutoBootRef = useRef(false);
```
`useRef` state is local to the component instance. If `MainContent` unmounts (hot reload, route navigation, React error boundary recovery) while an npm install is still running on the server, the ref resets to `false` on remount and the autoboot effect fires again — triggering a second `POST /api/pi/install` that races with the in-flight install.

**Fix:** Covered by RACE-1's lock-file fix. With a server-side lock, the second request returns `202 / installing: true` harmlessly instead of starting a concurrent install.

---

## 3. Windows path handling

### WIN-1 — HIGH: `localPrefix` with spaces breaks `npm install` on Windows

`lib/pi-setup.ts:229-251`:
```ts
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const spawnOpts = { ..., shell: isWindows };

const result = spawnSync(
  npmCmd,
  ['install', '--prefix', localPrefix, '--global', '@mariozechner/pi-coding-agent'],
  spawnOpts,
);
```
When `shell: true`, Node.js passes the command + joined args to `cmd.exe /d /s /c "..."`. Args are joined by spaces with no automatic quoting. `localPrefix` is `%APPDATA%\MashupForge\pi`, and `%APPDATA%` is typically `C:\Users\<username>\AppData\Roaming`. Any username with a space (e.g., `John Doe`) produces `localPrefix = C:\Users\John Doe\AppData\Roaming\MashupForge\pi`, which becomes:

```
npm.cmd install --prefix C:\Users\John Doe\AppData\... --global @mariozechner/pi-coding-agent
```

npm receives `--prefix C:\Users\John` and treats `Doe\AppData\...` as a positional argument, failing with a confusing error. **Most Windows users have spaces in their username.** This is a blocking bug for STORY-004.

**Fix (preferred):** Drop `shell: true` and use `execFileSync` (or `spawnSync` without `shell: true`) with `npmCmd = 'npm.cmd'` — Node.js can resolve `.cmd` files directly on Windows without a shell when the `.cmd` extension is explicit:
```ts
const spawnOpts = {
  encoding: 'utf8' as const,
  timeout: 5 * 60 * 1000,
  env,
  // shell: false (default) — Node resolves .cmd directly
};
```
**Fix (alternative):** Quote the `localPrefix` arg explicitly when building the args array:
```ts
const prefixArg = isWindows ? `"${localPrefix}"` : localPrefix;
['install', '--prefix', prefixArg, '--global', '@mariozechner/pi-coding-agent']
```

---

### WIN-2 — INFO: `pi.cmd` lookup and PATH injection are correct

- `join(prefix, 'pi.cmd')` correctly resolves the npm shim location on Windows ✓
- PATH separator is `;` on Windows, `:` on POSIX — correctly handled (lines 277-280) ✓
- `binDir = localPrefix` for Windows (not `localPrefix/bin`) is correct — npm puts `.cmd` shims at the prefix root ✓
- `where pi` correctly takes `split(/\r?\n/)[0]` to handle multiple matches ✓
- `npm.cmd` as explicit name is correct for shell-less spawn on Windows ✓

---

### WIN-3 — INFO: Windows `cmd /k` leaves the auth window open after pi exits

`setup/route.ts:61`. `cmd /k` keeps the console window alive after the command finishes. For an interactive auth flow this is intentional (user can see output), but it means the terminal window stays open indefinitely after sign-in completes and requires manual close. `cmd /c` would auto-close. Consider adding exit instructions to the status message, or switching to `cmd /c` if pi's login flow exits cleanly on success.

---

## Summary table

| ID | Severity | Area | Description | Blocks STORY-004? |
|---|---|---|---|---|
| SEC-1 | Medium | Security | `piPath` string interpolation into shell command | No (Tauri path is safe) |
| SEC-2 | Low | Security | Dead `PI_BIN` candidate in `piCandidates()` | No |
| SEC-3 | Low | Security | npm install runs with scripts enabled, no version pin | No |
| RACE-1 | High | Race condition | No install lock — concurrent npm installs corrupt prefix | Indirectly |
| RACE-2 | Medium | Race condition | `getPiModels()` blocks event loop for 10s | Indirectly |
| RACE-3 | Low | Race condition | `piAutoBootRef` resets on unmount; covered by RACE-1 fix | No |
| WIN-1 | **High** | Windows paths | `localPrefix` with spaces breaks `npm install` with `shell: true` | **Yes** |
| WIN-2 | Info | Windows paths | `.cmd` path, PATH injection, `where` handling all correct | — |
| WIN-3 | Info | Windows paths | `cmd /k` leaves auth window open after pi exits | No |

**Must fix before STORY-004:** WIN-1 (blocks all users with spaces in username), RACE-1 (blocks clean first-launch on hot-reload or multi-window).

**Should fix before release:** SEC-1, SEC-2, RACE-2.

**Low priority / optional:** SEC-3, RACE-3, WIN-3.
