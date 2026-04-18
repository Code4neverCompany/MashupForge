/**
 * V030-008: Leonardo.AI v2 parameter specs for all six production
 * models (3 image, 3 video). Fed to pi.dev so the model-selection
 * reasoner can see the full parameter surface — which knobs each
 * model exposes and what values each knob accepts — rather than a
 * lossy compiled matrix.
 *
 * IMPORTANT: this intentionally OMITS the sample curl requests from
 * the upstream docs. Those samples contain specific prompt strings,
 * style_ids, and image IDs that are meaningless as guidance — pi
 * should not treat them as templates. Only the parameter catalogs
 * (accepted values, dimensions, style IDs, required vs optional) are
 * passed through so pi reasons from options, not from examples.
 */

export const LEONARDO_API_DOCS = `
========================================================================
# GPT Image-1.5
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v2/generations
Model identifier: "gpt-image-1.5"

## Parameters
- model (string, required): "gpt-image-1.5".
- prompt (string, required).
- quality (string, optional): LOW | MEDIUM | HIGH.
- mode (string, optional): FAST | QUALITY | ULTRA.
- prompt_enhance (string, optional): ON | OFF. App default: ON.
- quantity (integer, optional).
- width (integer, optional).
- height (integer, optional).
- seed (integer, optional).
- public (boolean, optional).
- guidances.image_reference (array, optional, up to 6): each entry
  has image.id, image.type (GENERATED|UPLOADED), strength (LOW|MID|HIGH).

## Aspect Ratio Settings (width × height)
| Aspect Ratio | Width | Height |
| 2:3          | 1024  | 1536   |
| 1:1          | 1024  | 1024   |
| 3:2          | 1536  | 1024   |

========================================================================
# Nano Banana 2
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v2/generations
Model identifier: "nano-banana-2"

## Parameters
- model (string, required): "nano-banana-2".
- prompt (string, required).
- prompt_enhance (string, optional): ON | OFF. App default: ON.
- quantity (integer, optional, default 1, max 8).
- width, height (integer, optional): see valid pairs table.
- seed (integer, optional).
- public (boolean, optional).
- style_ids (array of UUID, optional): preset style identifiers.
- guidances.image_reference (array, optional, up to 6): each image.id,
  image.type (GENERATED|UPLOADED), strength (LOW|MID|HIGH).

## Dimensions (width × height)
| AR    | 1K          | 2K           | 4K           |
| 1:1   | 1024 × 1024 | 2048 × 2048  | 4096 × 4096  |
| 2:3   | 848  × 1264 | 1696 × 2528  | 3392 × 5056  |
| 3:2   | 1264 × 848  | 2528 × 1696  | 5056 × 3392  |
| 3:4   | 896  × 1200 | 1792 × 2400  | 3584 × 4800  |
| 4:3   | 1200 × 896  | 2400 × 1792  | 4800 × 3584  |
| 4:5   | 928  × 1152 | 1856 × 2304  | 3712 × 4608  |
| 5:4   | 1152 × 928  | 2304 × 1856  | 4608 × 3712  |
| 9:16  | 768  × 1376 | 1536 × 2752  | 3072 × 5504  |
| 16:9  | 1376 × 768  | 2752 × 1536  | 5504 × 3072  |
| 21:9  | 1584 × 672  | 3168 × 1344  | 6336 × 2688  |

Width/height values 0,0 → match input reference aspect ratio.

## Style IDs (pick by name; UUIDs live in the app)
3D Render, Acrylic, Creative, Dynamic, Fashion, Game Concept,
Graphic Design 2D, Graphic Design 3D, Illustration, None, Portrait,
Portrait Cinematic, Portrait Fashion, Pro B&W Photography,
Pro Color Photography, Pro Film Photography, Ray Traced, Stock Photo,
Watercolor.

========================================================================
# Nano Banana Pro (API: gemini-image-2)
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v2/generations
Model identifier: "gemini-image-2".

## Parameters
Same parameter surface as Nano Banana 2. prompt_enhance ON|OFF
(app default ON). quantity default 1, max 8. style_ids array accepted.
guidances.image_reference same shape (up to 6 refs).

## Dimensions
Width and height individually validated; 0,0 = match input reference.
Default 1024×1024 when unspecified. Same aspect ratio table as
Nano Banana 2 (1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9 / 21:9).

## Style IDs
Same palette as Nano Banana 2.

========================================================================
# Kling 3.0 (video)
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v2/generations
Model identifier: "kling-3.0".

## Parameters
- model (string, required): "kling-3.0".
- prompt (string, required, ≤1500 chars).
- duration (number, required): 3 – 15 seconds.
- width, height (number).
- mode (string): RESOLUTION_720 (Standard) | RESOLUTION_1080 (Pro, default).
- motion_has_audio (boolean).
- public (boolean).
- guidances.start_frame (array, max 1): requires NO image_reference.
- guidances.end_frame (array, max 1): requires start_frame AND no image_reference.
- guidances.image_reference (array, up to 7; 4 with video ref):
  requires NO start_frame or end_frame.

## Dimensions
720p: 16:9 1280×720; 1:1 960×960; 9:16 720×1280.
1080p: 16:9 1920×1080; 1:1 1440×1440; 9:16 1080×1920.
When width/height omitted and start_frame given, dims follow the start frame.

========================================================================
# Kling O3 (API: kling-video-o-3)
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v2/generations
Model identifier: "kling-video-o-3".

## Parameters
- model (string, required): "kling-video-o-3".
- prompt (string, required, ≤1500 chars).
- duration (number, required): 3 – 15; max 10 if a video reference is used.
- mode: RESOLUTION_720 | RESOLUTION_1080 (default).
- motion_has_audio (boolean). Audio is stripped when a video reference is used.
- guidances.start_frame (array, max 1).
- guidances.end_frame (array, max 1).
- guidances.image_reference (array, up to 7; 4 with video ref).
- guidances.video_reference_base (array, max 1): id + type (GENERATED only);
  may be combined with image_reference.

## Dimensions
Same table as Kling 3.0.

========================================================================
# Veo 3.1 (API: VEO3_1 | VEO3_1FAST)
========================================================================

## Endpoint
POST https://cloud.leonardo.ai/api/rest/v1/generations-image-to-video
Model identifier: "VEO3_1" or "VEO3_1FAST".

## Parameters
- model (string): VEO3_1 | VEO3_1FAST.
- prompt (string).
- duration (number): 4 | 6 | 8.
- resolution: RESOLUTION_720 | RESOLUTION_1080.
- width, height (number).
- imageId (string): starting frame image id.
- imageType (string): UPLOADED | GENERATED.
- endFrameImage (object, optional): id + type; requires imageId/imageType.
- isPublic (boolean).

## Dimensions
720p 16:9 → 1280×720; 720p 9:16 → 720×1280.
1080p 16:9 → 1920×1080; 1080p 9:16 → 1080×1920.
Dimensions outside these are rejected. Uploaded images are cropped to fit.
`;
