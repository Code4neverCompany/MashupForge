# QA Security Audit — AUDIT-010

**Status:** CONCERNS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**HEAD:** c0d2ec1
**Scope:** Hardcoded keys, exposed endpoints, injection surfaces, SSRF

---

## Summary

No hardcoded credentials found in source. `.env.local` is correctly gitignored and
not tracked. Three issues found: one HIGH (SSRF), one MEDIUM (unguarded pi routes),
and two LOW carryovers from prior audits. No gate blocker for the desktop use case,
but SSRF requires a fix before any non-loopback deployment.

---

## Findings

### SEC-AUDIT-001 — SSRF in `GET /api/proxy-image` [HIGH]

**File:** `app/api/proxy-image/route.ts`

```ts
const url = searchParams.get('url');  // user-supplied
const response = await fetch(url);    // no allowlist
```

- **No URL allowlist.** Any caller can pass `?url=http://169.254.169.254/...` (AWS IMDS),
  `?url=http://localhost:PORT/internal-route`, or `?url=file:///etc/passwd`. The server
  fetches it and proxies the response body back.
- **Content-Type reflection.** `Content-Type: response.headers.get('Content-Type') || 'image/jpeg'`
  — if the fetched URL returns `Content-Type: text/html`, the proxy serves HTML to the
  browser. In a web deployment this enables reflected XSS.
- **`Access-Control-Allow-Origin: *`** — response is CORS-open. Any page can use this
  proxy to exfiltrate internal service responses cross-origin.

**Desktop threat model:** Tauri hard-pins the sidecar to `127.0.0.1:19782` and the
WebView2 window is the only client. Risk is contained for the current deployment.

**Non-desktop / future risk:** If the Next.js server is ever exposed beyond loopback
(dev mode, future Vercel deployment, port-forwarded tunnel), this is a full SSRF.

**Required fix:**
```ts
const ALLOWED_HOSTS = ['cdn.leonardo.ai', 'storage.googleapis.com', 'i.uguu.se'];
const parsed = new URL(url);
if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
  return new NextResponse('Disallowed host', { status: 403 });
}
```

---

### SEC-AUDIT-002 — Pi routes lack desktop guard [MEDIUM]

**Files:** `app/api/pi/install/route.ts`, `app/api/pi/start/route.ts`, `app/api/pi/stop/route.ts`

All three accept unauthenticated POST requests with no `isServerless()` / `MASHUPFORGE_DESKTOP` guard.

- `POST /api/pi/install` — triggers `npm install --global` on the host. In a serverless
  deployment, this would attempt npm install in the Lambda/Vercel sandbox.
- `POST /api/pi/start` — spawns a child process (`pi.cmd` or Node entry point).
- `POST /api/pi/stop` — kills the running pi process.

**Desktop mitigations present:** Loopback-only binding (`127.0.0.1:19782`) means
only the local WebView2 can reach these routes. The mutex fix (PROP-013, a95ceea)
prevents concurrent install. Risk is contained for the current deployment.

**Required fix (defense in depth):** Add `isServerless()` guard matching the pattern
in `app/api/pi/setup/route.ts` and `app/api/desktop/config/route.ts`. Fail with 503
on non-desktop environments. This costs ~5 LOC per route and eliminates the risk
surface entirely for any future non-loopback exposure.

---

### SEC-AUDIT-003 — SEC-1 carry-forward: `piPath` in shell string [MEDIUM, mitigated]

**File:** `app/api/pi/setup/route.ts` lines 61, 76

Windows path:
```ts
spawn(
  `start "..." cmd /k "\"${piPath}\" /login"`,
  { shell: true, detached: true, stdio: 'ignore' },
)
```
POSIX path:
```ts
execSync(`tmux new-session ... '${piPath} /login'`, ...)
```

- `piPath` comes from `getPiPath()` which resolves the npm global install path. The path
  is determined by `MASHUPFORGE_PI_DIR` (set by the Rust launcher — not user-editable
  in the UI). Not directly user-controlled.
- A `piPath` containing `'` (single quote) would break out of the POSIX tmux single-quote
  fence and could inject shell commands.
- `getPiPath()` validates the path via `existsSync()` only — no character allowlist.

**Current threat:** Low in the desktop context (MASHUPFORGE_PI_DIR is launcher-controlled).
Non-zero if an attacker can write a crafted file to `%APPDATA%\MashupForge\pi\` before install.

**Recommended fix (not blocking):** On POSIX, use `spawn(['tmux', 'new-session', '-d', '-s',
'pi-setup', piPath, '/login'], { shell: false })` to eliminate the shell injection surface.
On Windows, use an args array with `shell: false` and `piPath` as a separate element.

---

### SEC-AUDIT-004 — SEC-2 carry-forward: Dead `PI_BIN` bypass [LOW]

**File:** `lib/pi-setup.ts` — `piCandidates()` function

The `PI_BIN` environment variable is still listed as a candidate path. Any env with
`PI_BIN` set will use that binary as the pi path, bypassing the runtime-install resolver
entirely. In the Tauri context, `PI_BIN` is not set by the Rust launcher, so the risk
is low. But it's an undocumented escape hatch — remove or document.

---

### Cleared findings

- **No hardcoded API keys.** `grep` sweep of `app/`, `lib/`, `hooks/` found no raw key
  values. Only `'MY_LEONARDO_API_KEY'` appears as a validation sentinel (correctly used
  in `app/api/leonardo*/route.ts` to detect unconfigured keys).
- **`.env.local` not tracked.** `git ls-files .env.local` → empty. `.gitignore` has
  `.env*` pattern. ✓
- **No secrets in git history.** `git log -p --diff-filter=A -- ".env*"` shows only
  `.env.example` with placeholder strings. ✓
- **Desktop config route guards correct.** `GET /api/desktop/config` returns
  `{ isDesktop: false, keys: {} }` on serverless (graceful, no key leak). `PATCH` returns
  503. ✓
- **Crash reporter path is safe.** Filename is `crash-webview-${Date.now()}.log` — not
  user-controlled. `crashDir` comes from `MASHUPFORGE_CRASH_DIR` env var set by Rust
  launcher. No path traversal surface. ✓
- **Auto-launch (PROP-005) is user-space only.** Writes to HKCU registry (Windows) /
  LaunchAgent (macOS) — no privilege escalation. ✓
- **RACE-1 fixed.** In-process mutex (a95ceea) prevents concurrent install. ✓

---

## Generated Tasks

```
- [ ] SEC-001: Add URL allowlist to /api/proxy-image (SSRF fix)
      why: No host restriction; server proxies arbitrary URLs incl. internal services
      classification: routine
      fix: allowlist ['cdn.leonardo.ai', 'storage.googleapis.com', 'i.uguu.se'] + 403 on miss

- [ ] SEC-002: Add isServerless() guard to pi/install, pi/start, pi/stop routes
      why: Defense-in-depth; routes spawn child processes with no environment check
      classification: routine
      fix: copy pattern from app/api/pi/setup/route.ts (~5 LOC per route)

- [ ] SEC-003: Fix POSIX shell injection in pi/setup route (piPath in single-quote fence)
      why: piPath with embedded single-quote breaks tmux exec fence
      classification: routine
      fix: use spawn() array form instead of template-literal shell string
```
