---

# QA Review — QA-INSTAGRAM (instagram-credentials.ts extraction + test suite)

**Status:** PASS (E2E blocked — see below)
**Agent:** Developer
**Date:** 2026-04-18
**Scope:** `lib/instagram-credentials.ts`, `tests/lib/instagram-credentials.test.ts`,
call-sites `app/api/social/post/route.ts:174-176`, `app/api/social/best-times/route.ts:18-20`

## What changed since the 2026-04-16 review

The inline `??` chain was extracted from both route handlers into a shared pure function
`resolveInstagramCredentials(env, body)`. A dedicated unit-test file was added. This review
covers that extraction and its test coverage.

## Credential chain — env vars → config.json → client body

The three-layer chain works as follows:

1. **`process.env.INSTAGRAM_*`** — populated on sidecar boot by `scripts/tauri-server-wrapper.js`
   reading `%APPDATA%\MashupForge\config.json`. This is the desktop path. Keys are either a
   non-empty string or absent entirely (the PATCH handler deletes empty-string keys — see
   existing review for invariant proof). `??` is therefore load-bearing, not cosmetic.

2. **`config.json`** — the physical store behind layer 1. Written by `DesktopSettingsPanel` →
   `PATCH /api/desktop/config` → live `process.env[k] = v.trim()`. Survives any webview
   origin drift because it is filesystem-backed under a stable APPDATA path.

3. **`body`** (request body / client-supplied creds) — the web fallback. On a Vercel or
   `npm run dev` deployment, `process.env.INSTAGRAM_*` is undefined; the client sends creds
   in the POST body from its own settings store (previously IDB-backed, still IDB on web
   since origin there is stable). The function doesn't distinguish "IDB fallback" from "web
   body" — that distinction lives entirely in the client; the server just sees `body`.

`resolveInstagramCredentials` correctly encodes all of this in 4 lines with no conditional
branches and no side effects. ✓

## Implementation audit (`lib/instagram-credentials.ts`)

- [PASS] `InstagramCredentialSources` typed as `Readonly<Record<string, string | undefined>>`
  — structurally compatible with `NodeJS.ProcessEnv`. Avoids a named-key interface that
  would fail at call-sites passing a plain object. ✓
- [PASS] `body` parameter is `| undefined` — callers that omit body (or pass `undefined`) do
  not throw. Test 6 explicitly covers this path. ✓
- [PASS] Empty-string final default (`?? ''`) — intentional. Both call-sites guard with
  `if (!igAccessTokenRaw || !igAccountIdRaw)` / `if (!accessToken || !igAccountId)` before
  proceeding. Return type is `string` not `string | null` which matches call-site expectations. ✓
- [NOTE] Naming asymmetry: `body.accessToken` (input) vs `igAccessToken` (output). Not a bug —
  the output name mirrors the env var key (`INSTAGRAM_ACCESS_TOKEN`). Consistent with how the
  post route destructures the result. ✓

## Test coverage (`tests/lib/instagram-credentials.test.ts` — 7 tests, all PASS)

| # | Scenario | Path covered | Result |
|---|---|---|---|
| 1 | env wins over body | desktop happy path | PASS |
| 2 | body wins, env `{}` | web/Vercel happy path | PASS |
| 3 | both missing | empty-string double-miss | PASS |
| 4 | partial env (account only) + body token | mixed partial | PASS |
| 5 | partial env (token only) + body account | mixed partial | PASS |
| 6 | undefined body, env present | env-only desktop | PASS |
| 7 | env keys present but `=== undefined` | Vercel process.env shape | PASS |

Test 7 is the most important edge case: on Vercel, `process.env` ships with all declared vars
as keys set to `undefined` rather than being absent entirely. The `??` operator handles both
shapes identically, and the test proves it.

**Missing test (acceptable):** No test for env key = `''` (empty string). This is acceptable
because the PATCH handler invariant (`v === '' → delete key from config.json`) guarantees env
vars are never set to `''` at runtime. The invariant is documented in the source file comment
and in the 2026-04-16 QA review. Encoding it in a test here would be redundant and might give
the wrong impression that the function is the enforcement point.

## Call-site audit

### `app/api/social/post/route.ts:174-176`
```ts
const { igAccountId: igAccountIdRaw, igAccessToken: igAccessTokenRaw } =
  resolveInstagramCredentials(process.env, credentials?.instagram);
if (!igAccessTokenRaw || !igAccountIdRaw) { throw new Error('Instagram credentials incomplete'); }
```
- [PASS] Passes `process.env` directly — compatible with `InstagramCredentialSources`. ✓
- [PASS] `credentials?.instagram` is optional-chained — body can be undefined safely. ✓
- [PASS] Guards both fields before use. ✓

### `app/api/social/best-times/route.ts:18-20`
```ts
const { igAccountId, igAccessToken: accessToken } =
  resolveInstagramCredentials(process.env, body);
if (!accessToken || !igAccountId) { return NextResponse.json({ ... }); }
```
- [PASS] Same pattern, graceful 200-return (not throw) on missing creds — correct for this
  route which falls back to research-backed defaults. ✓
- [NOTE] `body` is typed `{ accessToken?: string; igAccountId?: string }` which matches
  `InstagramCredentialBody`. Field names align. ✓

## E2E status — BLOCKED ON MAURICE

Live E2E test (real IG creds → uguu image host → Graph API container → publish → verify post)
**has not been run**. Requires Maurice to provide a live Facebook Page Access Token and a
connected Business Account ID in the Desktop Configuration panel.

**Action required:** Maurice runs through the manual verification checklist from the
2026-04-16 review (steps 1-8 under "Verification") using the current build.

