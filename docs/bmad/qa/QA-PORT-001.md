# QA Review — PORT-001 (Port-conflict UI banner)

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-16
**Commit:** e02be42
**Files:** `components/PortConflictBanner.tsx` (new), `components/DesktopSettingsPanel.tsx`

---

## Findings

### `PortConflictBanner.tsx`
- [INFO] Detects port conflict via `window.location.port !== '19782'` on mount.
  Correct — the stable DESKTOP_PORT is IANA-unassigned 19782; any other port
  indicates the ephemeral fallback fired. ✓
- [INFO] Empty port string (`window.location.port === ''`) correctly treated as
  stable (HTTPS default port 443 case). In the web deployment the port is empty
  and the condition `port && port !== STABLE_PORT` correctly short-circuits to
  false — no spurious banner on Vercel. ✓
- [INFO] Banner only renders on mismatch (`if (!ephemeral) return null`). No
  visible impact on normal desktop or web operation. ✓
- [INFO] Copy explicitly calls out which data IS at risk (watermark, scheduled
  posts) and which is NOT (API keys, IG credentials). Accurate and useful. ✓
- [INFO] Amber warning style — consistent with other warning UI in the app. ✓

### `DesktopSettingsPanel.tsx`
- [INFO] `<PortConflictBanner />` placed before the `<UpdateBanner />` — correct
  position, shown near top of the Desktop Configuration section. ✓
- [INFO] Single import, no logic change to DesktopSettingsPanel itself. ✓

### What this addresses
This is the "silent WARN in startup.log" gap identified in the INSTAGRAM-CRED-FIX
root cause analysis. Users experiencing origin drift will now see a visible
amber banner in the settings modal instead of never knowing.

### Limitation (correctly in scope)
Banner only appears after the user opens the settings modal. Users who don't
open settings after a conflict-affected launch won't see it. A persistent
header banner would be more visible but involves more state management.
Acceptable for v0.1.x — the STORY-121 followup (Tauri-command-backed store)
eliminates the issue entirely.

---

## Gate Decision

PASS — Correct implementation. Detects ephemeral-port fallback accurately,
no false positives on web/Vercel, banner copy is accurate about affected/
unaffected data. Addresses the silent-failure gap from INSTAGRAM-CRED-FIX
root cause analysis.
