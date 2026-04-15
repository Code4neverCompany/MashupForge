# QA Review — STORY-133

**Status:** PASS
**Agent:** QA (Quinn)
**Date:** 2026-04-15
**Commit:** 2f715a2

## Findings

### `app/api/social/post/route.ts` — `parseJsonOrThrow()`

- [INFO] Root cause correct: Instagram Graph API and uguu return HTML error pages on rate limits, 5xx responses, and maintenance windows. Calling `.json()` directly on those bodies throws `"Unexpected token < in JSON at position 0"` with no actionable context.
- [INFO] `parseJsonOrThrow(res, context)` reads body as `res.text()` first, then `JSON.parse()`. On parse failure, throws with HTTP status + first 200 chars of raw body. Users and logs now see which endpoint failed and what the server actually returned. ✓
- [INFO] Empty body (`raw = ''`) returns `{}` rather than throwing — correct for APIs that return 204-style empty success. ✓
- [INFO] `raw.slice(0, 200).replace(/\s+/g, ' ').trim()` collapses whitespace before logging — HTML pages become legible in a single log line. Good for log parsers. ✓

### Call sites (5 wired)
- [INFO] `uguu image upload` — now includes HTTP status + description/error field from uguu's JSON. ✓
- [INFO] `IG Container` — single-image path. ✓
- [INFO] `IG Publish` — single-image publish. ✓
- [INFO] `IG Carousel Item` — per-item creation. ✓
- [INFO] `IG Carousel Container` + `IG Carousel Publish` — carousel assembly + publish. ✓
- [INFO] All 6 IG/uguu fetch calls now routed through the helper. Consistent treatment. ✓

### Note on `await new Promise(resolve => setTimeout(resolve, 5000))`
- [INFO] Two blind 5s sleeps remain in this diff (lines ~163 and ~215). These are the sleeps that FIX-101 (9300ce1) replaces with `waitForIgContainerReady()`. STORY-133 and FIX-101 are separate commits; FIX-101 is already gated. The final combined state has the sleeps replaced. No regression.

### Security
- [INFO] `parseJsonOrThrow` logs raw server response body. The snippet is bounded to 200 chars and written to server-side logs only (not returned to client). No PII surface expanded.

## Gate Decision

PASS — Correct fix for opaque `[object Object]` / `Unexpected token <` errors in Instagram posting. All IG and uguu fetch calls consistently wired. Empty-body edge case handled. Server logs now actionable.
