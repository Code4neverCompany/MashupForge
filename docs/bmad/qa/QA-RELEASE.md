# QA-RELEASE — Full Regression Test: 0.1.1 → 0.1.3

**Status:** PASS with one open note
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Scope:** All commits from `ac553a0` (v0.1.1) to `f36a60a` (v0.1.3)
**Commits:** 25 commits, 23 production source files changed (1,230 insertions / 104 deletions)

---

## Build Integrity

| Check | Result |
|---|---|
| `npx tsc --noEmit` | CLEAN ✓ |
| `npm test` | 107/107 PASS ✓ |
| `npm run build` | PASS ✓ |
| Turbopack NFT warning (`lib/pi-setup.ts`) | Pre-existing ✓ (predates v0.1.1) |

Build completes cleanly. The single Turbopack NFT trace warning is pre-existing — it originates from `lib/pi-setup.ts` using `path.join` for binary resolution, present since the pi.dev route was introduced. Not a regression.

---

## Security Surface (verified intact since v0.1.1)

### SEC-001 — SSRF allowlist (`app/api/proxy-image/route.ts`)
- `isAllowedUrl()` exported and in place at line 10. ✓
- Guard fires at line 31 before any fetch. ✓
- 14 regression tests still passing. ✓

### SEC-002 — Serverless guards (`lib/runtime-env.isServerless`)
- All four pi routes (install, start, stop, setup) import `isServerless` from
  `lib/runtime-env.ts` and return 503 when set. ✓

### SEC-003 — POSIX injection fix (`app/api/pi/setup/route.ts`)
- `spawnSync('tmux', [...args])` array form at lines 70–71. ✓
- No `execSync` with interpolated strings in the pi/setup route. ✓

### Token exposure note (carried from QA-IG-POSTING-FIX, QA-AUDIT-008)
`GET /api/desktop/config` returns `INSTAGRAM_ACCESS_TOKEN` to the browser
client. Desktop-only; existing threat model. **Refactor queued as
QA-AUDIT-008** — not a blocker for this release. ✓

---

## Settings Persistence (verified intact)

### PROP-010 — Race fix (`hooks/useSettings.ts:64–67`)
`isSettingsLoaded` guard prevents default-state write before IDB is read.
`useEffect` + committed state replaces the `setSettings(updater) → set(latest!)`
anti-pattern. ✓

### POLISH-018 — Deep-merge (`hooks/useSettings.ts:11–24`)
`mergeSettings()` at load path (lines 41, 45) strips undefined and one-level
deep-merges `watermark` and `apiKeys`. 8 regression tests lock the behavior.
`isSettingsLoaded` guard on persist effect prevents racing with load on new
origins. ✓

---

## Instagram Credential Flow (verified end-to-end)

### INSTAGRAM-CRED-FIX — Config.json persistence
`DESKTOP_CONFIG_KEYS` includes `INSTAGRAM_ACCOUNT_ID` and
`INSTAGRAM_ACCESS_TOKEN` (the original two IG keys that motivated this
fix). The list has since grown to 16 entries covering Leonardo, pi.dev
provider/model + per-provider API keys (ZAI/ANTHROPIC/OPENAI/GOOGLE),
Instagram, Twitter (4), Pinterest (2), and Discord — see
`lib/desktop-config-keys.ts` for the source of truth. ✓

### VERIFY-003 — `resolveInstagramCredentials()` (`lib/instagram-credentials.ts`)
Pure function — `env.INSTAGRAM_ACCOUNT_ID ?? body?.igAccountId ?? ''`.
Both `app/api/social/post` and `app/api/social/best-times` use
`resolveInstagramCredentials(process.env, body)`. No inline duplicate patterns.
7 regression tests. ✓

### IG-POSTING-FIX — `hasPlatformCreds` client gate
`useDesktopConfig` hook replaces `useIsDesktop` in MainContent. No orphaned
`useIsDesktop` imports in any component. `hasPlatformCreds('instagram')`
checks IDB first, then config.json fallback on desktop. ✓

