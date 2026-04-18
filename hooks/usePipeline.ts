'use client';

import { useCallback } from 'react';
import { applyResumeCheckpoint } from '@/lib/resume-checkpoint';
import { usePipelineDaemon } from './usePipelineDaemon';
import { useIdeaProcessor } from './useIdeaProcessor';
import type { Idea, UserSettings, GeneratedImage, GenerateOptions } from '../types/mashup';

interface UsePipelineDeps {
  ideas: Idea[];
  settings: UserSettings;
  updateSettings: (
    newSettings: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>),
  ) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  addIdea: (concept: string, context?: string) => void;
  generateComparison: (
    prompt: string,
    modelIds: string[],
    options?: GenerateOptions,
    cachedEnhancements?: Record<string, import('./useComparison').CachedEnhancement>,
  ) => Promise<void>;
  generatePostContent: (image: GeneratedImage) => Promise<GeneratedImage | undefined>;
  saveImage: (img: GeneratedImage) => void;
  savedImages: GeneratedImage[];
  images: GeneratedImage[];
}

/**
 * V030-001: thin composer over usePipelineDaemon + useIdeaProcessor.
 * Public surface (20 fields) unchanged — MashupContextType consumers don't
 * see the split. See docs/bmad/stories/V030-001.md for the design.
 */
export function usePipeline(deps: UsePipelineDeps) {
  const {
    ideas,
    settings,
    updateSettings,
    updateIdeaStatus,
    addIdea,
    generateComparison,
    generatePostContent,
    saveImage,
    savedImages,
    images,
  } = deps;

  const daemon = usePipelineDaemon({
    ideas,
    settings,
    images,
    savedImages,
    addIdea,
    updateIdeaStatus,
  });

  const processor = useIdeaProcessor({
    getSettings: daemon.getSettings,
    getImages: daemon.getImages,
    generateComparison,
    generatePostContent,
    saveImage,
    updateIdeaStatus,
    updateSettings,
    addLog: daemon.addLog,
    setPipelineProgress: daemon.setPipelineProgress,
  });

  const startPipeline = useCallback(
    () => daemon.runOuterLoop(processor.processIdea),
    [daemon, processor.processIdea],
  );

  const acceptResume = useCallback(() => {
    applyResumeCheckpoint(daemon.pendingResume, {
      setPipelineDelayState: daemon.setPipelineDelayState,
      setPipelineContinuous: daemon.setPipelineContinuous,
      setPipelineIntervalState: daemon.setPipelineIntervalState,
      setPipelineTargetDaysState: daemon.setPipelineTargetDaysState,
      getIdeas: daemon.getIdeas,
      updateIdeaStatus,
      setPendingResume: daemon.setPendingResume,
      startPipeline,
    });
  }, [daemon, updateIdeaStatus, startPipeline]);

  return {
    pipelineEnabled: daemon.pipelineEnabled,
    pipelineRunning: daemon.pipelineRunning,
    pipelineQueue: daemon.pipelineQueue,
    pipelineProgress: daemon.pipelineProgress,
    pipelineLog: daemon.pipelineLog,
    pipelineDelay: daemon.pipelineDelay,
    setPipelineDelay: daemon.setPipelineDelay,
    togglePipeline: daemon.togglePipeline,
    startPipeline,
    stopPipeline: daemon.stopPipeline,
    skipCurrentIdea: daemon.skipCurrentIdea,
    pipelineContinuous: daemon.pipelineContinuous,
    toggleContinuous: daemon.toggleContinuous,
    pipelineInterval: daemon.pipelineInterval,
    setPipelineInterval: daemon.setPipelineInterval,
    pipelineTargetDays: daemon.pipelineTargetDays,
    setPipelineTargetDays: daemon.setPipelineTargetDays,
    clearPipelineLog: daemon.clearPipelineLog,
    pendingResume: daemon.pendingResume,
    acceptResume,
    dismissResume: daemon.dismissResume,
  };
}
