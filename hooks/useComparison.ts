'use client';

import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import {
  type GeneratedImage,
  type GenerateOptions,
  type UserSettings,
  type WatermarkSettings,
  GEMINI_MODELS,
  LEONARDO_MODELS,
} from '../types/mashup';

function getModelName(id: string, provider: 'gemini' | 'leonardo') {
  if (provider === 'gemini') {
    return GEMINI_MODELS.find(m => m.id === id)?.name || id;
  }
  return LEONARDO_MODELS.find(m => m.id === id)?.name || id;
}

interface UseComparisonDeps {
  settings: UserSettings;
  saveImage: (img: GeneratedImage) => void;
  applyWatermark: (baseImageSrc: string, wm: WatermarkSettings, channelName?: string) => Promise<string>;
}

export function useComparison({ settings, saveImage, applyWatermark }: UseComparisonDeps) {
  const [comparisonResults, setComparisonResults] = useState<GeneratedImage[]>([]);
  const [comparisonPrompt, setComparisonPrompt] = useState('');
  const [comparisonOptions, setComparisonOptions] = useState<GenerateOptions>({
    aspectRatio: '1:1',
    imageSize: '1K',
    negativePrompt: ''
  });
  const [isComparisonLoaded, setIsComparisonLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const idbComparisonResults = await get('mashup_comparison_results');
        if (idbComparisonResults) setComparisonResults(idbComparisonResults);
      } catch (e) {
        console.error('Failed to load comparison results', e);
      } finally {
        setIsComparisonLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (isComparisonLoaded) {
      set('mashup_comparison_results', comparisonResults);
    }
  }, [comparisonResults, isComparisonLoaded]);

  const generateComparison = async (prompt: string, modelIds: string[], options?: GenerateOptions) => {
    setIsGenerating(true);
    const comparisonId = `comp-group-${Date.now()}`;

    let finalPrompt = prompt;
    if (options?.style || options?.lighting || options?.angle) {
      const parts = [prompt];
      if (options.style) parts.push(`Art style: ${options.style}`);
      if (options.lighting) parts.push(`Lighting: ${options.lighting}`);
      if (options.angle) parts.push(`Camera angle: ${options.angle}`);
      parts.push('Highly detailed, cinematic composition.');
      finalPrompt = parts.join('. ');
    }

    const placeholders: GeneratedImage[] = modelIds.map((modelId, idx) => ({
      id: `comp-placeholder-${Date.now()}-${idx}`,
      comparisonId,
      prompt: finalPrompt,
      status: 'generating',
      url: '',
      modelInfo: {
        provider: LEONARDO_MODELS.some(m => m.id === modelId) ? 'leonardo' : 'gemini',
        modelId,
        modelName: getModelName(modelId, LEONARDO_MODELS.some(m => m.id === modelId) ? 'leonardo' : 'gemini')
      }
    }));
    setComparisonResults(prev => [...placeholders, ...prev]);
    setProgress('Preparing comparison...');

    try {
      for (let i = 0; i < modelIds.length; i++) {
        const modelId = modelIds[i];
        const isLeonardo = LEONARDO_MODELS.some(m => m.id === modelId);
        const provider = isLeonardo ? 'leonardo' : 'gemini';
        const modelName = getModelName(modelId, provider);

        setProgress(`Generating with ${modelName}...`);

        try {
          let imageUrl = '';
          let base64Data = '';
          let imageId = '';
          let seed = 0;

          if (isLeonardo) {
            const modelNameLower = modelName.toLowerCase();
            const isXL = modelNameLower.includes('xl') || modelNameLower.includes('lightning') || modelId === 'gemini-image-2' || modelId === 'nano-banana-2';

            let width = isXL ? 1024 : 768;
            let height = isXL ? 1024 : 768;
            const currentAspectRatio = options?.aspectRatio || '1:1';

            if (currentAspectRatio === '16:9') { width = isXL ? 1376 : 1024; height = isXL ? 768 : 576; }
            else if (currentAspectRatio === '9:16') { width = isXL ? 768 : 576; height = isXL ? 1376 : 1024; }
            else if (currentAspectRatio === '4:3') { width = isXL ? 1200 : 896; height = isXL ? 896 : 672; }
            else if (currentAspectRatio === '3:4') { width = isXL ? 896 : 672; height = isXL ? 1200 : 896; }
            else if (currentAspectRatio === '4:1') { width = isXL ? 1584 : 1024; height = isXL ? 672 : 256; }
            else if (currentAspectRatio === '1:4') { width = isXL ? 672 : 256; height = isXL ? 1584 : 1024; }

            const res = await fetch('/api/leonardo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: finalPrompt,
                modelId,
                width,
                height,
                negativePrompt: options?.negativePrompt,
                apiKey: settings.apiKeys.leonardo
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.generationId) {
                let status = 'PENDING';
                let attempts = 0;
                while (status !== 'COMPLETE' && attempts < 150) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  attempts++;
                  const statusRes = await fetch(`/api/leonardo/${data.generationId}`);
                  if (!statusRes.ok) break;
                  const statusData = await statusRes.json();
                  status = statusData.status;
                  if (status === 'COMPLETE') {
                    imageUrl = statusData.url;
                    imageId = statusData.imageId;
                    seed = statusData.seed;
                  } else if (status === 'FAILED') {
                    break;
                  }
                }
              }
            }
          } else {
            const imgRes = await fetch('/api/gemini/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelId,
                prompt: finalPrompt,
                config: {
                  imageConfig: { aspectRatio: options?.aspectRatio || "1:1" },
                },
              }),
            });

            if (imgRes.ok) {
              const imgData = await imgRes.json();
              if (imgData.base64) {
                base64Data = imgData.base64;
                imageUrl = `data:image/jpeg;base64,${base64Data}`;
              }
            }
          }

          if (imageUrl || base64Data) {
            const newImg: GeneratedImage = {
              id: `comp-${Date.now()}-${modelId}`,
              comparisonId,
              url: imageUrl,
              base64: base64Data || undefined,
              prompt: finalPrompt,
              imageId,
              seed,
              status: 'ready',
              negativePrompt: options?.negativePrompt,
              aspectRatio: options?.aspectRatio,
              imageSize: options?.imageSize,
              modelInfo: { provider, modelId, modelName }
            };
            setComparisonResults(prev => prev.map(img => img.id === placeholders[i].id ? newImg : img));
          } else {
            setComparisonResults(prev => prev.filter(img => img.id !== placeholders[i].id));
          }
        } catch (err) {
          console.error(`Failed to generate with ${modelName}`, err);
          setComparisonResults(prev => prev.filter(img => img.id !== placeholders[i].id));
        }
      }
    } catch (e) {
      console.error('Comparison failed', e);
      setProgress('Comparison failed. Check your API keys.');
    } finally {
      setIsGenerating(false);
    }
  };

  const pickComparisonWinner = async (id: string) => {
    const winnerImg = comparisonResults.find(img => img.id === id);
    if (!winnerImg || !winnerImg.url) return;

    setComparisonResults(prev => prev.map(img => {
      if (img.id === id) {
        return { ...img, winner: true };
      }
      return img;
    }));

    let finalUrl = winnerImg.url;
    let finalBase64 = winnerImg.base64;

    const watermarkSettings: WatermarkSettings = {
      ...(settings.watermark || { enabled: false, image: null, position: 'bottom-right', opacity: 0.8, scale: 0.05 }),
      enabled: true,
    };
    finalUrl = await applyWatermark(finalUrl, watermarkSettings, settings.channelName || 'Multiverse Mashup');
    finalBase64 = undefined;

    const galleryImg: GeneratedImage = {
      ...winnerImg,
      id: `img-${Date.now()}-winner`,
      url: finalUrl,
      base64: finalBase64,
      status: 'ready'
    };

    saveImage(galleryImg);
  };

  const clearComparison = () => {
    setComparisonResults([]);
    set('mashup_comparison_results', []);
  };

  const deleteComparisonResult = (id: string) => {
    setComparisonResults(prev => {
      const updated = prev.filter(img => img.id !== id);
      set('mashup_comparison_results', updated);
      return updated;
    });
  };

  return {
    comparisonResults,
    comparisonPrompt,
    setComparisonPrompt,
    comparisonOptions,
    setComparisonOptions,
    generateComparison,
    pickComparisonWinner,
    clearComparison,
    deleteComparisonResult,
    isComparisonLoaded,
    isComparisonGenerating: isGenerating,
    comparisonProgress: progress,
  };
}
