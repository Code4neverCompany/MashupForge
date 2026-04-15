'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { streamAIToString, extractJsonFromLLM } from '@/lib/aiClient';
import {
  LEONARDO_MODELS,
  type Idea,
  type UserSettings,
  type GeneratedImage,
  type PipelineLogEntry,
  type PipelineProgress,
  type ScheduledPost,
} from '../types/mashup';
import { findBestSlot, findBestSlots, fetchInstagramEngagement, loadEngagementData, type CachedEngagement, type EngagementHour, type EngagementDay } from '@/lib/smartScheduler';
import { getErrorMessage } from '@/lib/errors';

interface UsePipelineDeps {
  ideas: Idea[];
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>)) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  addIdea: (concept: string, context?: string) => void;
  generateImages: (customPrompts?: string[], append?: boolean) => Promise<void>;
  generateComparison: (prompt: string, modelIds: string[], options?: import('../types/mashup').GenerateOptions, cachedEnhancements?: Record<string, import('./useComparison').CachedEnhancement>) => Promise<void>;
  generatePostContent: (image: GeneratedImage) => Promise<GeneratedImage | undefined>;
  saveImage: (img: GeneratedImage) => void;
  savedImages: GeneratedImage[];
  images: GeneratedImage[];
}

const PIPELINE_STORAGE_KEY = 'mashup_pipeline_state';

interface PersistedPipelineState {
  enabled: boolean;
  delay: number;
  continuous: boolean;
  interval: number;
  targetDays: number;
  log: { timestamp: string; step: string; ideaId: string; status: 'success' | 'error'; message: string }[];
}

function loadPersistedState(): PersistedPipelineState {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backfill new fields on old persisted state so older installs
      // don't crash after upgrading.
      return {
        enabled: parsed.enabled ?? false,
        delay: parsed.delay ?? 30,
        continuous: parsed.continuous ?? false,
        interval: parsed.interval ?? 120,
        targetDays: parsed.targetDays ?? 7,
        log: parsed.log ?? [],
      };
    }
  } catch { /* ignore */ }
  return { enabled: false, delay: 30, continuous: false, interval: 120, targetDays: 7, log: [] };
}

