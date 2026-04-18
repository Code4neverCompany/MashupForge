'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { streamAIToString, extractJsonArrayFromLLM, extractJsonObjectFromLLM } from '@/lib/aiClient';
import {
  type Idea,
  type UserSettings,
  type GeneratedImage,
  type PipelineLogEntry,
  type PipelineProgress,
  type ScheduledPost,
} from '../types/mashup';
import {
  fetchInstagramEngagement,
  loadEngagementData,
  type CachedEngagement,
  type EngagementHour,
} from '@/lib/smartScheduler';
import { getErrorMessage } from '@/lib/errors';
import { setPipelineBusy } from '@/lib/pipeline-busy';
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  type PipelineCheckpoint,
} from '@/lib/pipeline-checkpoint';
import { SkipIdeaSignal } from '@/lib/pipeline-processor';
import { withPipelineRunning } from '@/lib/pipeline-runner';

const PIPELINE_STORAGE_KEY = 'mashup_pipeline_state';

interface PersistedPipelineState {
  enabled: boolean;
  delay: number;
  continuous: boolean;
  interval: number;
  targetDays: number;
  log: {
    timestamp: string;
    step: string;
    ideaId: string;
    status: 'success' | 'error';
    message: string;
  }[];
}

function loadPersistedState(): PersistedPipelineState {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? false,
        delay: parsed.delay ?? 30,
        continuous: parsed.continuous ?? false,
        interval: parsed.interval ?? 120,
        targetDays: parsed.targetDays ?? 7,
        log: parsed.log ?? [],
      };
    }
  } catch {
    /* ignore */
  }
  return {
    enabled: false,
    delay: 30,
    continuous: false,
    interval: 120,
    targetDays: 7,
    log: [],
  };
}

