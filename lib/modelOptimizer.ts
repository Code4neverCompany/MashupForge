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
  if (!guide) return { prompt: basePrompt };

  const modelConfig = getLeonardoModel(modelId);
  const supportedRatios = modelConfig?.aspectRatios.map((r) => r.label).join(', ') || '1:1';
  const supportedStyles = modelConfig?.styles?.map((s) => s.name).join(', ') || 'None';
  // gpt-image-1.5 rejects negative prompts entirely (the route also
  // strips it, but we tell pi so it doesn't waste a field).
  const supportsNegPrompt = modelId !== 'gpt-image-1.5';

  try {
    const result = await streamAIToString(
      `You are an expert AI image prompt engineer. Optimize this prompt for the best result with this specific model.

MODEL: ${getModelName(modelId)}
MODEL STRENGTHS: ${guide}

SUPPORTED PARAMETERS:
- Aspect ratios: ${supportedRatios}
- Art styles: ${supportedStyles}
- Negative prompts: ${supportsNegPrompt ? 'Effective' : 'Not supported — do not include'}

ORIGINAL PROMPT: "${basePrompt}"
${options?.style ? `USER SELECTED STYLE: ${options.style}` : ''}
${options?.aspectRatio ? `USER SELECTED RATIO: ${options.aspectRatio}` : ''}
${options?.negativePrompt ? `USER NEGATIVE PROMPT: ${options.negativePrompt}` : ''}

Return ONLY a JSON object with:
- "prompt": the rewritten prompt optimized for this model
- "style": the best art style from the supported list (or null if none fits)
- "aspectRatio": the best aspect ratio from the supported list based on the scene composition
- "negativePrompt": a smart negative prompt${supportsNegPrompt ? '' : ' (MUST be null for this model)'}`,
      { mode: 'enhance' }
    );

    const data = extractJsonFromLLM(result, 'object');
    return {
      prompt: (typeof data.prompt === 'string' && data.prompt.trim()) || basePrompt,
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
