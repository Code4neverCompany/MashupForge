# Implementation Briefs — Open Bugs & Proposals
**Date:** 2026-04-22
**Author:** Research subagent
**Project:** MashupForge

---

## 1. MEDIUM-1: Caption error handling — no user-visible feedback on caption generation failure

### Status: ALREADY IMPLEMENTED (AUDIT-010 + AUDIT-011)

### What exists
The caption failure handling has been fully addressed in two prior audits:

**AUDIT-010 (caption fallback):** `lib/pipeline-processor.ts` lines 314-330 (carousel) and lines 427-440 (per-model). Both paths now:
- Catch errors from `generatePostContent()`
- Fall back to `expandedPrompt` as caption
- Log via `addLog('caption', idea.id, 'error', '...')` — both empty-result and throw cases
- Users see the fallback caption in the scheduled post, plus a pipeline log entry explaining what happened

**AUDIT-011 (pi pre-check):** `hooks/usePipelineDaemon.ts` lines 395-436. Before any pipeline work starts, a single fetch to `/api/pi/status` checks if pi is installed and running, logging a clear `pi-precheck` error if not. This gives Maurice a heads-up *before* 90s of image generation, rather than discovering the caption fallbacks scattered across the run log.

### No additional changes needed
The two audits together turn what was a silent 90-second debug session into a 5-second "pi is down" glance at the log. Test coverage exists in `tests/lib/pipeline-processor.test.ts` (caption failure test at line 140: `generatePostContent: vi.fn().mockRejectedValue(new Error('pi not running'))`).

---

## 2. MEDIUM-3: pi pre-check — no guard before sending requests if pi sidecar is not running

### Status: ALREADY IMPLEMENTED (AUDIT-011 + prompt route guard)

### What exists
Two layers of protection are in place:

**Layer 1 — Pipeline level:** `hooks/usePipelineDaemon.ts:395-436`
A `pi-precheck` fetches `/api/pi/status` once at pipeline start. Three outcomes:
- Not installed → error log
- Installed but not running → error log (includes last error)
- Running → success log