Until that test completes, the unit-test gate is PASS but end-to-end confidence is ASSUMED
from the prior manual test (commit 4423ed3), not freshly verified.

## Gate Decision

**PASS (unit tests) / E2E PENDING** — Extraction is clean. Resolver logic is correct. Tests
cover all meaningful paths including the Vercel env-shape edge case. Both call-sites use the
helper correctly. No regressions detectable from static analysis. Live posting verification
is blocked on Maurice providing real credentials.

---

# QA Review — QA-INSTAGRAM (INSTAGRAM-CRED-FIX)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commits:** 4423ed3 (implementation), f737467 (docs + QA artifacts bundled)

## Root cause analysis

- [INFO] Maurice's report: IG creds and watermark settings wipe on every desktop restart.
- [INFO] Root cause correct: STORY-121's `resolve_port()` fallback fires when port 19782
  is already bound (zombie sidecar, second instance, dev tool). Webview navigates to a
  new `http://127.0.0.1:<ephemeral>` origin; IndexedDB reads an empty store for the new
  origin. Credentials previously entered are still on disk under the old origin but
  invisible to the new one.
- [INFO] This is a structural limitation of origin-scoped IDB — the full fix is a Tauri-
  command-backed file store (already flagged as STORY-121 followup). The scoped fix
  here correctly targets IG creds as the blocker. ✓

## Fix audit (4 files)

### `lib/desktop-config-keys.ts`
- [INFO] `INSTAGRAM_ACCOUNT_ID` and `INSTAGRAM_ACCESS_TOKEN` added to `DESKTOP_CONFIG_KEYS`.
  `DesktopSettingsPanel` auto-renders all entries in this list via `KeyField` — zero extra
  React code required. Reuses the proven config.json write path already used for
  `LEONARDO_API_KEY` and `ZAI_API_KEY`. ✓
- [INFO] Comment explains the migration rationale (IDB origin-scoping) directly in code.
  Future maintainers will understand why these keys live here. ✓

### `app/api/social/post/route.ts`
- [INFO] Env-first pattern:
  ```ts
  process.env.INSTAGRAM_ACCOUNT_ID   ?? credentials?.instagram?.igAccountId   ?? ''
  process.env.INSTAGRAM_ACCESS_TOKEN ?? credentials?.instagram?.accessToken    ?? ''
  ```
- [INFO] Desktop: env vars are set on sidecar boot by `tauri-server-wrapper.js` and kept
  live by `PATCH /api/desktop/config → process.env[k] = v.trim()`. Creds come from
  `config.json`, completely IDB-independent. ✓
- [INFO] Web (Vercel, `npm run dev`): `process.env.INSTAGRAM_*` is undefined → falls
  through to `credentials.instagram.*` (request-body path). Web deployment unchanged. ✓
- [INFO] `??` semantics correct: `PATCH` deletes empty-string keys from config.json
  (`v === '' → delete existing[k]` in the PATCH handler), so the env var is either a
  non-empty string or undefined — never an empty string that would block the fallback. ✓

### `app/api/social/best-times/route.ts`
- [INFO] Same env-first pattern applied. This route feeds the Smart Scheduler engagement
  cache — it was hitting the same credential-missing failure mode. ✓
- [INFO] Type assertion `as { accessToken?: string; igAccountId?: string }` is appropriate
  here — both fields are optional and the `??` chain handles undefined safely. ✓

### `components/SettingsModal.tsx`
- [INFO] IG credential inputs wrapped in `{isDesktop === false && (...)}`. On desktop,
  inputs are hidden — the duplicate IDB-backed field cannot shadow or confuse the
  `config.json`-backed DesktopSettingsPanel version. ✓
- [INFO] `isDesktop === false` (strict equality) — if `config` is still loading
  (`isDesktop` = undefined), the section is hidden rather than shown. Safe default. ✓
- [INFO] This is the same pattern used for the Leonardo key (STORY-130). Consistent. ✓

## What this does NOT fix (correctly scoped out)

- [INFO] Watermark settings (`enabled`, `image`, `position`, `opacity`, `scale`) still in
  IDB — correctly deferred. Base64 image URL is not suitable for `KeyField` / `process.env`
  injection. Requires the broader STORY-121 followup (Tauri-command-backed settings store).
- [INFO] Scheduled posts, carousel groups, pipeline state, saved personalities also still
  in IDB — same followup path. Developer has flagged this to Hermes as the next proposal.
- [INFO] One-time migration cost: users must re-enter IG creds once in the Desktop
  Configuration section. The old IDB values are orphaned but not deleted. Acceptable.

## Security
- [INFO] `config.json` at `%APPDATA%\MashupForge\config.json` — user-space, NTFS
  permissions inherit from APPDATA (user-only readable). Same security posture as
  `LEONARDO_API_KEY`. No new attack surface. ✓
- [INFO] `process.env.INSTAGRAM_*` is set on the server-side Node process only — never
  exposed to the client bundle or response bodies. ✓

## Verification
- [INFO] `npx tsc --noEmit` clean per developer review.
- [INFO] `npm test` — 78/78 passing. No new tests (plumbing change, not a testable pure
  function). Correct judgment call.

## Gate Decision

PASS — Correct scoped fix. Root cause correctly identified (STORY-121 ephemeral-port
fallback → IDB origin drift). Fix uses the proven `config.json` + env hydration path.
Web deployment unchanged. Desktop IG inputs hidden to prevent IDB shadowing. Watermark
and other IDB-backed settings correctly deferred to the STORY-121 followup. tsc clean,
tests passing.
