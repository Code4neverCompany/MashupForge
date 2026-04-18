# V030-007 follow-up — Wire Leonardo model param spec into smart pre-fill

**Status:** done
**Date:** 2026-04-18

## Why

Maurice provided an authoritative `model-params.json` spec for all 6
Leonardo models (3 image, 3 video). The Studio tab's smart pre-fill
needs to respect these exact values so the suggestion it pre-fills
actually matches what the Leonardo v2 API accepts — otherwise we'd
suggest, e.g., `16:9` for a landscape prompt on a model that only
accepts `1024x1024` and the API would reject or silently normalize.

## What changed

### New — `LEONARDO_MODEL_PARAMS` (types/mashup.ts)

Authoritative per-model spec keyed by model id, matching the
`model-params.json` shape exactly:

- **Image models:**
  - `gpt-image-1.5` — 1024×1024, quality LOW/MEDIUM/HIGH,
    supports image reference, prompt_enhance OFF
  - `nano-banana-2` — 1024×1024, style_ids
  - `nano-banana-pro` — api_name **gemini-image-2**, 1024×1024, style_ids

- **Video models:**
  - `kling-3.0` — 1920×1080, 5s, mode RESOLUTION_1080, audio,
    start-frame only
  - `kling-o3` — api_name **kling-video-o-3**, 1920×1080, 3s,
    audio, start-frame only
  - `veo-3.1` — api_name **VEO3_1**, 1920×1080, 8s, start-frame +
    end-frame

Type definitions: `LeonardoImageModelSpec`, `LeonardoVideoModelSpec`,
and a `LeonardoModelSpec` discriminated union.

### New — `LEONARDO_VIDEO_MODELS` (types/mashup.ts)

First-class video model configs (id, name, apiModelId, duration,
dimensions, frame-support flags, motion_has_audio). Analogous to
`LEONARDO_MODELS` but tailored for the video-generation path. Makes
the three video models discoverable from a single import.

### Updated — `lib/param-suggest.ts`

- New optional input `modelParams` defaulting to `LEONARDO_MODEL_PARAMS`.
- **Aspect-ratio constraint:** after the top-N models are chosen, if
  every selected image model only supports `1024x1024` we override any
  keyword-derived ratio back to `1:1` and explain why (e.g.
  `"16:9 unsupported — gemini-image-2 only accepts 1024×1024"`).
- **Quality suggestion:** when a top-ranked model has a `quality`
  capability (only `gpt-image-1.5` today), emit a `quality` field —
  `HIGH` if the prompt contains a detail keyword, `MEDIUM` otherwise.

### Updated — `components/ParamSuggestionCard.tsx`

- Quality row rendered in view mode when `suggestion.quality` is present.
- Quality dropdown rendered in edit mode, labeled
  `Quality (gpt-image-1.5)` so the user understands when it applies.
- Quality included in the `onApply` options payload.

### Updated — `tests/lib/param-suggest.test.ts`

- Existing keyword-heuristic tests pass `modelParams: {}` to isolate
  the heuristic from the spec constraint (the spec behavior has its
  own dedicated block).
- New block `per-model spec constraints` adds 4 cases:
  - Forces `1:1` when every selected model only supports 1024×1024
  - Suggests `HIGH` quality for detail keywords + `gpt-image-1.5`
  - Suggests `MEDIUM` quality by default with `gpt-image-1.5`
  - Omits quality when no selected model supports it

## Acceptance criteria — verification

| AC | Evidence |
|---|---|
| Each model has specific width/height/quality/duration | `LEONARDO_MODEL_PARAMS` holds the exact spec for all 6 models. |
| Image models 1024×1024, quality options (gpt-image-1.5), style_ids (nano-banana) | Spec matches; `gpt-image-1.5` exposes `quality: ['LOW','MEDIUM','HIGH']`; both nano-banana variants carry `style_ids: true`. |
| Video models 1920×1080, durations (kling 5s, kling-o3 3s, veo 8s) | `LEONARDO_VIDEO_MODELS` entries carry exact durations; `LEONARDO_MODEL_PARAMS` mirrors them. |
| nano-banana-pro API name = gemini-image-2 | `LEONARDO_MODELS` entry already set; spec entry also carries `api_name: 'gemini-image-2'`. |
| kling-o3 API name = kling-video-o-3 | `LEONARDO_VIDEO_MODELS` entry's `apiModelId: 'kling-video-o-3'`. |
| veo-3.1 API name = VEO3_1 | `LEONARDO_VIDEO_MODELS` entry's `apiModelId: 'VEO3_1'`. |
| param-suggest + model config updated | `lib/param-suggest.ts` consumes the spec and constrains suggestions accordingly. |
| Studio tab pre-fills CORRECT dimensions | When selected models only support 1024×1024, the suggestion engine forces `1:1`; quality only appears when gpt-image-1.5 is in the shortlist. |
| tsc clean | `npx tsc --noEmit` — no errors. |
| Tests pass | 24 files / 262 tests passing (was 258; added 4). |

## Notes

- The existing `LEONARDO_MODELS` `aspectRatios` list is unchanged — it's
  still used by `useComparison.ts` / `useImageGeneration.ts` for
  dimension lookup. The new spec is additive: smart pre-fill
  constrains what it *suggests*, but the UI can still expose
  per-model ratios if/when the API ever opens up beyond 1024×1024.
- Video models aren't selectable from the Compare tab today; the
  config is in place for future video-generation flows.
