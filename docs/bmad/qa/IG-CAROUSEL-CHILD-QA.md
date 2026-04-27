# QA Review — IG Carousel Child media_type Fix

| Field       | Value                                         |
|-------------|-----------------------------------------------|
| Task        | QA-IG-CAROUSEL-CHILD                          |
| Commit      | 5ebb227                                       |
| Reviewer    | Quinn (QA)                                    |
| Date        | 2026-04-27                                    |
| Gate        | **PASS**                                      |
| Confidence  | 0.95                                          |

---

## Bug confirmed

**File:** `app/api/social/post/route.ts:261` (pre-fix)

```ts
body: JSON.stringify({ image_url: url, is_carousel_item: true }),
```

Instagram Graph API requires `media_type` on every carousel child
container request. Without it the API returns:
> "Only photo or video can be accepted as media type"

`is_carousel_item: true` alone is not sufficient — the API does not
infer the type from the carousel context.

---

## Fix reviewed (commit 5ebb227)

```ts
// FIX-IG-CAROUSEL-CHILD: Graph API rejects carousel children
// without an explicit `media_type` ("Only photo or video can
// be accepted as media type"). is_carousel_item alone does
// not let the API infer the type. We only handle image
// carousels in this branch (igMediaUrls filters above) so
// IMAGE is correct; reels/video carousels would need VIDEO +
// a separate upload flow we don't support yet.
const childRes = await fetch(`.../${igAccountId}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
  body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true }),
  signal: AbortSignal.timeout(15000),
});
```

| Check | Result |
|---|---|
| `media_type: 'IMAGE'` added to carousel child payload | ✓ |
| Placement: before `image_url` (clean field order) | ✓ |
| Value `'IMAGE'` is correct for photo carousel children | ✓ |
| Comment explains why and notes the video-carousel gap | ✓ |
| Carousel container payload still uses `media_type: 'CAROUSEL'` (line 280) — untouched, correct | ✓ |
| Only the child loop was modified; container + publish steps unchanged | ✓ |
| TypeScript: `npx tsc --noEmit` — clean | ✓ |
| Tests: 892 / 892 pass | ✓ |

---

## Scope note

This branch only reaches `igMediaUrls.length > 1` for photo carousels
(video media is handled separately upstream). `media_type: 'IMAGE'` as a
literal is therefore unconditionally correct here. A future video-carousel
path would need `'VIDEO'` plus an upload container step; that is out of
scope and correctly called out in the comment.

---

## INFO — No unit test for carousel child payload shape

The `/api/social/post` route makes live `fetch` calls to Instagram's
Graph API; there are no route-level tests that mock `fetch` and assert
the request body. The fix is verified by the IG API error disappearing in
production. Adding a fetch-mock test would pin the payload contract and
catch regressions, but is a separate story from this bugfix.

---

## Gate decision

**PASS**

Minimal, surgical fix. Correct field and value, comment explains the
constraint and the video-carousel limitation. No regressions (892/892,
tsc clean). The pre-existing gap in API payload test coverage is noted as
INFO — not introduced by this commit.
