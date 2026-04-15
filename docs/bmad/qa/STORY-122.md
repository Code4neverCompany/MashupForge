# QA Review — STORY-122

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 33e04d2

## Findings

### Code quality
- [INFO] Three files (new route, new component, 1 embed). Scope appropriate for the feature.
- [INFO] `npx tsc --noEmit` clean.

### API route (`app/api/app/version-check/route.ts`)
- [INFO] GitHub 404 (no releases yet) handled gracefully — returns `updateAvailable: false`, `latest: null` at 200. This is the current repo state; banner shows "up to date" until a tag is cut. Correct.
- [INFO] Non-404 GitHub errors return 200 with `error` field — Settings UI degrades to amber "check failed" line, not a broken panel. ✓
- [INFO] 10-minute in-process TTL avoids GitHub anonymous rate limit (60 req/hour/IP). ✓
- [INFO] `compareVersions` zero-dep implementation handles `a.b.c[-pre]`. Sufficient for `0.x` versioning. Pre-release sorted lower than release. ✓
- [INFO] Current version sourced from `package.json` via typed import — build-time pinned, matches tauri.conf.json `0.1.0`. Single source of truth. ✓

### Component (`components/UpdateBanner.tsx`)
- [INFO] Four-state renderer (checking / up-to-date / available / error) — all states handled.
- [INFO] `isDesktop` guard in `DesktopSettingsPanel.tsx` ensures the banner never runs on Vercel/web. ✓
- [INFO] URL exposed in a read-only text input + Copy button — correct decision to avoid `tauri-plugin-opener` dependency. Clean STORY-123 followup path identified.
- [INFO] No `window.open()` — correct for WebView2 where external navigation behavior is unpredictable without explicit plugin wiring.
- [INFO] Collapsible `<details>` for release notes — no JS overhead, native HTML.

### Scope decisions (justified)
- [INFO] `tauri-plugin-updater` deferred — correct. Requires signing infrastructure, signed `latest.json` manifest, and CI secrets. No releases exist yet. Not asked for.
- [INFO] `tauri-plugin-opener` deferred — correct. Clean followup (STORY-123) identified.

### Security
- [INFO] Route fetches from `api.github.com` — no user-supplied input in the URL. No injection surface.
- [INFO] Response is parsed and specific fields extracted — no `eval`, no HTML injection into the component (string interpolation only). ✓

## Gate Decision

PASS — Version check route + UpdateBanner are correct and well-scoped. GitHub error handling is defensive. Plugin deferral decisions are sound and followup stories identified. TypeScript clean.
