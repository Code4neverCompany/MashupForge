'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { streamAIToString } from '@/lib/aiClient';
import type {
  Idea,
  UserSettings,
  GeneratedImage,
  PipelineLogEntry,
  PipelineProgress,
  ScheduledPost,
} from '../types/mashup';

interface UsePipelineDeps {
  ideas: Idea[];
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  generateImages: (customPrompts?: string[], append?: boolean) => Promise<void>;
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
    generatePostContent,
    savedImages,
    images,
  } = deps;

  const persisted = useRef(loadPersistedState());
  const [pipelineEnabled, setPipelineEnabled] = useState(persisted.current.enabled);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<Idea[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [pipelineLog, setPipelineLog] = useState<PipelineLogEntry[]>(
    persisted.current.log.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))
  );
  const [pipelineDelay, setPipelineDelayState] = useState(persisted.current.delay);

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

  const expandIdeaToPrompt = useCallback(async (idea: Idea): Promise<string> => {
    const systemContext = `${settings.agentPrompt || 'You are a Master Content Creator.'}
Active Niches: ${settings.agentNiches?.join(', ') || 'None'}.
Active Genres: ${settings.agentGenres?.join(', ') || 'None'}.

You are given a content idea concept. Expand it into a single, highly detailed image generation prompt.
The prompt should be vivid, specific, and optimized for AI image generation.
Return ONLY the prompt text, nothing else.`;

    const text = await streamAIToString('/api/ai/generate', {
      model: 'gemini-3-flash-preview',
      contents: `${systemContext}

Idea concept: ${idea.concept}
${idea.context ? `Additional context: ${idea.context}` : ''}

Generate a single detailed image prompt for this idea.`,
      config: {
        temperature: 1.0,
      },
    });

    return text.trim() || idea.concept;
  }, [settings]);

  const findNextAvailableSlot = useCallback((existingPosts: ScheduledPost[]): { date: string; time: string } => {
    const now = new Date();
    // Start from tomorrow at 10:00, then 14:00, 18:00 slots
    const slots = ['10:00', '14:00', '18:00'];
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 1);

    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const dateStr = checkDate.toISOString().split('T')[0];

      for (const time of slots) {
        const taken = existingPosts.some(p => p.date === dateStr && p.time === time);
        if (!taken) return { date: dateStr, time };
      }
    }
    // Fallback
    return { date: startDate.toISOString().split('T')[0], time: '12:00' };
  }, []);

  const processIdea = useCallback(async (idea: Idea, index: number, total: number) => {
    // Step a: Mark in-work
    setPipelineProgress({ current: index + 1, total, currentStep: 'Updating status', currentIdea: idea.concept });
    updateIdeaStatus(idea.id, 'in-work');
    addLog('status-update', idea.id, 'success', `Marked "${idea.concept}" as in-work`);

    // Step b: Expand idea to prompt
    setPipelineProgress({ current: index + 1, total, currentStep: 'Expanding idea to prompt', currentIdea: idea.concept });
    let expandedPrompt: string;
    try {
      expandedPrompt = await expandIdeaToPrompt(idea);
      addLog('prompt-expand', idea.id, 'success', `Expanded prompt: "${expandedPrompt.slice(0, 80)}..."`);
    } catch (e: any) {
      addLog('prompt-expand', idea.id, 'error', `Failed to expand: ${e.message}`);
      throw e;
    }

    // Step c & d: Generate image
    setPipelineProgress({ current: index + 1, total, currentStep: 'Generating image', currentIdea: idea.concept });
    try {
      await generateImages([expandedPrompt], true);
      addLog('image-gen', idea.id, 'success', 'Image generation started');
    } catch (e: any) {
      addLog('image-gen', idea.id, 'error', `Image generation failed: ${e.message}`);
      throw e;
    }

    // Wait for the image to finish generating — poll images state
    await delay(3000);
    let attempts = 0;
    while (attempts < 60) {
      const currentImages = imagesRef.current;
      const latestImage = currentImages.find(img =>
        img.prompt === expandedPrompt || img.prompt.includes(expandedPrompt.slice(0, 40))
      );
      if (latestImage && latestImage.status === 'ready' && (latestImage.base64 || latestImage.url)) {
        addLog('image-ready', idea.id, 'success', 'Image ready');

        // Step e: Generate caption
        setPipelineProgress({ current: index + 1, total, currentStep: 'Generating caption', currentIdea: idea.concept });
        try {
          const captionedImg = await generatePostContent(latestImage);
          if (captionedImg) {
            addLog('caption', idea.id, 'success', `Caption: "${captionedImg.postCaption?.slice(0, 60)}..."`);

            // Step f: Create scheduled post
            setPipelineProgress({ current: index + 1, total, currentStep: 'Scheduling post', currentIdea: idea.concept });
            const existingPosts = settings.scheduledPosts || [];
            const slot = findNextAvailableSlot(existingPosts);
            const newPost: ScheduledPost = {
              id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              imageId: latestImage.id,
              date: slot.date,
              time: slot.time,
              platforms: Object.entries(settings.apiKeys)
                .filter(([key, val]) => ['instagram', 'twitter', 'discordWebhook'].includes(key) && val)
                .map(([key]) => key === 'discordWebhook' ? 'discord' : key),
              caption: captionedImg.postCaption || '',
              status: 'scheduled',
            };
            updateSettings({ scheduledPosts: [...existingPosts, newPost] });
            addLog('schedule', idea.id, 'success', `Scheduled for ${slot.date} at ${slot.time}`);
          } else {
            addLog('caption', idea.id, 'error', 'Caption generation returned empty');
          }
        } catch (e: any) {
          addLog('caption', idea.id, 'error', `Caption failed: ${e.message}`);
        }

        break;
      }
      attempts++;
      await delay(2000);
    }

    if (attempts >= 60) {
      addLog('image-ready', idea.id, 'error', 'Timed out waiting for image generation');
    }

    // Step g: Mark done
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
