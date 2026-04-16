# CRED-001 — Migrate Twitter/Pinterest/Discord credentials to config.json

**Date:** 2026-04-16
**Status:** Done
**Classification:** Complex (Hermes-dispatched)

## Problem

On desktop, Twitter, Pinterest, and Discord credentials were only stored in
IndexedDB (origin-scoped). The same origin-drift bug that affected Instagram
(STORY-121 ephemeral port fallback) could silently wipe these credentials on
restart. Instagram was already migrated to config.json; the other three
platforms were not.

## Changes

### 1. `lib/desktop-config-keys.ts` — 7 new keys
Added TWITTER_APP_KEY, TWITTER_APP_SECRET, TWITTER_ACCESS_TOKEN,
TWITTER_ACCESS_SECRET, PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID,
DISCORD_WEBHOOK_URL. DesktopSettingsPanel auto-renders inputs for all of
these; tauri-server-wrapper.js hydrates them into process.env at sidecar boot.

### 2. `app/api/social/post/route.ts` — env-first credential resolution
All three platforms now use the same `process.env.X ?? credentials?.platform.field ?? ''`
pattern already established for Instagram. Desktop env vars take priority;
IDB-sourced body values are the web-mode fallback.

### 3. `components/SettingsModal.tsx` — hide Pinterest on desktop
Pinterest input section now wrapped with `{isDesktop === false && (...)}`,
matching the existing Leonardo and Instagram pattern. Twitter and Discord
never had input sections in SettingsModal (they're entered via
DesktopSettingsPanel on desktop).

### 4. `hooks/useDesktopConfig.ts` — new boolean flags
Added `hasTwitterCreds`, `hasPinterestCreds`, `hasDiscordCreds` to
`DesktopCredentialFlags`. Twitter requires all 4 OAuth keys present;
Pinterest and Discord each require their single token/URL.

### 5. `components/MainContent.tsx` + `components/PipelinePanel.tsx` — desktop-aware credential gates
Both `hasPlatformCreds` (MainContent) and `hasCreds` (PipelinePanel) now
check desktop credential flags as fallback when IDB keys are absent.
PipelinePanel gained the `useDesktopConfig()` hook import.

### 6. `tests/lib/desktop-config-keys.test.ts` — 3 new tests (10 total)
Regression tests lock all 7 new keys: Twitter×4, Pinterest×2, Discord×1.

## Files changed

| File | Change |
|------|--------|
| `lib/desktop-config-keys.ts` | +7 keys |
| `app/api/social/post/route.ts` | env-first resolution for Twitter/Pinterest/Discord |
| `components/SettingsModal.tsx` | Hide Pinterest inputs on desktop |
| `hooks/useDesktopConfig.ts` | +3 boolean flags |
| `components/MainContent.tsx` | Desktop-aware hasPlatformCreds for all platforms |
| `components/PipelinePanel.tsx` | Desktop-aware hasCreds + useDesktopConfig import |
| `tests/lib/desktop-config-keys.test.ts` | +3 tests for new keys |
| `tests/PROVENANCE.md` | Updated counts |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 110/110 pass
- **Needs Maurice**: rebuild .msi, enter Twitter/Pinterest/Discord creds in
  Desktop Settings panel, verify posting works from all platforms
