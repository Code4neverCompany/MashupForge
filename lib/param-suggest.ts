/**
 * V030-007: smart parameter pre-fill.
 * V030-008: AI-driven variant on top of the rule-based engine.
 * V030-008-per-model: parameters are now produced PER MODEL. Each
 * shortlisted model gets its own optimal aspect ratio, dimensions,
 * quality, style, prompt-enhance flag (image) or duration / mode /
 * motion-audio knob (video) — calibrated against THAT model's API
 * surface. Where the AI variant runs, pi.dev is called once per model
 * in parallel, each call seeing only that model's API doc slice.
 *
 * Two entry points:
 *
 *   `suggestParameters(input)` — pure, deterministic rule engine. Runs
 *   instantly, no network. Drives tests and serves as the fallback
 *   when pi.dev is unreachable. Emits a per-model map plus a "best
 *   shared" view derived from the first model (back-compat with the
 *   existing card / apply path).
 *
 *   `suggestParametersAI(input)` — async. Calls the rule engine to
 *   pick a model shortlist, then fires one pi.dev call per model in
 *   parallel. Each call gets only that model's API doc slice so pi
 *   reasons about a single model's capabilities. Per-model failures
 *   fall back to the rule engine's perModel entry so the user always
 *   sees a populated card.
 */

import type {
  GeneratedImage,
  LeonardoModelConfig,
  LeonardoModelSpec,
  LeonardoImageModelSpec,
  LeonardoVideoModelSpec,
} from '@/types/mashup';
import { LEONARDO_MODEL_PARAMS } from '@/types/mashup';
import { streamAIToString, extractJsonObjectFromLLM } from './aiClient';
import {
  LEONARDO_API_DOCS,
  LEONARDO_API_DOCS_BY_MODEL,
} from './leonardo-api-docs';
import { getModelSpec, getAllModelSpecs } from './model-specs';

/**
 * Preamble for every pi.dev parameter-selection prompt. Teaches pi how
 * to read the structured spec blocks below — capabilities tell it what
 * a model CAN and CANNOT do, and rules expose hard constraints.
 * Critical: when `capabilities.styles` is false the model has no style
 * parameter, so pi must omit it entirely.
 */
const PARAMETER_SELECTION_GUIDE = [
  'PARAMETER SELECTION GUIDE:',
  '- Read each model\'s capabilities carefully.',
  '- If a model has styles:TRUE, pick a style NAME that matches the prompt\'s mood.',
  '- If a model has styles:FALSE, OMIT style entirely.',
  '- If a model has negativePrompt:FALSE, OMIT negativePrompt entirely.',
  '- Pick aspect ratio based on what the prompt describes:',
  '  - Portraits / people → 2:3 or 9:16',
  '  - Landscapes / scenes → 3:2 or 16:9',
  '  - Square / close-ups → 1:1',
  '  - Ultra-wide scenes → 21:9',
  '- For video models: pick duration based on scene complexity (short = punchy, long = cinematic).',
  '- NEVER set a parameter that the model\'s capabilities mark as FALSE.',
  '- ALWAYS pick values that the spec\'s allowed sets / aspect-ratio table contain.',
  '- Each model gets INDEPENDENT parameters — do NOT copy between models.',
].join('\n');

/**
 * Render a single model's structured spec as a compact block pi.dev
 * can parse. Uses the JSON sitting in `lib/model-specs/*.json` as the
 * source of truth — capabilities, allowed params, aspect-ratio table,
 * styles (name → UUID), and hard rules.
 */
function renderModelSpecBlock(modelId: string): string | null {
  const spec = getModelSpec(modelId);
  if (!spec) return null;
  const lines: string[] = [];
  lines.push(`### MODEL SPEC — ${spec.modelId} (type: ${spec.type}, API: ${spec.apiName})`);
  lines.push(`endpoint: ${spec.endpoint}`);
  lines.push('');
  lines.push('capabilities:');
  for (const [k, v] of Object.entries(spec.capabilities)) {
    lines.push(`  - ${k}: ${v ? 'TRUE' : 'FALSE'}`);
  }
  lines.push('');
  lines.push('parameters:');
  lines.push(JSON.stringify(spec.parameters, null, 2));
  if (spec.aspectRatios) {
    lines.push('');
    lines.push('aspectRatios (exact width × height pairs):');
    lines.push(JSON.stringify(spec.aspectRatios, null, 2));
  }
  if (spec.styles) {
    lines.push('');
    lines.push('styles (NAME → UUID map; return the NAME, the app resolves the UUID):');
    lines.push(JSON.stringify(spec.styles, null, 2));
  }
  lines.push('');
  lines.push('rules:');
  for (const r of spec.rules) lines.push(`  - ${r}`);
  return lines.join('\n');
}

export type SuggestionSource = 'ai' | 'rules' | 'ai+rules';

// ── Per-model suggestion shape ───────────────────────────────────────────────

export interface PerModelImageSuggestion {
  type: 'image';
  modelId: string;
  apiName: string;
  aspectRatio: string;
  width: number;
  height: number;
  imageSize: '1K' | '2K';
  /** Only set when the model exposes a quality knob (today gpt-image-1.5). */
  quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  promptEnhance: 'ON' | 'OFF';
  /** Style name (resolved to UUID downstream). Only meaningful for nano-banana-*. */
  style?: string;
  negativePrompt?: string;
  /** 1-2 sentence rationale for THIS model's settings. */
  reason: string;
  source: SuggestionSource;
}

export interface PerModelVideoSuggestion {
  type: 'video';
  modelId: string;
  apiName: string;
  aspectRatio: string;
  width: number;
  height: number;
  duration: number;
  mode: 'RESOLUTION_720' | 'RESOLUTION_1080';
  motionHasAudio?: boolean;
  reason: string;
  source: SuggestionSource;
}

export type PerModelSuggestion = PerModelImageSuggestion | PerModelVideoSuggestion;

// ── Top-level (shared / shortlist) suggestion shape ──────────────────────────

