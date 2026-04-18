'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

// Re-export everything from types/mashup so existing imports keep working
export {
  type GeneratedImage,
  type Collection,
  type GenerateOptions,
  type WatermarkSettings,
  type AgentPersonality,
  type Idea,
  type ScheduledPost,
  type CarouselGroup,
  type UserSettings,
  type ViewType,
  type MashupContextType,
  type PipelineLogEntry,
  type PipelineProgress,
  RECOMMENDED_NICHES,
  RECOMMENDED_GENRES,
  LEONARDO_MODELS,
  MODEL_PROMPT_GUIDES,
  ART_STYLES,
  LIGHTING_OPTIONS,
  CAMERA_ANGLES,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  defaultSettings,
} from '../types/mashup';

import type { MashupContextType, ViewType, GeneratedImage } from '../types/mashup';

// Import hooks
import { useSettings } from '../hooks/useSettings';
import { useImages } from '../hooks/useImages';
import { useCollections } from '../hooks/useCollections';
import { useImageGeneration, applyWatermark } from '../hooks/useImageGeneration';
import { useComparison } from '../hooks/useComparison';
import { useIdeas } from '../hooks/useIdeas';
import { useSocial } from '../hooks/useSocial';
import { usePipeline } from '../hooks/usePipeline';

const MashupContext = createContext<MashupContextType | null>(null);

export function useMashup() {
  const ctx = useContext(MashupContext);
  if (!ctx) throw new Error('useMashup must be used within MashupProvider');
  return ctx;
}

