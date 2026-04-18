/**
 * V030-007: smart parameter pre-fill.
 * V030-008: AI-driven variant on top of the rule-based engine.
 *
 * Two entry points:
 *
 *   `suggestParameters(input)` — pure, deterministic rule engine. Runs
 *   instantly, no network. Drives tests and serves as the fallback
 *   when pi.dev is unreachable.
 *
 *   `suggestParametersAI(input)` — async. Packages the idea, the full
 *   per-model API compatibility matrix, the available styles, and the
 *   top prior winners, then asks pi.dev to reason about which model/
 *   ratio/style/quality/negative-prompt combination fits best. Any
 *   failure (network, bad JSON, missing field, timeout) falls back to
 *   the rule engine so the user never sees an empty card.
 */

import type {
  GeneratedImage,
  LeonardoModelConfig,
  LeonardoModelSpec,
} from '@/types/mashup';
import { LEONARDO_MODEL_PARAMS } from '@/types/mashup';
import { streamAIToString, extractJsonObjectFromLLM } from './aiClient';
import { LEONARDO_API_DOCS } from './leonardo-api-docs';

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

export type SuggestionSource = 'ai' | 'rules' | 'ai+rules';

export interface ParamSuggestion {
  modelIds: string[];
  aspectRatio: string;
  style?: string;
  imageSize: '1K' | '2K';
  negativePrompt?: string;
  /** Only set when a top-ranked model supports quality (gpt-image-1.5). */
  quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  /**
   * V030-008: Leonardo prompt_enhance knob. Defaults to 'ON' when any
   * image model is in the shortlist (matches the server default).
   * The AI path may override to 'OFF' when an idea reads as already-
   * engineered (e.g. the prompt is clearly hand-tuned).
   */
  promptEnhance?: 'ON' | 'OFF';
  reasons: ParamSuggestionReasons;
  priorMatchCount: number;
  /** Where the suggestion came from. `ai+rules` = AI responded but we
   *  back-filled some fields from the deterministic engine. */
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
   * Per-model API parameter spec. Defaults to LEONARDO_MODEL_PARAMS.
   * Exposed for tests to inject a minimal spec; production callers
   * should leave this unset.
   */
  modelParams?: Record<string, LeonardoModelSpec>;
}

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

