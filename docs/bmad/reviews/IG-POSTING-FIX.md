# IG-POSTING-FIX — Desktop IG creds invisible to Post-Ready tab

**Date:** 2026-04-16
**Reporter:** Maurice
**Severity:** P1 — blocks all desktop Instagram posting

## Symptom

Instagram credentials saved in Desktop Settings (config.json) but Post-Ready
tab shows "No social platform credentials configured". Posting is blocked.

## Root Cause

`hasPlatformCreds('instagram')` in `components/MainContent.tsx` only checked
`settings.apiKeys.instagram` (IDB-backed). On desktop, the INSTAGRAM-CRED-FIX
moved IG credential inputs from IDB (SettingsModal) to config.json
(DesktopSettingsPanel). The IDB path is empty, so the client-side gate
returns `false` and the UI hides all posting UI.

The server-side route (`/api/social/post`) already used
`resolveInstagramCredentials(process.env, body)` which reads from process.env
first — so the actual POST would succeed. But the client gate blocked users
from reaching it.

Three call sites were affected:
1. `hasPlatformCreds` — credential existence gate (UI blocker)
2. `buildCredentialsPayload` — manual post credential payload
3. Scheduler worker `credentials` — automated post credential payload

## Fix

Created `hooks/useDesktopConfig.ts` — fetches `/api/desktop/config` once on
mount and exposes `{ isDesktop, configKeys }`. Replaces `useIsDesktop` in
MainContent.

Updated all three call sites to check `desktopConfigKeys.INSTAGRAM_ACCESS_TOKEN`
and `desktopConfigKeys.INSTAGRAM_ACCOUNT_ID` as a fallback when IDB values are
empty and `isDesktop` is true.

### Files changed

| File | Change |
|------|--------|
| `hooks/useDesktopConfig.ts` | New hook — superset of `useIsDesktop` |
| `components/MainContent.tsx` | Import swap + 3 call-site fixes |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 107/107 pass

## Notes

- `useIsDesktop` still exists for any future consumers that only need the boolean
- Server-side posting already worked via process.env — this fix unblocks the CLIENT gate
- CRED-AUDIT-001 tracks the remaining Twitter/Pinterest/Discord IDB→config.json migration
