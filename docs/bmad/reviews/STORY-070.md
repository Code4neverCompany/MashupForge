# STORY-070 Review — Portable Windows build bring-up

**Status:** DONE (smoke-tested on Linux; needs Maurice confirm on Windows)
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine (human-directed, bypasses daily cap)
**Files touched:** `scripts/build-portable.sh`, `scripts/build-portable.ps1`

---

## Original report

Maurice: "start.bat shows 'Waiting for server...' then crashes
instantly." Then, after deeper inspection of `logs\server.log`:
"EADDRINUSE port 3000 — it's already in use by the Next.js dev
server running in WSL2 (which is accessible from Windows via
localhost:3000). Fix: use a different port."

## Root cause (primary)

`server.js` fell over at boot with `EADDRINUSE: address already in
use 0.0.0.0:3000`. WSL2 forwards `localhost` bindings
bidirectionally between the Linux guest and the Windows host via a
Hyper-V socket, so a dev server running `next dev` inside WSL
occupies port 3000 from the Windows side as well. The portable
launcher tried to bind the same port and died before the readiness
probe ever ran — "Waiting for server…" followed by an instant exit
is exactly what that looks like.

## Secondary bugs found during investigation

Three additional problems existed in the build scripts that would
have bitten the build regardless of the port collision. All fixed
in the same pass.

### 1. `.next/static` and `public/` placed outside the server's cwd

`server.js` does `process.chdir(__dirname)`, so it serves static
assets from `./.next/static` and `./public` relative to its own
folder (i.e., `standalone/`). The old script copied static and
public to `$APP_DIR/.next/static` and `$APP_DIR/public` — one level
above where the server could find them. Result: the HTML page
would load but every CSS, JS chunk, icon, and font would 404.

**Fix:** copy into `standalone/.next/static` and `standalone/public`
instead, merging with the traced public/ the standalone bundle
already ships.

### 2. Linux-only native bindings in `standalone/node_modules`

The build runs on Linux/WSL. `npm run build` on Linux populates
`standalone/node_modules` with `@img/sharp-linux-x64`,
`@img/sharp-linuxmusl-x64`, and no `@next/swc-win32-*` package at
all. On Windows those `.node` files cannot be loaded; Next.js 16
currently lazy-loads sharp for image optimization (off in our
config, `unoptimized: true`) but depending on feature flags it can
still be required at boot, and `@next/swc-win32-x64-msvc` is the
preferred SWC backend over the wasm fallback.

**Fix:** after copying standalone, run

```
npm install --force --no-save --no-audit --loglevel=error \
  --os=win32 --cpu=x64 \
  @img/sharp-win32-x64 \
  @next/swc-win32-x64-msvc
```

inside `standalone/`. The `--os`/`--cpu` flags (npm ≥ 10) download
the optional deps for a foreign platform without running install
scripts. The script sanity-checks that both `.node` files exist
afterward and bails if either is missing.

Side benefit: the transitive optional-dep resolution also pulled
in `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`,
`@unrs/resolver-binding-win32-x64-msvc`, and
`@mariozechner/clipboard-win32-x64-msvc`. None of those are
runtime-critical for the standalone server but shipping them
defends against any surprise `require()` during a code path we
haven't exercised.

### 3. No `HOSTNAME` pin → Windows Defender Firewall prompt (STORY-041 pattern)

`server.js` defaults to `process.env.HOSTNAME || '0.0.0.0'`. On
Windows, binding `0.0.0.0` for an unsigned process triggers the
"Allow MashupForge.exe through the firewall" prompt on first run.
STORY-041 already fixed this for the Tauri sidecar path by
hard-pinning `HOSTNAME=127.0.0.1` in `tauri-server-wrapper.js`.
The portable launcher needed the same treatment.

**Fix:** `start.bat` now sets `HOSTNAME=127.0.0.1`, `HOST=127.0.0.1`
before spawning node. Loopback binding is Defender-exempt.

## The launcher changes

- Explicit `NODE_EXE` path via `%~dp0node\node-v22.11.0-win-x64\node.exe`
  (instead of relying on PATH mutation that `start /B` may or may
  not inherit reliably)
- `setlocal` so env changes don't leak out of the batch session
- Pre-flight existence checks for `NODE_EXE` and `standalone\server.js`
  with actionable error messages
- `PORT=3001` (was 3000) — avoids the WSL dev-server collision
- 20-second readiness probe with `curl` instead of an infinite
  `goto wait` loop; on timeout, dumps `logs\server.log` inline so
  the failure is visible without the user having to open the file
- `http://127.0.0.1:3001` in the browser launch URL
- `taskkill /F /IM node.exe` on exit (unchanged — known caveat:
  kills any other node.exe on the system; acceptable for a
  portable launcher where the user owns their session)

## Smoke test (Linux host, standalone tree)

I cannot run the `.bat` from WSL, but I can boot `server.js` on
Linux against the built standalone tree to verify the layout and
asset serving:

```
$ HOSTNAME=127.0.0.1 PORT=3099 node standalone/server.js &
▲ Next.js 16.2.3
- Local:         http://127.0.0.1:3099
- Network:       http://127.0.0.1:3099
✓ Ready in 0ms
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3099/
200
$ curl -s -o /dev/null -w "%{http_code}\n" \
    http://127.0.0.1:3099/_next/static/chunks/112qdnf547wz8.js
200
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3099/icon.svg
200
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3099/manifest.json
200
```

That proves:
- `server.js` boots (so the Next standalone output is
  self-contained as built)
- Root HTML renders (`/` → 200)
- Static chunk fetches from `standalone/.next/static/` (the
  layout fix works)
- Public assets fetch from `standalone/public/` (both
  `icon.svg` and `manifest.json`)

What Linux smoke-test **cannot** prove:
- That Windows `node.exe` can load `@img/sharp-win32-x64.node` —
  can't execute a Windows binary from WSL
- That the `.bat` control flow works — cmd.exe parsing is
  Windows-only
- That Port 3001 is free on Maurice's Windows host (it usually is;
  the common dev-server collision was on 3000)

Those need Maurice's manual confirm.

## Why both scripts were untracked

Neither `scripts/build-portable.sh` nor `scripts/build-portable.ps1`
was in git (`git status` showed them as `??`). They existed on disk
but had never been committed, which is why the bugs persisted
across sessions — every build reproduced the same broken layout.
This commit pulls them into version control so the fixes stick.

## Maurice's test pass

1. Rebuild: `bash scripts/build-portable.sh`
2. Copy `dist/portable/MashupForge-portable.tar.gz` to the Windows host
3. Extract
4. Double-click `start.bat`
5. Expect:
   - Console shows "Starting Next.js server on http://127.0.0.1:3001"
   - Console shows "Waiting for server..." (one or two dots)
   - Console shows "Server ready."
   - Browser opens to `http://127.0.0.1:3001/`
   - **No Defender firewall prompt** (per STORY-041)
   - App UI renders with all CSS, icons, fonts intact (per layout fix)

If step 5 fails, `logs\server.log` will be dumped inline by the
batch file's timeout branch — paste that and the first screen of
the console into a new failure report at
`docs/bmad/reviews/STORY-070-failure.md`.

## Handoff

- Two scripts staged (`build-portable.sh`, `build-portable.ps1`)
- This review artifact committed alongside
- Portable tree rebuilt locally (`dist/portable/` gitignored)
- Smoke-test evidence captured above
- No change to the Tauri `.msi` build path — STORY-060/STORY-061
  are unaffected
- Going idle after Maurice confirms on-host
