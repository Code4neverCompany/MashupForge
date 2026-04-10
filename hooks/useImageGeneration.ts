'use client';

import { useState } from 'react';
import { streamAIToString } from '@/lib/aiClient';
import {
  type GeneratedImage,
  type GenerateOptions,
  type UserSettings,
  type WatermarkSettings,
  LEONARDO_MODELS,
  getLeonardoDimensions,
  RECOMMENDED_NICHES,
  RECOMMENDED_GENRES,
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

      const padding = canvas.width * 0.03;

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

interface UseImageGenerationDeps {
  settings: UserSettings;
  updateImageTags: (id: string, tags: string[]) => void;
}

export function useImageGeneration({ settings, updateImageTags }: UseImageGenerationDeps) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  const clearGenerationError = () => setGenerationError(null);

  const autoTagImage = async (id: string, providedImg?: GeneratedImage) => {
    const img = providedImg || [...images].find(i => i.id === id);
    if (!img) return;

    try {
      const res = await fetch('/api/ai/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: img.prompt }),
      });

      if (!res.ok) throw new Error('Tag request failed');
      const data = await res.json();
      let tags = data.tags || [];
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
      const res = await fetch('/api/ai/negative-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.negativePrompt || '';
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
          const tagRes = await fetch('/api/ai/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          });
          if (!tagRes.ok) return ['Mashup'];
          const tagData = await tagRes.json();
          return tagData.tags || ['Mashup'];
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      const systemContext = `${settings.agentPrompt || 'You are a Master Content Creator.'}
      Active Niches: ${settings.agentNiches?.join(', ') || 'None'}.
      Active Genres: ${settings.agentGenres?.join(', ') || 'None'}.
      Recommended Niches: ${RECOMMENDED_NICHES.join(', ')}.
      Recommended Genres: ${RECOMMENDED_GENRES.join(', ')}.

      INTELLIGENT SELECTION:
      1. For each prompt, choose the most fitting Niches and Genres from the ACTIVE lists.
      2. If a RECOMMENDED (but inactive) tag is significantly better for the specific prompt, you may pick it.
      3. Smartly select the most appropriate aspect ratio (e.g., "16:9", "9:16", "1:1", "4:3", "3:4").
      4. Generate a set of fitting tags for the gallery (characters, universe, themes).

      CRITICAL: Use Google Search to research current social media trends, popular crossover memes, and viral "what if" scenarios for Star Wars, Marvel, DC, and Warhammer 40k. Base your ideas on these real-world trends.
      Focus heavily on alternative universes, different timelines, and epic crossovers.
      Ensure the prompts are safe and do not contain restricted content.

      DIVERSITY MANDATE: You MUST generate highly diverse ideas. Do NOT repeat the same characters, themes, or scenarios across the prompts. Ensure a wide variety of characters from the mentioned franchises are used. Do not get stuck on a single character (like Dr. Doom, Darth Vader, Batman, etc.). Each prompt must feature completely different primary characters and settings.`;

      if (options?.skipEnhance && customPrompts) {
        itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
      } else if (!customPrompts || customPrompts.length === 0) {
        const promptText = await streamAIToString('/api/ai/chat', {
          systemPrompt: systemContext,
          prompt: `Generate 4 completely distinct, highly detailed image generation prompts.
          Ensure maximum variety in characters, franchises, and settings. Do NOT repeat characters.
          Return ONLY a JSON array of 4 objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)

          Random Seed: ${Math.random()}`,
        });

        try {
          const cleaned = promptText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          itemsToGenerate = JSON.parse(cleaned || '[]');
        } catch (e) {
          console.error('Failed to parse prompts:', e);
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
        const promptText2 = await streamAIToString('/api/ai/chat', {
          systemPrompt: systemContext,
          prompt: `The user wants to generate images based on these ideas: ${JSON.stringify(customPrompts)}.
          Enhance these ideas into highly detailed, cinematic image generation prompts.
          Return ONLY a JSON array of objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)`,
        });

        try {
          const cleaned = promptText2.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          itemsToGenerate = JSON.parse(cleaned || '[]');
        } catch (e) {
          console.error('Failed to parse enhanced prompts:', e);
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
        const currentAspectRatio = item.aspectRatio || options?.aspectRatio || '1:1';

        const selectedModel = options?.leonardoModel || settings.defaultLeonardoModel;
        const modelName = getModelName(selectedModel);

        setProgress(`Generating image ${i + 1} of ${itemsToGenerate.length} with ${modelName}...`);
        try {
          const generatedNegativePrompt = item.negativePrompt || options?.negativePrompt;

          const dims = getLeonardoDimensions(selectedModel, currentAspectRatio);

          const res = await fetch('/api/leonardo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: item.prompt,
              negative_prompt: generatedNegativePrompt,
              modelId: selectedModel,
              width: dims.width,
              height: dims.height,
              styleIds: options?.style ? [options.style] : undefined,
              apiKey: settings.apiKeys.leonardo
            })
          });

          if (!res.ok) {
            let errMessage = 'Leonardo API failed';
            try {
              const errData = await res.json();
              errMessage = errData.error || errMessage;
            } catch (e) {
              const text = await res.text();
              errMessage = `Server error (${res.status}): ${text.slice(0, 100)}...`;
            }
            throw new Error(errMessage);
          }

          const data = await res.json();
          if (data.generationId) {
            // Initial delay: Leonardo's Hasura layer needs ~3s to commit the
            // generation before status polls return a usable result. Polling
            // earlier triggers the auth-hook 500 path on the server.
            await new Promise(resolve => setTimeout(resolve, 3000));
            let status = 'PENDING';
            let attempts = 0;
            while (status !== 'COMPLETE' && attempts < 150) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              attempts++;
              const statusRes = await fetch(`/api/leonardo/${data.generationId}`);
              if (!statusRes.ok) {
                const errText = await statusRes.text();
                throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
              }
              const statusData = await statusRes.json();
              status = statusData.status;
              if (status === 'COMPLETE') {
                let finalUrl = statusData.url;
                if (settings.watermark?.enabled) {
                  finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
                }
                const generatedTags = await ensureTags(item.prompt, item.tags);
                setImages(prev => prev.map(img => img.id === placeholders[i].id ? {
                  id: `img-${Date.now()}-${i}`,
                  url: finalUrl,
                  prompt: item.prompt,
                  tags: generatedTags,
                  imageId: statusData.imageId,
                  seed: statusData.seed,
                  negativePrompt: generatedNegativePrompt,
                  aspectRatio: currentAspectRatio,
                  status: 'ready',
                  modelInfo: {
                    provider: 'leonardo',
                    modelId: selectedModel,
                    modelName: getModelName(selectedModel)
                  }
                } : img));
              } else if (status === 'FAILED') {
                throw new Error(statusData.error || 'Leonardo generation failed');
              }
            }
            if (status !== 'COMPLETE') {
              throw new Error('Timeout waiting for Leonardo generation');
            }
          }
        } catch (imgError: any) {
          console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);
        }
        setProgress('');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      const message = error?.message || 'An error occurred during generation.';
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
          const tagRes = await fetch('/api/ai/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          });
          if (!tagRes.ok) return ['Mashup'];
          const tagData = await tagRes.json();
          return tagData.tags || ['Mashup'];
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      let enhancedPrompt = prompt;
      try {
        enhancedPrompt = await streamAIToString('/api/ai/chat', {
          systemPrompt: settings.agentPrompt || 'You are a Master Content Creator.',
          prompt: `Platform Niches: ${settings.agentNiches?.join(', ') || 'None'}.
        Target Genres: ${settings.agentGenres?.join(', ') || 'None'}.
        The user wants to re-roll an image based on this idea: "${prompt}". Enhance this idea into a highly detailed, cinematic image generation prompt. You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers. Return ONLY the enhanced prompt as a single string.`,
        });
      } catch (e) {
        console.error('Reroll prompt enhancement failed, using original prompt', e);
      }

      const finalPrompt = options?.negativePrompt
        ? `${enhancedPrompt}\nDo not include: ${options.negativePrompt}`
        : enhancedPrompt;

      let newImg: GeneratedImage | null = null;

      try {
        const currentAspectRatio = options?.aspectRatio || '1:1';
        const dims = getLeonardoDimensions(selectedModel, currentAspectRatio);

        const res = await fetch('/api/leonardo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: finalPrompt,
            negative_prompt: options?.negativePrompt,
            modelId: selectedModel,
            width: dims.width,
            height: dims.height,
            styleIds: options?.style ? [options.style] : undefined,
            apiKey: settings.apiKeys.leonardo
          })
        });

        if (!res.ok) {
          let errMessage = 'Leonardo API failed';
          try {
            const errData = await res.json();
            errMessage = errData.error || errMessage;
          } catch (e) {
            const text = await res.text();
            errMessage = `Server error (${res.status}): ${text.slice(0, 100)}...`;
          }
          throw new Error(errMessage);
        }

        const data = await res.json();
        if (data.generationId) {
          // Initial delay: see comment in main generate path.
          await new Promise(resolve => setTimeout(resolve, 3000));
          let status = 'PENDING';
          let attempts = 0;
          while (status !== 'COMPLETE' && attempts < 150) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
            const statusRes = await fetch(`/api/leonardo/${data.generationId}`);
            if (!statusRes.ok) {
              const errText = await statusRes.text();
              throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
            }
            const statusData = await statusRes.json();
            status = statusData.status;
            if (status === 'COMPLETE') {
              let finalUrl = statusData.url;
              if (settings.watermark?.enabled) {
                finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
              }
              const generatedTags = await ensureTags(enhancedPrompt, []);
              newImg = {
                id: `img-${Date.now()}-reroll`,
                url: finalUrl,
                prompt: enhancedPrompt,
                tags: generatedTags,
                imageId: statusData.imageId,
                seed: statusData.seed,
                negativePrompt: options?.negativePrompt,
                aspectRatio: currentAspectRatio,
                status: 'ready',
                modelInfo: {
                  provider: 'leonardo',
                  modelId: selectedModel,
                  modelName: getModelName(selectedModel)
                }
              };
            } else if (status === 'FAILED') {
              throw new Error(statusData.error || 'Leonardo generation failed');
            }
          }
          if (status !== 'COMPLETE') {
            throw new Error('Timeout waiting for Leonardo generation');
          }
        }
      } catch (err) {
        console.error('Leonardo reroll failed:', err);
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
    } catch (error: any) {
      console.error('Reroll error:', error);
      const message = error?.message || 'An error occurred during reroll.';
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
    generateImages,
    rerollImage,
    generateNegativePrompt,
    autoTagImage,
    setImageStatus,
  };
}
