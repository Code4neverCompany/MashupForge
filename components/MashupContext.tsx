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
import { collectFinalizeTargets, finalizePipelineImage } from '../lib/pipeline-finalize';
import { applyCaptionEdit } from '../lib/caption-edit';
import { planApproveScheduledPost, planRejectScheduledPost } from '../lib/approval-actions';

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
  //
  // V040-HOTFIX-007: approval also "finalizes" the pipeline-pending
  // images the post references — flips `pipelinePending:false` so
  // Gallery renders them, and applies the watermark that the pipeline
  // run never applied (the generateComparison path skips watermark,
  // unlike pickComparisonWinner's finalize step). Flag flip is
  // synchronous so Gallery lights up immediately; watermark is applied
  // best-effort in the background and swaps the URL when ready.
  const finalizePipelineImagesForPosts = (posts: import('../types/mashup').ScheduledPost[]) => {
    for (const post of posts) {
      const targets = collectFinalizeTargets(post, savedImages);
      if (targets.length === 0) continue;
      // Step 1 — instant flag flip: Gallery renders these now.
      for (const img of targets) saveImage({ ...img, pipelinePending: false });
      // Step 2 — background watermark pass. Best-effort: failures keep
      // the original URL (handled inside finalizePipelineImage).
      // BUG-DEV-004: per-image catch surfaces unexpected failures
      // (saveImage IDB quota, etc.) that escape finalizePipelineImage's
      // internal try/catch. Without this, a Promise.all rejection from
      // any image silently aborts the rest of the batch.
      if (settings.watermark?.enabled) {
        void Promise.all(
          targets.map(async (img) => {
            try {
              const finalized = await finalizePipelineImage(
                img,
                settings.watermark,
                settings.channelName,
                applyWatermark,
              );
              saveImage(finalized);
            } catch (err) {
              console.warn('[MashupContext] finalize/save failed for', img.id, err);
            }
          }),
        );
      }
    }
  };

  // BUG-CRIT-012: read the target post from the rendered settings
  // snapshot BEFORE updateSettings rather than from inside the
  // functional updater. The old shape relied on React's "eager state
  // update" optimization (the functional updater runs synchronously
  // only when the queue is empty) — which silently broke for the 2nd+
  // call in a row. CarouselApprovalCard fans out N approve calls back-
  // to-back, so images 2..N got status='scheduled' but kept
  // pipelinePending=true (hidden from Gallery, no watermark).
  const approveScheduledPost = (postId: string) => {
    const { toFinalize, nextPosts } = planApproveScheduledPost(
      settings.scheduledPosts || [],
      postId,
    );
    if (toFinalize.length === 0) return;
    updateSettings((prev) => ({
      scheduledPosts: nextPosts(prev.scheduledPosts || []),
    }));
    finalizePipelineImagesForPosts(toFinalize);
  };

  // V050-009 BUG-DEV-001: status guard mirrors the approve path. Without
  // it, rejecting any post id (e.g. a stale UI reference) would silently
  // flip an already-scheduled / posted / failed post to 'rejected',
  // pulling it out of the auto-poster's view with no recovery path.
  //
  // BUG-DEV-003: also finalize the underlying pipelinePending image(s)
  // so they land in Gallery instead of being orphaned (pipelinePending=true
  // forever, invisible everywhere). Reject means "don't post this", not
  // "delete this asset" — the user already paid the generation cost, so
  // we surface the image in Gallery (watermarked, like approve does) and
  // let them delete it explicitly if they really don't want it. Carousel
  // siblings are released as a group via collectFinalizeTargets.
  // BUG-CRIT-012: same closure-timing fix as approveScheduledPost.
  // Carousel "Reject carousel" fans out N reject calls; without the
  // pre-update lookup, only the first image landed in Gallery.
  const rejectScheduledPost = (postId: string) => {
    const { toFinalize, nextPosts } = planRejectScheduledPost(
      settings.scheduledPosts || [],
      postId,
    );
    if (toFinalize.length === 0) return;
    updateSettings((prev) => ({
      scheduledPosts: nextPosts(prev.scheduledPosts || []),
    }));
    finalizePipelineImagesForPosts(toFinalize);
  };

  // Bulk variants — single functional-updater pass so N approvals applied
  // in a single click don't race against each other or the auto-poster.
  const bulkApproveScheduledPosts = (postIds: string[]) => {
    if (postIds.length === 0) return;
    const idSet = new Set(postIds);
    let approvedPosts: import('../types/mashup').ScheduledPost[] = [];
    updateSettings((prev) => {
      approvedPosts = (prev.scheduledPosts || []).filter(
        (p) => idSet.has(p.id) && p.status === 'pending_approval',
      );
      return {
        scheduledPosts: (prev.scheduledPosts || []).map((p) =>
          idSet.has(p.id) && p.status === 'pending_approval'
            ? { ...p, status: 'scheduled' as const }
            : p
        ),
      };
    });
    if (approvedPosts.length > 0) finalizePipelineImagesForPosts(approvedPosts);
  };

  // V050-009 BUG-DEV-001: same status guard as the singular reject —
  // bulk reject must only touch pending_approval posts. Mirrors the
  // bulkApprove guard at lines 226-229.
  //
  // BUG-DEV-003: same finalize-on-reject as the singular path — releases
  // pipelinePending images to Gallery in a single batch.
  const bulkRejectScheduledPosts = (postIds: string[]) => {
    if (postIds.length === 0) return;
    const idSet = new Set(postIds);
    let rejectedPosts: import('../types/mashup').ScheduledPost[] = [];
    updateSettings((prev) => {
      rejectedPosts = (prev.scheduledPosts || []).filter(
        (p) => idSet.has(p.id) && p.status === 'pending_approval',
      );
      return {
        scheduledPosts: (prev.scheduledPosts || []).map((p) =>
          idSet.has(p.id) && p.status === 'pending_approval'
            ? { ...p, status: 'rejected' as const }
            : p
        ),
      };
    });
    if (rejectedPosts.length > 0) finalizePipelineImagesForPosts(rejectedPosts);
  };

  // V050-005: inline caption editing from the approval queue. Updates
  // every targeted post's caption and the matching CarouselGroup's
  // caption (if all the post ids belong to one) in a single
  // updateSettings pass so the UI never sees a half-applied state.
  const updateScheduledPostsCaption = (postIds: string[], caption: string) => {
    if (postIds.length === 0) return;
    updateSettings((prev) => applyCaptionEdit(
      prev.scheduledPosts || [],
      prev.carouselGroups || [],
      postIds,
      caption,
    ));
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
    updateScheduledPostsCaption,
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