function persistState(state: PersistedPipelineState) {
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function countFutureScheduledPosts(
  posts: ScheduledPost[] | undefined,
  daysAhead: number,
): number {
  if (!posts || posts.length === 0) return 0;
  const now = Date.now();
  const horizon = now + daysAhead * 24 * 60 * 60 * 1000;
  return posts.filter(p => {
    if (p.status === 'posted' || p.status === 'failed') return false;
    const t = new Date(`${p.date}T${p.time}:00`).getTime();
    return t >= now && t <= horizon;
  }).length;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** V030-002: hard cap per idea so a stuck step can't pin the daemon. */
const PER_IDEA_TIMEOUT_MS = 10 * 60 * 1000;

class IdeaTimeoutError extends Error {
  readonly kind = 'timeout' as const;
  constructor() {
    super('__IDEA_TIMEOUT__');
    this.name = 'IdeaTimeoutError';
  }
}

export type WriteCheckpointBase = (
  ideaId: string,
  concept: string,
  step: string,
  imageIds: readonly string[],
) => void;

export type ProcessIdeaFn = (
  idea: Idea,
  index: number,
  total: number,
  engagement: CachedEngagement,
  accumulatedPosts: ScheduledPost[],
  skipSignal: AbortSignal,
  writeCheckpointBase: WriteCheckpointBase,
) => Promise<void>;

export interface UsePipelineDaemonDeps {
  ideas: Idea[];
  settings: UserSettings;
  images: GeneratedImage[];
  savedImages: GeneratedImage[];
  addIdea: (concept: string, context?: string) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
}

/**
 * Pipeline daemon hook. Owns all pipeline state, the outer cycle loop,
 * checkpoint storage, and user-facing run controls.
 *
 * V030-001: refs reduced from 8 sync pairs to 1 consolidated latestPropsRef
 * (documented exception for live reads of parent props — see spec §4.3).
 * All daemon-owned state reads use functional setState peek; stop/skip
 * signals use AbortController held in useState.
 */
export function usePipelineDaemon(deps: UsePipelineDaemonDeps) {
  const { addIdea, updateIdeaStatus } = deps;

  const [pipelineEnabled, setPipelineEnabled] = useState(
    () => loadPersistedState().enabled,
  );
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<Idea[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [pipelineLog, setPipelineLog] = useState<PipelineLogEntry[]>(() =>
    loadPersistedState().log.map(e => ({ ...e, timestamp: new Date(e.timestamp) })),
  );
  const [pipelineDelay, setPipelineDelayState] = useState(() => loadPersistedState().delay);
  const [pipelineContinuous, setPipelineContinuous] = useState(
    () => loadPersistedState().continuous,
  );
  const [pipelineInterval, setPipelineIntervalState] = useState(
    () => loadPersistedState().interval,
  );
  const [pipelineTargetDays, setPipelineTargetDaysState] = useState(
    () => loadPersistedState().targetDays,
  );
  const [pendingResume, setPendingResume] = useState<PipelineCheckpoint | null>(null);
  // AbortControllers — signal.aborted is a live read on the shared object,
  // so no ref needed. Held in useState so stop/skip handlers can reach the
  // current one via functional setState peek.
  const [runCtrl, setRunCtrl] = useState<AbortController | null>(null);
  const [skipCtrl, setSkipCtrl] = useState<AbortController | null>(null);

  // § 4.3 documented exception: ONE consolidated ref + ONE useEffect, replacing
  // the 8 per-field ref/useEffect pairs in the old god hook. Live reads of
  // parent-owned values (ideas, settings, images, savedImages) must go through
  // this — long-running async loops can't close over React props without it.
  const latestPropsRef = useRef({
    ideas: deps.ideas,
    settings: deps.settings,
    images: deps.images,
    savedImages: deps.savedImages,
  });
  useEffect(() => {
    latestPropsRef.current = {
      ideas: deps.ideas,
      settings: deps.settings,
      images: deps.images,
      savedImages: deps.savedImages,
    };
  }, [deps.ideas, deps.settings, deps.images, deps.savedImages]);

  const getIdeas = useCallback(() => latestPropsRef.current.ideas, []);
  const getSettings = useCallback(() => latestPropsRef.current.settings, []);
  const getImages = useCallback(() => latestPropsRef.current.images, []);

  // Publish busy flag so UpdateChecker (outside MashupProvider) can postpone
  // auto-install while a run is in flight.
  useEffect(() => {
    setPipelineBusy(pipelineRunning);
  }, [pipelineRunning]);

  // Hydrate resume prompt on mount.
  useEffect(() => {
    let cancelled = false;
    void loadCheckpoint().then(cp => {
      if (cancelled || !cp) return;
      setPendingResume(cp);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist config + log to localStorage.
  useEffect(() => {
    persistState({
      enabled: pipelineEnabled,
      delay: pipelineDelay,
      continuous: pipelineContinuous,
      interval: pipelineInterval,
      targetDays: pipelineTargetDays,
      log: pipelineLog
        .slice(-50)
        .map(e => ({ ...e, timestamp: e.timestamp.toISOString() })),
    });
  }, [
    pipelineEnabled,
    pipelineDelay,
    pipelineContinuous,
    pipelineInterval,
    pipelineTargetDays,
    pipelineLog,
  ]);

  const addLog = useCallback(
    (
      step: string,
      ideaId: string,
      status: 'success' | 'error',
      message: string,
    ) => {
      setPipelineLog(prev => {
        const next = [...prev, { timestamp: new Date(), step, ideaId, status, message }];
        return next.length > 50 ? next.slice(-50) : next;
      });
    },
    [],
  );

  const autoGenerateIdeas = useCallback(async (count: number): Promise<Idea[]> => {
    const s = latestPropsRef.current.settings;
    const themed = s.pipelineThemedBatches ?? false;
    const base = `${s.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${s.agentNiches?.join(', ') || 'All'}
Active Genres: ${s.agentGenres?.join(', ') || 'All'}`;

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
      const parsed = extractJsonObjectFromLLM(text);
      const theme = typeof parsed.theme === 'string' ? parsed.theme.trim() : '';
      const variations = Array.isArray(parsed.variations)
        ? (parsed.variations as unknown[])
        : [];
      const ideasOut = variations
        .filter(
          (v): v is Record<string, unknown> =>
            typeof v === 'object' &&
            v !== null &&
            typeof (v as Record<string, unknown>).concept === 'string' &&
            Boolean((v as Record<string, unknown>).concept),
        )
        .map((v, i) =>
          buildIdea(
            String(v.concept),
            theme
              ? `Theme: ${theme}${v.context ? ` — ${v.context}` : ''}`
              : typeof v.context === 'string'
                ? v.context
                : '',
            i,
          ),
        );
      if (ideasOut.length > 0) return ideasOut;
    }

    const parsed = extractJsonArrayFromLLM(text);
    return parsed
      .filter(
        (idea): idea is Record<string, unknown> =>
          typeof idea === 'object' &&
          idea !== null &&
          typeof (idea as Record<string, unknown>).concept === 'string' &&
          Boolean((idea as Record<string, unknown>).concept),
      )
      .map((idea, i) =>
        buildIdea(
          String(idea.concept),
          typeof idea.context === 'string' ? idea.context : '',
          i,
        ),
      );
  }, []);

  /**
   * Runs the outer pipeline loop end-to-end: pi-precheck, engagement fetch,
   * one-or-many cycles of idea processing, continuous-mode sleep, cleanup.
   * Caller provides processIdea (built by useIdeaProcessor).
   *
   * Live-value reads inside the loop go through functional setState peek or
   * latestPropsRef — no per-field refs are created here.
   */
  const runOuterLoop = useCallback(
    (processIdea: ProcessIdeaFn): Promise<void> =>
      withPipelineRunning(setPipelineRunning, async () => {
        // Fresh AbortControllers for this run.
        const runAbort = new AbortController();
        setRunCtrl(runAbort);

        // Snapshot settings at run start for checkpoint continuity. Captured
        // in a local so writeCheckpointBase closes over stable values — no ref.
        const snapshotSettings: PipelineCheckpoint['settings'] = {
          delay: pipelineDelay,
          continuous: pipelineContinuous,
          interval: pipelineInterval,
          targetDays: pipelineTargetDays,
        };
        const writeCheckpointBase: WriteCheckpointBase = (
          ideaId,
          concept,
          step,
          imageIds,
        ) => {
          void saveCheckpoint({
            ideaId,
            step,
            concept,
            ts: new Date().toISOString(),
            settings: snapshotSettings,
            imageIds: [...imageIds],
          });
        };

        setPendingResume(null);
        addLog(
          'pipeline-start',
          '',
          'success',
          `Pipeline started${pipelineContinuous ? ' (continuous mode)' : ''}`,
        );

        // pi.dev pre-check.
        try {
          const piRes = await fetch('/api/pi/status');
          if (piRes.ok) {
            const piStatus = (await piRes.json()) as {
              installed?: boolean;
              running?: boolean;
              lastError?: string | null;
            };
            if (!piStatus.installed) {
              addLog(
                'pi-precheck',
                '',
                'error',
                'pi.dev not installed — caption/prompt/trending steps will fall back to generic output',
              );
            } else if (!piStatus.running) {
              addLog(
                'pi-precheck',
                '',
                'error',
                `pi.dev installed but not running${piStatus.lastError ? ` — last error: ${piStatus.lastError}` : ''}`,
              );
            } else {
              addLog('pi-precheck', '', 'success', 'pi.dev reachable — proceeding');
            }
          } else {
            addLog(
              'pi-precheck',
              '',
              'error',
              `pi.dev status check failed (HTTP ${piRes.status})`,
            );
          }
        } catch (e: unknown) {
          addLog(
            'pi-precheck',
            '',
            'error',
            `pi.dev status check threw: ${getErrorMessage(e)}`,
          );
        }

        // Engagement fetch (24h cached inside smartScheduler).
        let engagement: CachedEngagement;
        try {
          engagement = await fetchInstagramEngagement(
            latestPropsRef.current.settings.apiKeys?.instagram?.accessToken,
            latestPropsRef.current.settings.apiKeys?.instagram?.igAccountId,
          );
        } catch {
          engagement = loadEngagementData();
        }
        const topHours = engagement.hours
          .sort((a: EngagementHour, b: EngagementHour) => b.weight - a.weight)
          .slice(0, 3)
          .map((h: EngagementHour) => `${h.hour}:00`);
        addLog(
          'engagement',
          '',
          'success',
          `Scheduler: ${engagement.source === 'instagram' ? 'IG insights' : 'research defaults'} — top hours: ${topHours.join(', ')}`,
        );

        const accumulatedPosts: ScheduledPost[] = [];
        let cycle = 0;

        // Functional-setState peek reads the latest committed value for
        // continuous-mode config without needing a ref.
        const peek = <T,>(setter: (updater: (prev: T) => T) => void): T => {
          let out: T;
          setter(prev => {
            out = prev;
            return prev;
          });
          return out!;
        };
        const readContinuous = () => peek<boolean>(setPipelineContinuous);
        const readInterval = () => peek<number>(setPipelineIntervalState);
        const readTargetDays = () => peek<number>(setPipelineTargetDaysState);
        const readDelay = () => peek<number>(setPipelineDelayState);

        do {
          cycle++;

          let pendingIdeas = latestPropsRef.current.ideas.filter(i => i.status === 'idea');

          if (pendingIdeas.length === 0) {
            setPipelineProgress({
              current: 0,
              total: 0,
              currentStep: 'Auto-generating ideas...',
              currentIdea: '',
            });
            try {
              const generated = await autoGenerateIdeas(3);
              for (const g of generated) {
                addIdea(g.concept, g.context || undefined);
              }
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
              pendingIdeas = generated;
            } catch (e: unknown) {
              addLog(
                'auto-generate',
                '',
                'error',
                `Failed to auto-generate ideas: ${getErrorMessage(e)}`,
              );
              if (!readContinuous()) break;
              setPipelineProgress({
                current: 0,
                total: 0,
                currentStep: `Retry in ${readInterval()} min`,
                currentIdea: '',
              });
              await wait(readInterval() * 60 * 1000);
              continue;
            }
          }

          if (pendingIdeas.length === 0) {
            addLog(
              'pipeline-cycle',
              '',
              'success',
              `Cycle ${cycle} — no ideas available, stopping`,
            );
            break;
          }

          setPipelineQueue(pendingIdeas);
          addLog(
            'pipeline-cycle',
            '',
            'success',
            `Cycle ${cycle} — processing ${pendingIdeas.length} ideas`,
          );

          for (let i = 0; i < pendingIdeas.length; i++) {
            if (runAbort.signal.aborted) {
              addLog('pipeline-stop', '', 'success', 'Pipeline stopped by user');
              break;
            }

            const idea = pendingIdeas[i];
            setPipelineQueue(pendingIdeas.slice(i));

            // Fresh skip controller per idea; stale request from the previous
            // idea can't carry over.
            const skipAbort = new AbortController();
            setSkipCtrl(skipAbort);

            // V030-002: 10-min hard timeout so a stuck step can't pin the
            // daemon. When it fires we also abort the skip signal so
            // processIdea's checkpoint guards let the idea unwind cleanly.
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                skipAbort.abort();
                reject(new IdeaTimeoutError());
              }, PER_IDEA_TIMEOUT_MS);
            });

            try {
              await Promise.race([
                processIdea(
                  idea,
                  i,
                  pendingIdeas.length,
                  engagement,
                  accumulatedPosts,
                  skipAbort.signal,
                  writeCheckpointBase,
                ),
                timeoutPromise,
              ]);
            } catch (e: unknown) {
              if (e instanceof IdeaTimeoutError) {
                addLog(
                  'pipeline-timeout',
                  idea.id,
                  'error',
                  `"${idea.concept}" exceeded ${PER_IDEA_TIMEOUT_MS / 60000}-min hard cap — continuing to next idea`,
                );
                updateIdeaStatus(idea.id, 'idea');
              } else if (
                e instanceof SkipIdeaSignal ||
                getErrorMessage(e) === '__SKIP_IDEA__'
              ) {
                addLog(
                  'pipeline-skip',
                  idea.id,
                  'success',
                  `Skipped "${idea.concept}" by user request`,
                );
                updateIdeaStatus(idea.id, 'idea');
              } else {
                addLog(
                  'pipeline-error',
                  idea.id,
                  'error',
                  `Skipping idea due to error: ${getErrorMessage(e)}`,
                );
                updateIdeaStatus(idea.id, 'idea');
              }
            } finally {
              if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
            }

            if (i < pendingIdeas.length - 1 && !runAbort.signal.aborted) {
              const d = readDelay();
              setPipelineProgress(prev =>
                prev ? { ...prev, currentStep: `Waiting ${d}s before next idea...` } : null,
              );
              await wait(d * 1000);
            }
          }

          if (runAbort.signal.aborted) break;

          if (readContinuous()) {
            const targetDays = readTargetDays();
            const intervalMin = readInterval();
            const allPosts = [
              ...(latestPropsRef.current.settings.scheduledPosts || []),
              ...accumulatedPosts,
            ];
            const futurePosts = countFutureScheduledPosts(allPosts, targetDays);
            const targetPerDay = 2;
            const targetTotal = targetDays * targetPerDay;

            if (futurePosts < targetTotal) {
              addLog(
                'daemon',
                '',
                'success',
                `Schedule has ${futurePosts}/${targetTotal} posts in next ${targetDays}d — will continue after sleep`,
              );
            } else {
              addLog(
                'daemon',
                '',
                'success',
                `Schedule target met (${futurePosts}/${targetTotal}) — sleeping ${intervalMin}m`,
              );
            }

            setPipelineProgress({
              current: 0,
              total: 0,
              currentStep: `Next cycle in ${intervalMin} min`,
              currentIdea: '',
            });
            const sleepMs = intervalMin * 60 * 1000;
            const sliceMs = 2000;
            for (
              let slept = 0;
              slept < sleepMs && !runAbort.signal.aborted;
              slept += sliceMs
            ) {
              await wait(Math.min(sliceMs, sleepMs - slept));
            }
          }
        } while (readContinuous() && !runAbort.signal.aborted);

        setPipelineQueue([]);
        setPipelineProgress(null);
        addLog(
          'pipeline-end',
          '',
          'success',
          `Pipeline finished after ${cycle} cycle${cycle === 1 ? '' : 's'}`,
        );
        // Clean exit — drop the checkpoint. Crash skips this, leaving the
        // last mid-step checkpoint intact for resume.
        void clearCheckpoint();
      }),
    [
      pipelineDelay,
      pipelineContinuous,
      pipelineInterval,
      pipelineTargetDays,
      autoGenerateIdeas,
      addLog,
      addIdea,
      updateIdeaStatus,
    ],
  );

  // ── User-facing controls ─────────────────────────────────────────────────
  const togglePipeline = useCallback(() => setPipelineEnabled(p => !p), []);
  const setPipelineDelay = useCallback((d: number) => setPipelineDelayState(d), []);
  const toggleContinuous = useCallback(() => setPipelineContinuous(p => !p), []);
  const setPipelineInterval = useCallback(
    (m: number) => setPipelineIntervalState(Math.max(30, Math.min(1440, m))),
    [],
  );
  const setPipelineTargetDays = useCallback(
    (d: number) => setPipelineTargetDaysState(Math.max(1, Math.min(30, d))),
    [],
  );
  const clearPipelineLog = useCallback(() => setPipelineLog([]), []);

  // Stop/skip use functional setState peek to abort the current controller.
  const stopPipeline = useCallback(() => {
    setRunCtrl(c => {
      c?.abort();
      return c;
    });
    setSkipCtrl(c => {
      c?.abort();
      return c;
    });
  }, []);
  const skipCurrentIdea = useCallback(() => {
    setSkipCtrl(c => {
      c?.abort();
      return c;
    });
  }, []);

  const dismissResume = useCallback(() => {
    setPendingResume(null);
    void clearCheckpoint();
  }, []);

  return {
    // State
    pipelineEnabled,
    pipelineRunning,
    pipelineQueue,
    pipelineProgress,
    pipelineLog,
    pipelineDelay,
    pipelineContinuous,
    pipelineInterval,
    pipelineTargetDays,
    pendingResume,

    // Setters exposed for composer-built helpers (e.g. acceptResume)
    setPipelineDelayState,
    setPipelineContinuous,
    setPipelineIntervalState,
    setPipelineTargetDaysState,
    setPendingResume,
    setPipelineProgress,

    // Live readers (backed by consolidated latestPropsRef)
    getIdeas,
    getSettings,
    getImages,

    // Side channels for processor
    addLog,

    // User-facing controls
    togglePipeline,
    setPipelineDelay,
    toggleContinuous,
    setPipelineInterval,
    setPipelineTargetDays,
    clearPipelineLog,
    stopPipeline,
    skipCurrentIdea,
    dismissResume,

    // Outer loop runner — composer wires processIdea through this
    runOuterLoop,

    // Debug / future use
    _runCtrl: runCtrl,
    _skipCtrl: skipCtrl,
  };
}
