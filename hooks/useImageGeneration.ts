'use client';

import { useState } from 'react';
import { streamAIToString, extractJsonFromLLM } from '@/lib/aiClient';
import { enhancePromptForModel } from '@/lib/modelOptimizer';
import { MASTERPROMPT_INSTRUCTIONS } from '@/lib/masterpromptTemplate';
import { getErrorMessage } from '@/lib/errors';
import {
  type GeneratedImage,
  type GenerateOptions,
  type UserSettings,
  type WatermarkSettings,
  LEONARDO_MODELS,
  getLeonardoDimensions,
} from '../types/mashup';

function getModelName(id: string): string {
  return LEONARDO_MODELS.find(m => m.id === id)?.name || id;
}

export async function applyWatermark(baseImageSrc: string, settings: WatermarkSettings, channelName?: string): Promise<string> {
  if (!settings.enabled) return baseImageSrc;
  if (!settings.image && !channelName) return baseImageSrc;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(baseImageSrc);
        return;
      }

      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = settings.opacity || 0.8;

      // 8% padding (up from 3%) gives watermarks more breathing room
      // even if Instagram applies minor adjustments to the padded image.
      const padding = canvas.width * 0.08;

      if (settings.image) {
        const wm = new Image();
        wm.crossOrigin = "anonymous";
        wm.onload = () => {
          const wmWidth = canvas.width * (settings.scale || 0.15);
          const wmHeight = (wm.height / wm.width) * wmWidth;

          let x = 0, y = 0;
          switch (settings.position) {
            case 'top-left': x = padding; y = padding; break;
            case 'top-right': x = canvas.width - wmWidth - padding; y = padding; break;
            case 'bottom-left': x = padding; y = canvas.height - wmHeight - padding; break;
            case 'bottom-right': x = canvas.width - wmWidth - padding; y = canvas.height - wmHeight - padding; break;
            case 'center': x = (canvas.width - wmWidth) / 2; y = (canvas.height - wmHeight) / 2; break;
          }

          ctx.drawImage(wm, x, y, wmWidth, wmHeight);
          resolve(canvas.toDataURL('image/png'));
        };
        wm.onerror = () => resolve(baseImageSrc);
        wm.src = settings.image;
      } else if (channelName) {
        const fontSize = canvas.width * (settings.scale || 0.05);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const metrics = ctx.measureText(channelName);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        let x = 0, y = 0;
        switch (settings.position) {
          case 'top-left': x = padding; y = padding; break;
          case 'top-right': x = canvas.width - textWidth - padding; y = padding; break;
          case 'bottom-left': x = padding; y = canvas.height - textHeight - padding; break;
          case 'bottom-right': x = canvas.width - textWidth - padding; y = canvas.height - textHeight - padding; break;
          case 'center': x = (canvas.width - textWidth) / 2; y = (canvas.height - textHeight) / 2; break;
        }

        ctx.fillText(channelName, x, y);
        resolve(canvas.toDataURL('image/png'));
      }
    };
    img.onerror = () => resolve(baseImageSrc);
    img.src = baseImageSrc.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(baseImageSrc)}` : (baseImageSrc.startsWith('data:') ? baseImageSrc : `data:image/jpeg;base64,${baseImageSrc}`);
  });
}

/**
 * Submit-and-poll helper used by both the main generate loop and
 * rerollImage. Returns the Leonardo success payload or throws. On
 * FAILED the thrown Error is annotated with `moderationClassification`
 * and `failedPrompt` so callers can detect content-moderation blocks
 * and decide whether to rewrite + retry.
 */
interface LeonardoSubmitParams {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  width: number;
  height: number;
  styleIds?: string[];
  apiKey?: string;
  quality?: string;
}

interface LeonardoSuccess {
  url: string;
  imageId?: string;
  seed?: number;
}

export type LeonardoGenerationError = Error & {
  moderationClassification?: string[];
  failedPrompt?: string;
  moderation?: unknown;
};

async function submitLeonardoAndPoll(params: LeonardoSubmitParams): Promise<LeonardoSuccess> {
  const res = await fetch('/api/leonardo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      modelId: params.modelId,
      width: params.width,
      height: params.height,
      styleIds: params.styleIds,
      apiKey: params.apiKey,
      quality: params.quality || 'HIGH',
    }),
  });
  if (!res.ok) {
    let errMessage = 'Leonardo API failed';
    try {
      const errData = await res.json();
      errMessage = errData.error || errMessage;
    } catch {
      const text = await res.text();
      errMessage = `Server error (${res.status}): ${text.slice(0, 100)}...`;
    }
    throw new Error(errMessage);
  }
  const data = await res.json();
  if (!data.generationId) throw new Error('Leonardo returned no generationId');

  // Initial delay: Leonardo's Hasura layer needs ~3s to commit the
  // generation before status polls return a usable result.
  await new Promise(resolve => setTimeout(resolve, 3000));
  let attempts = 0;
  while (attempts < 150) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
    const statusRes = await fetch(`/api/leonardo/${data.generationId}`);
    if (!statusRes.ok) {
      const errText = await statusRes.text();
      throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
    }
    const statusData = await statusRes.json();
    if (statusData.status === 'COMPLETE') {
      return {
        url: statusData.url,
        imageId: statusData.imageId,
        seed: statusData.seed,
      };
    }
    if (statusData.status === 'FAILED') {
      const classifications: string[] = Array.isArray(statusData.moderation?.moderationClassification)
        ? statusData.moderation.moderationClassification
        : [];
      const err = new Error(statusData.error || 'Leonardo generation failed') as LeonardoGenerationError;
      err.moderationClassification = classifications;
      err.failedPrompt = statusData.failedPrompt || params.prompt;
      err.moderation = statusData.moderation;
      throw err;
    }
  }
  throw new Error('Timeout waiting for Leonardo generation');
}

function buildModerationRewriteInstruction(failedPrompt: string): string {
  return `This prompt was blocked by content moderation. Rewrite it to be cleaner and shorter (40–60 words max). Remove any violence, gore, or explicit language. Keep the character names and core concept. Return ONLY the rewritten prompt.