function persistState(state: PersistedPipelineState) {
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * Count how many scheduled posts fall within the next `daysAhead` days
 * from now. Used by the continuous-mode daemon to decide whether to
 * auto-generate more ideas this cycle.
 */
function countFutureScheduledPosts(posts: ScheduledPost[] | undefined, daysAhead: number): number {
  if (!posts || posts.length === 0) return 0;
  const now = Date.now();
  const horizon = now + daysAhead * 24 * 60 * 60 * 1000;
  return posts.filter((p) => {
    if (p.status === 'posted' || p.status === 'failed') return false;
    const t = new Date(`${p.date}T${p.time}:00`).getTime();
    return t >= now && t <= horizon;
  }).length;
}

export function usePipeline(deps: UsePipelineDeps) {
  const {
    ideas,
    settings,
    updateSettings,
    updateIdeaStatus,
    addIdea,
    generateImages,
    generateComparison,
    generatePostContent,
    saveImage,
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
  const [pipelineContinuous, setPipelineContinuous] = useState(() => loadPersistedState().continuous);
  const [pipelineInterval, setPipelineIntervalState] = useState(() => loadPersistedState().interval);
  const [pipelineTargetDays, setPipelineTargetDaysState] = useState(() => loadPersistedState().targetDays);

  const stopRequestedRef = useRef(false);
  /**
   * Set by the user via skipCurrentIdea(). Checked at the major
   * checkpoints inside processIdea so the in-flight idea bails out
   * promptly without aborting the whole pipeline run. The outer queue
   * loop resets this between ideas so a stray skip can't carry over.
   */
  const skipCurrentIdeaRef = useRef(false);
  const imagesRef = useRef(images);
  const savedImagesRef = useRef(savedImages);
  // Refs for continuous-mode config so the running loop reads live
  // values if the user toggles/edits them mid-run. Stale-closure
  // avoidance — useCallback dep lists alone aren't enough because the
  // running function was created before the change landed.
  const ideasRef = useRef(ideas);
  const settingsRef = useRef(settings);
  const pipelineContinuousRef = useRef(pipelineContinuous);
  const pipelineIntervalRef = useRef(pipelineInterval);
  const pipelineTargetDaysRef = useRef(pipelineTargetDays);
  const pipelineDelayRef = useRef(pipelineDelay);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { savedImagesRef.current = savedImages; }, [savedImages]);
  useEffect(() => { ideasRef.current = ideas; }, [ideas]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { pipelineContinuousRef.current = pipelineContinuous; }, [pipelineContinuous]);
  useEffect(() => { pipelineIntervalRef.current = pipelineInterval; }, [pipelineInterval]);
  useEffect(() => { pipelineTargetDaysRef.current = pipelineTargetDays; }, [pipelineTargetDays]);
  useEffect(() => { pipelineDelayRef.current = pipelineDelay; }, [pipelineDelay]);

  // Persist state changes
  useEffect(() => {
    persistState({
      enabled: pipelineEnabled,
      delay: pipelineDelay,
      continuous: pipelineContinuous,
      interval: pipelineInterval,
      targetDays: pipelineTargetDays,
      log: pipelineLog.slice(-100).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  }, [pipelineEnabled, pipelineDelay, pipelineContinuous, pipelineInterval, pipelineTargetDays, pipelineLog]);

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

  /** Smart slot picker — uses engagement data (Instagram insights or research-backed defaults).
   *  When `platforms` + `caps` are supplied, the picker also enforces per-platform daily caps
   *  by skipping any day where one of the target platforms is already at its limit. */
  const findNextAvailableSlot = useCallback((
    existingPosts: ScheduledPost[],
    engagement?: CachedEngagement,
    platforms?: string[],
    caps?: UserSettings['pipelineDailyCaps'],
  ): { date: string; time: string; reason: string } => {
    const eng = engagement || loadEngagementData();
    const slot = findBestSlot(existingPosts, eng, { platforms, caps });
    const topHour = eng.hours.reduce((a: EngagementHour, b: EngagementHour) => a.weight > b.weight ? a : b);
    const topDay = eng.days.reduce((a: EngagementDay, b: EngagementDay) => a.multiplier > b.multiplier ? a : b);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const slotDate = new Date(slot.date);
    const capsActive = caps && Object.values(caps).some((v) => typeof v === 'number');
    const reason = `${slot.time} on ${dayNames[slotDate.getDay()]} (${eng.source === 'instagram' ? 'IG insights' : 'research'} — best hour ${topHour.hour}:00, best day ${dayNames[topDay.day]}${capsActive ? ', caps applied' : ''})`;
    return { ...slot, reason };
  }, []);

  const processIdea = useCallback(async (idea: Idea, index: number, total: number, engagement: CachedEngagement, accumulatedPosts: ScheduledPost[]) => {
    // Reset skip-flag at the start of each idea so a stale request from
    // a previous idea can't make us bail out before doing any work.
    skipCurrentIdeaRef.current = false;
    // Tiny inline helper — throws a sentinel string that the outer
    // try/catch in startPipeline turns into a "skipped" log entry.
    const checkSkip = () => {
      if (skipCurrentIdeaRef.current) throw new Error('__SKIP_IDEA__');
    };
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
    setPipelineProgress({ current: index + 1, total, currentStep: 'Updating status', currentIdea: idea.concept, currentIdeaId: idea.id });
    updateIdeaStatus(idea.id, 'in-work');
    addLog('status-update', idea.id, 'success', `Marked "${idea.concept}" as in-work`);

    // Step b: Research trending topics for tags/niches
    let trendingContext = '';
    setPipelineProgress({ current: index + 1, total, currentStep: 'Researching trending topics', currentIdea: idea.concept, currentIdeaId: idea.id });
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
        const queries = data.queriesUsed;
        const queryLabel = Array.isArray(queries) ? queries.join(', ') : Object.values(queries || {}).flat().join(', ');
        addLog('trending', idea.id, 'success', `Found ${data.results?.length || 0} trending items for: ${queryLabel}`);
      } else {
        addLog('trending', idea.id, 'success', 'No trending data found — proceeding without');
      }
    } catch (e: unknown) {
      addLog('trending', idea.id, 'success', `Trending research skipped: ${getErrorMessage(e)}`);
    }

    // Step c: Expand idea to prompt (with trending context)
    setPipelineProgress({ current: index + 1, total, currentStep: 'Expanding idea to prompt', currentIdea: idea.concept, currentIdeaId: idea.id });
    let expandedPrompt: string;
    try {
      expandedPrompt = await expandIdeaToPrompt(idea, trendingContext);
      addLog('prompt-expand', idea.id, 'success', `Expanded prompt: "${expandedPrompt.slice(0, 80)}..."`);
    } catch (e: unknown) {
      addLog('prompt-expand', idea.id, 'error', `Failed to expand: ${getErrorMessage(e)}`);
      throw e;
    }

    // Step d: Generate with ALL models (same as Studio compare).
    // Each model gets its own pi-optimized prompt via modelOptimizer.
    const allModelIds = LEONARDO_MODELS.filter(m => m.id !== 'nano-banana').map(m => m.id);
    setPipelineProgress({ current: index + 1, total, currentStep: `Generating with ${allModelIds.length} models`, currentIdea: idea.concept, currentIdeaId: idea.id });
    try {
      await generateComparison(expandedPrompt, allModelIds, { skipEnhance: false });
      addLog('image-gen', idea.id, 'success', `Image generation started with ${allModelIds.length} models`);
    } catch (e: unknown) {
      addLog('image-gen', idea.id, 'error', `Image generation failed: ${getErrorMessage(e)}`);
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
      checkSkip();
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

    const carouselMode = settings.pipelineCarouselMode ?? false;

    if (readyImages.length === 0) {
      addLog('image-ready', idea.id, 'error', 'Timed out waiting for any image');
    } else if (carouselMode && readyImages.length > 1) {
      addLog('image-ready', idea.id, 'success', `${readyImages.length} image(s) ready — carousel mode`);

      // Save all images to gallery so they show up in Gallery + Captioning
      for (const img of readyImages) saveImage(img);

      // Caption only the first image; the rest share it
      let sharedCaption = '';
      let sharedHashtags: string[] | undefined;
      const firstImage = readyImages[0];
      if (autoCaption) {
        setPipelineProgress({ current: index + 1, total, currentStep: `Captioning carousel (${readyImages.length} images)`, currentIdea: idea.concept, currentIdeaId: idea.id });
        try {
          checkSkip();
          const withCaption = await generatePostContent(firstImage);
          if (withCaption) {
            sharedCaption = withCaption.postCaption || '';
            sharedHashtags = withCaption.postHashtags;
            saveImage(withCaption);
            addLog('caption', idea.id, 'success', `[carousel] Caption: "${sharedCaption.slice(0, 60)}..."`);
          } else {
            addLog('caption', idea.id, 'error', `[carousel] Caption returned empty`);
          }
        } catch (e: unknown) {
          if (getErrorMessage(e) === '__SKIP_IDEA__') throw e;
          addLog('caption', idea.id, 'error', `[carousel] Caption failed: ${getErrorMessage(e)}`);
        }
      }

      checkSkip();

      if (autoSchedule) {
        setPipelineProgress({ current: index + 1, total, currentStep: `Scheduling carousel`, currentIdea: idea.concept, currentIdeaId: idea.id });
        if (pipelinePlatforms.length === 0) {
          addLog('schedule', idea.id, 'error', 'No platforms configured — skipped');
        } else {
          const allPosts = [...(settingsRef.current.scheduledPosts || []), ...accumulatedPosts];
          const slot = findNextAvailableSlot(
            allPosts,
            engagement,
            pipelinePlatforms,
            settingsRef.current.pipelineDailyCaps,
          );
          const nowStamp = Date.now();
          const groupId = `carousel-${nowStamp}-${Math.random().toString(36).slice(2, 9)}`;
          const newPosts: ScheduledPost[] = readyImages.map((img, idx) => ({
            id: `post-${nowStamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            imageId: img.id,
            date: slot.date,
            time: slot.time,
            platforms: pipelinePlatforms,
            caption: sharedCaption,
            status: 'pending_approval' as const,
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
                status: 'scheduled' as const,
              },
            ],
          }));
          addLog('schedule', idea.id, 'success', `[carousel ${readyImages.length}× images] ${slot.reason}`);
        }
      }
      // Note: auto-post is intentionally skipped in carousel mode —
      // carousels publish through the pending_approval → scheduled →
      // auto-poster path, which is the only path that knows how to
      // fan a carouselGroupId out into a multi-image post.
    } else {
      addLog('image-ready', idea.id, 'success', `${readyImages.length} image(s) ready from ${allModelIds.length} models`);

      // Process ALL generated images through caption + schedule.
      // Each model's output gets its own caption and scheduled post.
      for (let imgIdx = 0; imgIdx < readyImages.length; imgIdx++) {
        checkSkip();
        const latestImage = readyImages[imgIdx];
        const modelLabel = latestImage.modelInfo?.modelName || `model-${imgIdx + 1}`;

        // Save to Gallery so the image appears in Gallery + Captioning tabs
        saveImage(latestImage);

        // Step e: Generate caption
        let captionedImg = latestImage;
        if (autoCaption) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Captioning ${modelLabel}`, currentIdea: idea.concept, currentIdeaId: idea.id });
          try {
            const withCaption = await generatePostContent(latestImage);
            if (withCaption) {
              captionedImg = withCaption;
              saveImage(withCaption);
              addLog('caption', idea.id, 'success', `[${modelLabel}] Caption: "${withCaption.postCaption?.slice(0, 60)}..."`);
            } else {
              addLog('caption', idea.id, 'error', `[${modelLabel}] Caption returned empty`);
            }
          } catch (e: unknown) {
            addLog('caption', idea.id, 'error', `[${modelLabel}] Caption failed: ${getErrorMessage(e)}`);
          }
        }

        // Step f: Schedule post (smart — uses engagement data)
        if (autoSchedule) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Scheduling ${modelLabel}`, currentIdea: idea.concept, currentIdeaId: idea.id });
          if (pipelinePlatforms.length === 0) {
            addLog('schedule', idea.id, 'error', 'No platforms configured — skipped');
          } else {
            // Slot computation reads the freshest scheduledPosts via
            // settingsRef so a manual edit / auto-post mid-pipeline doesn't
            // make us pick a slot that just got filled. Local
            // accumulatedPosts adds the in-flight pipeline posts on top.
            const allPosts = [...(settingsRef.current.scheduledPosts || []), ...accumulatedPosts];
            const slot = findNextAvailableSlot(
              allPosts,
              engagement,
              pipelinePlatforms,
              settingsRef.current.pipelineDailyCaps,
            );
            const newPost: ScheduledPost = {
              id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              imageId: latestImage.id,
              date: slot.date,
              time: slot.time,
              platforms: pipelinePlatforms,
              caption: captionedImg.postCaption || '',
              // Pipeline posts enter the approval queue instead of going
              // straight to 'scheduled'. User approves via Pipeline panel
              // / Calendar / Post Ready before the auto-poster picks it up.
              status: 'pending_approval',
              sourceIdeaId: idea.id,
            };
            accumulatedPosts.push(newPost);
            // Functional updater so we append to the LATEST list — protects
            // against a long async pipeline run clobbering manual edits or
            // newly-posted statuses.
            updateSettings((prev) => ({
              scheduledPosts: [...(prev.scheduledPosts || []), newPost],
            }));
            addLog('schedule', idea.id, 'success', `[${modelLabel}] ${slot.reason}`);
          }
        }

        // Step g: Auto-post immediately
        if (autoPost && pipelinePlatforms.length > 0) {
          setPipelineProgress({ current: index + 1, total, currentStep: `Posting ${modelLabel}`, currentIdea: idea.concept, currentIdeaId: idea.id });
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
          } catch (e: unknown) {
            addLog('post', idea.id, 'error', `[${modelLabel}] Auto-post failed: ${getErrorMessage(e)}`);
          }
        }
      }
    }

    // Step h: Mark done
    updateIdeaStatus(idea.id, 'done');
    addLog('complete', idea.id, 'success', `"${idea.concept}" pipeline complete`);
  }, [expandIdeaToPrompt, generateImages, generatePostContent, updateIdeaStatus, updateSettings, settings, addLog, findNextAvailableSlot]);

  /**
   * Ask pi to generate `count` fresh content ideas aligned to the
   * user's active niches/genres and agentPrompt. Returns the raw idea
   * objects (not yet injected into state) so the caller can both
   * inject them via addIdea AND operate on them within the same cycle
   * without waiting for a re-render. Called by the continuous-mode
   * daemon when the queue is empty.
   */
  const autoGenerateIdeas = useCallback(async (count: number): Promise<Idea[]> => {
    const s = settingsRef.current;
    const themed = s.pipelineThemedBatches ?? false;
    const base = `${s.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${s.agentNiches?.join(', ') || 'All'}
Active Genres: ${s.agentGenres?.join(', ') || 'All'}`;

    // Themed-batch mode: ask pi to pick ONE umbrella theme and produce
    // N variations riffing on it, so the feed reads as a coherent drop
    // instead of disconnected one-offs. Shared context string ties them
    // together in the UI + feedback loop.
    const systemContext = themed
      ? `${base}

Pick ONE specific, unifying theme that fits the active niches/genres — a single crossover universe pairing, era mashup, visual motif, or narrative angle. Then generate ${count} variations that all riff on that same theme from different angles (different characters, scenes, moods, or compositions within the theme).

The theme should be concrete, not generic — e.g. "Retro Saturday Morning Cartoons × Cosmic Horror" is good, "cool mashups" is not.

Return ONLY a JSON object with:
- "theme": the one-line shared theme (used as the shared context for every variation)
- "variations": array of ${count} objects, each with a "concept" field (the specific image idea within the theme)

Example:
{"theme":"Retro Saturday Morning Cartoons × Cosmic Horror","variations":[
  {"concept":"Scooby-Doo gang investigating a non-euclidean haunted mansion, Lovecraftian tentacles seeping through the walls"},
  {"concept":"The Muppets performing a ritual in a candlelit theatre, Kermit chanting from a Necronomicon"},
  {"concept":"Looney Tunes characters as cultists worshipping a cosmic Acme entity, Bugs Bunny in dark robes"}
]}`
      : `${base}

Generate ${count} unique, creative content ideas for social media posts.
Each idea should be visually striking, shareable, and aligned with the niches/genres.
Return ONLY a JSON array of objects with "concept" and "context" fields. Example:
[{"concept": "Darth Vader as a grimdark Warhammer inquisitor...", "context": "Star Wars × WH40k crossover"}]`;

    const text = await streamAIToString(systemContext, { mode: 'idea' });

    const nowStamp = Date.now();
    const buildIdea = (concept: string, context: string, i: number): Idea => ({
      id: `idea-auto-${nowStamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      concept: concept.trim(),
      context: context.trim(),
      status: 'idea' as const,
      createdAt: nowStamp,
    });

    if (themed) {
      const parsed = extractJsonFromLLM(text, 'object');
      const theme = typeof parsed?.theme === 'string' ? parsed.theme.trim() : '';
      const variations = Array.isArray(parsed?.variations) ? parsed.variations : [];
      const ideasOut = (variations as unknown[])
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).concept === 'string' && Boolean((v as Record<string, unknown>).concept))
        .map((v, i) =>
          buildIdea(
            String(v.concept),
            theme ? `Theme: ${theme}${v.context ? ` — ${v.context}` : ''}` : (typeof v.context === 'string' ? v.context : ''),
            i,
          ),
        );
      // Fallback: if pi returned something we couldn't parse as a themed
      // object, try the legacy array shape so a bad response degrades
      // gracefully instead of stalling the daemon.
      if (ideasOut.length > 0) return ideasOut;
    }

    const parsed = extractJsonFromLLM(text, 'array');
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((idea): idea is Record<string, unknown> => typeof idea === 'object' && idea !== null && typeof (idea as Record<string, unknown>).concept === 'string' && Boolean((idea as Record<string, unknown>).concept))
      .map((idea, i) =>
        buildIdea(
          String(idea.concept),
          typeof idea.context === 'string' ? idea.context : '',
          i,
        ),
      );
  }, []);

  const startPipeline = useCallback(async () => {
    stopRequestedRef.current = false;
    setPipelineRunning(true);
    addLog('pipeline-start', '', 'success', `Pipeline started${pipelineContinuousRef.current ? ' (continuous mode)' : ''}`);

    // Refresh engagement data from Instagram (cached 24h)
    let engagement: CachedEngagement;
    try {
      engagement = await fetchInstagramEngagement(
        settingsRef.current.apiKeys?.instagram?.accessToken,
        settingsRef.current.apiKeys?.instagram?.igAccountId,
      );
    } catch {
      engagement = loadEngagementData();
    }
    const topHours = engagement.hours
      .sort((a: EngagementHour, b: EngagementHour) => b.weight - a.weight)
      .slice(0, 3)
      .map((h: EngagementHour) => `${h.hour}:00`);
    addLog('engagement', '', 'success', `Scheduler: ${engagement.source === 'instagram' ? 'IG insights' : 'research defaults'} — top hours: ${topHours.join(', ')}`);

    // Accumulated posts across the entire pipeline run (prevents slot collisions)
    const accumulatedPosts: ScheduledPost[] = [];
    let cycle = 0;

    // Outer loop — one iteration per daemon cycle. Exits after one pass
    // when pipelineContinuous is off, or when the user stops the run.
    do {
      cycle++;

      // Pull the freshest list of pending ideas from the ref so new
      // ideas added between cycles (via addIdea, either by the daemon
      // or by the user in another tab) show up.
      let pendingIdeas = ideasRef.current.filter(i => i.status === 'idea');

      // Queue empty → auto-generate via pi. Happens both on first run
      // when the user has no ideas yet and in continuous mode when
      // we've exhausted the backlog.
      if (pendingIdeas.length === 0) {
        setPipelineProgress({ current: 0, total: 0, currentStep: 'Auto-generating ideas...', currentIdea: '' });
        try {
          const generated = await autoGenerateIdeas(3);
          for (const g of generated) {
            addIdea(g.concept, g.context || undefined);
          }
          // Themed runs share the same "Theme: ..." prefix across every
          // idea's context — surface it in the log so the user can see
          // at a glance what the cycle is about.
          const sharedTheme = generated[0]?.context?.startsWith('Theme: ')
            ? generated[0].context.replace(/^Theme:\s*/, '').split(' — ')[0]
            : '';
          addLog(
            'auto-generate',
            '',
            'success',
            sharedTheme
              ? `Queue empty → generated ${generated.length} themed ideas via pi — theme: "${sharedTheme}"`
              : `Queue empty → generated ${generated.length} ideas via pi`,
          );
          // Use the generated ideas directly for this cycle — we can't
          // rely on ideasRef being updated this tick because addIdea
          // dispatches through setState.
          pendingIdeas = generated;
        } catch (e: unknown) {
          addLog('auto-generate', '', 'error', `Failed to auto-generate ideas: ${getErrorMessage(e)}`);
          // If we couldn't generate and we're not in continuous mode,
          // there's nothing more to do this run.
          if (!pipelineContinuousRef.current) break;
          // In continuous mode, sleep then retry the cycle.
          setPipelineProgress({ current: 0, total: 0, currentStep: `Retry in ${pipelineIntervalRef.current} min`, currentIdea: '' });
          await delay(pipelineIntervalRef.current * 60 * 1000);
          continue;
        }
      }

      if (pendingIdeas.length === 0) {
        // Still nothing — bail out rather than spin forever.
        addLog('pipeline-cycle', '', 'success', `Cycle ${cycle} — no ideas available, stopping`);
        break;
      }

      setPipelineQueue(pendingIdeas);
      addLog('pipeline-cycle', '', 'success', `Cycle ${cycle} — processing ${pendingIdeas.length} ideas`);

      for (let i = 0; i < pendingIdeas.length; i++) {
        if (stopRequestedRef.current) {
          addLog('pipeline-stop', '', 'success', 'Pipeline stopped by user');
          break;
        }

        const idea = pendingIdeas[i];
        setPipelineQueue(pendingIdeas.slice(i));

        try {
          await processIdea(idea, i, pendingIdeas.length, engagement, accumulatedPosts);
        } catch (e: unknown) {
          if (getErrorMessage(e) === '__SKIP_IDEA__') {
            addLog('pipeline-skip', idea.id, 'success', `Skipped "${idea.concept}" by user request`);
            updateIdeaStatus(idea.id, 'idea'); // Put it back in the queue
          } else {
            addLog('pipeline-error', idea.id, 'error', `Skipping idea due to error: ${getErrorMessage(e)}`);
            updateIdeaStatus(idea.id, 'idea'); // Reset on failure
          }
        }
        // Defensive — also clear the flag here so a skip request that
        // arrived during the inter-idea delay doesn't carry into the
        // next idea before processIdea's own reset runs.
        skipCurrentIdeaRef.current = false;

        // Delay between ideas (unless last or stopped)
        if (i < pendingIdeas.length - 1 && !stopRequestedRef.current) {
          setPipelineProgress(prev => prev ? { ...prev, currentStep: `Waiting ${pipelineDelayRef.current}s before next idea...` } : null);
          await delay(pipelineDelayRef.current * 1000);
        }
      }

      if (stopRequestedRef.current) break;

      // Continuous-mode tail: check whether the schedule needs filling,
      // log a status line, sleep for the configured interval, then loop.
      if (pipelineContinuousRef.current) {
        const allPosts = [...(settingsRef.current.scheduledPosts || []), ...accumulatedPosts];
        const futurePosts = countFutureScheduledPosts(allPosts, pipelineTargetDaysRef.current);
        const targetPerDay = 2; // two posts/day is a reasonable default
        const targetTotal = pipelineTargetDaysRef.current * targetPerDay;

        if (futurePosts < targetTotal) {
          addLog('daemon', '', 'success', `Schedule has ${futurePosts}/${targetTotal} posts in next ${pipelineTargetDaysRef.current}d — will continue after sleep`);
        } else {
          addLog('daemon', '', 'success', `Schedule target met (${futurePosts}/${targetTotal}) — sleeping ${pipelineIntervalRef.current}m`);
        }

        setPipelineProgress({ current: 0, total: 0, currentStep: `Next cycle in ${pipelineIntervalRef.current} min`, currentIdea: '' });
        // Sleep in small slices so stop-requests are honored quickly
        // instead of forcing the user to wait up to `pipelineInterval`
        // minutes after clicking Stop.
        const sleepMs = pipelineIntervalRef.current * 60 * 1000;
        const sliceMs = 2000;
        for (let slept = 0; slept < sleepMs && !stopRequestedRef.current; slept += sliceMs) {
          await delay(Math.min(sliceMs, sleepMs - slept));
        }
      }
    } while (pipelineContinuousRef.current && !stopRequestedRef.current);

    setPipelineRunning(false);
    setPipelineQueue([]);
    setPipelineProgress(null);
    addLog('pipeline-end', '', 'success', `Pipeline finished after ${cycle} cycle${cycle === 1 ? '' : 's'}`);
  }, [processIdea, addLog, updateIdeaStatus, autoGenerateIdeas, addIdea]);

  const stopPipeline = useCallback(() => {
    stopRequestedRef.current = true;
  }, []);

  const skipCurrentIdea = useCallback(() => {
    skipCurrentIdeaRef.current = true;
  }, []);

  const togglePipeline = useCallback(() => {
    setPipelineEnabled(prev => !prev);
  }, []);

  const setPipelineDelay = useCallback((d: number) => {
    setPipelineDelayState(d);
  }, []);

  const toggleContinuous = useCallback(() => {
    setPipelineContinuous(prev => !prev);
  }, []);

  const setPipelineInterval = useCallback((minutes: number) => {
    // Clamp to sane range — 30min floor, 1 day ceiling.
    setPipelineIntervalState(Math.max(30, Math.min(1440, minutes)));
  }, []);

  const setPipelineTargetDays = useCallback((days: number) => {
    setPipelineTargetDaysState(Math.max(1, Math.min(30, days)));
  }, []);

  const clearPipelineLog = useCallback(() => {
    setPipelineLog([]);
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
    skipCurrentIdea,
    pipelineContinuous,
    toggleContinuous,
    pipelineInterval,
    setPipelineInterval,
    pipelineTargetDays,
    setPipelineTargetDays,
    clearPipelineLog,
  };
}
