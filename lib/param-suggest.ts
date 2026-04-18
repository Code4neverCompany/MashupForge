/**
 * V030-007: smart parameter pre-fill.
 *
 * Pure, deterministic suggestion engine. Given a prompt plus the models,
 * styles, and prior saved images available to the user, return a
 * best-guess model shortlist, aspect ratio, style, image-size tier, and
 * negative prompt — each paired with a short human-readable reason so the
 * Studio UI can explain itself.
 *
 * Deliberately keyword-driven (no LLM call) so suggestions are:
 *  - instant (run on every prompt change if desired)
 *  - deterministic (testable without network or stubs)
 *  - overridable (the UI is the source of truth once the user edits)
 */

import type { GeneratedImage, LeonardoModelConfig } from '@/types/mashup';

export interface ParamSuggestionReasons {
  models: string;
  aspectRatio: string;
  style?: string;
  imageSize: string;
  negativePrompt?: string;
}

export interface ParamSuggestion {
  modelIds: string[];
  aspectRatio: string;
  style?: string;
  imageSize: '1K' | '2K';
  negativePrompt?: string;
  reasons: ParamSuggestionReasons;
  priorMatchCount: number;
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

  return {
    modelIds,
    aspectRatio,
    style,
    imageSize,
    negativePrompt,
    reasons: {
      models: modelsReason,
      aspectRatio: aspectReason,
      style: styleReason,
      imageSize: imageSizeReason,
      negativePrompt: negativeReason,
    },
    priorMatchCount: scoredWinners.length,
  };
}
