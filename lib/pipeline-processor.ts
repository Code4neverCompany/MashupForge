/**
 * Standalone pipeline idea processor.
 *
 * Extracted from hooks/usePipeline.ts so it can be unit-tested without React
 * and without a browser environment. All side-effects are injected via
 * ProcessIdeaDeps so tests can mock them cheaply.
 *
 * V030-001 will split usePipeline into usePipelineDaemon + useIdeaProcessor;
 * this extraction is the first step — processIdea is now callable outside
 * a hook context.
 */

import {
  LEONARDO_MODELS,
  type Idea,
  type GeneratedImage,
  type UserSettings,
  type ScheduledPost,
  type PipelineProgress,
} from '@/types/mashup';
import type { CachedEngagement } from '@/lib/smartScheduler';
import { resolvePipelinePostStatus } from '@/lib/pipeline-daemon-utils';
import {
  configuredPlatforms,
  type DesktopCredentialFlags,
  type PipelinePlatform,
} from '@/lib/platform-credentials';

/** Typed replacement for the __SKIP_IDEA__ string sentinel. */
export class SkipIdeaSignal extends Error {
  readonly kind = 'skip' as const;
  constructor() {
    super('Pipeline idea skipped by user');
    this.name = 'SkipIdeaSignal';
  }
}

/**
 * V050-001: credit-preserving resume payload. When the daemon detects a
 * checkpoint with stored imageIds, it looks those images up in the saved
 * gallery and forwards them here so processIdea skips the (expensive)
 * Leonardo generation steps and resumes at captioning.
 */
export interface ResumeContext {
  /** Pre-generated images for this idea, already in the gallery. */
  images: GeneratedImage[];
}

export interface ProcessIdeaDeps {
  /**
   * Fetch trending context for the idea (wraps /api/trending).
   * Returns the context string on success, '' when no data is found.
   * May throw on hard network/parse failure — processIdea catches and continues.
   */
  fetchTrendingContext(idea: Idea): Promise<string>;
  /** Expand an idea + trending context into an image generation prompt. Throws on failure. */
  expandIdeaToPrompt(idea: Idea, trendingContext: string): Promise<string>;
  /** Start image generation for a prompt + model list. Throws on failure. */
  triggerImageGeneration(prompt: string, modelIds: string[]): Promise<void>;
  /**
   * Wait for generated images to appear in the image store.
   * Returns ready images (may be empty on timeout).
   * Implementations poll the image store and throw SkipIdeaSignal when
   * isSkipRequested() goes true mid-poll.
   */
  waitForImages(modelCount: number): Promise<GeneratedImage[]>;
  /** Generate post caption + hashtags for a single image. Returns undefined on empty result. */
  generatePostContent(img: GeneratedImage): Promise<GeneratedImage | undefined>;
  /** Persist an image to the gallery. */
  saveImage(img: GeneratedImage): void;
  updateIdeaStatus(id: string, status: 'idea' | 'in-work' | 'done'): void;
  updateSettings(patch: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>)): void;
  findNextAvailableSlot(
    posts: ScheduledPost[],
    engagement: CachedEngagement,
    platforms?: string[],
    caps?: UserSettings['pipelineDailyCaps'],
  ): { date: string; time: string; reason: string };
  addLog(step: string, ideaId: string, status: 'success' | 'error', message: string): void;
  setPipelineProgress(p: PipelineProgress | null): void;
  /** Write a resumable checkpoint for the current step. Best-effort. */
  writeCheckpoint(step: string): void;
  /** Returns true when the user has requested to skip the current idea. */
  isSkipRequested(): boolean;
  /** Read the freshest scheduled posts for slot collision avoidance. */
  getScheduledPosts(): ScheduledPost[];
  /**
   * V041-HOTFIX-IG: presence flags for credentials stored in the desktop
   * config.json (separate from settings.apiKeys, which is the web-mode
   * IDB-backed bag). Pipeline platform inference must consider both, or
   * desktop users with creds only in config.json get "No platforms
   * configured — skipped". Optional so non-desktop callers can omit.
   */
  desktopCreds?: DesktopCredentialFlags;
}

