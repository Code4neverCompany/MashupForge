'use client';

import { useCallback } from 'react';
import { streamAIToString } from '@/lib/aiClient';
import {
  type Idea,
  type UserSettings,
  type GeneratedImage,
  type GenerateOptions,
  type ScheduledPost,
  type PipelineProgress,
} from '../types/mashup';
import {
  findBestSlot,
  loadEngagementData,
  type CachedEngagement,
  type EngagementHour,
  type EngagementDay,
} from '@/lib/smartScheduler';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import {
  processIdea as processIdeaFn,
  SkipIdeaSignal,
  type ProcessIdeaDeps,
} from '@/lib/pipeline-processor';
import type { WriteCheckpointBase } from './usePipelineDaemon';

export interface UseIdeaProcessorDeps {
  getSettings: () => UserSettings;
  getImages: () => GeneratedImage[];
  generateComparison: (
    prompt: string,
    modelIds: string[],
    options?: GenerateOptions,
  ) => Promise<void>;
  generatePostContent: (img: GeneratedImage) => Promise<GeneratedImage | undefined>;
  saveImage: (img: GeneratedImage) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  updateSettings: (
    patch: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>),
  ) => void;
  addLog: (
    step: string,
    ideaId: string,
    status: 'success' | 'error',
    message: string,
  ) => void;
  setPipelineProgress: (p: PipelineProgress | null) => void;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function findNextAvailableSlot(
  existingPosts: ScheduledPost[],
  engagement: CachedEngagement | undefined,
  platforms: string[] | undefined,
  caps: UserSettings['pipelineDailyCaps'] | undefined,
): { date: string; time: string; reason: string } {
  const eng = engagement || loadEngagementData();
  const slot = findBestSlot(existingPosts, eng, { platforms, caps });
  const topHour = eng.hours.reduce((a: EngagementHour, b: EngagementHour) =>
    a.weight > b.weight ? a : b,
  );
  const topDay = eng.days.reduce((a: EngagementDay, b: EngagementDay) =>
    a.multiplier > b.multiplier ? a : b,
  );
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slotDate = new Date(slot.date);
  const capsActive = caps && Object.values(caps).some(v => typeof v === 'number');
  const reason = `${slot.time} on ${dayNames[slotDate.getDay()]} (${
    eng.source === 'instagram' ? 'IG insights' : 'research'
  } — best hour ${topHour.hour}:00, best day ${dayNames[topDay.day]}${
    capsActive ? ', caps applied' : ''
  })`;
  return { ...slot, reason };
}

/**
 * Per-idea processor hook. Owns no state — builds a ProcessIdeaDeps bag
 * from daemon-supplied live readers + caller-supplied primitives and
 * delegates to the pure processIdeaFn in lib/pipeline-processor.ts.
 */
export function useIdeaProcessor(deps: UseIdeaProcessorDeps) {
  const {
    getSettings,
    getImages,
    generateComparison,
    generatePostContent,
    saveImage,
    updateIdeaStatus,
    updateSettings,
    addLog,
    setPipelineProgress,
  } = deps;

  const expandIdeaToPrompt = useCallback(
    async (idea: Idea, trendingContext?: string): Promise<string> => {
      const s = getSettings();
      const systemContext = `${s.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${s.agentNiches?.join(', ') || 'None'}.
Active Genres: ${s.agentGenres?.join(', ') || 'None'}.

You are given a content idea concept. Expand it into a single, highly detailed image generation prompt.
The prompt should be vivid, specific, and optimized for AI image generation.
${trendingContext ? `\nCURRENT TRENDING CONTEXT — weave relevant trends into the prompt to make it timely and shareable:\n${trendingContext}\n` : ''}
Return ONLY the prompt text, nothing else.`;

      const text = await streamAIToString(
        `${systemContext}\n\nIdea concept: ${idea.concept}\n${idea.context ? `Additional context: ${idea.context}` : ''}\n\nGenerate a single detailed image prompt for this idea.`,
        { mode: 'enhance' },
      );
      return text.trim() || idea.concept;
    },
    [getSettings],
  );

  const processIdea = useCallback(
    async (
      idea: Idea,
      index: number,
      total: number,
      engagement: CachedEngagement,
      accumulatedPosts: ScheduledPost[],
      skipSignal: AbortSignal,
      writeCheckpointBase: WriteCheckpointBase,
    ): Promise<void> => {
      const perIdeaImageIds: string[] = [];
      const checkpoint = (step: string) =>
        writeCheckpointBase(idea.id, idea.concept, step, perIdeaImageIds);

      const processorDeps: ProcessIdeaDeps = {
        fetchTrendingContext: async ideaArg => {
          const s = getSettings();
          const res = await fetchWithRetry('/api/trending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tags: [],
              niches: s.agentNiches,
              genres: s.agentGenres,
              ideaConcept: ideaArg.concept,
            }),
          });
          const data = (await res.json()) as { success?: boolean; summary?: string };
          if (data.success && data.summary) return data.summary;
          return '';
        },
        expandIdeaToPrompt,
        triggerImageGeneration: (prompt, modelIds) =>
          generateComparison(prompt, modelIds, { skipEnhance: false }),
        waitForImages: async modelCount => {
          await wait(3000);
          const beforeIds = new Set(getImages().map(i => i.id));
          let attempts = 0;
          let readyImages: GeneratedImage[] = [];
          while (attempts < 90) {
            if (skipSignal.aborted) throw new SkipIdeaSignal();
            readyImages = getImages().filter(
              img =>
                !beforeIds.has(img.id) &&
                img.status === 'ready' &&
                (img.base64 || img.url),
            );
            if (readyImages.length >= modelCount) break;
            attempts++;
            await wait(3000);
          }
          for (const img of readyImages) {
            if (!perIdeaImageIds.includes(img.id)) perIdeaImageIds.push(img.id);
          }
          return readyImages;
        },
        generatePostContent,
        saveImage: img => {
          saveImage(img);
          if (!perIdeaImageIds.includes(img.id)) perIdeaImageIds.push(img.id);
        },
        updateIdeaStatus,
        updateSettings,
        findNextAvailableSlot,
        addLog,
        setPipelineProgress,
        writeCheckpoint: checkpoint,
        isSkipRequested: () => skipSignal.aborted,
        getScheduledPosts: () => getSettings().scheduledPosts || [],
      };

      await processIdeaFn(
        idea,
        index,
        total,
        engagement,
        accumulatedPosts,
        getSettings(),
        processorDeps,
      );
    },
    [
      getSettings,
      getImages,
      generateComparison,
      generatePostContent,
      saveImage,
      updateIdeaStatus,
      updateSettings,
      addLog,
      setPipelineProgress,
      expandIdeaToPrompt,
    ],
  );

  return { processIdea, expandIdeaToPrompt };
}