BLOCKED PROMPT:
${failedPrompt}

REWRITTEN PROMPT:`;
}

interface ModerationRetryCallback {
  /** Fires once if the first submission hits a moderation block and we're about to rewrite-and-retry. */
  onRetry: (classifications: string[]) => void;
}

interface SubmitResult {
  success: LeonardoSuccess;
  finalPrompt: string;
  /** true if the second attempt (rewrite) was used. false means first try succeeded. */
  retried: boolean;
}

/**
 * One-retry moderation recovery. Leonardo's moderation is empirically
 * non-deterministic — a 3-attempt cascade with aggressive rewrites and
 * defensive negative prompts gave marginal improvement for significant
 * complexity. This helper does the simple thing: submit, and if it
 * fails with a moderation classification, ask pi for a clean rewrite
 * and try exactly one more time. No classification-aware branching,
 * no forbidden lists, no negative-prompt escalation.
 *
 * Non-moderation errors rethrow immediately and skip the retry.
 */
async function submitWithOneRetry(
  initialPrompt: string,
  baseParams: Omit<LeonardoSubmitParams, 'prompt'>,
  callbacks: ModerationRetryCallback
): Promise<SubmitResult> {
  try {
    const success = await submitLeonardoAndPoll({ prompt: initialPrompt, ...baseParams });
    return { success, finalPrompt: initialPrompt, retried: false };
  } catch (err) {
    const lErr = err as LeonardoGenerationError;
    const classifications = lErr.moderationClassification || [];
    if (classifications.length === 0) throw err;

    console.warn('[moderation-stats] first-try blocked:', {
      model: baseParams.modelId,
      classifications,
      failedPrompt: (lErr.failedPrompt || initialPrompt).slice(0, 120),
    });
    callbacks.onRetry(classifications);

    const rewritten = await streamAIToString(
      buildModerationRewriteInstruction(lErr.failedPrompt || initialPrompt),
      { mode: 'enhance' }
    );
    const activePrompt = (rewritten || '').trim() || initialPrompt;

    const success = await submitLeonardoAndPoll({ prompt: activePrompt, ...baseParams });
    return { success, finalPrompt: activePrompt, retried: true };
  }
}

export interface LastGenerationError {
  message: string;
  classifications: string[];
  failedPrompt?: string;
  /** true when the retry also failed and the user needs to edit manually. */
  retried: boolean;
}

interface UseImageGenerationDeps {
  settings: UserSettings;
  updateImageTags: (id: string, tags: string[]) => void;
}

export function useImageGeneration({ settings, updateImageTags }: UseImageGenerationDeps) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<LastGenerationError | null>(null);

  const clearGenerationError = () => setGenerationError(null);
  const clearLastError = () => setLastError(null);

  const autoTagImage = async (id: string, providedImg?: GeneratedImage) => {
    const img = providedImg || [...images].find(i => i.id === id);
    if (!img) return;

    try {
      const text = await streamAIToString(
        `Analyze this image prompt: "${img.prompt}".
