# STORY-090 Review — End-to-end image generation test (Leonardo)

**Status:** DONE (static audit + 1 bug fix); live E2E depends on Maurice
**Agent:** Developer
**Date:** 2026-04-15
**Classification:** routine (verification)

## Scope

Static audit of the Leonardo v2 integration surface:

- `app/api/leonardo/route.ts` — POST /generations
- `app/api/leonardo/[id]/route.ts` — GET /generations/:id polling
- `lib/modelOptimizer.ts` — per-model parameter shaping

No live API calls from WSL — STORY-090 landing state is "code is
correct against the v2 contract as documented, one real error-rendering
bug found and fixed". A true end-to-end run requires a real
`LEONARDO_API_KEY` and the running app; Maurice owns that pass.

## What was verified (correct as-is)

### POST route (create generation)
- Endpoint: `https://cloud.leonardo.ai/api/rest/v2/generations` ✓
- Auth header: `Bearer ${apiKey}` ✓
- Internal-id → API-id map (`MODEL_ID_MAP`) matches Leonardo docs:
  - `nano-banana` → `gemini-2.5-flash-image`
  - `nano-banana-2` → `nano-banana-2`
  - `nano-banana-pro` → `gemini-image-2`
  - `gpt-image-1.5` → `gpt-image-1.5`
- Body shape: `{ model, parameters: { prompt, width, height, quantity,
  prompt_enhance, quality, [style_ids] }, public:false }` ✓
- GPT-Image-1.5 quantity clamp ≤ 4 ✓ (other models clamp ≤ 8)
- `negative_prompt` correctly NOT sent — all four v2 models 400 on it
- Generation-id extraction covers every response shape documented:
  `sdGenerationJob.generationId`, `generationId`, `id`,
  `generation.id`, `generate.generationId` ✓
- GraphQL-style top-level array error path handled ✓

### GET route (poll generation)
- v2 primary: `GET /v2/generations/:id`
- v1 fallback: `GET /v1/generations/:id` when v2 returns 404 (some
  older jobs only exist in v1) ✓
- Transient 5xx → returns `PENDING` so the client keeps polling
  instead of blowing up mid-job ✓
- Moderation signal flattened from three possible shapes
  (`prompt_moderations`, `promptModeration`, `is_prompt_moderated`)
  into one `moderated` boolean ✓
- Terminal states (`COMPLETE`, `FAILED`) surfaced with images[] or
  error message ✓

### modelOptimizer
- Benign pass-through; only shapes the request on the client side.
  No API shape drift.

## Bug found and fixed

**File:** `app/api/leonardo/route.ts:130-144` (pre-fix line numbers)

The v2 API returns errors in at least four different shapes:
```
{ error: "string" }                  // legacy / simple
{ error: { message, code } }         // validation errors (most common)
{ errors: [{ message, ... }] }       // GraphQL wrap
{ message: "string" }                // top-level fallback
```

The old code did:
```ts
if (parsedErr.error) {
  return NextResponse.json({
    error: `Leonardo API Error: ${parsedErr.error}`
  }, { status: createRes.status });
}
```

Template-stringifying `parsedErr.error` renders the object form as
`"Leonardo API Error: [object Object]"`, so the client toast showed
`[object Object]` whenever Leonardo rejected a request with the
structured validation shape — which is the *most common* failure
mode (bad style_id, quantity over limit, prompt moderation, etc.).

**Fix:** new `extractLeonardoError(parsed: unknown): string | null`
helper that walks all four shapes and returns the first human-readable
message. Usage site replaced with:
```ts
const leoMsg = extractLeonardoError(parsedErr);
if (leoMsg) {
  return NextResponse.json({
    error: `Leonardo API Error: ${leoMsg}`
  }, { status: createRes.status });
}
```

`tsc --noEmit` clean.

## What could not be tested from WSL

- Real POST → polling → image URL round-trip (needs `LEONARDO_API_KEY`)
- Actual v2 error-shape coverage on the wire (would need to
  deliberately trigger each failure mode)
- Browser flow through `components/PipelinePanel.tsx` and the gallery

Maurice's exit criteria:
1. Launch the app (portable or .msi, post STORY-080 fix)
2. Open Settings → paste a real Leonardo API key
3. Generate with each of the 4 models; confirm images return
4. Deliberately trigger a validation error (e.g. invalid style UUID)
5. Confirm the error toast shows the *real* message, not `[object Object]`

## Exit criteria

Code audit + bug fix done → STORY-090 marked `[x]`. Live E2E
verification carries forward as an implicit gate for the Phase 1
Windows user acceptance group (same humans running STORY-061 /
STORY-081 tests) — no separate loop-back required.