function checkSkip(isSkipRequested: () => boolean): void {
  if (isSkipRequested()) throw new SkipIdeaSignal();
}

/**
 * Process a single idea through the full pipeline:
 * trending → expand → generate → caption → schedule → (auto-post).
 *
 * Throws SkipIdeaSignal when the user requests a skip mid-run.
 * Throws on fatal errors (expand / generate failures).
 * Handles recoverable errors (trending, caption) internally and continues.
 */
export async function processIdea(
  idea: Idea,
  index: number,
  total: number,
  engagement: CachedEngagement,
  accumulatedPosts: ScheduledPost[],
  settings: UserSettings,
  deps: ProcessIdeaDeps,
  resumeFrom?: ResumeContext,
): Promise<void> {
  const {
    fetchTrendingContext,
    expandIdeaToPrompt,
    triggerImageGeneration,
    waitForImages,
    generatePostContent,
    saveImage,
    updateIdeaStatus,
    updateSettings,
    findNextAvailableSlot,
    addLog,
    setPipelineProgress,
    writeCheckpoint,
    isSkipRequested,
    getScheduledPosts,
  } = deps;

  const resuming = !!(resumeFrom && resumeFrom.images.length > 0);

  writeCheckpoint(resuming ? 'Resuming at captioning' : 'starting');

  const autoCaption = settings.pipelineAutoCaption ?? true;
  const autoSchedule = settings.pipelineAutoSchedule ?? true;
  const autoPost = settings.pipelineAutoPost ?? false;

  const explicitPlatforms =
    settings.pipelinePlatforms && settings.pipelinePlatforms.length > 0
      ? settings.pipelinePlatforms
      : null;
  // V041-HOTFIX-IG: defer to the shared helper so this matches PipelinePanel's
  // availability check (which considers desktop config.json creds, not just
  // settings.apiKeys). The previous Object.entries filter both ignored desktop
  // creds and treated empty objects as configured.
  const inferredPlatforms: PipelinePlatform[] = configuredPlatforms(settings, deps.desktopCreds);
  const pipelinePlatforms = explicitPlatforms ?? inferredPlatforms;

  // V040-HOTFIX-007 + BUG-CRIT-009: when this run will produce a post
  // that lands in `pending_approval`, the associated images must stay
  // OUT of Gallery until the user approves them (at which point the
  // watermark is applied + the flag cleared in
  // MashupContext.approveScheduledPost).
  //
  // BUG-CRIT-009 update: gate is `autoSchedule` only — the previous
  // `pipelinePlatforms.length > 0` extra constraint silently dropped
  // the flag whenever platform credential detection failed, so the
  // image leaked straight into Gallery un-reviewed and un-watermarked.
  // The downstream scheduling block now always creates a
  // `pending_approval` ScheduledPost (with `platforms: []` when none
  // are configured) so the approval queue has an entry that can clear
  // the flag for every pipeline-produced image. After BUG-CRIT-001
  // `resolvePipelinePostStatus` always returns 'pending_approval', so
  // the call here just documents intent — the result is always true.
  const pipelinePending =
    autoSchedule &&
    resolvePipelinePostStatus(pipelinePlatforms, settings.pipelineAutoApprove) ===
      'pending_approval';
  const savePipelineImage = (img: GeneratedImage) =>
    saveImage(pipelinePending ? { ...img, pipelinePending: true } : img);

  let expandedPrompt: string;
  let readyImages: GeneratedImage[];

  if (resuming) {
    // V050-001: credit-preserving resume. Images already exist in the
    // gallery from the prior interrupted run — skip status flip, trending,
    // expand, and generation. Use idea.concept as the prompt fallback for
    // any caption-failure path below; pi.dev re-expand would be cheap but
    // we avoid even that to keep resume instant.
    setPipelineProgress({
      current: index + 1,
      total,
      currentStep: `Resuming at captioning (${resumeFrom!.images.length} images)`,
      currentIdea: idea.concept,
      currentIdeaId: idea.id,
    });
    updateIdeaStatus(idea.id, 'in-work');
    addLog(
      'resume',
      idea.id,
      'success',
      `Resumed at captioning — ${resumeFrom!.images.length} pre-generated image${
        resumeFrom!.images.length === 1 ? '' : 's'
      } reused, no Leonardo credits spent`,
    );
    expandedPrompt = idea.concept;
    readyImages = resumeFrom!.images;
  } else {
    // Step a — mark in-work
    setPipelineProgress({
      current: index + 1,
      total,
      currentStep: 'Updating status',
      currentIdea: idea.concept,
      currentIdeaId: idea.id,
    });
    updateIdeaStatus(idea.id, 'in-work');
    addLog('status-update', idea.id, 'success', `Marked "${idea.concept}" as in-work`);
    writeCheckpoint('Updating status');

    // Step b — trending context (recoverable)
    let trendingContext = '';
    setPipelineProgress({
      current: index + 1,
      total,
      currentStep: 'Researching trending topics',
      currentIdea: idea.concept,
      currentIdeaId: idea.id,
    });
    writeCheckpoint('Researching trending topics');
    try {
      trendingContext = await fetchTrendingContext(idea);
      if (trendingContext) {
        addLog('trending', idea.id, 'success', `Trending context fetched`);
      } else {
        addLog('trending', idea.id, 'success', 'No trending data found — proceeding without');
      }
    } catch {
      addLog('trending', idea.id, 'error', 'Trending research failed — proceeding without');
    }

    // Step c — expand prompt (fatal on failure)
    setPipelineProgress({
      current: index + 1,
      total,
      currentStep: 'Expanding idea to prompt',
      currentIdea: idea.concept,
      currentIdeaId: idea.id,
    });
    writeCheckpoint('Expanding prompt');
    try {
      expandedPrompt = await expandIdeaToPrompt(idea, trendingContext);
      addLog('prompt-expand', idea.id, 'success', `Expanded: "${expandedPrompt.slice(0, 80)}..."`);
    } catch (e) {
      addLog('prompt-expand', idea.id, 'error', 'Failed to expand prompt');
      throw e;
    }

    // Step d — generate images (fatal on failure)
    const allModelIds = LEONARDO_MODELS.filter((m) => m.id !== 'nano-banana').map((m) => m.id);
    setPipelineProgress({
      current: index + 1,
      total,
      currentStep: `Generating with ${allModelIds.length} models`,
      currentIdea: idea.concept,
      currentIdeaId: idea.id,
    });
    writeCheckpoint('Generating images');
    try {
      await triggerImageGeneration(expandedPrompt, allModelIds);
      addLog('image-gen', idea.id, 'success', `Image generation started with ${allModelIds.length} models`);
    } catch (e) {
      addLog('image-gen', idea.id, 'error', 'Image generation failed');
      throw e;
    }

    // Wait for images to appear (injectable — tests mock this to return immediately)
    readyImages = await waitForImages(allModelIds.length);
  }
  const carouselMode = settings.pipelineCarouselMode ?? false;

  if (readyImages.length === 0) {
    // Timeout — log and continue so the idea still gets marked done
    addLog('image-ready', idea.id, 'error', 'Timed out waiting for any image');
  } else if (carouselMode && readyImages.length > 1) {
    // ── Carousel mode ──────────────────────────────────────────────────────
    addLog(
      'image-ready',
      idea.id,
      'success',
      `${readyImages.length} images ready — carousel mode`,
    );
    for (const img of readyImages) savePipelineImage(img);
    writeCheckpoint('Captioning carousel');

    let sharedCaption = '';
    let sharedHashtags: string[] | undefined;
    if (autoCaption) {
      setPipelineProgress({
        current: index + 1,
        total,
        currentStep: `Captioning carousel (${readyImages.length} images)`,
        currentIdea: idea.concept,
        currentIdeaId: idea.id,
      });
      try {
        checkSkip(isSkipRequested);
        const withCaption = await generatePostContent(readyImages[0]);
        if (withCaption) {
          sharedCaption = withCaption.postCaption || '';
          sharedHashtags = withCaption.postHashtags;
          savePipelineImage(withCaption);
          addLog('caption', idea.id, 'success', `[carousel] Caption generated`);
        } else {
          sharedCaption = expandedPrompt;
          addLog('caption', idea.id, 'error', '[carousel] Caption returned empty — using prompt as fallback');
        }
      } catch (e) {
        if (e instanceof SkipIdeaSignal) throw e;
        sharedCaption = expandedPrompt;
        addLog('caption', idea.id, 'error', '[carousel] Caption failed — using prompt as fallback');
      }
    }

    checkSkip(isSkipRequested);

    if (autoSchedule) {
      setPipelineProgress({
        current: index + 1,
        total,
        currentStep: 'Scheduling carousel',
        currentIdea: idea.concept,
        currentIdeaId: idea.id,
      });
      // BUG-CRIT-009: always create the ScheduledPost (with empty
      // `platforms` when none are configured) so the approval queue
      // has an entry that can later clear `pipelinePending` on the
      // images. Without this, a pipeline run with autoSchedule=true
      // but no platforms would orphan its pipelinePending images
      // (hidden from Gallery, no approval card to release them).
      {
        const nowStamp = Date.now();
        const groupId = `carousel-${nowStamp}-${Math.random().toString(36).slice(2, 9)}`;
        const allPosts = [...getScheduledPosts(), ...accumulatedPosts];
        const slot = findNextAvailableSlot(
          allPosts,
          engagement,
          pipelinePlatforms,
          settings.pipelineDailyCaps,
        );
        const carouselStatus = resolvePipelinePostStatus(
          pipelinePlatforms,
          settings.pipelineAutoApprove,
        );
        // V040-HOTFIX-004: keep CarouselGroup.status in sync with the
        // per-post status. CarouselGroup has no `pending_approval`
        // value of its own, so a queue of posts that still need
        // approval is represented as `draft` — accurate to the
        // CarouselGroup type and consistent with how user-built
        // groups in the gallery start out (also 'draft').
        const carouselGroupStatus: 'scheduled' | 'draft' =
          carouselStatus === 'scheduled' ? 'scheduled' : 'draft';
        const newPosts: ScheduledPost[] = readyImages.map((img, idx) => ({
          id: `post-${nowStamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          imageId: img.id,
          date: slot.date,
          time: slot.time,
          platforms: pipelinePlatforms,
          caption: sharedCaption,
          status: carouselStatus,
          carouselGroupId: groupId,
          sourceIdeaId: idea.id,
        }));
        accumulatedPosts.push(...newPosts);
        updateSettings((prev) => ({
          scheduledPosts: [...(prev.scheduledPosts || []), ...newPosts],
          carouselGroups: [
            ...(prev.carouselGroups || []),
            {
              id: groupId,
              imageIds: readyImages.map((i) => i.id),
              caption: sharedCaption,
              hashtags: sharedHashtags,
              scheduledDate: slot.date,
              scheduledTime: slot.time,
              platforms: pipelinePlatforms,
              status: carouselGroupStatus,
            },
          ],
        }));
        addLog('schedule', idea.id, 'success', `[carousel ${readyImages.length}×] ${slot.reason}`);
      }
    }
  } else {
    // ── Single / per-model mode ─────────────────────────────────────────────
    addLog(
      'image-ready',
      idea.id,
      'success',
      `${readyImages.length} image${readyImages.length === 1 ? '' : 's'} ready`,
    );
    for (let imgIdx = 0; imgIdx < readyImages.length; imgIdx++) {
      checkSkip(isSkipRequested);
      const img = readyImages[imgIdx];
      const modelLabel = img.modelInfo?.modelName ?? `model-${imgIdx + 1}`;

      savePipelineImage(img);
      writeCheckpoint(`Captioning ${modelLabel}`);

      let captionedImg = img;
      if (autoCaption) {
        setPipelineProgress({
          current: index + 1,
          total,
          currentStep: `Captioning ${modelLabel}`,
          currentIdea: idea.concept,
          currentIdeaId: idea.id,
        });
        try {
          const withCaption = await generatePostContent(img);
          if (withCaption) {
            captionedImg = withCaption;
            savePipelineImage(withCaption);
            addLog('caption', idea.id, 'success', `[${modelLabel}] Caption generated`);
          } else {
            captionedImg = { ...img, postCaption: expandedPrompt };
            addLog('caption', idea.id, 'error', `[${modelLabel}] Caption returned empty — using prompt as fallback`);
          }
        } catch {
          captionedImg = { ...img, postCaption: expandedPrompt };
          addLog('caption', idea.id, 'error', `[${modelLabel}] Caption failed — using prompt as fallback`);
        }
      }

      let scheduledPostId: string | null = null;
      if (autoSchedule) {
        setPipelineProgress({
          current: index + 1,
          total,
          currentStep: `Scheduling ${modelLabel}`,
          currentIdea: idea.concept,
          currentIdeaId: idea.id,
        });
        // BUG-CRIT-009: always create the ScheduledPost (with empty
        // `platforms` when none are configured) so the approval queue
        // has an entry that can later clear `pipelinePending` on the
        // image. Without this, an autoSchedule=true run with missing
        // platform credentials would orphan its pipelinePending image
        // (hidden from Gallery, no approval card to release it).
        {
          const allPosts = [...getScheduledPosts(), ...accumulatedPosts];
          const slot = findNextAvailableSlot(
            allPosts,
            engagement,
            pipelinePlatforms,
            settings.pipelineDailyCaps,
          );
          const newPost: ScheduledPost = {
            id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            imageId: img.id,
            date: slot.date,
            time: slot.time,
            platforms: pipelinePlatforms,
            caption: captionedImg.postCaption || '',
            status: resolvePipelinePostStatus(
              pipelinePlatforms,
              settings.pipelineAutoApprove,
            ),
            sourceIdeaId: idea.id,
          };
          scheduledPostId = newPost.id;
          accumulatedPosts.push(newPost);
          updateSettings((prev) => ({
            scheduledPosts: [...(prev.scheduledPosts || []), newPost],
          }));
          addLog('schedule', idea.id, 'success', `[${modelLabel}] ${slot.reason}`);
        }
      }

      if (autoPost && pipelinePlatforms.length > 0) {
        setPipelineProgress({
          current: index + 1,
          total,
          currentStep: `Posting ${modelLabel}`,
          currentIdea: idea.concept,
          currentIdeaId: idea.id,
        });
        try {
          const res = await fetch('/api/social/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: captionedImg.postCaption || expandedPrompt,
              platforms: pipelinePlatforms,
              mediaUrl: img.url,
              mediaBase64: img.base64,
              credentials: {
                instagram: settings.apiKeys.instagram,
                twitter: settings.apiKeys.twitter,
                pinterest: settings.apiKeys.pinterest,
                discord: { webhookUrl: settings.apiKeys.discordWebhook },
              },
            }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error || 'post failed');
          addLog('post', idea.id, 'success', `[${modelLabel}] Posted to ${pipelinePlatforms.join(', ')}`);
          if (scheduledPostId) {
            const postedId = scheduledPostId;
            updateSettings((prev) => ({
              scheduledPosts: (prev.scheduledPosts || []).map((p) =>
                p.id === postedId ? { ...p, status: 'posted' as const } : p,
              ),
            }));
          }
        } catch {
          addLog('post', idea.id, 'error', `[${modelLabel}] Auto-post failed`);
        }
      }
    }
  }

  // Step h — mark done
  updateIdeaStatus(idea.id, 'done');
  addLog('complete', idea.id, 'success', `"${idea.concept}" pipeline complete`);
}
