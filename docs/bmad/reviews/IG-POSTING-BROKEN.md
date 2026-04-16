# IG-POSTING-BROKEN — Instagram posting + auto-scheduling fail despite valid credentials

**Date:** 2026-04-16
**Reporter:** Maurice
**Severity:** P1 — all Instagram posting is broken

## Symptom

Credentials are saved and recognized (IG-POSTING-FIX confirmed working), but:
- Manual "Post Now" fails with an error
- Auto-scheduler marks posts as "failed"
- Error messages present in the UI

## Root Cause: Graph API v19.0 Deprecated

The posting route (`app/api/social/post/route.ts`) hardcoded Meta Graph API
version `v19.0` in all 6 Instagram API calls:
- Container creation (`/{igAccountId}/media`)
- Container status polling (`/{containerId}?fields=status_code`)
- Media publish (`/{igAccountId}/media_publish`)
- Carousel item creation, carousel container, carousel publish

Meta Graph API v19.0 was released January 2024 and followed the standard
2-year deprecation lifecycle, meaning it was deprecated in **January 2026**.
We are now April 2026 — 3 months past deprecation. Deprecated API versions
return error responses that cause `parseJsonOrThrow` to surface unhelpful
error messages to the user.

Auto-scheduling inherits the same failure: the scheduler worker at
`MainContent.tsx:1047` calls the same `/api/social/post` endpoint.

## Additional Risk: uguu.se Dependency

Instagram requires a public image URL (no base64). The route uploads images
to `uguu.se/upload.php` as a temporary host. If uguu.se is down or changes
their API, posting fails before even reaching the IG API. This is a separate
fragility point that should be tracked independently.

## Fix

Extracted `IG_GRAPH_API_VERSION = 'v21.0'` constant at the top of the post
route. All 6 hardcoded `/v19.0/` paths now use the constant. v21.0 was
released September 2024 and should remain active until September 2026.

### Files changed

| File | Change |
|------|--------|
| `app/api/social/post/route.ts` | `v19.0` → `v21.0` via constant (6 call sites) |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 107/107 pass
- **Needs manual verification by Maurice**: Post an image from the desktop
  app to confirm IG API accepts v21.0 calls with his token.

## Why auto-scheduling is also broken

The auto-scheduling worker (`MainContent.tsx:1045-1175`) calls the exact same
`/api/social/post` endpoint. It's not a separate bug — any posting failure
propagates to scheduled posts, which get marked `status: 'failed'`.

## Follow-up items

1. **Token validation**: If posting still fails after the version upgrade,
   check token expiry and permissions (`pages_content_publish`,
   `instagram_content_publish`). The route already rejects IGQ (Basic
   Display) tokens at line 175.
2. **uguu.se resilience**: Consider a self-hosted or more reliable image
   hosting solution (S3 pre-signed URLs, Cloudflare R2, etc.)
3. **Version monitoring**: Add the API version to a config constant or
   environment variable so it's trivial to bump without a code change.