export function suggestParameters(input: SuggestParametersInput): ParamSuggestion {
  const {
    prompt,
    availableModels,
    modelGuides,
    availableStyles,
    savedImages,
    topN = 2,
    excludedModelIds = ['nano-banana'],
    modelParams = LEONARDO_MODEL_PARAMS,
  } = input;

  const promptTokens = tokenize(prompt);
  const excluded = new Set(excludedModelIds);
  const eligible = availableModels.filter(m => !excluded.has(m.id));

  // ── Aspect ratio ──────────────────────────────────────────────────────────
  let aspectRatio = '1:1';
  let aspectReason = 'default square — no orientation cue in prompt';
  for (const rule of ASPECT_RULES) {
    const hit = firstHit(prompt, rule.keywords);
    if (hit) {
      aspectRatio = rule.ratio;
      aspectReason = `"${hit}" → ${rule.reason}`;
      break;
    }
  }

  // ── Style ─────────────────────────────────────────────────────────────────
  let style: string | undefined;
  let styleReason: string | undefined;
  const availableStyleNames = new Set(availableStyles.map(s => s.name));
  for (const rule of STYLE_RULES) {
    const hit = firstHit(prompt, rule.keywords);
    if (hit && availableStyleNames.has(rule.styleName)) {
      style = rule.styleName;
      styleReason = `"${hit.trim()}" → ${rule.reason}`;
      break;
    }
  }

  // ── Image size ────────────────────────────────────────────────────────────
  const detailHit = firstHit(prompt, DETAIL_KEYWORDS);
  const imageSize: '1K' | '2K' = detailHit ? '2K' : '1K';
  const imageSizeReason = detailHit
    ? `"${detailHit}" → render at 2K for detail`
    : 'standard 1K render';

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

  const wantedCount = Math.max(1, Math.min(topN, ranked.length));
  const modelIds = ranked.slice(0, wantedCount).map(m => m.id);

  const modelsReason = scoredWinners.length > 0
    ? `top ${modelIds.length} by prompt-guide fit + ${scoredWinners.length} prior winner${scoredWinners.length === 1 ? '' : 's'}`
    : `top ${modelIds.length} by prompt-guide keyword fit`;

  // ── Negative prompt (from closest prior winner that had one) ─────────────
  let negativePrompt: string | undefined;
  let negativeReason: string | undefined;
  const priorWithNeg = scoredWinners.find(s => s.img.negativePrompt?.trim());
  if (priorWithNeg?.img.negativePrompt) {
    negativePrompt = priorWithNeg.img.negativePrompt;
    const snippet = priorWithNeg.img.prompt.slice(0, 40);
    negativeReason = `carried over from prior winner "${snippet}${priorWithNeg.img.prompt.length > 40 ? '…' : ''}"`;
  }

  // ── Per-model spec constraints ────────────────────────────────────────────
  // The Leonardo v2 API accepts a fixed set of sizes per model. If every
  // top-ranked model only supports 1024x1024 we override the keyword-
  // derived ratio to 1:1 so the suggestion matches what the API will
  // actually accept. Same idea applies to quality: only gpt-image-1.5
  // exposes LOW/MEDIUM/HIGH today, so we only emit a quality suggestion
  // when one of the top models has that capability.
  const topSpecs = modelIds
    .map(id => modelParams[id])
    .filter((s): s is LeonardoModelSpec => Boolean(s));

  const imageSpecs = topSpecs.filter(
    (s): s is Extract<LeonardoModelSpec, { type: 'image' }> => s.type === 'image',
  );
  const allOnly1k1k =
    imageSpecs.length > 0 &&
    imageSpecs.every(
      s => s.supported_sizes.length === 1 && s.supported_sizes[0] === '1024x1024',
    );
  if (allOnly1k1k && aspectRatio !== '1:1') {
    aspectReason = `${aspectRatio} unsupported — ${imageSpecs.map(s => s.api_name ?? '').filter(Boolean).join(', ') || 'selected models'} only accept 1024×1024`;
    aspectRatio = '1:1';
  }

  // Quality — only meaningful for gpt-image-1.5 (the one model with a
  // LOW/MEDIUM/HIGH knob). Detail keywords in the prompt push it to HIGH;
  // everything else stays MEDIUM.
  let quality: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
  let qualityReason: string | undefined;
  const modelWithQuality = imageSpecs.find(s => s.quality && s.quality.length > 0);
  if (modelWithQuality) {
    quality = detailHit ? 'HIGH' : 'MEDIUM';
    qualityReason = detailHit
      ? `"${detailHit}" → HIGH quality for detail rendering`
      : 'MEDIUM — default for balanced cost / quality';
  }

  // V030-008: prompt_enhance defaults to ON when any image model is in
  // the shortlist. Maurice's standing directive — let Leonardo auto-
  // improve prompts unless the user explicitly opts out.
  let promptEnhance: 'ON' | 'OFF' | undefined;
  let promptEnhanceReason: string | undefined;
  if (imageSpecs.length > 0) {
    promptEnhance = 'ON';
    promptEnhanceReason = 'ON by default — Leonardo auto-enhances prompts for richer output';
  }

  return {
    modelIds,
    aspectRatio,
    style,
    imageSize,
    negativePrompt,
    quality,
    promptEnhance,
    reasons: {
      models: modelsReason,
      aspectRatio: aspectReason,
      style: styleReason,
      imageSize: imageSizeReason,
      negativePrompt: negativeReason,
      quality: qualityReason,
      promptEnhance: promptEnhanceReason,
    },
    priorMatchCount: scoredWinners.length,
    source: 'rules',
  };
}

// ── V030-008: AI-driven suggestion via pi.dev ────────────────────────────────

