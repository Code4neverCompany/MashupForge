'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { streamAIToString } from '@/lib/aiClient';
import {
  LEONARDO_MODELS,
  type Idea,
  type UserSettings,
  type GeneratedImage,
  type PipelineLogEntry,
  type PipelineProgress,
  type ScheduledPost,
} from '../types/mashup';
import { findBestSlot, fetchInstagramEngagement, loadEngagementData } from '@/lib/smartScheduler';

interface UsePipelineDeps {
  ideas: Idea[];
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  generateImages: (customPrompts?: string[], append?: boolean) => Promise<void>;
  generateComparison: (prompt: string, modelIds: string[], options?: import('../types/mashup').GenerateOptions) => Promise<void>;
  generatePostContent: (image: GeneratedImage) => Promise<GeneratedImage | undefined>;
  savedImages: GeneratedImage[];
  images: GeneratedImage[];
}

const PIPELINE_STORAGE_KEY = 'mashup_pipeline_state';

interface PersistedPipelineState {
  enabled: boolean;
  delay: number;
  log: { timestamp: string; step: string; ideaId: string; status: 'success' | 'error'; message: string }[];
}

function loadPersistedState(): PersistedPipelineState {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { enabled: false, delay: 30, log: [] };
}

function persistState(state: PersistedPipelineState) {
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function usePipeline(deps: UsePipelineDeps) {
  const {
    ideas,
    settings,
    updateSettings,
    updateIdeaStatus,
    generateImages,
    generateComparison,
    generatePostContent,
    savedImages,
    images,
  } = deps;

  const [pipelineEnabled, setPipelineEnabled] = useState(() => loadPersistedState().enabled);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<Idea[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [pipelineLog, setPipelineLog] = useState<PipelineLogEntry[]>(() =>
    loadPersistedState().log.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))
  );
  const [pipelineDelay, setPipelineDelayState] = useState(() => loadPersistedState().delay);

  const stopRequestedRef = useRef(false);
  const imagesRef = useRef(images);
  const savedImagesRef = useRef(savedImages);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { savedImagesRef.current = savedImages; }, [savedImages]);

  // Persist state changes
  useEffect(() => {
    persistState({
      enabled: pipelineEnabled,
      delay: pipelineDelay,
      log: pipelineLog.slice(-100).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  }, [pipelineEnabled, pipelineDelay, pipelineLog]);

  const addLog = useCallback((step: string, ideaId: string, status: 'success' | 'error', message: string) => {
    setPipelineLog(prev => [...prev, { timestamp: new Date(), step, ideaId, status, message }]);
  }, []);

  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  const expandIdeaToPrompt = useCallback(async (idea: Idea, trendingContext?: string): Promise<string> => {
    const systemContext = `${settings.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${settings.agentNiches?.join(', ') || 'None'}.
Active Genres: ${settings.agentGenres?.join(', ') || 'None'}.

You are given a content idea concept. Expand it into a single, highly detailed image generation prompt.
The prompt should be vivid, specific, and optimized for AI image generation.
${trendingContext ? `\nCURRENT TRENDING CONTEXT — weave relevant trends into the prompt to make it timely and shareable:\n${trendingContext}\n` : ''}
Return ONLY the prompt text, nothing else.`;

    const text = await streamAIToString(
      `${systemContext}\n\nIdea concept: ${idea.concept}\n${idea.context ? `Additional context: ${idea.context}` : ''}\n\nGenerate a single detailed image prompt for this idea.`,
      { mode: 'enhance' }
    );

    return text.trim() || idea.concept;
  }, [settings]);

  /** Smart slot picker — uses engagement data (Instagram insights or research-backed defaults). */
  const findNextAvailableSlot = useCallback((existingPosts: ScheduledPost[]): { date: string; time: string } => {
    const engagement = loadEngagementData();
    return findBestSlot(existingPosts, engagement);
  }, []);

  const processIdea = useCallback(async (idea: Idea, index: number, total: number) => {
    // Respect the new pipeline stage toggles (defaults: tag/caption/schedule on, post off).
    const autoCaption = settings.pipelineAutoCaption ?? true;
    const autoSchedule = settings.pipelineAutoSchedule ?? true;
    const autoPost = settings.pipelineAutoPost ?? false;
    // Explicit platform list if set, otherwise infer from configured api keys
    // (preserves historical behaviour).
    const explicitPlatforms = settings.pipelinePlatforms && settings.pipelinePlatforms.length > 0
      ? settings.pipelinePlatforms
      : null;
    const inferredPlatforms = Object.entries(settings.apiKeys)
      .filter(([key, val]) => ['instagram', 'pinterest', 'twitter', 'discordWebhook'].includes(key) && val)
      .map(([key]) => (key === 'discordWebhook' ? 'discord' : key));
    const pipelinePlatforms = explicitPlatforms || inferredPlatforms;

    // Step a: Mark in-work
    setPipelineProgress({ current: index + 1, total, currentStep: 'Updating status', currentIdea: idea.concept });
    updateIdeaStatus(idea.id, 'in-work');
    addLog('status-update', idea.id, 'success', `Marked "${idea.concept}" as in-work`);

    // Step b: Research trending topics for tags/niches
    let trendingContext = '';
    setPipelineProgress({ current: index + 1, total, currentStep: 'Researching trending topics', currentIdea: idea.concept });
    try {
      const res = await fetch('/api/trending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: [],
          niches: settings.agentNiches,
          genres: settings.agentGenres,
          ideaConcept: idea.concept,
        }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        trendingContext = data.summary;
        addLog('trending', idea.id, 'success', `Found ${data.results?.length || 0} trending items for: ${(data.queriesUsed || []).join(', ')}`);
      } else {
        addLog('trending', idea.id, 'success', 'No trending data found — proceeding without');
      }
    } catch (e: any) {
      addLog('trending', idea.id, 'success', `Trending research skipped: ${e.message}`);
    }

    // Step c: Expand idea to prompt (with trending context)
    setPipelineProgress({ current: index + 1, total, currentStep: 'Expanding idea to prompt', currentIdea: idea.concept });
    let expandedPrompt: string;
    try {
      expandedPrompt = await expandIdeaToPrompt(idea, trendingContext);
      addLog('prompt-expand', idea.id, 'success', `Expanded prompt: "${expandedPrompt.slice(0, 80)}..."`);
    } catch (e: any) {
      addLog('prompt-expand', idea.id, 'error', `Failed to expand: ${e.message}`);
      throw e;
    }

    // Step d: Generate with ALL models (same as Studio compare).
    // Each model gets its own pi-optimized prompt via modelOptimizer.
    const allModelIds = LEONARDO_MODELS.map(m => m.id);
    setPipelineProgress({ current: index + 1, total, currentStep: `Generating with ${allModelIds.length} models`, currentIdea: idea.concept });
    try {
      await generateComparison(expandedPrompt, allModelIds, { skipEnhance: false });
      addLog('image-gen', idea.id, 'success', `Image generation started with ${allModelIds.length} models`);
    } catch (e: any) {
      addLog('image-gen', idea.id, 'error', `Image generation failed: ${e.message}`);
      throw e;
    }

    // Wait for ALL model images to finish — poll images state.
    // generateComparison creates one placeholder per model, each with a
    // pi-optimized prompt that differs from the original expandedPrompt,
    // so we track images by counting new ready entries added since gen start.
    await delay(3000);
    const beforeIds = new Set(imagesRef.current.map(i => i.id));
    let attempts = 0;
    let readyImages: GeneratedImage[] = [];
    while (attempts < 90) {
      const currentImages = imagesRef.current;
      // Find images that were created by this generation pass.
      readyImages = currentImages.filter(img =>
        !beforeIds.has(img.id) &&
        img.status === 'ready' &&
        (img.base64 || img.url)
      );
      if (readyImages.length >= allModelIds.length) break;
      attempts++;
      await delay(3000);
    }

    if (readyImages.length === 0) {
      addLog('image-ready', idea.id, 'error', 'Timed out waiting for any image');
    } else {
      addLog('image-ready', idea.id, 'success', `${readyImages.length} image(s) ready from ${allModelIds.length} models`);

      // Process ALL generated images through caption + schedule.
      // Each model's output gets its own caption and scheduled post.
      for (let imgIdx = 0; imgIdx < readyImages.length; imgIdx++) {
        const latestImage = readyImages[imgIdx];
        const modelLabel = latestImage.modelInfo?.modelName || `model-${imgIdx + 1}`;

        // Step e: Generate caption
        let captionedImg = latestImage;
        if (autoCaption) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Captioning ${modelLabel}`, currentIdea: idea.concept });
          try {
            const withCaption = await generatePostContent(latestImage);
            if (withCaption) {
              captionedImg = withCaption;
              addLog('caption', idea.id, 'success', `[${modelLabel}] Caption: "${withCaption.postCaption?.slice(0, 60)}..."`);
            } else {
              addLog('caption', idea.id, 'error', `[${modelLabel}] Caption returned empty`);
            }
          } catch (e: any) {
            addLog('caption', idea.id, 'error', `[${modelLabel}] Caption failed: ${e.message}`);
          }
        }

        // Step f: Schedule post
        if (autoSchedule) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Scheduling ${modelLabel}`, currentIdea: idea.concept });
          if (pipelinePlatforms.length === 0) {
            addLog('schedule', idea.id, 'error', 'No platforms configured — skipped');
          } else {
            const existingPosts = settings.scheduledPosts || [];
            const slot = findNextAvailableSlot(existingPosts);
            const newPost: ScheduledPost = {
              id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              imageId: latestImage.id,
              date: slot.date,
              time: slot.time,
              platforms: pipelinePlatforms,
              caption: captionedImg.postCaption || '',
              status: 'scheduled',
            };
            updateSettings({ scheduledPosts: [...existingPosts, newPost] });
            addLog('schedule', idea.id, 'success', `[${modelLabel}] Scheduled for ${slot.date} at ${slot.time}`);
          }
        }

        // Step g: Auto-post immediately
        if (autoPost && pipelinePlatforms.length > 0) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Posting ${modelLabel}`, currentIdea: idea.concept });
          try {
            const res = await fetch('/api/social/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: captionedImg.postCaption || expandedPrompt,
                platforms: pipelinePlatforms,
                mediaUrl: latestImage.url,
                mediaBase64: latestImage.base64,
                credentials: {
                  instagram: settings.apiKeys.instagram,
                  twitter: settings.apiKeys.twitter,
                  pinterest: settings.apiKeys.pinterest,
                  discord: { webhookUrl: settings.apiKeys.discordWebhook },
                },
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'post failed');
            addLog('post', idea.id, 'success', `[${modelLabel}] Posted to ${pipelinePlatforms.join(', ')}`);
          } catch (e: any) {
            addLog('post', idea.id, 'error', `[${modelLabel}] Auto-post failed: ${e.message}`);
          }
        }
      }
    }

    if (attempts >= 60) {
      addLog('image-ready', idea.id, 'error', 'Timed out waiting for image generation');
    }

    // Step h: Mark done
    updateIdeaStatus(idea.id, 'done');
    addLog('complete', idea.id, 'success', `"${idea.concept}" pipeline complete`);
  }, [expandIdeaToPrompt, generateImages, generatePostContent, updateIdeaStatus, updateSettings, settings, addLog, findNextAvailableSlot]);

  const startPipeline = useCallback(async () => {
    const pendingIdeas = ideas.filter(i => i.status === 'idea');
    if (pendingIdeas.length === 0) return;

    stopRequestedRef.current = false;
    setPipelineRunning(true);
    setPipelineQueue(pendingIdeas);
    addLog('pipeline-start', '', 'success', `Pipeline started with ${pendingIdeas.length} ideas`);

    // Refresh engagement data from Instagram (cached 24h)
    try {
      const eng = await fetchInstagramEngagement(
        settings.apiKeys?.instagram?.accessToken,
        settings.apiKeys?.instagram?.igAccountId,
      );
      addLog('engagement', '', 'success', `Posting times: ${eng.source === 'instagram' ? 'Instagram insights' : 'research-backed defaults'}`);
    } catch {
      addLog('engagement', '', 'success', 'Using default posting times');
    }

    for (let i = 0; i < pendingIdeas.length; i++) {
      if (stopRequestedRef.current) {
        addLog('pipeline-stop', '', 'success', 'Pipeline stopped by user');
        break;
      }

      const idea = pendingIdeas[i];
      setPipelineQueue(pendingIdeas.slice(i));

      try {
        await processIdea(idea, i, pendingIdeas.length);
      } catch (e: any) {
        addLog('pipeline-error', idea.id, 'error', `Skipping idea due to error: ${e.message}`);
        updateIdeaStatus(idea.id, 'idea'); // Reset on failure
      }

      // Delay between ideas (unless last or stopped)
      if (i < pendingIdeas.length - 1 && !stopRequestedRef.current) {
        setPipelineProgress(prev => prev ? { ...prev, currentStep: `Waiting ${pipelineDelay}s before next idea...` } : null);
        await delay(pipelineDelay * 1000);
      }
    }

    setPipelineRunning(false);
    setPipelineQueue([]);
    setPipelineProgress(null);
    addLog('pipeline-end', '', 'success', 'Pipeline finished');
  }, [ideas, processIdea, addLog, pipelineDelay, updateIdeaStatus]);

  const stopPipeline = useCallback(() => {
    stopRequestedRef.current = true;
  }, []);

  const togglePipeline = useCallback(() => {
    setPipelineEnabled(prev => !prev);
  }, []);

  const setPipelineDelay = useCallback((d: number) => {
    setPipelineDelayState(d);
  }, []);

  return {
    pipelineEnabled,
    pipelineRunning,
    pipelineQueue,
    pipelineProgress,
    pipelineLog,
    pipelineDelay,
    setPipelineDelay,
    togglePipeline,
    startPipeline,
    stopPipeline,
  };
}
