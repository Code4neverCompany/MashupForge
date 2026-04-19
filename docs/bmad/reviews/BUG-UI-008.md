# BUG-UI-008 — "Instagram credentials not detected despite being saved"

**Status:** done — single source of truth wired everywhere
**Classification:** routine
**Severity:** medium (false-negative health signal; misleads the user)

## Bug as reported

> "IG shows 'Broken Missing credentials' even though credentials are
> saved. Credential detection broken."
> Acceptance: "IG credentials detected. Health dot shows green."

The sidebar `HealthStrip` rendered the Instagram dot in the `broken`
state with hover-detail "Missing credentials — platform enabled in
pipeline" even though the user had configured Instagram via the
desktop settings panel.

## Root cause

`components/platform/HealthStrip.tsx:119-123` (pre-fix):

```typescript
const credsPresent = Boolean(
  p.key === 'discord'
    ? settings.apiKeys?.discordWebhook
    : settings.apiKeys?.[p.key],
);
```

This naive check has two distinct problems:

### 1. Ignores desktop config.json (the user-visible bug)

In the Tauri shell, credentials persisted via the desktop settings
panel land in `~/.config/<app>/config.json`, exposed to the React
layer through `useDesktopConfig()` as boolean presence flags. They
do **not** populate `settings.apiKeys.instagram` (which is the
IDB-backed UserSettings store). For a user who configured IG via the
desktop panel, `settings.apiKeys?.instagram` is `undefined`,
`Boolean(undefined)` is `false`, and the strip declares the platform
"broken." Exactly the reported symptom.

This is the same class of bug that `lib/platform-credentials.ts`
(V041-HOTFIX-IG) was created to centralise. The header comment on
that file even calls out the historical pattern:

> Pre-fix, PipelinePanel and pipeline-processor each had their own
> answer. … desktop users with IG creds in config.json saw "No
> platforms configured".

`HealthStrip` (and `DailyDigest.platformHealth`) were two more
copies of the same naive check that had been missed in the original
sweep.

### 2. Empty-string fields read as configured (latent false positive)

`settings.apiKeys.instagram` is the object `{ accessToken; igAccountId }`.
A partially-filled or persisted-then-cleared object
(`{ accessToken: '', igAccountId: '' }`) is still a non-null object,
so `Boolean(...)` is `true`. The strip would have shown the platform
as configured even though no actual token is present. Same for
twitter and pinterest.

## Fix shipped

Both surfaces now route through the canonical helper.

### `components/platform/HealthStrip.tsx`

```typescript
const { credentials: desktopCreds } = useDesktopConfig();
…
const credsPresent = isPlatformConfigured(p.key, settings, desktopCreds);
```

`isPlatformConfigured` (`lib/platform-credentials.ts:30`) already
implements the correct logic for all four platforms:
- Reads `settings.apiKeys?.<platform>?.<field>` (so empty-string
  fields fail the check).
- Falls back to the `desktopCreds.has<Platform>*` flags.
- Returns the explicit OR of those two sources.

The `useMemo` dep array updates from
`[scheduledPosts, pipelinePlatforms, apiKeys]` to
`[settings, desktopCreds]` so the recompute fires when desktop
creds resolve from the async `fetch('/api/desktop/config')` (the
hook starts with `EMPTY_FLAGS` and fills in once the GET returns).

### `components/ideas/DailyDigest.tsx`

The Daily Digest's footer-row platform health computation
(`components/ideas/DailyDigest.tsx:185-191`) had a near-identical
copy of the naive check. Same fix applied — wire `useDesktopConfig`
+ `isPlatformConfigured`. Now the digest's small per-platform
indicators agree with the sidebar strip and with the rest of the
app.

## Verification

- `npx tsc --noEmit` → exit 0.
- `vitest run` → 456/456 pass via the pre-commit hook.
  `tests/lib/platform-credentials.test.ts` already exercises both
  the IDB-stored and desktop-fallback cases (since V041-HOTFIX-IG),
  so the helper itself is well-covered. The new consumers inherit
  that coverage by composition.
- `tests/integration/pipeline-platform-detection.test.ts` covers
  the empty-string-fields case end-to-end at the pipeline layer.
- Cannot run dev server visual smoke from WSL; both edits are pure
  function-call substitutions and one new hook subscription per
  file.
- Behaviour-equivalence:
  - For users with IDB-stored credentials (web build): both old and
    new check agree (object truthy + fields present).
  - For users with desktop-config credentials (Tauri shell): old
    returned `false`, new returns `true`. **This is the fix.**
  - For users with partially-filled IDB objects (rare, only via
    devtools): old returned `true`, new returns `false`. Now
    consistent with the rest of the app's gating logic.

## Files touched

### Production
- `components/platform/HealthStrip.tsx` — added 2 imports
  (`useDesktopConfig`, `isPlatformConfigured`); replaced the inline
  Boolean check with `isPlatformConfigured` and threaded
  `desktopCreds`. ~7 LOC delta.
- `components/ideas/DailyDigest.tsx` — same wire-up for the digest's
  `platformHealth` block. ~6 LOC delta.

### Docs
- `docs/bmad/reviews/BUG-UI-008.md` (this file).

## Out of scope

- **Active credential validation** (e.g., ping IG Graph API on
  mount to detect expired tokens). The HealthStrip header comment
  already flags this as a separate future PROP. Out of scope for
  a routine BUG-UI fix.
- **Sweeping the codebase for any remaining naive checks.** The
  two known live sites are now fixed. A wider audit would be a
  proposal-tier task; if Hermes wants it, file a follow-up.
- **`useDesktopConfig` SSR / non-Tauri behaviour.** Hook already
  handles fetch failure (sets `EMPTY_FLAGS`) and non-desktop builds
  (returns `isDesktop: false` + `EMPTY_FLAGS`). No changes needed.

## Hermes inbox envelope

```
{"from":"developer","task":"BUG-UI-008","status":"done","summary":"HealthStrip dot for IG (and DailyDigest's footer health row) showed 'Missing credentials' for Tauri-shell users who configured IG via the desktop settings panel. Root cause: both surfaces had a naive Boolean(settings.apiKeys?.[p.key]) check that (a) doesn't consult desktop config.json (where Tauri-shell users' creds live) and (b) treats {accessToken:'',igAccountId:''} as configured. Fix: route both through the canonical lib/platform-credentials.isPlatformConfigured(p.key, settings, desktopCreds) helper that already exists (V041-HOTFIX-IG). Wired useDesktopConfig() in both components to source the desktop credential flags. ~13 LOC across 2 files. Both old and new checks agree for IDB-stored creds; desktop-config users now correctly read as configured (the fix); partially-filled empty-string objects now correctly read as not configured (latent false positive removed). useMemo dep arrays updated so the recompute fires when desktop creds resolve from the async config fetch. Pre-commit green (456/456). Doc at docs/bmad/reviews/BUG-UI-008.md."}
```
