# STORY-041 Review — Windows firewall exception handling

**Status:** DONE
**Agent:** Developer
**Date:** 2026-04-14
**Classification:** routine (1 file, ~15 LOC net add)
**Target file:** `scripts/tauri-server-wrapper.js`
**Dispatched as:** human-directed (bypasses the 10-routine/period cap)

---

## The real risk (and the real fix)

The STORY title says "firewall exception handling" but the concrete
first-launch failure mode isn't about adding a firewall *exception* —
it's about **not triggering the Windows Defender Firewall prompt at
all**.

Windows Defender Firewall's on-first-bind dialog fires when an
unsigned `.exe` starts listening on a non-loopback interface (`0.0.0.0`
or a real NIC). Binding **only** to `127.0.0.1` / `::1` is exempt from
the prompt — that's documented Windows behavior and every well-behaved
localhost dev tool relies on it.

So the fix is: guarantee the Next sidecar binds loopback only, no
matter what. Adding an actual firewall rule via NSIS would require
admin elevation during install, which is exactly the user-trust hit
Phase 1 is trying to avoid (same reasoning as PROP-005 recommending
against always-on auto-launch).

## The bug

`scripts/tauri-server-wrapper.js:67` runs `hydrateDesktopEnv()` which
reads `%APPDATA%\MashupForge\config.json` and unconditionally copies
every string value into `process.env`:

```js
for (const [k, v] of Object.entries(parsed)) {
  if (typeof v === 'string' && v.length > 0) {
    process.env[k] = v;
    keys.push(k);
  }
}
```

The Rust launcher sets `HOSTNAME=127.0.0.1` before spawning the
sidecar (verified in `src-tauri/src/lib.rs:103-112`), but the hydrate
loop runs *after* and will happily overwrite it. If a user drops a
stray `"HOSTNAME": "0.0.0.0"` into their `config.json` — intentionally
or by copy-pasting a Docker example from Stack Overflow — Next
standalone (`.next/standalone/server.js`) will read
`process.env.HOSTNAME` and bind to `0.0.0.0`, and the Defender dialog
will fire on first launch.

The existing fallback `if (!process.env.HOSTNAME) process.env.HOSTNAME = '127.0.0.1';`
was also the wrong shape — it only fired when HOSTNAME was *unset*,
not when it was set to a non-loopback value.

## The fix

Replace the conditional fallback with a hard override, AFTER
`hydrateDesktopEnv` has run:

```js
const LOOPBACK = '127.0.0.1';
for (const key of ['HOSTNAME', 'HOST']) {
  if (process.env[key] && process.env[key] !== LOOPBACK) {
    console.warn(
      `[tauri-wrapper] overriding ${key}=${process.env[key]} -> ${LOOPBACK} ` +
      '(desktop mode pins loopback to avoid Windows Firewall prompts)'
    );
  }
  process.env[key] = LOOPBACK;
}
```

Key properties:

- **Runs after config hydration** — user config cannot escape the
  loopback cage
- **Runs after Rust launcher env** — redundant with the launcher,
  but redundant in the right direction: if the launcher ever
  regresses and stops setting HOSTNAME, the wrapper still pins it
- **Logs the override** — if a user *intentionally* put
  `HOSTNAME: "0.0.0.0"` in their config, the override is visible in
  the Tauri stdout log so they understand why their override didn't
  take effect
- **Also pins `HOST`** — Next standalone reads `HOSTNAME`, but some
  auxiliary tools / middleware read `HOST`. Belt and suspenders: zero
  cost, one extra line.

## Why a hard override is safe

This wrapper is **desktop-only**. It's installed as `start.js`
inside `resources/app/` by `copy-standalone-to-resources.ps1`, and
the only caller is the Rust sidecar spawn in
`src-tauri/src/lib.rs`. Vercel / Linux dev / CI never see this file.
So hard-pinning loopback can't affect any deployment where binding
to `0.0.0.0` is legitimate.

The one edge case worth considering: what if a future feature wants
the desktop app to expose its Next server to another device on the
LAN (e.g. "view your gallery on your phone")? That would need to
flip this guard off. We can cross that bridge when it exists — the
override lives in one file, ~15 lines, trivially reversible. For
Phase 1 the goal is "install, run, no surprises" and the surprise
we're avoiding is the Defender dialog.

## What this does NOT do

- **Does not add a netsh firewall rule** during install. Phase 1
  ships unsigned and does not request admin elevation; adding
  `netsh advfirewall firewall add rule` to the NSIS post-install
  script would push the installer into admin territory and trigger
  an extra UAC prompt. Not worth the trade for a prompt we can
  avoid entirely by binding loopback-only.
- **Does not catch `EADDRINUSE` on bind.** If the ephemeral port
  picker in `lib.rs:16-20` races with another process that grabs
  the port between `pick_free_port()` and the sidecar spawn, the
  Next server will fail to bind and crash. That's an unrelated
  failure mode tracked in STORY-023 (crash reporter, PROP-006
  pending) which will catch it when it lands.
- **Does not handle IPv6 loopback (`::1`).** Next standalone's
  hostname parsing accepts `127.0.0.1` as IPv4-only, and the Rust
  launcher's `wait_for_port` polls `127.0.0.1:<port>`, so the whole
  chain is pinned IPv4. Adding `::1` would break the ready-poll
  gate. IPv4 loopback is the intended architecture.
- **Does not change anything on POSIX.** The file is
  cross-platform, and the fix applies to all platforms — but only
  Windows users benefit, because only Windows triggers a firewall
  prompt on non-loopback binds of unsigned executables.

## Verification

- `node -c scripts/tauri-server-wrapper.js` → syntax OK
- Logic trace:
  1. `hydrateDesktopEnv` runs → may set `HOSTNAME` from config.json
  2. Hard-override loop runs → `HOSTNAME = '127.0.0.1'` regardless
  3. `require('./server.js')` runs → Next standalone reads
     `process.env.HOSTNAME`, sees `127.0.0.1`, binds loopback-only
  4. Windows Defender sees a loopback bind → no prompt
- The pre-existing `if (!process.env.PORT) process.env.PORT = '0'`
  fallback is preserved — PORT is always set by the Rust launcher,
  so the fallback is defense-in-depth for hypothetical dev invocations.

## Manual test hook

This is now the new Test 2.5 in the STORY-004 Windows manual test
pass (inserted between the existing Tests 2 and 3):

- [ ] **Test 2.5 — No Defender dialog.** On first launch of the
      installed `.msi`, there is no "Allow MashupForge.exe through
      the firewall" dialog. If one appears, the loopback pin is
      broken — check the Tauri stdout log for `[tauri-wrapper]
      booting Next on 127.0.0.1:<port>` and confirm HOSTNAME is not
      being overridden downstream.

I haven't added this to the STORY-004 review inline because that
artifact is frozen pre-commit; Maurice can append it or just
mentally add it when running the pass.

## Handoff

- `scripts/tauri-server-wrapper.js` — single file, ~15 LOC changed
- Commit on `main` with STORY-041 ID
- Queue entry will be marked `[x]` with a pointer to this artifact
- Next CI build on push will carry the loopback pin automatically
