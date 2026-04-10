'use client';

import { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import {
  type GeneratedImage,
  type GenerateOptions,
  type UserSettings,
  type WatermarkSettings,
  GEMINI_MODELS,
  PAID_MODELS,
  LEONARDO_MODELS,
  RECOMMENDED_NICHES,
  RECOMMENDED_GENRES,
} from '../types/mashup';

function getModelName(id: string, provider: 'gemini' | 'leonardo') {
  if (provider === 'gemini') {
    return GEMINI_MODELS.find(m => m.id === id)?.name || id;
  }
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

  const autoTagImage = async (id: string, providedImg?: GeneratedImage) => {
    const img = providedImg || [...images].find(i => i.id === id);
    if (!img) return;

    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this image prompt: "${img.prompt}".
        Generate a set of 5-8 fitting tags for a gallery.
        Include:
        - Universe/Franchise (e.g., "Warhammer 40k" - NEVER use "Warhammer 40,000", "Star Wars", "Marvel")
        - Character names
        - Style (e.g., "Cinematic", "Cyberpunk", "Grimdark")
        - Themes (e.g., "Battle", "Portrait", "Landscape")
        Return ONLY a JSON array of strings.`,
        config: {
          responseMimeType: 'application/json',
        },
      });

      let tags = JSON.parse(response.text || '[]');
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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this image generation idea: "${idea}".
        Generate a concise negative prompt (comma-separated list of things to avoid) to ensure high quality, avoiding common AI artifacts, blurry textures, or elements that would clash with this specific theme.
        Return ONLY the negative prompt string.`,
      });
      return res.text || '';
    } catch (e) {
      console.error('Failed to generate negative prompt', e);
      return '';
    }
  };

  const generateImages = async (customPrompts?: string[], append: boolean = false, options?: GenerateOptions) => {
    setIsGenerating(true);
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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      let itemsToGenerate: {
        prompt: string,
        aspectRatio?: string,
        tags?: string[],
        selectedNiches?: string[],
        selectedGenres?: string[],
        negativePrompt?: string
      }[] = [];
      const isLeonardo = options?.provider ? options.provider === 'leonardo' : settings.defaultProvider === 'leonardo';

      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const tagRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze this image prompt: "${prompt}". Generate a set of 5-8 fitting tags for a gallery. Include Universe/Franchise, Character names, Style, and Themes. Return ONLY a JSON array of strings.`,
            config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(tagRes.text || '[]');
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
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `${systemContext}
          Generate 4 completely distinct, highly detailed image generation prompts.
          Ensure maximum variety in characters, franchises, and settings. Do NOT repeat characters.
          Return ONLY a JSON array of 4 objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)

          Random Seed: ${Math.random()}`,
          config: {
            tools: [{ googleSearch: {} }],
            toolConfig: { includeServerSideToolInvocations: true },
            temperature: 1.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedNiches: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedGenres: { type: Type.ARRAY, items: { type: Type.STRING } },
                  negativePrompt: { type: Type.STRING }
                }
              },
            },
          },
        });

        try {
          itemsToGenerate = JSON.parse(promptRes.text || '[]');
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
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `${systemContext}
          The user wants to generate images based on these ideas: ${JSON.stringify(customPrompts)}.
          Enhance these ideas into highly detailed, cinematic image generation prompts.
          Return ONLY a JSON array of objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)`,
          config: {
            temperature: 1.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedNiches: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedGenres: { type: Type.ARRAY, items: { type: Type.STRING } },
                  negativePrompt: { type: Type.STRING }
                }
              },
            },
          },
        });

        try {
          itemsToGenerate = JSON.parse(promptRes.text || '[]');
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

      if (!isLeonardo && typeof window !== 'undefined' && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }

      for (let i = 0; i < itemsToGenerate.length; i++) {
        const item = itemsToGenerate[i];
        const currentAspectRatio = item.aspectRatio || options?.aspectRatio || '1:1';

        const selectedModel = isLeonardo
          ? (options?.leonardoModel || settings.defaultLeonardoModel)
          : (options?.geminiModel || settings.defaultGeminiModel);

        const isGeminiModel = GEMINI_MODELS.some(m => m.id === selectedModel);
        const currentProvider = isGeminiModel ? 'gemini' : 'leonardo';
        let modelName = getModelName(selectedModel, currentProvider);
        const isCurrentLeonardo = currentProvider === 'leonardo';

        setProgress(`Generating image ${i + 1} of ${itemsToGenerate.length} with ${modelName}...`);
        try {
          const generatedNegativePrompt = item.negativePrompt || options?.negativePrompt;
          const finalPrompt = generatedNegativePrompt
            ? `${item.prompt}\nDo not include: ${generatedNegativePrompt}`
            : item.prompt;

          let useGeminiApi = isGeminiModel;
          let usedGeminiFallback = false;

            if (!useGeminiApi) {
              try {
                const modelNameLower = modelName.toLowerCase();
                const isXL = modelNameLower.includes('xl') ||
                             modelNameLower.includes('lightning') ||
                             selectedModel === 'gemini-image-2' ||
                             selectedModel === 'nano-banana-2';

                let width = isXL ? 1024 : 768;
                let height = isXL ? 1024 : 768;

              if (currentAspectRatio === '16:9') {
                width = isXL ? 1376 : 1024;
                height = isXL ? 768 : 576;
              } else if (currentAspectRatio === '9:16') {
                width = isXL ? 768 : 576;
                height = isXL ? 1376 : 1024;
              } else if (currentAspectRatio === '4:3') {
                width = isXL ? 1200 : 896;
                height = isXL ? 896 : 672;
              } else if (currentAspectRatio === '3:4') {
                width = isXL ? 896 : 672;
                height = isXL ? 1200 : 896;
              } else if (currentAspectRatio === '4:1') {
                width = isXL ? 1584 : 1024;
                height = isXL ? 672 : 256;
              } else if (currentAspectRatio === '1:4') {
                width = isXL ? 672 : 256;
                height = isXL ? 1584 : 1024;
              }

              const res = await fetch('/api/leonardo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: item.prompt,
                  negative_prompt: generatedNegativePrompt,
                  modelId: selectedModel,
                  width,
                  height,
                  seed: options?.seed,
                  guidance_scale: options?.cfgScale,
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
                let status = 'PENDING';
                let attempts = 0;
                while (status !== 'COMPLETE' && attempts < 150) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  attempts++;
                  const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
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
                        modelName: getModelName(selectedModel, 'leonardo')
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
            } catch (err) {
              console.error('Leonardo generation failed:', err);
              throw err;
            }
          }

          if (useGeminiApi) {
            const selectedGeminiModel = selectedModel;
            modelName = getModelName(selectedGeminiModel, 'gemini');

            if (PAID_MODELS.includes(selectedGeminiModel) && typeof window !== 'undefined' && (window as any).aistudio) {
              const hasKey = await (window as any).aistudio.hasSelectedApiKey();
              if (!hasKey) {
                await (window as any).aistudio.openSelectKey();
              }
            }

            const apiKey = (PAID_MODELS.includes(selectedGeminiModel) && process.env.API_KEY)
              ? process.env.API_KEY
              : (process.env.API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY);

            const imageAi = new GoogleGenAI({ apiKey });

            const imageConfig: any = {};

            let finalAspectRatio = currentAspectRatio;
            if (selectedGeminiModel === 'gemini-2.5-flash-image') {
              const unsupportedRatios = ['1:4', '1:8', '4:1', '8:1'];
              if (unsupportedRatios.includes(finalAspectRatio)) {
                finalAspectRatio = finalAspectRatio.startsWith('1:') ? '9:16' : '16:9';
              }
            }
            imageConfig.aspectRatio = finalAspectRatio;

            if (selectedGeminiModel !== 'gemini-2.5-flash-image') {
              imageConfig.imageSize = options?.imageSize || '1K';
            }

            const imgRes = await imageAi.models.generateContent({
              model: selectedGeminiModel,
              contents: {
                parts: [{ text: finalPrompt }],
              },
              config: {
                imageConfig,
              },
            });

            let base64Data = '';
            for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                base64Data = part.inlineData.data || '';
                break;
              }
            }

            if (base64Data) {
              let finalUrl = `data:image/jpeg;base64,${base64Data}`;
              const generatedTags = await ensureTags(item.prompt, item.tags);
              let newImg: GeneratedImage = {
                id: `img-${Date.now()}-${i}`,
                base64: base64Data,
                prompt: item.prompt,
                tags: generatedTags,
                negativePrompt: generatedNegativePrompt,
                aspectRatio: currentAspectRatio,
                imageSize: options?.imageSize || '1K',
                status: 'ready',
                modelInfo: {
                  provider: 'gemini',
                  modelId: selectedGeminiModel,
                  modelName: getModelName(selectedGeminiModel, 'gemini')
                }
              };

              if (settings.watermark?.enabled) {
                finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
                newImg = {
                  ...newImg,
                  url: finalUrl,
                };
                delete newImg.base64;
              } else {
                newImg.url = finalUrl;
              }
              setImages(prev => prev.map(img => img.id === placeholders[i].id ? newImg : img));
            }
          }
        } catch (imgError: any) {
            console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);

            const errStr = typeof imgError === 'string' ? imgError : (imgError.message || JSON.stringify(imgError));
            if (errStr.includes('PERMISSION_DENIED') || errStr.includes('NOT_FOUND') || errStr.includes('403') || errStr.includes('404')) {
              if (typeof window !== 'undefined' && (window as any).aistudio) {
                console.log('Detected API key issue, prompting for key selection...');
                (window as any).aistudio.openSelectKey();
              }
            }
          }
        }
        setProgress('');
      } catch (error) {
      console.error('Generation error:', error);
      setProgress('An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const rerollImage = async (id: string, prompt: string, options?: GenerateOptions) => {
    setIsGenerating(true);
    setProgress('Rerolling image...');

    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating' } : img));

    try {
      const isLeonardo = options?.provider ? options.provider === 'leonardo' : settings.defaultProvider === 'leonardo';
      const selectedModel = isLeonardo
        ? (options?.leonardoModel || settings.defaultLeonardoModel)
        : (options?.geminiModel || settings.defaultGeminiModel);

      const useGeminiApi = !isLeonardo && selectedModel.startsWith('gemini-');

      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const tagRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze this image prompt: "${prompt}". Generate a set of 5-8 fitting tags for a gallery. Include Universe/Franchise, Character names, Style, and Themes. Return ONLY a JSON array of strings.`,
            config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(tagRes.text || '[]');
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${settings.agentPrompt || 'You are a Master Content Creator.'}
        Platform Niches: ${settings.agentNiches?.join(', ') || 'None'}.
        Target Genres: ${settings.agentGenres?.join(', ') || 'None'}.
        The user wants to re-roll an image based on this idea: "${prompt}". Enhance this idea into a highly detailed, cinematic image generation prompt. You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers. Return ONLY the enhanced prompt as a single string.`,
      });
      const enhancedPrompt = promptRes.text || prompt;

      const finalPrompt = options?.negativePrompt
        ? `${enhancedPrompt}\nDo not include: ${options.negativePrompt}`
        : enhancedPrompt;

      let newImg: GeneratedImage | null = null;
      let usedGeminiFallback = false;

      if (!useGeminiApi) {
        try {
          const modelName = getModelName(selectedModel, 'leonardo').toLowerCase();
          const isXL = modelName.includes('xl') ||
                       modelName.includes('lightning') ||
                       selectedModel === 'gemini-image-2';

          let width = isXL ? 1024 : 768;
          let height = isXL ? 1024 : 768;

          const currentAspectRatio = options?.aspectRatio || '1:1';
          if (currentAspectRatio === '16:9') {
            width = isXL ? 1376 : 1024;
            height = isXL ? 768 : 576;
          } else if (currentAspectRatio === '9:16') {
            width = isXL ? 768 : 576;
            height = isXL ? 1376 : 1024;
          } else if (currentAspectRatio === '4:3') {
            width = isXL ? 1200 : 896;
            height = isXL ? 896 : 672;
          } else if (currentAspectRatio === '3:4') {
            width = isXL ? 896 : 672;
            height = isXL ? 1200 : 896;
          } else if (currentAspectRatio === '4:1') {
            width = isXL ? 1584 : 1024;
            height = isXL ? 672 : 256;
          } else if (currentAspectRatio === '1:4') {
            width = isXL ? 672 : 256;
            height = isXL ? 1584 : 1024;
          }

          const res = await fetch('/api/leonardo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: finalPrompt,
              negative_prompt: options?.negativePrompt,
              modelId: selectedModel,
              width,
              height,
              seed: options?.seed,
              guidance_scale: options?.cfgScale,
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
            let status = 'PENDING';
            let attempts = 0;
            while (status !== 'COMPLETE' && attempts < 150) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              attempts++;
              const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
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
                    aspectRatio: options?.aspectRatio || '1:1',
                    status: 'ready',
                    modelInfo: {
                      provider: 'leonardo',
                      modelId: selectedModel,
                      modelName: getModelName(selectedModel, 'leonardo')
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
      }

      if (useGeminiApi) {
        const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
        const imageAi = new GoogleGenAI({ apiKey: geminiApiKey });
        const selectedGeminiModel = selectedModel;
        const imageConfig: any = {};

        let finalAspectRatio = options?.aspectRatio || '1:1';
        if (selectedGeminiModel === 'gemini-2.5-flash-image') {
          const unsupportedRatios = ['1:4', '1:8', '4:1', '8:1'];
          if (unsupportedRatios.includes(finalAspectRatio)) {
            finalAspectRatio = finalAspectRatio.startsWith('1:') ? '9:16' : '16:9';
          }
        }
        imageConfig.aspectRatio = finalAspectRatio;

        if (selectedGeminiModel !== 'gemini-2.5-flash-image') {
          imageConfig.imageSize = options?.imageSize || '1K';
        }

        const imgRes = await imageAi.models.generateContent({
          model: selectedGeminiModel,
          contents: finalPrompt,
          config: {
            imageConfig,
          },
        });

        let base64Data = '';
        for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Data = part.inlineData.data || '';
            break;
          }
        }

        if (base64Data) {
          let finalUrl = `data:image/jpeg;base64,${base64Data}`;
          const generatedTags = await ensureTags(enhancedPrompt, []);
          if (settings.watermark?.enabled) {
            finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
            newImg = {
              id: `img-${Date.now()}-reroll`,
              url: finalUrl,
              prompt: enhancedPrompt,
              tags: generatedTags,
              aspectRatio: finalAspectRatio,
              imageSize: options?.imageSize || '1K',
              status: 'ready',
              modelInfo: {
                provider: 'gemini',
                modelId: selectedGeminiModel,
                modelName: getModelName(selectedGeminiModel, 'gemini')
              }
            };
          } else {
            newImg = {
              id: `img-${Date.now()}-reroll`,
              base64: base64Data,
              url: finalUrl,
              prompt: enhancedPrompt,
              tags: generatedTags,
              aspectRatio: finalAspectRatio,
              imageSize: options?.imageSize || '1K',
              status: 'ready',
              modelInfo: {
                provider: 'gemini',
                modelId: selectedGeminiModel,
                modelName: getModelName(selectedGeminiModel, 'gemini')
              }
            };
          }
        }
      }

      if (newImg) {
        setImages(prev => {
          return prev.map(img => img.id === id ? newImg! : img);
        });
      } else {
        setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'ready' } : img));
      }

      setProgress('');
    } catch (error) {
      console.error('Reroll error:', error);
      setProgress('An error occurred during reroll.');
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    images,
    setImages,
    isGenerating,
    progress,
    generateImages,
    rerollImage,
    generateNegativePrompt,
    autoTagImage,
    setImageStatus,
  };
}
