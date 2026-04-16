---
name: CRED-AUDIT-001 — IDB credential exposure audit
description: Audit of which social platform credentials are still in origin-scoped IndexedDB and at risk of the STORY-121 ephemeral-port origin drift bug.
type: review
---
# CRED-AUDIT-001 — IDB credential exposure audit

**Date:** 2026-04-16
**Author:** developer
**Status:** AUDIT COMPLETE — findings documented, migration deferred to CRED-001

## Context

INSTAGRAM-CRED-FIX moved Instagram credentials from IDB to `config.json`.
This audit checks which other credentials are still IDB-only and exposed
to the same silent-wipe bug when port 19782 is unavailable.

## Safe (already in config.json)

| Credential | Config Key | Migrated By |
|---|---|---|
| Leonardo API Key | `LEONARDO_API_KEY` | Original DesktopSettingsPanel |
| Zai API Key | `ZAI_API_KEY` | Original DesktopSettingsPanel |
| Instagram Account ID | `INSTAGRAM_ACCOUNT_ID` | INSTAGRAM-CRED-FIX (f737467) |
| Instagram Access Token | `INSTAGRAM_ACCESS_TOKEN` | INSTAGRAM-CRED-FIX (614e8ec) |

## At risk (still IDB-only)

| Credential | IDB Path | Used By | Fields |
|---|---|---|---|
| Twitter/X | `apiKeys.twitter` | `social/post` L281–288 | `appKey`, `appSecret`, `accessToken`, `accessSecret` |
| Pinterest | `apiKeys.pinterest` | `social/post` L307–356 | `accessToken`, `boardId` |
| Discord Webhook | `apiKeys.discordWebhook` | `social/post` L370–382 | single URL string |

**Total: 7 credential fields across 3 platforms still in IDB.**

All three follow the same code path: client reads from `useSettings` →
IDB → passes via request body → `social/post/route.ts` reads from
`credentials?.{platform}`. On desktop, if the ephemeral-port fallback
fires, these credentials silently disappear.

## Proposed fix (CRED-001)

Same pattern as INSTAGRAM-CRED-FIX:

1. Add 7 keys to `DESKTOP_CONFIG_KEYS`:
   - `TWITTER_APP_KEY`, `TWITTER_APP_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
   - `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`
   - `DISCORD_WEBHOOK_URL`

2. Add env-first resolution in `social/post/route.ts` for each platform
   (same `process.env.X ?? credentials?.platform.field ?? ''` pattern).

3. Hide Twitter/Pinterest/Discord input sections on desktop in
   `SettingsModal.tsx` (same `{isDesktop === false && (...)}` pattern).

4. Add regression tests for the new keys in `desktop-config-keys.test.ts`.

**Classification:** complex (3+ files, new config keys, touches
SettingsModal UI). Lifted to CRED-001 for Hermes approval.

## Non-credential IDB data also at risk

For completeness, these non-credential settings also live in IDB and
are subject to the same origin-drift bug:

- `watermark` (enabled, image, position, opacity, scale)
- `agentPrompt`, `agentNiches`, `agentGenres`
- `channelName`, `savedPersonalities`
- `defaultLeonardoModel`, `defaultVideoModel`, `defaultAnimationDuration`
- Scheduled posts, carousel groups, pipeline state

These require the broader STORY-121 followup (Tauri-command-backed
settings store) since they don't fit the `KeyField` / env-var pattern.