**Layer 2 — API route level:** `app/api/pi/prompt/route.ts:270-280`
The `/api/pi/prompt` route itself has a lazy-start guard:
```ts
if (!isRunning()) {
  await piStart();
}
```
If this throws (pi can't start), returns a 503 with a meaningful error message.

### No additional changes needed
The prompt route lazy-starts pi on demand. The pipeline pre-check warns early. Both are working.

---

## 3. PROP-013 RACE-1: Install lock for /api/pi/install race condition

### Status: ALREADY IMPLEMENTED (defense-in-depth mutex + QA-passed)

### What exists
**File:** `app/api/pi/install/route.ts:17-57`

An in-process mutex was added (commit `a95ceea`):
```ts
let installInFlight: Promise<ReturnType<typeof installPi>> | null = null;
// ...
if (!installInFlight) {
  installInFlight = Promise.resolve().then(() => installPi()).finally(() => {
    installInFlight = null;
  });
}
const result = await installInFlight;
```

**Analysis (PROP-013 review doc):** The original race is structurally impossible under the current `spawnSync` implementation — both `getPiPath()` and `installPi()` are synchronous, blocking the event loop. However, the mutex is valid defense-in-depth against future async refactors.

**QA (QA-PROP-013):** PASS. Correct lifecycle — `.finally()` clears sentinel, second callers share the same promise, no double-install risk.

### No additional changes needed
QA passed, fix is in place. The `installPi()` function is still sync (`spawnSync`), so the mutex is defensive but correct.

---

## 4. PROP-014 AUDIT-007b: persistCarouselGroup useCallback wrap

### Status: ALREADY IMPLEMENTED (DONE + lint-clean)

### What exists
**Files modified:**
- `hooks/useSettings.ts:135-142` — `updateSettings` wrapped in `useCallback([], [])` for stable identity
- `components/MainContent.tsx:671-687` — `persistCarouselGroup` wrapped in `useCallback` with deps `[settings.carouselGroups, updateSettings]`
- `components/MainContent.tsx:1217` — effect dep array updated to include `persistCarouselGroup`

The fix eliminated the last `react-hooks/exhaustive-deps` warning in the codebase. Lint is fully clean (0 errors, 0 warnings). The stable `updateSettings` upstream was the key fix — without it, `persistCarouselGroup` would also re-create every render even with `useCallback`.

### No additional changes needed
Both files are in place. The lint state is fully clean.

---

## 5. PROP-015 TASK-140: extractJsonFromLLM return type narrowing

### Status: ALREADY IMPLEMENTED (4-phase migration complete, QA-passed)

### What exists
**File:** `lib/aiClient.ts:140-173`

The original `extractJsonFromLLM` returning `any` was eliminated via a 4-phase migration:

1. **Phase 1:** Added typed sibling functions:
   - `extractJsonArrayFromLLM(raw): unknown[]` (line 163)
   - `extractJsonObjectFromLLM(raw): Record<string, unknown>` (line 168)
2. **Phase 2:** Migrated `useImageGeneration` callers
3. **Phase 3:** Migrated `MainContent.tsx` and `usePipeline.ts` callers
4. **Phase 4:** Renamed original to `parseJsonFromLLM` (private, unexported) — line 140

All callers now use typed helpers with explicit per-field narrowing (`typeof field === 'string' ? field : undefined`). No `as` casts needed.

**QA (QA-PROP-015):** PASS. All 4 phases include `tsc --noEmit` clean confirmation. 78/78 tests pass. No behavior change.

### No additional changes needed
Public API surface is fully typed. Original `any` helper is private.

---

## 6. PROP-010 FIX-102: Consolidate dual-store settings (localStorage + IDB)

### Status: PARTIALLY IMPLEMENTED — critical race fixed, full consolidation still open

### What exists (DONE)
**File:** `hooks/useSettings.ts`

The critical settings-reset bug (closure-timing race in `updateSettings`) was fixed via commit `5df7495` (Option B from PROP-010 doc):

- `updateSettings` is now synchronous pure `setState` (line 135-142) — no closure capture, no race
- `useEffect([settings, isSettingsLoaded])` persists to IDB after every committed state change (line 93-110), with debounce
- Load path has `typeof idbSettings === 'object'` guard (line 66) against corrupted `undefined` from prior race
- localStorage fallback with migration: reads localStorage, migrates to IDB, removes localStorage key (lines 58-63)
- `beforeunload` safety net: synchronous localStorage flush on page close (line 121-124)

**QA (PROP-010 QA):** PASS. Structural fix eliminates the race. Load guard prevents default-overwrite on mount.

### What remains (OPEN — PROP-010 umbrella)
The **dual-store consolidation** between IDB and `~/.config/MashupForge/config.json` is still open:

**Current architecture:**
- `hooks/useSettings.ts` — reads/writes non-secret settings to IndexedDB (`mashup_settings`)
- `components/DesktopSettingsPanel.tsx` — reads/writes API keys to `config.json` via `/api/desktop/config`
- Both exist on desktop; `useSettings` has no knowledge of `config.json`

**Why it matters:** API keys have two homes on desktop (IDB for web mode, config.json for Tauri env hydration). Story-130 mitigated Leonardo specifically, but other API keys (Instagram, Twitter, etc.) still have this split.

**What a consolidation would look like (NOT urgent — this is a UX/cleanup task):**
1. On desktop, `useSettings` could prefer `config.json` for API keys when desktop env is detected
2. Or: single source-of-truth could migrate to `config.json` for all desktop settings, with IDB as web-only fallback
3. Migration path: on first desktop load, merge IDB settings into config.json (or vice versa)

**Test file:** No dedicated test for useSettings exists yet. The PROP-010 investigation doc notes this should be written when PROP-011 (test harness) lands. Suggested mock of `idb-keyval`.

### No immediate action needed
The critical bug (settings reset) is fixed. The dual-store consolidation is a refactoring task for a future cycle.

---

## 7. PROP-022: Tauri updater signing key lifecycle hardening

### Status: NO MATCHING PROPOSAL FOUND — PROP-022 is "Route Bundle-Size Budget Fix"

### Finding
The item labeled "PROP-022: Tauri updater signing key lifecycle hardening" was migrated to `ESC-HUMAN-001` in E2-STATE and keeps the PROP-022 number for signing-key hardening. The bundle-size lazy-loading fix is tracked separately as **PROP-022-BUNDLE** (`docs/bmad/reviews/ROUTE-BUDGET-FIX.md`). PROP-022-BUNDLE is already resolved.

### Current updater signing state
The updater signing infrastructure is **already implemented and secure** (SEC-AUDIT-001):

**Source files:**
- `src-tauri/tauri.conf.json:63-69` — updater plugin config with endpoint + pubkey
- `.github/workflows/tauri-windows.yml` — CI passes `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `components/UpdateChecker.tsx` — in-app update check/download/install UI

**Security audit finding (SEC-AUDIT-001 §5): CLEAR**
- pubkey is valid minisign key (`E7822E2491229C6A`)
- `tauri-plugin-updater` v2 enforces signature verification before install
- Private key lives only in GitHub Actions secret
- Endpoint is HTTPS (GitHub CDN) — no MITM risk
- Even manifest replacement requires private key to produce valid `.sig`

### If the intent is to harden the key lifecycle (not yet tracked)
Potential enhancements (would need a new PROP number):
1. **Key rotation playbook** — documented procedure for rotating the minisign key pair (generate new, update `pubkey` in tauri.conf.json, update GH secret, release with both old+new sigs during transition)
2. **Key expiry check** — CI step that warns if the key has been in use for >N months
3. **Backup key** — store a second pubkey in the config as a fallback during rotation
4. **Audit logging** — log when the updater checks, what version it sees, signature pass/fail

These are nice-to-have operational hardening items. No code bugs or security vulnerabilities exist in the current implementation.

---

## Summary Table

| Item | Status | Source Files | Tests | Action |
|------|--------|-------------|-------|--------|
| MEDIUM-1 Caption errors | DONE | `lib/pipeline-processor.ts`, `hooks/usePipelineDaemon.ts` | `pipeline-processor.test.ts` | None |
| MEDIUM-3 pi pre-check | DONE | `hooks/usePipelineDaemon.ts:395-436`, `app/api/pi/prompt/route.ts:270-280` | — | None |
| PROP-013 RACE-1 mutex | DONE | `app/api/pi/install/route.ts:17-57` | — | None |
| PROP-014 useCallback | DONE | `hooks/useSettings.ts:135-142`, `components/MainContent.tsx:671-687` | — | None |
| PROP-015 type narrowing | DONE | `lib/aiClient.ts:140-173` | — | None |
| PROP-010 FIX-102 | PARTIAL | `hooks/useSettings.ts` | None yet | Dual-store consolidation deferred |
| PROP-022 updater signing (ESC-HUMAN-001) | N/A | `src-tauri/tauri.conf.json`, `UpdateChecker.tsx` | — | New PROP needed if hardening desired |
| PROP-022-BUNDLE bundle-size fix | DONE | `docs/bmad/reviews/ROUTE-BUDGET-FIX.md` | — | None |