export interface SuggestParametersAIOptions {
  /** AbortSignal passed through to fetch. */
  signal?: AbortSignal;
  /**
   * Override the AI caller. Defaults to streamAIToString from aiClient.
   * Exposed so tests can inject a canned response without touching
   * fetch / the network.
   */
  aiCall?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  /**
   * Override the fallback engine. Defaults to suggestParameters.
   * Exposed for tests.
   */
  fallback?: (input: SuggestParametersInput) => ParamSuggestion;
}

/**
 * Build the compact compatibility matrix we hand to pi. Keeps the
 * token budget small by stripping fields the AI doesn't need to
 * reason about (e.g. uuids).
 */
function buildModelMatrix(
  eligible: readonly LeonardoModelConfig[],
  modelParams: Record<string, LeonardoModelSpec>,
): Array<Record<string, unknown>> {
  return eligible.map(m => {
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
}

/** Pull the most relevant recent winners in a compact form for the prompt. */
function summarizeWinners(savedImages: readonly GeneratedImage[], promptTokens: Set<string>) {
  const winners = savedImages.filter(
    img => (img.winner || img.approved || img.isPostReady) && img.modelInfo?.modelId,
  );
  return winners
    .map(img => ({ img, score: jaccard(promptTokens, tokenize(img.prompt)) }))
    .filter(s => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => ({
      prompt: s.img.prompt.slice(0, 140),
      model: s.img.modelInfo?.modelId,
      style: s.img.style,
      aspectRatio: s.img.aspectRatio,
      negativePrompt: s.img.negativePrompt,
    }));
}

interface AIResponseShape {
  modelIds?: unknown;
  aspectRatio?: unknown;
  style?: unknown;
  imageSize?: unknown;
  quality?: unknown;
  negativePrompt?: unknown;
  promptEnhance?: unknown;
  reasoning?: unknown;
  reasons?: unknown;
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Normalize pi's JSON blob against the `ParamSuggestion` shape. Any
 * field the AI omits or mangles is back-filled from the deterministic
 * fallback. Returned suggestion's `source` reflects whether the AI
 * provided every field (`ai`) or we had to stitch (`ai+rules`).
 */
function mergeAIWithFallback(
  parsed: AIResponseShape,
  fallback: ParamSuggestion,
  allowedModelIds: readonly string[],
  allowedStyles: readonly string[],
): ParamSuggestion {
  let blendedSource: SuggestionSource = 'ai';

  const modelIds = Array.isArray(parsed.modelIds)
    ? parsed.modelIds
        .filter((x): x is string => typeof x === 'string')
        .filter(id => allowedModelIds.includes(id))
    : [];
  const finalModelIds = modelIds.length > 0 ? modelIds : fallback.modelIds;
  if (modelIds.length === 0) blendedSource = 'ai+rules';

  const aspectRatio = pickString(parsed.aspectRatio) ?? fallback.aspectRatio;
  if (!pickString(parsed.aspectRatio)) blendedSource = 'ai+rules';

  let style = pickString(parsed.style);
  if (style && !allowedStyles.includes(style)) style = undefined;
  const finalStyle = style ?? fallback.style;

  const sizeCandidate = pickString(parsed.imageSize);
  const imageSize: '1K' | '2K' =
    sizeCandidate === '1K' || sizeCandidate === '2K' ? sizeCandidate : fallback.imageSize;
  if (imageSize !== sizeCandidate) blendedSource = blendedSource === 'ai' ? blendedSource : 'ai+rules';

  const qualityCandidate = pickString(parsed.quality);
  let quality: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
  if (qualityCandidate === 'LOW' || qualityCandidate === 'MEDIUM' || qualityCandidate === 'HIGH') {
    quality = qualityCandidate;
  } else {
    quality = fallback.quality;
  }

  const peCandidate = pickString(parsed.promptEnhance)?.toUpperCase();
  const promptEnhance: 'ON' | 'OFF' | undefined =
    peCandidate === 'ON' || peCandidate === 'OFF' ? peCandidate : fallback.promptEnhance;

  const negativePrompt = pickString(parsed.negativePrompt) ?? fallback.negativePrompt;

  const reasoningRaw =
    (parsed.reasoning && typeof parsed.reasoning === 'object'
      ? (parsed.reasoning as Record<string, unknown>)
      : undefined) ??
    (parsed.reasons && typeof parsed.reasons === 'object'
      ? (parsed.reasons as Record<string, unknown>)
      : undefined);

  const reasons: ParamSuggestionReasons = reasoningRaw
    ? {
        models:
          pickString(reasoningRaw.models) ??
          pickString(reasoningRaw.model) ??
          fallback.reasons.models,
        aspectRatio:
          pickString(reasoningRaw.aspectRatio) ??
          pickString(reasoningRaw.ratio) ??
          fallback.reasons.aspectRatio,
        style: pickString(reasoningRaw.style) ?? fallback.reasons.style,
        imageSize:
          pickString(reasoningRaw.imageSize) ??
          pickString(reasoningRaw.size) ??
          fallback.reasons.imageSize,
        negativePrompt:
          pickString(reasoningRaw.negativePrompt) ?? fallback.reasons.negativePrompt,
        quality: pickString(reasoningRaw.quality) ?? fallback.reasons.quality,
        promptEnhance:
          pickString(reasoningRaw.promptEnhance) ?? fallback.reasons.promptEnhance,
        overall:
          pickString(reasoningRaw.overall) ??
          pickString(reasoningRaw.summary) ??
          pickString(reasoningRaw.explanation),
      }
    : { ...fallback.reasons };

  if (!reasoningRaw) blendedSource = 'ai+rules';

  return {
    modelIds: finalModelIds,
    aspectRatio,
    style: finalStyle,
    imageSize,
    negativePrompt,
    quality,
    promptEnhance,
    reasons,
    priorMatchCount: fallback.priorMatchCount,
    source: blendedSource,
  };
}

/**
 * Build the user-facing message we send to pi. Kept as a bare string
 * so callers (tests in particular) can inspect it.
 */
export function buildAIPromptPayload(input: SuggestParametersInput): string {
  const {
    prompt,
    availableModels,
    availableStyles,
    savedImages,
    excludedModelIds = ['nano-banana'],
    modelParams = LEONARDO_MODEL_PARAMS,
    topN = 2,
  } = input;

  const excluded = new Set(excludedModelIds);
  const eligible = availableModels.filter(m => !excluded.has(m.id));
  const matrix = buildModelMatrix(eligible, modelParams);
  const priors = summarizeWinners(savedImages, tokenize(prompt));
  const styleNames = availableStyles.map(s => s.name);

  return [
    'You are the Leonardo.AI model-selection reasoner for MashupForge.',
    'A user has a creative idea. Your job is to READ the MODEL DATABASE',
    'below and SELECT the single best model (or a small shortlist) whose',
    'capabilities fit the idea, then propose the parameters that model',
    'accepts. You are choosing the model, not just filling a form.',
    '',
    `USER IDEA:\n${prompt || '(empty)'}`,
    '',
    'MODEL DATABASE — authoritative catalog of what each model supports.',
    'These are PARAMETER SPECS (options each model accepts), not templates.',
    'Ignore any example-style language; reason only about the options.',
    '--- BEGIN MODEL DATABASE ---',
    LEONARDO_API_DOCS,
    '--- END MODEL DATABASE ---',
    '',
    'IN-APP ELIGIBILITY (only these ids may appear in modelIds; nano-banana',
    'legacy is already excluded upstream):',
    JSON.stringify(matrix, null, 2),
    '',
    `AVAILABLE STYLE NAMES (pick one exactly, or omit): ${JSON.stringify(styleNames)}`,
    '',
    'PRIOR WINNERS ON SIMILAR IDEAS (calibration signal — do not blindly copy):',
    JSON.stringify(priors, null, 2),
    '',
    'HOW TO REASON:',
    `1. Identify what the idea actually needs (subject, medium, motion,`,
    `   aspect, detail, reference images).`,
    `2. Scan the MODEL DATABASE — which models can deliver that? Pick`,
    `   up to ${topN} best-fit ids from the IN-APP ELIGIBILITY list.`,
    `3. Choose parameters each chosen model actually accepts (check its`,
    `   section in the database — supported dimensions, quality levels,`,
    `   duration, style_ids, guidances).`,
    `4. In reasoning.overall, explain WHY this model fits this idea in`,
    `   1-2 sentences (e.g. "Nano Banana Pro handles cinematic portraits`,
    `   at 1024×1024 with rich style_ids, which matches the crossover art").`,
    '',
    'HARD CONSTRAINTS:',
    '- modelIds must appear in the IN-APP ELIGIBILITY list above.',
    '- Aspect ratio must be one the chosen models actually support per the',
    '  MODEL DATABASE. If every chosen model only supports 1024×1024,',
    '  aspectRatio MUST be "1:1".',
    '- quality (LOW/MEDIUM/HIGH) applies only if a chosen model exposes it',
    '  (per the database — today only gpt-image-1.5).',
    '- imageSize is "1K" or "2K" only.',
    '- style must be exactly one of AVAILABLE STYLE NAMES, or omitted.',
    '- promptEnhance defaults to "ON" — only set to "OFF" when the idea is',
    '  already a long, hand-engineered prompt.',
    '',
    'Return ONLY a JSON object with this shape, no code fences, no commentary:',
    '{',
    '  "modelIds": ["..."],',
    '  "aspectRatio": "1:1" | "2:3" | "3:2" | "9:16" | "16:9" | "3:4" | "4:3" | "4:5" | "5:4",',
    '  "style": "<style name or omit>",',
    '  "imageSize": "1K" | "2K",',
    '  "quality": "LOW" | "MEDIUM" | "HIGH",   // omit when not applicable',
    '  "promptEnhance": "ON" | "OFF",           // default ON',
    '  "negativePrompt": "<optional>",',
    '  "reasoning": {',
    '    "overall": "<1-2 sentence paragraph explaining why this model fits this idea>",',
    '    "models": "<why these models>",',
    '    "aspectRatio": "<why this ratio>",',
    '    "style": "<why this style, if any>",',
    '    "imageSize": "<why this size>",',
    '    "quality": "<why this quality, if applicable>",',
    '    "promptEnhance": "<why ON or OFF>",',
    '    "negativePrompt": "<why this negative prompt, if any>"',
    '  }',
    '}',
  ].join('\n');
}

async function defaultAiCall(prompt: string, signal?: AbortSignal): Promise<string> {
  return streamAIToString(prompt, { mode: 'generate', signal });
}

/**
 * Ask pi.dev to reason about optimal parameters and return a structured
 * ParamSuggestion. On any failure (network error, thrown in stream,
 * malformed JSON, empty modelIds) falls back to the rule-based engine.
 */
export async function suggestParametersAI(
  input: SuggestParametersInput,
  options: SuggestParametersAIOptions = {},
): Promise<ParamSuggestion> {
  const fallbackFn = options.fallback ?? suggestParameters;
  const fallback = fallbackFn(input);
  const caller = options.aiCall ?? defaultAiCall;

  const excluded = new Set(input.excludedModelIds ?? ['nano-banana']);
  const allowedModelIds = input.availableModels
    .filter(m => !excluded.has(m.id))
    .map(m => m.id);
  const allowedStyles = input.availableStyles.map(s => s.name);

  let raw: string;
  try {
    raw = await caller(buildAIPromptPayload(input), options.signal);
  } catch {
    return fallback;
  }

  const parsed = extractJsonObjectFromLLM(raw) as AIResponseShape;
  if (!parsed || Object.keys(parsed).length === 0) return fallback;

  return mergeAIWithFallback(parsed, fallback, allowedModelIds, allowedStyles);
}