export interface ParamSuggestionReasons {
  models: string;
  aspectRatio: string;
  style?: string;
  imageSize: string;
  negativePrompt?: string;
  quality?: string;
  promptEnhance?: string;
  /** Holistic AI-authored paragraph explaining the suggestion as a whole. */
  overall?: string;
}

export interface ParamSuggestion {
  modelIds: string[];
  /** Per-model parameter map keyed by in-app model id. */
  perModel: Record<string, PerModelSuggestion>;
  /**
   * "Best shared" view derived from the first (highest-ranked) model.
   * Kept for the existing apply path which writes to a single shared
   * `comparisonOptions`. Per-model overrides live in `perModel`.
   */
  aspectRatio: string;
  style?: string;
  imageSize: '1K' | '2K';
  negativePrompt?: string;
  quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  promptEnhance?: 'ON' | 'OFF';
  reasons: ParamSuggestionReasons;
  priorMatchCount: number;
  /** Where the suggestion came from. `ai+rules` = AI partly responded. */
  source: SuggestionSource;
}

export interface SuggestParametersInput {
  prompt: string;
  availableModels: LeonardoModelConfig[];
  modelGuides: Record<string, string>;
  availableStyles: { name: string; uuid: string }[];
  savedImages: GeneratedImage[];
  /** How many models to return. Default 2 — matches the compare-mode minimum. */
  topN?: number;
  /** Models to exclude from ranking. Defaults to nano-banana (pipeline skips it). */
  excludedModelIds?: readonly string[];
  /**
   * Models the user has already selected. These are force-included in
   * the output regardless of ranking score, so a manually-selected
   * low-rank model (e.g. GPT Image-1.5) still gets a per-model panel.
   * Forced inclusions count against topN up to its budget, and any
   * overflow beyond topN is still included.
   */
  includedModelIds?: readonly string[];
  /** Per-model API parameter spec. Defaults to LEONARDO_MODEL_PARAMS. */
  modelParams?: Record<string, LeonardoModelSpec>;
}

// ── Heuristic rules ──────────────────────────────────────────────────────────

interface AspectRule {
  keywords: string[];
  ratio: string;
  reason: string;
}

const ASPECT_RULES: AspectRule[] = [
  { keywords: ['vertical', 'reel', 'tiktok', 'story', 'mobile wallpaper'], ratio: '9:16', reason: 'vertical format for social / mobile' },
  { keywords: ['portrait', 'character', 'figure', 'face', 'headshot', 'head shot'], ratio: '2:3', reason: 'portrait orientation fits subject-focused shots' },
  { keywords: ['landscape', 'panorama', 'vista', 'horizon', 'cityscape', 'skyline', 'wide shot'], ratio: '16:9', reason: 'wide format suits landscape composition' },
  { keywords: ['square', 'icon', 'logo', 'album cover', 'avatar'], ratio: '1:1', reason: 'square format for icon / cover use' },
  { keywords: ['cinematic', 'film still', 'movie still'], ratio: '3:2', reason: 'cinematic 3:2 framing' },
];

interface StyleRule {
  keywords: string[];
  styleName: string;
  reason: string;
}

const STYLE_RULES: StyleRule[] = [
  { keywords: ['monochrome', 'black and white', 'b&w', 'noir'], styleName: 'Pro B&W Photography', reason: 'monochrome cue' },
  { keywords: ['fashion', 'editorial', 'runway', 'vogue'], styleName: 'Fashion', reason: 'fashion / editorial cue' },
  { keywords: ['anime', 'cartoon', 'comic', 'manga', 'illustration'], styleName: 'Illustration', reason: 'illustrated / drawn style cue' },
  { keywords: ['3d render', '3d', 'cgi', 'octane', 'blender'], styleName: '3D Render', reason: '3D / rendered look cue' },
  { keywords: ['watercolor', 'watercolour', 'painted', 'gouache'], styleName: 'Watercolor', reason: 'painted-medium cue' },
  { keywords: ['game concept', 'concept art'], styleName: 'Game Concept', reason: 'concept-art cue' },
  { keywords: ['portrait', 'headshot', 'head shot', 'close-up'], styleName: 'Portrait Cinematic', reason: 'portrait composition detected' },
  { keywords: ['cinematic', 'dramatic', 'moody'], styleName: 'Portrait Cinematic', reason: 'cinematic / moody cue' },
  { keywords: ['photorealistic', 'realistic', 'photograph', 'photo '], styleName: 'Pro Color Photography', reason: 'photographic-realism cue' },
];

const DETAIL_KEYWORDS = [
  'ultra detailed', 'ultra-detailed', 'highly detailed', 'hyper detailed',
  'hyper-detailed', 'intricate', '8k', '4k', 'ultra realistic',
];

