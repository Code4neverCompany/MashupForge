/**
 * Per-model prompt optimizer.
 *
 * Each Leonardo model has different strengths — some prefer concise
 * stylised prompts with explicit keywords, others want long natural
 * language, some render text correctly, some reject negative prompts.
 * This helper asks pi (via /api/pi/prompt) to rewrite the caller's
 * prompt for the target model AND pick the best supported
 * style/aspect ratio/negative prompt from the model's catalog.
 *
 * The pi call returns a JSON object that we parse with
 * extractJsonFromLLM so reasoning-model trailing prose doesn't break
 * the flow. Any failure falls back to the raw base prompt with no
 * parameter overrides so a pi glitch can't block Leonardo.
 */

import { streamAIToString, extractJsonFromLLM } from './aiClient';
import {
  LEONARDO_MODELS,
  MODEL_PROMPT_GUIDES,
  getLeonardoModel,
} from '../types/mashup';
import { CONCEPT_ART_NEGATIVES, CONCEPT_ART_NEGATIVES_SHORT, isConceptArtPrompt } from './negativePrompts';

export interface ModelEnhancement {
  prompt: string;
  /** Art style name from the target model's supported styles list. */
  style?: string;
  /** Aspect ratio label (e.g. "16:9") from the model's supported ratios. */
  aspectRatio?: string;
  /** Smart negative prompt, or undefined when the model doesn't support it. */
  negativePrompt?: string;
}

export interface EnhanceOptions {
  style?: string;
  aspectRatio?: string;
  negativePrompt?: string;
}

function getModelName(id: string): string {
  return LEONARDO_MODELS.find((m) => m.id === id)?.name || id;
}

/**
 * Rewrite a base prompt for the target Leonardo model and suggest
 * model-aware parameters. Returns the base prompt unchanged if the
 * model has no guide entry or if pi errors.
 */
export async function enhancePromptForModel(
  basePrompt: string,
  modelId: string,
  options?: EnhanceOptions
): Promise<ModelEnhancement> {
  const guide = MODEL_PROMPT_GUIDES[modelId];
  if (!guide) {
    // No model guide — still apply concept art negatives
    if (isConceptArtPrompt(basePrompt)) {
      const neg = basePrompt.length > 600 ? CONCEPT_ART_NEGATIVES_SHORT : CONCEPT_ART_NEGATIVES;
      return { prompt: `${basePrompt}. Avoid: ${neg}` };
    }
    return { prompt: basePrompt };
  }

  const isConceptArt = isConceptArtPrompt(basePrompt);
  const conceptArtNegBlock = isConceptArt
    ? (basePrompt.length > 600 ? CONCEPT_ART_NEGATIVES_SHORT : CONCEPT_ART_NEGATIVES)
    : '';

  const modelConfig = getLeonardoModel(modelId);
  const supportedRatios = modelConfig?.aspectRatios.map((r) => r.label).join(', ') || '1:1';
  const supportedStyles = modelConfig?.styles?.map((s) => s.name).join(', ') || 'None';
  // gpt-image-1.5 rejects negative prompts entirely (the route also
  // strips it, but we tell pi so it doesn't waste a field).
  const supportsNegPrompt = modelId !== 'gpt-image-1.5';

  try {
    const result = await streamAIToString(
      `Analyze and enhance this image prompt for optimal results with this model:

TARGET MODEL: ${getModelName(modelId)}
MODEL STRENGTHS: ${guide}

AVAILABLE OPTIONS:
- Aspect ratios: ${supportedRatios}
- Art styles: ${supportedStyles}
- Negative prompts: ${supportsNegPrompt ? 'supported' : 'not supported'}

ORIGINAL PROMPT: "${basePrompt}"
${options?.style ? `Preferred style: ${options.style}` : ''}
${options?.aspectRatio ? `Preferred ratio: ${options.aspectRatio}` : ''}
${options?.negativePrompt ? `User negative prompt: ${options.negativePrompt}` : ''}

Enhance the prompt with specific visual detail — lighting, atmosphere, textures, composition. Pick the best aspect ratio for the scene (wide/epic = 16:9, portrait/character = 9:16, other = 1:1). Pick the art style that fits the concept best. If negative prompts are supported, write one that prevents common quality issues (blurry, deformed, low detail).${isConceptArt ? `\n\nThis is a concept art prompt. The image must be a SINGLE illustration, NOT a reference sheet or multi-panel layout. Do NOT include "concept art sheet", "character sheet", "turnaround", or "grid layout" in the prompt.` : ''}

Return ONLY a JSON object:
{ "prompt": "...", "style": "...", "aspectRatio": "...", "negativePrompt": "..." }`,
      { mode: 'enhance' }
    );

    const data = extractJsonFromLLM(result, 'object');
    let finalPrompt = (typeof data.prompt === 'string' && data.prompt.trim()) || basePrompt;

    // Safety net: if pi forgot to bake negatives for concept art, append them
    if (isConceptArt && !finalPrompt.toLowerCase().includes('avoid:')) {
      finalPrompt = `${finalPrompt}. Avoid: ${conceptArtNegBlock}`;
    }

    return {
      prompt: finalPrompt,
      style: (typeof data.style === 'string' && data.style) || undefined,
      aspectRatio: (typeof data.aspectRatio === 'string' && data.aspectRatio) || undefined,
      negativePrompt:
        supportsNegPrompt && typeof data.negativePrompt === 'string' && data.negativePrompt
          ? data.negativePrompt
          : undefined,
    };
  } catch {
    return { prompt: basePrompt };
  }
}
