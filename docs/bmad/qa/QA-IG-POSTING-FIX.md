# QA Review — QA-IG-POSTING-FIX (hasPlatformCreds config.json)

**Status:** PASS with security note
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** 6d5e0d6
**Files:** `hooks/useDesktopConfig.ts` (new), `components/MainContent.tsx` (3 sites updated)

---

## Problem

After INSTAGRAM-CRED-FIX moved IG creds from IDB to `config.json`, the
client-side `hasPlatformCreds('instagram')` still read only
`settings.apiKeys.instagram` (IDB-backed) — which is now always empty on
desktop. The UI gate blocked the Post button even though the server already
resolved creds from `process.env.INSTAGRAM_ACCESS_TOKEN` correctly.

---

## Fix audit

### `hooks/useDesktopConfig.ts` — new hook
- Fetches `GET /api/desktop/config` once on mount, cancelled on unmount. ✓
- Fallback on error: `{ isDesktop: false, configKeys: {} }` — safe default, no crash. ✓
- `cancelled` flag in the cleanup return — no stale setState after unmount. ✓
- Replaces `useIsDesktop` in MainContent — superset of that hook. ✓

### `components/MainContent.tsx` — three update sites

**hasPlatformCreds** — now checks both IDB and config.json keys:
```ts
if (settings.apiKeys.instagram?.accessToken && settings.apiKeys.instagram?.igAccountId) return true;
if (isDesktop && desktopConfigKeys.INSTAGRAM_ACCESS_TOKEN && desktopConfigKeys.INSTAGRAM_ACCOUNT_ID) return true;
return false;
```
Correct. IDB first (preserves web path), config.json fallback for desktop. ✓

**buildCredentialsPayload** — same fallback pattern for manual posts. ✓

**Auto-posting scheduler worker** — same fallback pattern for scheduled
posts. ✓ All three credential consumers are consistent.

---

## Security note [MEDIUM — desktop-only, in-scope]

`GET /api/desktop/config` returns the full `config.json` contents — including
`INSTAGRAM_ACCESS_TOKEN` (a real bearer token) — to the browser client.

**Attack surface assessment**:
- Endpoint is localhost-only (`127.0.0.1:19782`). Vercel returns `{ isDesktop: false, keys: {} }`. ✓
- Any local process could already read `config.json` directly from
  `%APPDATA%\MashupForge\config.json`. No new filesystem exposure.
- `DesktopSettingsPanel` already displays these key values in `<input>` fields
  (user can click "show"). Token is already in browser DOM.
- Token appears in DevTools Network tab response and in React component state.

**Redundancy**: The server POST route already reads `process.env.INSTAGRAM_ACCESS_TOKEN`
first (`??` chain). The token sent in the client POST body is never used when
`process.env` is set. The client fetches and forwards a token it doesn't
strictly need to forward.

**Recommendation** (non-blocking, future task):
Refactor `useDesktopConfig` to return boolean presence flags
(`{ hasInstagramToken: boolean, hasAccountId: boolean }`) rather than raw
token values. The server already has the tokens in `process.env`; the client
only needs to know *whether* they exist for UI gating.

This is a defense-in-depth improvement, not a blocking security issue.
Queue as **QA-AUDIT-008** for Developer.

---

## Gate Decision

PASS — Correct scoped fix. Client UI gate now reflects server credential
state on desktop. All three consumer sites (hasPlatformCreds, manual post,
scheduler worker) updated consistently. Security note (token in client state)
is within the existing desktop threat model; follow-up queued as QA-AUDIT-008.
