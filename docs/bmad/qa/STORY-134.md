# QA Review — STORY-134

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** eaf4e32

## Findings

### `components/UpdateBanner.tsx`

- [INFO] Primary CTA renamed from "Open in browser" → "Update Now" when a `.msi` asset URL is directly available (`info.downloadUrl`). Downloads the installer immediately instead of landing on the release page. Correct UX — eliminates one step for the user. ✓
- [INFO] Falls back to "Open release page" when `downloadUrl` is absent (e.g., CI still uploading assets). Appropriate degradation. ✓
- [INFO] Icon changed `ExternalLink` → `Download` for "Update Now" state. Semantic match. `ExternalLink` retained for the secondary "View release page" button. ✓
- [INFO] Description text updated: when `installerUrl` is present, explains download-then-run flow; when absent, explains that the asset is not yet attached. Removes ambiguity. ✓
- [INFO] Secondary "View release page" button added — shown only when both `installerUrl` AND `releasePage` are present. Allows checking changelogs without replacing the primary CTA. ✓
- [INFO] `disabled={!primaryTarget}` preserved — button is non-interactive when neither URL is available. ✓
- [INFO] `aria-label` updated to match current button action (`'Download installer now'` vs `'Open release page in browser'`). Accessibility correct. ✓

### Scope
- [INFO] Single file (`UpdateBanner.tsx`). No API shape changes, no new dependencies.
- [INFO] TypeScript clean (no new type surface — all fields already typed in the existing `UpdateInfo` interface).

## Gate Decision

PASS — UX improvement: primary CTA now triggers direct .msi download. Fallback to release page when asset absent. Accessibility labels updated. No regressions.