// Video-specific cues — duration + audio knobs.
const SHORT_VIDEO_KEYWORDS = ['short clip', 'gif', 'looping', 'loop', 'quick'];
const LONG_VIDEO_KEYWORDS = ['long take', 'extended', 'one shot', 'continuous shot'];
const SILENT_VIDEO_KEYWORDS = ['silent', 'no audio', 'mute', 'quiet'];

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function firstHit(prompt: string, keywords: string[]): string | undefined {
  const lower = prompt.toLowerCase();
  for (const k of keywords) {
    if (lower.includes(k)) return k;
  }
  return undefined;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

// ── Rule engine: per-model derivation ────────────────────────────────────────

interface RuleHints {
  aspectKeywordRatio?: string;
  aspectKeywordReason?: string;
  styleKeyword?: { name: string; reason: string };
  detailHit?: string;
  shortVideoHit?: string;
  longVideoHit?: string;
  silentVideoHit?: string;
}

function deriveHints(prompt: string): RuleHints {
  const hints: RuleHints = {};
  for (const rule of ASPECT_RULES) {
    const hit = firstHit(prompt, rule.keywords);
    if (hit) {
      hints.aspectKeywordRatio = rule.ratio;
      hints.aspectKeywordReason = `"${hit}" → ${rule.reason}`;
      break;
    }
  }
  for (const rule of STYLE_RULES) {
    const hit = firstHit(prompt, rule.keywords);
    if (hit) {
      hints.styleKeyword = { name: rule.styleName, reason: `"${hit.trim()}" → ${rule.reason}` };
      break;
    }
  }
  hints.detailHit = firstHit(prompt, DETAIL_KEYWORDS);
  hints.shortVideoHit = firstHit(prompt, SHORT_VIDEO_KEYWORDS);
  hints.longVideoHit = firstHit(prompt, LONG_VIDEO_KEYWORDS);
  hints.silentVideoHit = firstHit(prompt, SILENT_VIDEO_KEYWORDS);
  return hints;
}

/** Pick the best supported aspect ratio for an image model given a hint. */
function pickImageAspect(
  spec: LeonardoImageModelSpec,
  hint: string | undefined,
): { aspectRatio: string; width: number; height: number; reason: string; clamped: boolean } {
  const supported = spec.supported_sizes;
  // Map "WxH" → "AR" for parsing. Falls back to the spec's own width/height.
  const sizeToAspect = (sz: string): string | undefined => {
    const m = sz.match(/^(\d+)x(\d+)$/);
    if (!m) return undefined;
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (w === h) return '1:1';
    if (w === 1024 && h === 1536) return '2:3';
    if (w === 1536 && h === 1024) return '3:2';
    return undefined;
  };
  const supportedAspects = new Set<string>();
  for (const sz of supported) {
    const a = sizeToAspect(sz);
    if (a) supportedAspects.add(a);
  }
  const wantHint = hint && supportedAspects.has(hint);
  const chosenAspect = wantHint ? hint : '1:1';
  const reason = wantHint
    ? `${hint} supported by this model`
    : hint
      ? `${hint} unsupported by this model — fallback to 1:1`
      : 'default 1:1 (no orientation cue)';
  // Resolve dims from the matching supported_size string.
  let width = spec.width;
  let height = spec.height;
  for (const sz of supported) {
    if (sizeToAspect(sz) === chosenAspect) {
      const m = sz.match(/^(\d+)x(\d+)$/);
      if (m) {
        width = parseInt(m[1], 10);
        height = parseInt(m[2], 10);
        break;
      }
    }
  }
  return {
    aspectRatio: chosenAspect,
    width,
    height,
    reason,
    clamped: !wantHint && Boolean(hint) && hint !== '1:1',
  };
}

/** Build a per-model rule-based suggestion for a single model. */
function ruleEngineForModel(
  modelId: string,
  spec: LeonardoModelSpec,
  apiName: string,
  hints: RuleHints,
  availableStyleNames: Set<string>,
  carriedNegativePrompt: string | undefined,
): PerModelSuggestion {
  if (spec.type === 'image') {
    const aspect = pickImageAspect(spec, hints.aspectKeywordRatio);
    const imageSize: '1K' | '2K' = hints.detailHit ? '2K' : '1K';

    let quality: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
    let qualityReason: string | undefined;
    if (spec.quality && spec.quality.length > 0) {
      quality = hints.detailHit ? 'HIGH' : 'MEDIUM';
      qualityReason = hints.detailHit
        ? `"${hints.detailHit}" → HIGH quality`
        : 'MEDIUM — balanced cost / quality';
    }

    let style: string | undefined;
    let styleReason: string | undefined;
    if (spec.style_ids && hints.styleKeyword && availableStyleNames.has(hints.styleKeyword.name)) {
      style = hints.styleKeyword.name;
      styleReason = hints.styleKeyword.reason;
    }

    const promptEnhance: 'ON' | 'OFF' = spec.prompt_enhance;
    const reasonParts = [
      `${aspect.reason}`,
      `${imageSize} render`,
      qualityReason,
      styleReason,
      `prompt_enhance ${promptEnhance}`,
    ].filter(Boolean);

    return {
      type: 'image',
      modelId,
      apiName,
      aspectRatio: aspect.aspectRatio,
      width: aspect.width,
      height: aspect.height,
      imageSize,
      quality,
      promptEnhance,
      style,
      negativePrompt: carriedNegativePrompt,
      reason: reasonParts.join('; '),
      source: 'rules',
    };
  }

  // Video model.
  // Aspect: respect hint when one of {1:1, 9:16, 16:9}; else default 16:9
  // (the model's native landscape).
  let aspectRatio = '16:9';
  let width = 1920;
  let height = 1080;
  if (hints.aspectKeywordRatio === '9:16') {
    aspectRatio = '9:16';
    width = 1080;
    height = 1920;
  } else if (hints.aspectKeywordRatio === '1:1') {
    aspectRatio = '1:1';
    width = 1440;
    height = 1440;
  }

  let duration = spec.duration;
  let durationReason = `${duration}s default for ${modelId}`;
  if (hints.shortVideoHit) {
    duration = Math.max(3, Math.min(duration, 4));
    durationReason = `"${hints.shortVideoHit}" → short ${duration}s clip`;
  } else if (hints.longVideoHit && modelId !== 'kling-o3') {
    duration = Math.min(15, Math.max(duration, 8));
    durationReason = `"${hints.longVideoHit}" → ${duration}s extended take`;
  }

  const mode: 'RESOLUTION_720' | 'RESOLUTION_1080' =
    spec.mode === 'RESOLUTION_720' ? 'RESOLUTION_720' : 'RESOLUTION_1080';

  let motionHasAudio: boolean | undefined;
  if (typeof spec.motion_has_audio === 'boolean') {
    motionHasAudio = hints.silentVideoHit ? false : spec.motion_has_audio;
  }

  const reasonParts = [
    `${aspectRatio} ${width}×${height}`,
    durationReason,
    mode,
    motionHasAudio === undefined
      ? undefined
      : motionHasAudio
        ? 'audio on'
        : `audio off${hints.silentVideoHit ? ` ("${hints.silentVideoHit}")` : ''}`,
  ].filter(Boolean);

  return {
    type: 'video',
    modelId,
    apiName,
    aspectRatio,
    width,
    height,
    duration,
    mode,
    motionHasAudio,
    reason: reasonParts.join('; '),
    source: 'rules',
  };
}

// ── Public rule engine ───────────────────────────────────────────────────────

export function suggestParameters(input: SuggestParametersInput): ParamSuggestion {
  const {
    prompt,
    availableModels,
    modelGuides,
    availableStyles,
    savedImages,
    topN = 2,
    excludedModelIds = ['nano-banana'],
    includedModelIds,
    modelParams = LEONARDO_MODEL_PARAMS,
  } = input;

  const promptTokens = tokenize(prompt);
  const excluded = new Set(excludedModelIds);
  const eligible = availableModels.filter(m => !excluded.has(m.id));
  const hints = deriveHints(prompt);
  const availableStyleNames = new Set(availableStyles.map(s => s.name));

  // ── Prior-success mining (Jaccard over prompts) ──────────────────────────
  const winners = savedImages.filter(
    img => (img.winner || img.approved || img.isPostReady) && img.modelInfo?.modelId,
  );
  const scoredWinners = winners
    .map(img => ({ img, score: jaccard(promptTokens, tokenize(img.prompt)) }))
    .filter(s => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // ── Model ranking (keyword-guide overlap + prior-success boost) ──────────
  const modelScore = new Map<string, number>();
  for (const m of eligible) {
    const guide = modelGuides[m.id];
    if (!guide) {
      modelScore.set(m.id, 0);
      continue;
    }
    const guideTokens = tokenize(guide);
    let overlap = 0;
    for (const t of promptTokens) if (guideTokens.has(t)) overlap++;
    modelScore.set(m.id, overlap);
  }
  for (const s of scoredWinners) {
    const id = s.img.modelInfo?.modelId;
    if (id && modelScore.has(id)) {
      modelScore.set(id, (modelScore.get(id) ?? 0) + s.score * 10);
    }
  }
  const ranked = eligible
    .map(m => ({ id: m.id, score: modelScore.get(m.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  // Force-include any model the caller already selected, even if it
  // ranked outside topN. `excludedModelIds` (e.g. the pipeline-skipped
  // nano-banana) still wins — forcing a model the engine explicitly
  // excludes would contradict the exclusion contract.
  const forced = new Set(
    (includedModelIds ?? []).filter(id => !excluded.has(id) && modelScore.has(id)),
  );
  const wantedCount = Math.max(1, Math.min(topN, ranked.length));
  const topSlots = Math.max(0, wantedCount - forced.size);
  const topRanked = ranked
    .filter(m => !forced.has(m.id))
    .slice(0, topSlots)
    .map(m => m.id);
  // Preserve rank order for forced models so UI panels stay ordered.
  const forcedOrdered = ranked.filter(m => forced.has(m.id)).map(m => m.id);
  const modelIds = Array.from(new Set([...forcedOrdered, ...topRanked]));

  const forcedCount = forcedOrdered.length;
  const rankedCount = modelIds.length - forcedCount;
  const forcedReason = forcedCount > 0 ? ` + ${forcedCount} user-selected` : '';
  const modelsReason = scoredWinners.length > 0
    ? `top ${rankedCount} by prompt-guide fit + ${scoredWinners.length} prior winner${scoredWinners.length === 1 ? '' : 's'}${forcedReason}`
    : `top ${rankedCount} by prompt-guide keyword fit${forcedReason}`;

  // ── Negative prompt (from closest prior winner that had one) ─────────────
  let carriedNegativePrompt: string | undefined;
  let carriedNegativeReason: string | undefined;
  const priorWithNeg = scoredWinners.find(s => s.img.negativePrompt?.trim());
  if (priorWithNeg?.img.negativePrompt) {
    carriedNegativePrompt = priorWithNeg.img.negativePrompt;
    const snippet = priorWithNeg.img.prompt.slice(0, 40);
    carriedNegativeReason = `carried over from prior winner "${snippet}${priorWithNeg.img.prompt.length > 40 ? '…' : ''}"`;
  }

  // ── Per-model derivation ─────────────────────────────────────────────────
  const perModel: Record<string, PerModelSuggestion> = {};
  for (const id of modelIds) {
    const spec = modelParams[id];
    const cfg = availableModels.find(m => m.id === id);
    const apiName = spec?.api_name ?? cfg?.apiModelId ?? id;
    if (!spec) continue;
    perModel[id] = ruleEngineForModel(
      id,
      spec,
      apiName,
      hints,
      availableStyleNames,
      carriedNegativePrompt,
    );
  }

  // ── "Best shared" view ───────────────────────────────────────────────────
  // The legacy apply path writes a single shared GenerateOptions; we
  // derive that from the highest-ranked per-model entry so the UI keeps
  // working without a per-model state migration. The per-model values
  // remain in `perModel` for the new card to render.
  const firstId = modelIds[0];
  const first = firstId ? perModel[firstId] : undefined;

  let aspectRatio = '1:1';
  let aspectReason = 'default 1:1';
  let imageSize: '1K' | '2K' = '1K';
  let imageSizeReason = 'standard 1K render';
  let quality: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
  let qualityReason: string | undefined;
  let promptEnhance: 'ON' | 'OFF' | undefined;
  let promptEnhanceReason: string | undefined;
  let style: string | undefined;
  let styleReason: string | undefined;

  if (first) {
    aspectRatio = first.aspectRatio;
    aspectReason = `${first.modelId}: ${first.reason.split(';')[0]?.trim() || first.aspectRatio}`;
    if (first.type === 'image') {
      imageSize = first.imageSize;
      imageSizeReason = first.imageSize === '2K' ? `"${hints.detailHit}" → 2K` : 'standard 1K render';
      quality = first.quality;
      qualityReason = first.quality
        ? hints.detailHit
          ? `"${hints.detailHit}" → ${first.quality}`
          : `${first.quality} — balanced cost / quality`
        : undefined;
      promptEnhance = first.promptEnhance;
      promptEnhanceReason = `prompt_enhance ${first.promptEnhance}`;
      style = first.style;
      styleReason = first.style ? hints.styleKeyword?.reason : undefined;
    }
  }

  return {
    modelIds,
    perModel,
    aspectRatio,
    style,
    imageSize,
    negativePrompt: carriedNegativePrompt,
    quality,
    promptEnhance,
    reasons: {
      models: modelsReason,
      aspectRatio: aspectReason,
      style: styleReason,
      imageSize: imageSizeReason,
      negativePrompt: carriedNegativeReason,
      quality: qualityReason,
      promptEnhance: promptEnhanceReason,
    },
    priorMatchCount: scoredWinners.length,
    source: 'rules',
  };
}

/**
 * Synthesise a minimal rules-only PerModelSuggestion for a model not in
 * the AI shortlist. Used by the param-suggestion card when the user
 * toggles a model ON after the initial suggestion has been generated,
 * so the card can show a default panel instead of "(no suggestion)".
 * Returns null if the model has no spec registered.
 */
export function buildRuleFallbackForModel(
  modelId: string,
  opts: {
    availableModels?: LeonardoModelConfig[];
    modelParams?: Record<string, LeonardoModelSpec>;
  } = {},
): PerModelSuggestion | null {
  const modelParams = opts.modelParams ?? LEONARDO_MODEL_PARAMS;
  const spec = modelParams[modelId];
  const cfg = opts.availableModels?.find(m => m.id === modelId);
  const apiName = spec?.api_name ?? cfg?.apiModelId ?? modelId;
  if (!spec) return null;

  if (spec.type === 'video') {
    return {
      type: 'video',
      modelId,
      apiName,
      aspectRatio: '16:9',
      width: spec.width,
      height: spec.height,
      duration: spec.duration,
      mode: /1080/.test(spec.mode) ? 'RESOLUTION_1080' : 'RESOLUTION_720',
      motionHasAudio: spec.motion_has_audio,
      reason: 'Default parameters — edit to customise.',
      source: 'rules',
    };
  }

  return {
    type: 'image',
    modelId,
    apiName,
    aspectRatio: '1:1',
    width: spec.width,
    height: spec.height,
    imageSize: '1K',
    promptEnhance: spec.prompt_enhance,
    reason: 'Default parameters — edit to customise.',
    source: 'rules',
  };
}

// ── V030-008: AI-driven per-model suggestion via pi.dev ──────────────────────

export interface SuggestParametersAIOptions {
  /** AbortSignal passed through to fetch. */
  signal?: AbortSignal;
  /**
   * Override the AI caller. Defaults to streamAIToString from aiClient.
   * Receives the per-model prompt — tests inject a canned response keyed
   * on which model is being evaluated.
   */
  aiCall?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  /** Override the fallback engine. Defaults to suggestParameters. */
  fallback?: (input: SuggestParametersInput) => ParamSuggestion;
}

/**
 * Per-model pi prompt. Gives pi ONLY this model's API doc slice plus
 * the user's idea, prior winners on this model, and the available
 * style names. pi answers with that model's optimal parameters as a
 * JSON object.
 */
export function buildPerModelPromptPayload(args: {
  prompt: string;
  modelId: string;
  apiName: string;
  spec: LeonardoModelSpec;
  apiDocSlice: string;
  availableStyles: { name: string; uuid: string }[];
  priorWinnersOnThisModel: Array<Record<string, unknown>>;
}): string {
  const { prompt, modelId, apiName, spec, apiDocSlice, availableStyles, priorWinnersOnThisModel } = args;
  const styleNames = availableStyles.map(s => s.name);
  const isImage = spec.type === 'image';

  const structuredSpec = renderModelSpecBlock(modelId);

  const responseShape = isImage
    ? [
        '{',
        '  "aspectRatio": "1:1" | "2:3" | "3:2" | ... (must be one this model supports),',
        '  "imageSize": "1K" | "2K",',
        '  "quality": "LOW" | "MEDIUM" | "HIGH",     // omit if this model has no quality knob',
        '  "promptEnhance": "ON" | "OFF",            // default ON',
        '  "style": "<style name from AVAILABLE STYLE NAMES, or omit>",',
        '  "negativePrompt": "<optional>",',
        '  "reason": "<1-2 sentences explaining why these settings fit THIS model for THIS idea>"',
        '}',
      ].join('\n')
    : [
        '{',
        '  "aspectRatio": "16:9" | "1:1" | "9:16",',
        '  "duration": <integer seconds within the model\'s allowed range>,',
        '  "mode": "RESOLUTION_720" | "RESOLUTION_1080",',
        '  "motionHasAudio": true | false,           // omit if model does not expose audio',
        '  "reason": "<1-2 sentences explaining why these settings fit THIS model for THIS idea>"',
        '}',
      ].join('\n');

  return [
    `You are tuning Leonardo.AI parameters for a single model: ${modelId} (API: ${apiName}).`,
    'You are NOT choosing a model. The model is fixed. Your job is to read the',
    "structured MODEL SPEC below and pick this model's optimal parameters for the user's idea.",
    '',
    PARAMETER_SELECTION_GUIDE,
    '',
    `USER IDEA:\n${prompt || '(empty)'}`,
    '',
    `MODEL: ${modelId} (API: ${apiName}; type: ${spec.type})`,
    '',
    structuredSpec ?? `(no structured spec available for ${modelId})`,
    '',
    '--- BEGIN API DOC SLICE (supplementary) ---',
    apiDocSlice,
    '--- END API DOC SLICE ---',
    '',
    isImage
      ? [
          'AVAILABLE STYLE NAMES — return ONE name from this list verbatim, or omit.',
          'CRITICAL: return the human-readable NAME (e.g. "Pro Color Photography").',
          'Do NOT return a UUID. The app maps the name → UUID before calling Leonardo.',
          `Names: ${JSON.stringify(styleNames)}`,
        ].join('\n')
      : 'STYLES: not applicable to video models.',
    '',
    'PRIOR WINNERS GENERATED BY THIS MODEL ON SIMILAR IDEAS (calibration):',
    JSON.stringify(priorWinnersOnThisModel, null, 2),
    '',
    'HARD CONSTRAINTS:',
    '- Obey the capabilities block: if a capability is FALSE, OMIT that parameter entirely.',
    '- Obey the rules list: every rule is a constraint the API enforces.',
    '- Aspect ratio / dimensions must come from the aspectRatios table for this model.',
    '- Each model gets INDEPENDENT parameters — do not copy values across sibling models.',
    isImage
      ? '- imageSize is "1K" or "2K" only, and only when capabilities.imageSize is TRUE.'
      : '- duration must be within the model\'s allowed range from the spec.',
    '',
    'Return ONLY a JSON object with this shape, no code fences, no commentary:',
    responseShape,
  ].join('\n');
}

interface PerModelAIResponse {
  aspectRatio?: unknown;
  imageSize?: unknown;
  quality?: unknown;
  promptEnhance?: unknown;
  style?: unknown;
  negativePrompt?: unknown;
  duration?: unknown;
  mode?: unknown;
  motionHasAudio?: unknown;
  reason?: unknown;
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * V030-008 style-UUID safety net. The pi.dev contract demands a NAME
 * from AVAILABLE STYLE NAMES, not a UUID. If pi disobeys and returns
 * a UUID anyway, look it up in the available styles list and translate
 * back to the canonical NAME — the rest of the pipeline (
 * `useComparison.ts` / `useImageGeneration.ts`) does name → UUID
 * resolution before hitting `/api/leonardo`, so we must hand it a name.
 */
function resolveStyleAlias(
  raw: string | undefined,
  availableStyles: { name: string; uuid: string }[],
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (UUID_RE.test(trimmed)) {
    const match = availableStyles.find(s => s.uuid.toLowerCase() === trimmed.toLowerCase());
    return match?.name;
  }
  // Exact name match (case-sensitive first, then case-insensitive).
  const exact = availableStyles.find(s => s.name === trimmed);
  if (exact) return exact.name;
  const ci = availableStyles.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
  return ci?.name;
}

/**
 * Resolve (width, height) for a video model given an aspect ratio and
 * resolution mode by reading the structured spec's `aspectRatios`
 * table. The JSON shape is `{ [tier]: { [aspect]: { width, height } } }`
 * — e.g. `{ "720p": { "16:9": { width: 1280, height: 720 } } }` — so
 * the lookup is `spec.aspectRatios[tier][aspect]`. If the tier or
 * aspect is missing, fall back to the caller-provided defaults so the
 * merge never silently clamps to a wrong shape.
 */
function resolveVideoDims(
  modelId: string,
  aspectRatio: string,
  mode: 'RESOLUTION_480' | 'RESOLUTION_720' | 'RESOLUTION_1080',
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const spec = getModelSpec(modelId);
  if (!spec || !spec.aspectRatios) return fallback;
  const tier = mode === 'RESOLUTION_480' ? '480p' : mode === 'RESOLUTION_720' ? '720p' : '1080p';
  const tierTable = (spec.aspectRatios as Record<string, unknown>)[tier] as
    | Record<string, { width: number; height: number }>
    | undefined;
  const hit = tierTable?.[aspectRatio];
  if (hit && typeof hit.width === 'number' && typeof hit.height === 'number') {
    return { width: hit.width, height: hit.height };
  }
  return fallback;
}

/** Resolve dimensions for an aspect ratio against an image model's supported_sizes list. */
function resolveImageDims(
  spec: LeonardoImageModelSpec,
  aspectRatio: string,
): { width: number; height: number } {
  for (const sz of spec.supported_sizes) {
    const m = sz.match(/^(\d+)x(\d+)$/);
    if (!m) continue;
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    const ar = w === h ? '1:1' : w === 1024 && h === 1536 ? '2:3' : w === 1536 && h === 1024 ? '3:2' : undefined;
    if (ar === aspectRatio) return { width: w, height: h };
  }
  return { width: spec.width, height: spec.height };
}

function mergePerModelAI(
  modelId: string,
  apiName: string,
  spec: LeonardoModelSpec,
  parsed: PerModelAIResponse | null,
  fallback: PerModelSuggestion,
  availableStyles: { name: string; uuid: string }[],
): PerModelSuggestion {
  const availableStyleNames = new Set(availableStyles.map(s => s.name));
  if (!parsed) return fallback;
  if (spec.type === 'image' && fallback.type === 'image') {
    let blendedSource: SuggestionSource = 'ai';
    const aspectRatio = pickString(parsed.aspectRatio) ?? fallback.aspectRatio;
    if (!pickString(parsed.aspectRatio)) blendedSource = 'ai+rules';
    const dims = resolveImageDims(spec, aspectRatio);

    const sizeCandidate = pickString(parsed.imageSize);
    const imageSize: '1K' | '2K' =
      sizeCandidate === '1K' || sizeCandidate === '2K' ? sizeCandidate : fallback.imageSize;
    if (!sizeCandidate) blendedSource = 'ai+rules';

    const qualityCandidate = pickString(parsed.quality);
    let quality: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
    if (
      spec.quality &&
      (qualityCandidate === 'LOW' || qualityCandidate === 'MEDIUM' || qualityCandidate === 'HIGH')
    ) {
      quality = qualityCandidate;
    } else {
      quality = fallback.quality;
    }

    const peCandidate = pickString(parsed.promptEnhance)?.toUpperCase();
    const promptEnhance: 'ON' | 'OFF' =
      peCandidate === 'ON' || peCandidate === 'OFF' ? peCandidate : fallback.promptEnhance;

    // Style: pi MUST return a name. If it returns a UUID anyway,
    // resolveStyleAlias maps it back to the canonical name. Anything
    // not in the available set (after alias resolution) is dropped.
    let style: string | undefined;
    if (spec.style_ids) {
      const raw = pickString(parsed.style);
      const resolved = resolveStyleAlias(raw, availableStyles);
      if (resolved && availableStyleNames.has(resolved)) style = resolved;
    }
    const finalStyle = style ?? fallback.style;

    const negativePrompt = pickString(parsed.negativePrompt) ?? fallback.negativePrompt;

    const reason = pickString(parsed.reason) ?? fallback.reason;
    if (!pickString(parsed.reason)) blendedSource = 'ai+rules';

    const merged: PerModelImageSuggestion = {
      type: 'image',
      modelId,
      apiName,
      aspectRatio,
      width: dims.width,
      height: dims.height,
      imageSize,
      quality,
      promptEnhance,
      style: finalStyle,
      negativePrompt,
      reason,
      source: blendedSource,
    };

    if (modelId === 'gpt-image-1.5') {
      merged.style = undefined;
      merged.negativePrompt = undefined;
    }

    return merged;
  }

  if (spec.type === 'video' && fallback.type === 'video') {
    let blendedSource: SuggestionSource = 'ai';
    const aspectRatio = pickString(parsed.aspectRatio) ?? fallback.aspectRatio;
    if (!pickString(parsed.aspectRatio)) blendedSource = 'ai+rules';

    const durationCandidate =
      typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
        ? parsed.duration
        : undefined;
    const duration = durationCandidate ?? fallback.duration;
    if (durationCandidate === undefined) blendedSource = 'ai+rules';

    const modeCandidate = pickString(parsed.mode);
    const mode: 'RESOLUTION_720' | 'RESOLUTION_1080' =
      modeCandidate === 'RESOLUTION_720' || modeCandidate === 'RESOLUTION_1080'
        ? modeCandidate
        : fallback.mode;

    // Resolve dimensions dynamically from the model spec's aspectRatios
    // table — covers every aspect the model actually supports (including
    // seedance's 21:9 / 9:21 / 4:3 / 3:4) instead of a hardcoded trio.
    const { width, height } = resolveVideoDims(modelId, aspectRatio, mode, {
      width: fallback.width,
      height: fallback.height,
    });

    let motionHasAudio: boolean | undefined;
    if (typeof parsed.motionHasAudio === 'boolean') {
      motionHasAudio = parsed.motionHasAudio;
    } else {
      motionHasAudio = fallback.motionHasAudio;
    }

    const reason = pickString(parsed.reason) ?? fallback.reason;
    if (!pickString(parsed.reason)) blendedSource = 'ai+rules';

    return {
      type: 'video',
      modelId,
      apiName,
      aspectRatio,
      width,
      height,
      duration,
      mode,
      motionHasAudio,
      reason,
      source: blendedSource,
    };
  }

  return fallback;
}

async function defaultAiCall(prompt: string, signal?: AbortSignal): Promise<string> {
  return streamAIToString(prompt, { mode: 'generate', signal });
}

/**
 * Per-model AI suggestion. Picks the model shortlist via the rule
 * engine, then runs one pi.dev call per model in parallel — each call
 * sees only that model's API doc slice. Per-model failures fall back
 * to the rule engine's perModel entry. The "best shared" view is
 * derived from the first model's resolved suggestion so the legacy
 * apply path (single shared GenerateOptions) keeps working.
 */
export async function suggestParametersAI(
  input: SuggestParametersInput,
  options: SuggestParametersAIOptions = {},
): Promise<ParamSuggestion> {
  const fallbackFn = options.fallback ?? suggestParameters;
  const fallback = fallbackFn(input);
  const caller = options.aiCall ?? defaultAiCall;

  const modelParams = input.modelParams ?? LEONARDO_MODEL_PARAMS;

  const promptTokens = tokenize(input.prompt);
  const winners = input.savedImages.filter(
    img => (img.winner || img.approved || img.isPostReady) && img.modelInfo?.modelId,
  );

  const perModelEntries = await Promise.all(
    fallback.modelIds.map(async modelId => {
      const spec = modelParams[modelId];
      const fbEntry = fallback.perModel[modelId];
      // Every model in `modelIds` must end up in `perModel` so the UI can
      // render a panel for it. If we lack a spec or a rules-derived entry
      // (e.g. the user added a model the spec map doesn't know about),
      // synthesise a minimal rules-only fallback so the card still shows
      // a row for this model instead of silently dropping it.
      if (!spec || !fbEntry) {
        const cfg = input.availableModels.find(m => m.id === modelId);
        const apiName = spec?.api_name ?? cfg?.apiModelId ?? modelId;
        if (spec?.type === 'video') {
          const video: PerModelVideoSuggestion = {
            type: 'video',
            modelId,
            apiName,
            aspectRatio: '16:9',
            width: spec.width,
            height: spec.height,
            duration: spec.duration,
            mode: /1080/.test(spec.mode) ? 'RESOLUTION_1080' : 'RESOLUTION_720',
            motionHasAudio: spec.motion_has_audio,
            reason: 'Default parameters — no model-specific data available.',
            source: 'rules',
          };
          return [modelId, video] as const;
        }
        const image: PerModelImageSuggestion = {
          type: 'image',
          modelId,
          apiName,
          aspectRatio: '1:1',
          width: spec?.width ?? 1024,
          height: spec?.height ?? 1024,
          imageSize: '1K',
          promptEnhance: spec?.type === 'image' ? spec.prompt_enhance : 'ON',
          reason: 'Default parameters — no model-specific data available.',
          source: 'rules',
        };
        return [modelId, image] as const;
      }

      const apiDocSlice = LEONARDO_API_DOCS_BY_MODEL[modelId];
      if (!apiDocSlice) return [modelId, fbEntry] as const;

      const cfg = input.availableModels.find(m => m.id === modelId);
      const apiName = spec.api_name ?? cfg?.apiModelId ?? modelId;

      const priorOnThis = winners
        .filter(w => w.modelInfo?.modelId === modelId)
        .map(w => ({ img: w, score: jaccard(promptTokens, tokenize(w.prompt)) }))
        .filter(s => s.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(s => ({
          prompt: s.img.prompt.slice(0, 140),
          style: s.img.style,
          aspectRatio: s.img.aspectRatio,
          negativePrompt: s.img.negativePrompt,
        }));

      const promptPayload = buildPerModelPromptPayload({
        prompt: input.prompt,
        modelId,
        apiName,
        spec,
        apiDocSlice,
        availableStyles: input.availableStyles,
        priorWinnersOnThisModel: priorOnThis,
      });

      let raw: string;
      try {
        raw = await caller(promptPayload, options.signal);
      } catch {
        return [modelId, fbEntry] as const;
      }

      const parsed = extractJsonObjectFromLLM(raw) as PerModelAIResponse | null;
      if (!parsed || Object.keys(parsed).length === 0) {
        return [modelId, fbEntry] as const;
      }

      const merged = mergePerModelAI(modelId, apiName, spec, parsed, fbEntry, input.availableStyles);
      return [modelId, merged] as const;
    }),
  );

  const perModel: Record<string, PerModelSuggestion> = {};
  let aiHits = 0;
  let aiPartial = 0;
  for (const entry of perModelEntries) {
    if (!entry) continue;
    const [id, sug] = entry;
    perModel[id] = sug;
    if (sug.source === 'ai') aiHits++;
    else if (sug.source === 'ai+rules') aiPartial++;
  }

  // Roll up overall source: all-ai → 'ai', any-ai → 'ai+rules', else 'rules'.
  let overallSource: SuggestionSource = 'rules';
  const total = Object.keys(perModel).length;
  if (total > 0) {
    if (aiHits === total) overallSource = 'ai';
    else if (aiHits + aiPartial > 0) overallSource = 'ai+rules';
  }

  // Derive best-shared view from the highest-ranked model's resolved suggestion.
  const firstId = fallback.modelIds[0];
  const first = firstId ? perModel[firstId] : undefined;

  const aspectRatio = first?.aspectRatio ?? fallback.aspectRatio;
  const imageSize: '1K' | '2K' = first && first.type === 'image' ? first.imageSize : fallback.imageSize;
  const quality = first && first.type === 'image' ? first.quality : fallback.quality;
  const promptEnhance = first && first.type === 'image' ? first.promptEnhance : fallback.promptEnhance;
  const style = first && first.type === 'image' ? first.style : fallback.style;
  const negativePrompt =
    first && first.type === 'image' ? first.negativePrompt : fallback.negativePrompt;

  // Synthesise a 1-2 sentence "overall" reason from the per-model reasons.
  const overall =
    Object.values(perModel)
      .map(s => `${s.modelId}: ${s.reason}`)
      .join(' ')
      .slice(0, 480) || undefined;

  return {
    modelIds: fallback.modelIds,
    perModel,
    aspectRatio,
    style,
    imageSize,
    negativePrompt,
    quality,
    promptEnhance,
    reasons: {
      ...fallback.reasons,
      overall,
    },
    priorMatchCount: fallback.priorMatchCount,
    source: overallSource,
  };
}

// ── Legacy export retained for the old test that still references it ─────────
// `buildAIPromptPayload` was the global one-shot prompt; the new path uses
// `buildPerModelPromptPayload` per model. We keep the old helper around for
// any caller that wants the holistic catalog.
export function buildAIPromptPayload(input: SuggestParametersInput): string {
  const {
    prompt,
    availableModels,
    availableStyles,
    excludedModelIds = ['nano-banana'],
    modelParams = LEONARDO_MODEL_PARAMS,
    topN = 2,
  } = input;
  const excluded = new Set(excludedModelIds);
  const eligible = availableModels.filter(m => !excluded.has(m.id));
  const matrix = eligible.map(m => {
    const spec = modelParams[m.id];
    const base: Record<string, unknown> = {
      id: m.id,
      api_name: spec?.api_name ?? m.apiModelId,
      supports_style_ids: m.supportsStyleIds,
    };
    if (spec) {
      base.type = spec.type;
      base.width = spec.width;
      base.height = spec.height;
      if (spec.type === 'image') {
        base.supported_sizes = spec.supported_sizes;
        if (spec.quality) base.quality_levels = spec.quality;
      } else {
        base.duration_seconds = spec.duration;
        base.mode = spec.mode;
      }
    }
    return base;
  });
  const styleNames = availableStyles.map(s => s.name);
  // Structured specs for every known model — lets pi reason over
  // capabilities + rules rather than the raw text blobs alone.
  const allSpecs = getAllModelSpecs();
  const structuredCatalog = Object.keys(allSpecs)
    .map(id => renderModelSpecBlock(id))
    .filter((s): s is string => Boolean(s))
    .join('\n\n');
  return [
    'You are the Leonardo.AI model-selection reasoner for MashupForge.',
    '',
    PARAMETER_SELECTION_GUIDE,
    '',
    `USER IDEA:\n${prompt || '(empty)'}`,
    '',
    'MODEL DATABASE (structured specs — authoritative):',
    structuredCatalog,
    '',
    'MODEL DATABASE (supplementary text docs):',
    LEONARDO_API_DOCS,
    '',
    `IN-APP ELIGIBILITY (top ${topN}): ${JSON.stringify(matrix, null, 2)}`,
    `AVAILABLE STYLE NAMES: ${JSON.stringify(styleNames)}`,
    '',
    'HARD CONSTRAINTS:',
    '- modelIds must appear in IN-APP ELIGIBILITY.',
    '- Obey each model\'s capabilities block — never set a parameter marked FALSE.',
    '- Quality LOW | MEDIUM | HIGH only when supported.',
  ].join('\n');
}