export function MashupProvider({ children }: { children: ReactNode }) {
  // UI state
  const [view, setView] = useState<ViewType>('studio');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Core hooks — order matters for dependencies
  const { settings, updateSettings, isSettingsLoaded, saveState: settingsSaveState } = useSettings();

  const imagesHook = useImages();
  const {
    savedImages,
    saveImage,
    deleteImage,
    updateImageTags,
    bulkUpdateImageTags,
    toggleApproveImage: toggleApproveSaved,
    setImageStatus,
    updateSavedImageCollectionId,
    clearCollectionFromImages,
    isImagesLoaded,
  } = imagesHook;

  const collectionsHook = useCollections(settings);
  const {
    collections,
    createCollection,
    deleteCollection,
    autoGenerateCollectionInfo,
    isCollectionsLoaded,
  } = collectionsHook;

  const generationHook = useImageGeneration({ settings, updateImageTags });
  const {
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
    setImageStatus: setGenImageStatus,
  } = generationHook;

  const comparisonHook = useComparison({ settings, saveImage, applyWatermark });
  const {
    comparisonResults,
    comparisonPrompt,
    setComparisonPrompt,
    comparisonOptions,
    setComparisonOptions,
    generateComparison,
    pickComparisonWinner,
    clearComparison,
    deleteComparisonResult,
    comparisonError,
    clearComparisonError,
  } = comparisonHook;

  const ideasHook = useIdeas();
  const { ideas, addIdea, updateIdeaStatus, deleteIdea, clearIdeas } = ideasHook;

  const socialHook = useSocial({ settings, saveImage, setImages });
  const { generatePostContent } = socialHook;

  // Auto-tag any saved image that lacks tags. Tracks attempted ids in a
  // ref so a failed attempt (e.g. pi is down) doesn't spam retries on
  // every render. Runs a low-priority queue, one image at a time.
  const autoTagAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const needsTagging = savedImages.find(
      (img) =>
        img.status === 'ready' &&
        (!img.tags || img.tags.length === 0) &&
        !autoTagAttemptedRef.current.has(img.id)
    );
    if (!needsTagging) return;
    autoTagAttemptedRef.current.add(needsTagging.id);
    // Fire and forget — autoTagImage updates the store on success.
    // Pass the saved image directly so autoTagImage doesn't need to
    // look it up in the ephemeral `images` array (which may have been
    // cleared by now).
    autoTagImage(needsTagging.id, needsTagging).catch(() => {});
  }, [savedImages, autoTagImage]);

  const pipelineHook = usePipeline({
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
  });

  // Approval flow for pending_approval scheduled posts. Pipeline-
  // produced posts land in that status and need explicit action before
  // the auto-poster will pick them up.
  // Functional updater so rapid bulk-approve/reject (e.g. clicking
  // through a dozen pending_approval cards in quick succession) chains
  // off the latest state instead of all reading the same closure snapshot.
  const approveScheduledPost = (postId: string) => {
    updateSettings((prev) => ({
      scheduledPosts: (prev.scheduledPosts || []).map((p) =>
        p.id === postId ? { ...p, status: 'scheduled' as const } : p
      ),
    }));
  };

  const rejectScheduledPost = (postId: string) => {
    updateSettings((prev) => ({
      scheduledPosts: (prev.scheduledPosts || []).filter((p) => p.id !== postId),
    }));
  };

  // Bulk variants — single functional-updater pass so N approvals applied
  // in a single click don't race against each other or the auto-poster.
  const bulkApproveScheduledPosts = (postIds: string[]) => {
    if (postIds.length === 0) return;
    const idSet = new Set(postIds);
    updateSettings((prev) => ({
      scheduledPosts: (prev.scheduledPosts || []).map((p) =>
        idSet.has(p.id) && p.status === 'pending_approval'
          ? { ...p, status: 'scheduled' as const }
          : p
      ),
    }));
  };

  const bulkRejectScheduledPosts = (postIds: string[]) => {
    if (postIds.length === 0) return;
    const idSet = new Set(postIds);
    updateSettings((prev) => ({
      scheduledPosts: (prev.scheduledPosts || []).filter((p) => !idSet.has(p.id)),
    }));
  };

  // Compose loading state
  const isLoaded = isSettingsLoaded && isImagesLoaded && isCollectionsLoaded && ideasHook.isIdeasLoaded;

  // Cross-hook wrappers
  const handleCreateCollection = async (name?: string, description?: string, imageIds?: string[]) => {
    return createCollection(name, description, imageIds, savedImages);
  };

  const addImageToCollection = (imageId: string, collectionId: string) => {
    updateSavedImageCollectionId(imageId, collectionId);
  };

  const removeImageFromCollection = (imageId: string) => {
    updateSavedImageCollectionId(imageId, undefined);
  };

  // toggleApproveImage must update both images[] and savedImages[]
  const handleToggleApprove = (id: string) => {
    toggleApproveSaved(id);
    setImages(prev => prev.map(img => img.id === id ? { ...img, approved: !img.approved } : img));
  };

  // setImageStatus wrapper that updates both arrays
  const handleSetImageStatus = (id: string, status: 'generating' | 'animating' | 'ready') => {
    setGenImageStatus(id, status);
  };

  const value: MashupContextType = {
    isLoaded,
    view,
    setView,
    images,
    savedImages,
    collections,
    isGenerating,
    progress,
    settings,
    updateSettings,
    settingsSaveState,
    generateImages,
    generatePostContent,
    rerollImage,
    saveImage,
    deleteImage,
    updateImageTags,
    createCollection: handleCreateCollection,
    bulkUpdateImageTags,
    deleteCollection,
    addImageToCollection,
    removeImageFromCollection,
    toggleApproveImage: handleToggleApprove,
    generateComparison,
    autoTagImage,
    setImageStatus: handleSetImageStatus,
    autoGenerateCollectionInfo,
    comparisonResults,
    pickComparisonWinner,
    clearComparison,
    deleteComparisonResult,
    generationError,
    clearGenerationError,
    comparisonError,
    clearComparisonError,
    generateNegativePrompt,
    comparisonPrompt,
    setComparisonPrompt,
    comparisonOptions,
    setComparisonOptions,
    ideas,
    addIdea,
    updateIdeaStatus,
    deleteIdea,
    clearIdeas,
    isSidebarOpen,
    setIsSidebarOpen,
    pipelineEnabled: pipelineHook.pipelineEnabled,
    pipelineRunning: pipelineHook.pipelineRunning,
    pipelineQueue: pipelineHook.pipelineQueue,
    pipelineProgress: pipelineHook.pipelineProgress,
    pipelineLog: pipelineHook.pipelineLog,
    pipelineDelay: pipelineHook.pipelineDelay,
    setPipelineDelay: pipelineHook.setPipelineDelay,
    togglePipeline: pipelineHook.togglePipeline,
    startPipeline: pipelineHook.startPipeline,
    stopPipeline: pipelineHook.stopPipeline,
    skipCurrentIdea: pipelineHook.skipCurrentIdea,
    pipelineContinuous: pipelineHook.pipelineContinuous,
    toggleContinuous: pipelineHook.toggleContinuous,
    pipelineInterval: pipelineHook.pipelineInterval,
    setPipelineInterval: pipelineHook.setPipelineInterval,
    pipelineTargetDays: pipelineHook.pipelineTargetDays,
    setPipelineTargetDays: pipelineHook.setPipelineTargetDays,
    clearPipelineLog: pipelineHook.clearPipelineLog,
    approveScheduledPost,
    rejectScheduledPost,
    bulkApproveScheduledPosts,
    bulkRejectScheduledPosts,
    pendingResume: pipelineHook.pendingResume,
    acceptResume: pipelineHook.acceptResume,
    dismissResume: pipelineHook.dismissResume,
    weekFillStatus: pipelineHook.weekFillStatus,
  };

  return (
    <MashupContext.Provider value={value}>
      {children}
    </MashupContext.Provider>
  );
}