---

## Reliability (verified)

### Fetch timeouts
All outbound fetches in `app/api/social/post/route.ts` have `AbortSignal.timeout(N)`:
- IG status poll: 10s ✓
- Uguu upload: 30s ✓
- IG container/publish/child: 15s ✓
- Twitter, Pinterest, Discord: 10–30s ✓

`app/api/leonardo-video/route.ts`: 30s timeout added (API-001). ✓

### Install mutex (PROP-013)
`installInFlight` promise dedup at `app/api/pi/install/route.ts:17`. ✓

---

## Code Quality

### Remaining console calls (13 total)
All are `console.error` in:
- Server-side API route catch blocks (error logging — appropriate) ✓
- `components/ErrorBoundary.tsx` (2× — React error boundary, appropriate) ✓
- `lib/pi-setup.ts:263` (critical install failure — appropriate) ✓

No `console.log` debug calls remain in production code. LOG-001 sweep intact. ✓

### Type narrowing (PROP-015)
`extractJsonFromLLM` removed from public API. Only typed exports remain:
`extractJsonArrayFromLLM(): unknown[]` and `extractJsonObjectFromLLM(): Record<string,unknown>`.
No call sites import the old name. ✓

### No orphaned hooks
`useIsDesktop` still exists as a file but no component imports it (replaced by
`useDesktopConfig` in the only consumer, MainContent). Not a leak — dead module
with no importers is harmless; build tree-shakes it. ✓

---

## Feature Inventory (0.1.1 → 0.1.3)

| Feature | Status | Gate |
|---|---|---|
| POLISH-016: pipeline log cap (50 entries) | PASS ✓ | AUDIT-011 |
| POLISH-018: settings deep-merge | PASS ✓ | QA-WATERMARK |
| PORT-001: port-conflict banner | PASS ✓ | QA-PORT-001 |
| INSTAGRAM-CRED-FIX + IG-POSTING-FIX | PASS ✓ | QA-INSTAGRAM + QA-IG-POSTING-FIX |
| SEC-001/002/003 security fixes | PASS ✓ | SEC-001-002-003 |
| UX-001 (Approve All), UX-002 (onError), UX-003/004 (copy) | PASS ✓ | QA-BATCH-UX |
| LOG-001/002 (log filter + noise reduction) | PASS ✓ | QA-BATCH-UX |
| AUDIT-050/UI-001/2a22291 (a11y + timeouts) | PASS ✓ | QA-BATCH-UX |
| NAV-001 + POLISH-019 (log labels + show/hide) | PASS ✓ | QA-BATCH-UX |
| STORY-024 splash screen | PASS ✓ | STORY-024 |
| STORY-094/095 loading state + mobile | PASS ✓ | STORY-024 |
| API-001 (Leonardo video timeout) | PASS ✓ | QA-BATCH-UX |
| VERIFY-003 (resolveInstagramCredentials helper) | PASS ✓ | QA-BATCH-UX |

---

## Open Items (non-blocking for release)

1. **QA-AUDIT-008**: Refactor `useDesktopConfig` to return boolean flags instead
   of raw token values — defense-in-depth, desktop-only scope.
2. **QA-AUDIT-005/006**: `useMemo` gaps in MainContent (performance, not correctness).
3. **STORY-121 followup**: Tauri-command-backed settings store — watermark and IDB-backed
   state still subject to origin drift on port fallback.
4. **PROP-021**: Gallery intersection-observer lazy loading (> 300 images threshold).

---

## Gate Decision

PASS — v0.1.1 → v0.1.3 regression clean. Build succeeds, tsc clean,
107/107 tests passing. All security fixes (SEC-001/002/003) verified intact.
Settings persistence race (PROP-010) and merge (POLISH-018) verified intact.
IG credential flow end-to-end verified (INSTAGRAM-CRED-FIX → IG-POSTING-FIX →
resolveInstagramCredentials). Four non-blocking follow-ups queued. No blockers.
