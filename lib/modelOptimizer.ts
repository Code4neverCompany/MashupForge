/**
 * Per-model metadata selector.
 *
 * Previously this file asked pi for a second LLM pass that rewrote
 * the caller's prompt — bolting on generic "quality booster" keywords
 * that degraded specificity. That role has moved upstream: the
 * masterprompt template in `lib/masterpromptTemplate.ts` is injected
 * into the idea-generation call so the prompt arrives here already
 * hyper-detailed with equipment fusions, proper nouns, atmosphere and
 * inline quality signals.
 *
 * All this function does now is pick MODEL METADATA — style, aspect
 * ratio, negative prompt — from the options the caller already has.
 * It returns the basePrompt unchanged. The async signature is kept so
 * existing callers don't churn, even though the body is synchronous.
 */

import { getLeonardoModel } from '../types/mashup';

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

/**
 * Return the base prompt unchanged and forward any metadata the caller
 * already has. gpt-image-1.5 rejects negative prompts entirely — we
 * strip them here so callers don't have to special-case it downstream.
 */
export async function enhancePromptForModel(
  basePrompt: string,
  modelId: string,
  options?: EnhanceOptions
): Promise<ModelEnhancement> {
  const supportsNegPrompt = modelId !== 'gpt-image-1.5';
  const modelConfig = getLeonardoModel(modelId);

  const aspectRatio =
    options?.aspectRatio ||
    modelConfig?.aspectRatios?.[0]?.label ||
    undefined;

  return {
    prompt: basePrompt,
    style: options?.style,
    aspectRatio,
    negativePrompt: supportsNegPrompt ? options?.negativePrompt : undefined,
  };
}
