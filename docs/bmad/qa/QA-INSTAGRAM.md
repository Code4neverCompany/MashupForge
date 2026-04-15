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
