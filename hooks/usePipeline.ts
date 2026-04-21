'use client';

import { useCallback } from 'react';
import { applyResumeCheckpoint } from '@/lib/resume-checkpoint';
import { usePipelineDaemon, type PipelineResumeHint } from './usePipelineDaemon';
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
  ) => Promise<GeneratedImage[]>;
  generatePostContent: (image: GeneratedImage) => Promise<GeneratedImage | undefined>;
  saveImage: (img: GeneratedImage) => void;
  /** Used by the skip-cleanup path to purge orphaned pipeline images. */
  deleteImage: (id: string, fromSaved: boolean) => unknown;
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
    deleteImage,
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
    generateComparison,
    generatePostContent,
    saveImage,
    updateIdeaStatus,
    updateSettings,
    addLog: daemon.addLog,
    setPipelineProgress: daemon.setPipelineProgress,
  });

  const startPipeline = useCallback(
    (resumeHint?: PipelineResumeHint) =>
      daemon.runOuterLoop(processor.processIdea, resumeHint),
    [daemon, processor.processIdea],
  );

  /**
   * Skip + cleanup. Aborts the current idea via the daemon, then
   * deletes any pipeline-produced images that were stamped with this
   * idea's id (so approved-but-then-skipped generations don't linger
   * as grayed-out pipelinePending entries) and drops their not-yet-
   * posted ScheduledPosts. Already-posted entries are left alone so
   * the history view still shows them.
   */
  const skipCurrentIdea = useCallback(() => {
    const currentIdeaId = daemon.pipelineProgress?.currentIdeaId;
    daemon.skipCurrentIdea();
    if (!currentIdeaId) return;
    const orphaned = savedImages.filter((i) => i.sourceIdeaId === currentIdeaId);
    for (const img of orphaned) deleteImage(img.id, true);
    updateSettings((prev) => ({
      scheduledPosts: (prev.scheduledPosts || []).filter(
        (p) => p.sourceIdeaId !== currentIdeaId || p.status === 'posted',
      ),
    }));
  }, [daemon, savedImages, deleteImage, updateSettings]);

  const acceptResume = useCallback(() => {
    applyResumeCheckpoint(daemon.pendingResume, {
      setPipelineDelayState: daemon.setPipelineDelayState,
      setPipelineContinuous: daemon.setPipelineContinuous,
      setPipelineIntervalState: daemon.setPipelineIntervalState,
      setPipelineTargetDaysState: daemon.setPipelineTargetDaysState,
      getIdeas: daemon.getIdeas,
      // V050-001: live reader over the saved gallery so the resume helper
      // can hydrate pre-generated images from checkpoint.imageIds.
      getSavedImages: () => savedImages,
      updateIdeaStatus,
      setPendingResume: daemon.setPendingResume,
      startPipeline,
    });
  }, [daemon, updateIdeaStatus, startPipeline, savedImages]);

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
    skipCurrentIdea,
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
    weekFillStatus: daemon.weekFillStatus,
  };
}