Generate a set of 5-8 fitting tags for a gallery. Include:
- Universe/Franchise (e.g., "Warhammer 40k", "Star Wars", "Marvel")
- Character names
- Style (e.g., "Cinematic", "Cyberpunk", "Grimdark")
- Themes (e.g., "Battle", "Portrait", "Landscape")
Return ONLY a JSON array of strings, nothing else.`,
        { mode: 'tag' }
      );
      let tags: any = [];
      try {
        tags = extractJsonFromLLM(text, 'array');
        if (!Array.isArray(tags) && typeof tags === 'object') {
          tags = tags.tags || Object.values(tags).flat();
        }
      } catch {
        tags = ['Mashup'];
      }
      if (Array.isArray(tags)) {
        tags = tags.map((t: string) => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t);
        updateImageTags(id, tags);
      }
    } catch (error) {
      console.error('Error auto-tagging image:', error);
    }
  };

  const setImageStatus = (id: string, status: 'generating' | 'animating' | 'ready') => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, status } : img));
  };

  const generateNegativePrompt = async (idea: string) => {
    try {
      const text = await streamAIToString(
        `Given this image generation idea: "${idea}"
Generate a concise negative prompt that would help avoid common issues in AI image generation.
Focus on: blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text overlay.
Keep it under 100 words. Return ONLY the negative prompt text, nothing else.`,
        { mode: 'negative-prompt' }
      );
      return text.trim();
    } catch (e) {
      console.error('Failed to generate negative prompt', e);
      return '';
    }
  };

  const generateImages = async (customPrompts?: string[], append: boolean = false, options?: GenerateOptions) => {
    setIsGenerating(true);
    setGenerationError(null);
    const placeholders: GeneratedImage[] = (customPrompts || [1, 2, 3, 4]).map((_, idx) => ({
      id: `placeholder-${Date.now()}-${idx}`,
      prompt: typeof _ === 'string' ? _ : 'Generating...',
      status: 'generating',
      url: '',
    }));

    if (!append) {
      setImages(placeholders);
    } else {
      setImages(prev => [...prev, ...placeholders]);
    }

    setProgress(append ? 'Generating image...' : 'Brainstorming crossover concepts...');

    try {
      let itemsToGenerate: {
        prompt: string,
        aspectRatio?: string,
        tags?: string[],
        selectedNiches?: string[],
        selectedGenres?: string[],
        negativePrompt?: string
      }[] = [];
      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const text = await streamAIToString(
            `Analyze this image prompt: "${prompt}". Generate 5-8 fitting tags (universe, character, style, theme). Return ONLY a JSON array of strings.`,
            { mode: 'tag' }
          );
          const parsed = extractJsonFromLLM(text, 'array');
          return Array.isArray(parsed) ? parsed : (parsed?.tags || ['Mashup']);
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      // Single source of truth: settings.agentPrompt carries diversity
      // rules, art direction, and universe-blending guidance. Niches +
      // genres are appended as live context so the active tag chips in
      // Settings still shape each batch.
      const systemContext = `${settings.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${settings.agentNiches?.join(', ') || 'All'}
Active Genres: ${settings.agentGenres?.join(', ') || 'All'}`;

      if (options?.skipEnhance && customPrompts) {
        itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
      } else if (!customPrompts || customPrompts.length === 0) {
        const promptText = await streamAIToString(
          `${systemContext}

${MASTERPROMPT_INSTRUCTIONS}

═══════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════
Generate 4 SHORT image prompts (40–60 words EACH) following the rules above. Leonardo's prompt_enhance will expand them — do NOT write long descriptions yourself. Maximum variety in characters, franchises, and settings. Do NOT repeat characters across the 4 prompts.

Return ONLY a JSON array of 4 objects, each with:
- "prompt": string — 40–60 words, named character + ONE equipment fusion + short setting + 1–2 quality tags
- "aspectRatio": string — "16:9" for wide/epic, "9:16" for portrait/character, "1:1" otherwise
- "tags": array of strings — 5-8 tags (universes, characters, themes)
- "selectedNiches": array of strings
- "selectedGenres": array of strings
- "negativePrompt": string — 15 words max, focused on technical quality (blurry, deformed, extra limbs)

Random Seed: ${Math.random()}`,
          { mode: 'idea' }
        );

        try {
          itemsToGenerate = extractJsonFromLLM(promptText, 'array');
        } catch (e) {
          console.error('Failed to parse prompts:', e, 'Raw:', promptText?.slice(0, 200));
          itemsToGenerate = [
            { prompt: 'A Space Marine from Warhammer 40k wielding a lightsaber from Star Wars, standing on a desolate alien planet.', aspectRatio: '16:9', tags: ['Warhammer 40k', 'Star Wars', 'Crossover'] },
            { prompt: 'Batman wearing an Iron Man suit, perched on a gargoyle in a futuristic cyberpunk Gotham.', aspectRatio: '9:16', tags: ['DC', 'Marvel', 'Crossover'] },
            { prompt: 'Gandalf the White casting a spell alongside Doctor Strange in the Mirror Dimension.', aspectRatio: '16:9', tags: ['Marvel', 'Fantasy', 'Crossover'] },
            { prompt: 'Darth Vader commanding a fleet of Star Destroyers over Hogwarts castle.', aspectRatio: '16:9', tags: ['Star Wars', 'Harry Potter', 'Crossover'] },
          ];
        }

        if (!Array.isArray(itemsToGenerate) || itemsToGenerate.length === 0) {
          throw new Error('Failed to generate prompts');
        }

        itemsToGenerate = itemsToGenerate.slice(0, 4);
      } else {
        const promptText2 = await streamAIToString(
          `${systemContext}

${MASTERPROMPT_INSTRUCTIONS}

═══════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════
The user has sketched these rough ideas: ${JSON.stringify(customPrompts)}

Transform EACH rough idea into a SHORT image prompt (40–60 words) following the rules above. Preserve the user's core concept — the character pairing, the situation — and add ONE crisp equipment fusion plus a brief setting phrase. Do NOT write long cinematic descriptions. Leonardo's prompt_enhance will expand your short prompt into the full detailed image prompt — your job is ingredients, not the recipe.

Return ONLY a JSON array of objects (one per input idea, in the same order), each with:
- "prompt": string — 40–60 words, named character + ONE equipment fusion + short setting + 1–2 quality tags
- "aspectRatio": string — "16:9" for wide/epic, "9:16" for portrait/character, "1:1" otherwise
- "tags": array of strings — 5-8 tags
- "selectedNiches": array of strings
- "selectedGenres": array of strings
- "negativePrompt": string — 15 words max, focused on technical quality (blurry, deformed, extra limbs)`,
          { mode: 'idea' }
        );

        try {
          itemsToGenerate = extractJsonFromLLM(promptText2, 'array');
        } catch (e) {
          console.error('Failed to parse enhanced prompts:', e, 'Raw:', promptText2?.slice(0, 200));
          itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
        }

        if (!Array.isArray(itemsToGenerate) || itemsToGenerate.length === 0) {
          itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
        } else {
          itemsToGenerate = itemsToGenerate.slice(0, customPrompts.length);
        }
      }

      for (let i = 0; i < itemsToGenerate.length; i++) {
        const item = itemsToGenerate[i];

        const selectedModel = options?.leonardoModel || settings.defaultLeonardoModel;
        const modelName = getModelName(selectedModel);

        // Ask pi to rewrite the prompt AND pick model-aware parameters
        // (best aspect ratio, best style, smart negative prompt) before
        // sending it to Leonardo. Skipped when options.skipEnhance is set.
        setProgress(`Optimizing prompt for ${modelName}...`);
        const enhancement = options?.skipEnhance
          ? { prompt: item.prompt }
          : await enhancePromptForModel(item.prompt, selectedModel, {
              style: options?.style,
              aspectRatio: item.aspectRatio || options?.aspectRatio,
              negativePrompt: item.negativePrompt || options?.negativePrompt,
            });

        const modelPrompt = enhancement.prompt;
        const currentAspectRatio =
          enhancement.aspectRatio || item.aspectRatio || options?.aspectRatio || '1:1';
        const modelStyle = enhancement.style || options?.style;
        const modelNegPrompt =
          enhancement.negativePrompt || item.negativePrompt || options?.negativePrompt;

        setProgress(`Generating image ${i + 1} of ${itemsToGenerate.length} with ${modelName}...`);
        try {
          const generatedNegativePrompt = modelNegPrompt;

          const dims = getLeonardoDimensions(selectedModel, currentAspectRatio);

          // Map art style name to Leonardo UUID. ART_STYLES are display names
          // like "Cinematic"; Leonardo needs UUIDs. Best-effort fuzzy match.
          const leonardoStyleUuids = (() => {
            if (!modelStyle) return undefined;
            const modelConfig = LEONARDO_MODELS.find(m => m.id === selectedModel);
            if (!modelConfig?.styles) return undefined;
            const match = modelConfig.styles.find(s =>
              s.name.toLowerCase() === modelStyle.toLowerCase() ||
              s.name.toLowerCase().includes(modelStyle.toLowerCase())
            );
            return match ? [match.uuid] : undefined;
          })();

          const leonardoBaseParams = {
            negativePrompt: generatedNegativePrompt,
            modelId: selectedModel,
            width: dims.width,
            height: dims.height,
            styleIds: leonardoStyleUuids,
            apiKey: settings.apiKeys.leonardo,
            quality: options?.quality || 'HIGH',
          };

          const { success, finalPrompt: activePrompt, retried } = await submitWithOneRetry(
            modelPrompt,
            leonardoBaseParams,
            {
              onRetry: (classifications) => {
                const reasons = classifications.join(', ');
                const stageMsg = `Blocked by ${reasons} — rewriting and retrying once…`;
                setLastError({
                  message: stageMsg,
                  classifications,
                  retried: false,
                });
                setImages(prev => prev.map(img =>
                  img.id === placeholders[i].id
                    ? { ...img, error: stageMsg }
                    : img
                ));
                setProgress(`Image ${i + 1}: ${stageMsg}`);
              },
            }
          );

          let finalUrl = success.url;
          if (settings.watermark?.enabled) {
            finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
          }
          const generatedTags = await ensureTags(activePrompt, item.tags);
          setImages(prev => prev.map(img => img.id === placeholders[i].id ? {
            id: `img-${Date.now()}-${i}`,
            url: finalUrl,
            prompt: activePrompt,
            tags: generatedTags,
            imageId: success.imageId,
            seed: success.seed,
            negativePrompt: generatedNegativePrompt,
            aspectRatio: currentAspectRatio,
            status: 'ready',
            modelInfo: {
              provider: 'leonardo',
              modelId: selectedModel,
              modelName: getModelName(selectedModel)
            }
          } : img));
          if (retried) {
            console.warn(`[moderation-stats] Image ${i + 1} recovered after rewrite (${selectedModel}).`);
            setLastError(null);
          }
        } catch (imgError: unknown) {
          console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);
          // Don't leave the placeholder stuck on 'generating'. Flip it
          // to 'error' with a human-readable reason so the UI can show
          // the failure instead of a forever-spinning loader.
          const rawMsg = getErrorMessage(imgError) || 'Generation failed';
          const classifications: string[] = (imgError as LeonardoGenerationError)?.moderationClassification || [];
          const isContentFilter =
            classifications.length > 0 ||
            rawMsg.toLowerCase().includes('no images found') ||
            rawMsg.toLowerCase().includes('complete but no images') ||
            rawMsg.toLowerCase().includes('blocked by content moderation');

          console.warn('[moderation-stats] final failure:', {
            model: selectedModel,
            classifications,
            message: rawMsg.slice(0, 160),
          });

          let errMsg: string;
          if (selectedModel === 'gpt-image-1.5' && isContentFilter) {
            errMsg = 'GPT-image-1.5 failed the generation. This model blocks more often than the nano-banana variants — try switching model or changing the style.';
          } else if (classifications.length > 0) {
            errMsg = `Blocked after rewrite: ${classifications.join(', ')}. Edit the prompt manually or try a different model.`;
          } else {
            errMsg = rawMsg;
          }
          setLastError({
            message: errMsg,
            classifications,
            failedPrompt: (imgError as LeonardoGenerationError)?.failedPrompt,
            retried: true,
          });
          setImages(prev => prev.map(img =>
            img.id === placeholders[i].id
              ? { ...img, status: 'error', error: errMsg }
              : img
          ));
        }
        setProgress('');
      }
    } catch (error: unknown) {
      console.error('Generation error:', error);
      const message = getErrorMessage(error) || 'An error occurred during generation.';
      setGenerationError(message);
      setProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  const rerollImage = async (id: string, prompt: string, options?: GenerateOptions) => {
    setIsGenerating(true);
    setGenerationError(null);
    setProgress('Rerolling image...');

    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating' } : img));

    try {
      const selectedModel = options?.leonardoModel || settings.defaultLeonardoModel;

      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const text = await streamAIToString(
            `Analyze this image prompt: "${prompt}". Generate 5-8 fitting tags (universe, character, style, theme). Return ONLY a JSON array of strings.`,
            { mode: 'tag' }
          );
          const parsed = extractJsonFromLLM(text, 'array');
          return Array.isArray(parsed) ? parsed : (parsed?.tags || ['Mashup']);
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      let enhancedPrompt = prompt;
      try {
        enhancedPrompt = await streamAIToString(
          `Platform Niches: ${settings.agentNiches?.join(', ') || 'None'}.
Target Genres: ${settings.agentGenres?.join(', ') || 'None'}.
The user wants to re-roll an image based on this idea: "${prompt}". Enhance this idea into a highly detailed, cinematic image generation prompt. You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers. Return ONLY the enhanced prompt as a single string.`,
          { mode: 'enhance' }
        );
      } catch (e) {
        console.error('Reroll prompt enhancement failed, using original prompt', e);
      }

      const finalPrompt = options?.negativePrompt
        ? `${enhancedPrompt}\nDo not include: ${options.negativePrompt}`
        : enhancedPrompt;

      // Apply the per-model prompt + parameter tuning on top of the
      // reroll enhancement so rerolls also pick the best aspect ratio
      // and art style for the target Leonardo variant.
      const rerollEnhancement = options?.skipEnhance
        ? { prompt: finalPrompt }
        : await enhancePromptForModel(finalPrompt, selectedModel, {
            style: options?.style,
            aspectRatio: options?.aspectRatio,
            negativePrompt: options?.negativePrompt,
          });
      const modelPrompt = rerollEnhancement.prompt;
      const modelStyle = rerollEnhancement.style || options?.style;
      const modelNegPrompt = rerollEnhancement.negativePrompt || options?.negativePrompt;

      let newImg: GeneratedImage | null = null;

      try {
        const currentAspectRatio =
          rerollEnhancement.aspectRatio || options?.aspectRatio || '1:1';
        const dims = getLeonardoDimensions(selectedModel, currentAspectRatio);

        // Map art style name to Leonardo UUID (same fix as generate path).
        // Uses the model-optimised style when pi suggested one.
        const leonardoStyleUuids = (() => {
          if (!modelStyle) return undefined;
          const modelConfig = LEONARDO_MODELS.find(m => m.id === selectedModel);
          if (!modelConfig?.styles) return undefined;
          const match = modelConfig.styles.find(s =>
            s.name.toLowerCase() === modelStyle.toLowerCase() ||
            s.name.toLowerCase().includes(modelStyle.toLowerCase())
          );
          return match ? [match.uuid] : undefined;
        })();

        const leonardoBaseParams = {
          negativePrompt: modelNegPrompt,
          modelId: selectedModel,
          width: dims.width,
          height: dims.height,
          styleIds: leonardoStyleUuids,
          apiKey: settings.apiKeys.leonardo,
          quality: options?.quality || 'HIGH',
        };

        const { success, finalPrompt: activePrompt, retried } = await submitWithOneRetry(
          modelPrompt,
          leonardoBaseParams,
          {
            onRetry: (classifications) => {
              const reasons = classifications.join(', ');
              const stageMsg = `Reroll blocked by ${reasons} — rewriting and retrying once…`;
              setLastError({
                message: stageMsg,
                classifications,
                retried: false,
              });
              setImages(prev => prev.map(img =>
                img.id === id
                  ? { ...img, error: stageMsg }
                  : img
              ));
              setProgress(stageMsg);
            },
          }
        );

        let finalUrl = success.url;
        if (settings.watermark?.enabled) {
          finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
        }
        const generatedTags = await ensureTags(activePrompt, []);
        newImg = {
          id: `img-${Date.now()}-reroll`,
          url: finalUrl,
          prompt: activePrompt,
          tags: generatedTags,
          imageId: success.imageId,
          seed: success.seed,
          negativePrompt: modelNegPrompt,
          aspectRatio: currentAspectRatio,
          status: 'ready',
          modelInfo: {
            provider: 'leonardo',
            modelId: selectedModel,
            modelName: getModelName(selectedModel)
          }
        };
        if (retried) {
          console.warn(`[moderation-stats] Reroll recovered after rewrite (${selectedModel}).`);
          setLastError(null);
        }
      } catch (err) {
        console.error('Leonardo reroll failed:', err);
        const lErr = err as LeonardoGenerationError;
        const classifications = lErr?.moderationClassification || [];
        if (classifications.length > 0) {
          setLastError({
            message: `Still blocked after rewrite: ${classifications.join(', ')}. Edit the prompt manually.`,
            classifications,
            failedPrompt: lErr.failedPrompt,
            retried: true,
          });
        }
        throw err;
      }

      if (newImg) {
        setImages(prev => {
          return prev.map(img => img.id === id ? newImg! : img);
        });
      } else {
        setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'ready' } : img));
      }

      setProgress('');
    } catch (error: unknown) {
      console.error('Reroll error:', error);
      const message = getErrorMessage(error) || 'An error occurred during reroll.';
      setGenerationError(message);
      setProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    images,
    setImages,
    isGenerating,
    progress,
    generationError,
    clearGenerationError,
    lastError,
    clearLastError,
    generateImages,
    rerollImage,
    generateNegativePrompt,
    autoTagImage,
    setImageStatus,
  };
}
