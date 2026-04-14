'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  Lightbulb,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useMashup } from './MashupContext';
import { BestTimesWidget } from './pipeline/BestTimesWidget';
import { ActiveIdeaCard } from './pipeline/ActiveIdeaCard';
import { ApprovalQueue } from './pipeline/ApprovalQueue';
import { STAGES } from './pipeline/stages';

type PipelinePlatform = 'instagram' | 'pinterest' | 'twitter' | 'discord';

export function PipelinePanel() {
  const {
    pipelineEnabled,
    pipelineRunning,
    pipelineQueue,
    pipelineProgress,
    pipelineLog,
    clearPipelineLog,
    pipelineDelay,
    setPipelineDelay,
    togglePipeline,
    startPipeline,
    stopPipeline,
    skipCurrentIdea,
    ideas,
    settings,
    updateSettings,
    images,
    approveScheduledPost,
    rejectScheduledPost,
    bulkApproveScheduledPosts,
    bulkRejectScheduledPosts,
    pipelineContinuous,
    toggleContinuous,
    pipelineInterval,
    setPipelineInterval,
    pipelineTargetDays,
    setPipelineTargetDays,
  } = useMashup();

  const [logExpanded, setLogExpanded] = useState(true);
  const [queueExpanded, setQueueExpanded] = useState(true);

  const pendingIdeas = ideas.filter((i) => i.status === 'idea');
  const reversedLog = [...pipelineLog].reverse();

  const autoTag = settings.pipelineAutoTag ?? true;
  const autoCaption = settings.pipelineAutoCaption ?? true;
  const autoSchedule = settings.pipelineAutoSchedule ?? true;
  const autoPost = settings.pipelineAutoPost ?? false;
  const platforms: PipelinePlatform[] = (settings.pipelinePlatforms as PipelinePlatform[]) || [];

  const hasCreds = (p: PipelinePlatform): boolean => {
    switch (p) {
      case 'instagram':
        return !!(settings.apiKeys.instagram?.accessToken && settings.apiKeys.instagram?.igAccountId);
      case 'pinterest':
        return !!settings.apiKeys.pinterest?.accessToken;
      case 'twitter':
        return !!(
          settings.apiKeys.twitter?.appKey &&
          settings.apiKeys.twitter?.appSecret &&
          settings.apiKeys.twitter?.accessToken &&
          settings.apiKeys.twitter?.accessSecret
        );
      case 'discord':
        return !!settings.apiKeys.discordWebhook;
    }
  };
  const availablePlatforms: PipelinePlatform[] = (['instagram', 'pinterest', 'twitter', 'discord'] as PipelinePlatform[]).filter(hasCreds);

  const togglePlatform = (p: PipelinePlatform) => {
    const next = platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p];
    updateSettings({ pipelinePlatforms: next });
  };

  const dailyCaps = settings.pipelineDailyCaps || {};
  const setDailyCap = (p: PipelinePlatform, value: number | null) => {
    const next: typeof dailyCaps = { ...dailyCaps };
    if (value == null || Number.isNaN(value)) {
      delete next[p];
    } else {
      next[p] = Math.max(1, Math.min(99, value));
    }
    updateSettings({ pipelineDailyCaps: next });
  };

  const toggleStage = (key: 'pipelineAutoTag' | 'pipelineAutoCaption' | 'pipelineAutoSchedule' | 'pipelineAutoPost') => {
    const current = settings[key];
    const defaults: Record<string, boolean> = {
      pipelineAutoTag: true,
      pipelineAutoCaption: true,
      pipelineAutoSchedule: true,
      pipelineAutoPost: false,
    };
    const effective = current ?? defaults[key];
    updateSettings({ [key]: !effective } as any);
  };

  const activeStageKey = (() => {
    if (!pipelineProgress || !pipelineRunning) return null;
    const step = pipelineProgress.currentStep || '';
    for (const stage of STAGES) {
      if (stage.matchStep && step.toLowerCase().includes(stage.matchStep.toLowerCase())) {
        return stage.key;
      }
    }
    return null;
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Zap className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="type-title">Ideas-to-Content Pipeline</h2>
          <p className="text-sm text-zinc-400">
            Automatically process ideas into images, captions, and scheduled posts
          </p>
        </div>
      </div>

      {/* Stage flow visualization */}
      <div className="card p-5 overflow-x-auto">
        <div className="space-y-4">
          {STAGES.map((stage, idx) => {
            const isActive = activeStageKey === stage.key;
            const isCompleted = idx < STAGES.findIndex(s => s.key === activeStageKey);
            return (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`relative p-4 rounded-xl border transition-all duration-300 ${
                  isActive ? 'bg-[#00e6ff]/8 border-[#00e6ff]/30 shadow-[0_0_16px_rgba(0,230,255,0.08)]' :
                  isCompleted ? 'bg-zinc-800/40 border-[#c5a062]/20' : 'bg-zinc-900/20 border-zinc-800/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isActive ? (
                    <div className="relative w-3 h-3">
                      <div className={`absolute inset-0 ${stage.dotColor} rounded-full animate-ping`} />
                      <div className={`relative ${stage.dotColor} w-3 h-3 rounded-full`} />
                    </div>
                  ) : (
                    <div className={`w-3 h-3 rounded-full ${isCompleted ? stage.dotColor : 'bg-zinc-700'}`} />
                  )}
                  <span className={`text-sm font-medium ${isActive ? 'text-[#00e6ff]' : isCompleted ? 'text-white' : 'text-zinc-500'}`}>
                    {stage.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Pipeline</span>
            <button
              onClick={togglePipeline}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                pipelineEnabled ? 'bg-[#00e6ff]' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  pipelineEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                pipelineEnabled ? 'bg-[#00e6ff]/15 text-[#00e6ff]' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {pipelineEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!pipelineRunning ? (
              <button
                onClick={startPipeline}
                disabled={!pipelineEnabled}
                className="btn-primary disabled:bg-zinc-900/80 disabled:text-zinc-600 disabled:shadow-none"
              >
                <Play className="w-4 h-4" />
                Start Pipeline
              </button>
            ) : (
              <button
                onClick={stopPipeline}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Delay config */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#c5a062]/15">
          <Clock className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Delay between ideas:</span>
          <input
            type="number"
            min={5}
            max={300}
            value={pipelineDelay}
            onChange={(e) =>
              setPipelineDelay(Math.max(5, Math.min(300, Number(e.target.value))))
            }
            className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white text-center"
          />
          <span className="text-sm text-zinc-500">seconds</span>
        </div>

        {/* Continuous mode */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#c5a062]/15">
          <RefreshCw className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Continuous mode</span>
          <button
            onClick={toggleContinuous}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pipelineContinuous ? 'bg-[#00e6ff]' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                pipelineContinuous ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {pipelineContinuous && (
            <>
              <span className="text-sm text-zinc-500">Every</span>
              <input
                type="number"
                min={30}
                max={1440}
                value={pipelineInterval}
                onChange={(e) => setPipelineInterval(Math.max(30, Math.min(1440, Number(e.target.value))))}
                className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white text-center"
              />
              <span className="text-sm text-zinc-500">min, target</span>
              <input
                type="number"
                min={1}
                max={30}
                value={pipelineTargetDays}
                onChange={(e) => setPipelineTargetDays(Math.max(1, Math.min(30, Number(e.target.value))))}
                className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white text-center"
              />
              <span className="text-sm text-zinc-500">days ahead</span>
            </>
          )}
        </div>

        {/* Best posting times */}
        <BestTimesWidget settings={settings} />

        {/* Stage toggles */}
        <div className="pt-2 border-t border-[#c5a062]/15 space-y-2">
          <p className="label-overline">Stages</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'pipelineAutoTag' as const, label: 'Auto-tag images', value: autoTag },
              { key: 'pipelineAutoCaption' as const, label: 'Auto-caption', value: autoCaption },
              { key: 'pipelineAutoSchedule' as const, label: 'Auto-schedule posts', value: autoSchedule },
              { key: 'pipelineAutoPost' as const, label: 'Auto-post to platforms', value: autoPost },
            ].map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 border border-[#c5a062]/15 rounded-xl cursor-pointer hover:border-[#c5a062]/35 hover:bg-zinc-800/60 transition-all duration-200"
              >
                <input
                  type="checkbox"
                  checked={opt.value}
                  onChange={() => toggleStage(opt.key)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-sm text-zinc-300">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Carousel mode — collapses all images from one idea into a single carousel post */}
        <div className="pt-2 border-t border-[#c5a062]/15 space-y-2">
          <label className="flex items-start gap-2 px-3 py-2 bg-zinc-800/40 border border-[#c5a062]/15 rounded-xl cursor-pointer hover:border-[#c5a062]/35 hover:bg-zinc-800/60 transition-all duration-200">
            <input
              type="checkbox"
              checked={settings.pipelineCarouselMode ?? false}
              onChange={() =>
                updateSettings({ pipelineCarouselMode: !(settings.pipelineCarouselMode ?? false) })
              }
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <div className="flex-1">
              <p className="text-sm text-zinc-200">Carousel mode</p>
              <p className="text-[11px] text-zinc-500 leading-snug">
                Group all ready images from an idea into one carousel post (shared caption + slot).
                Always schedules first — auto-post fires when the slot hits, never immediately after generation.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2 px-3 py-2 bg-zinc-800/40 border border-[#c5a062]/15 rounded-xl cursor-pointer hover:border-[#c5a062]/35 hover:bg-zinc-800/60 transition-all duration-200">
            <input
              type="checkbox"
              checked={settings.pipelineThemedBatches ?? false}
              onChange={() =>
                updateSettings({ pipelineThemedBatches: !(settings.pipelineThemedBatches ?? false) })
              }
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <div className="flex-1">
              <p className="text-sm text-zinc-200">Themed idea batches</p>
              <p className="text-[11px] text-zinc-500 leading-snug">
                Auto-generate ideas as one shared theme + N variations instead of random unrelated ideas.
              </p>
            </div>
          </label>
        </div>

        {/* Platform picker */}
        {autoPost && (
          <div className="pt-2 border-t border-[#c5a062]/15 space-y-2">
            <p className="label-overline">Auto-post to</p>
            {availablePlatforms.length === 0 ? (
              <p className="text-[11px] text-amber-400">
                No platform credentials configured. Add Instagram or Pinterest keys in Settings.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {availablePlatforms.map((p) => {
                  const checked = platforms.includes(p);
                  const colour =
                    p === 'instagram'
                      ? 'bg-pink-600'
                      : p === 'pinterest'
                        ? 'bg-red-600'
                        : p === 'twitter'
                          ? 'bg-sky-600'
                          : 'bg-indigo-600';
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                        checked
                          ? `${colour} text-white border-transparent`
                          : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 inline mr-1" />}
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Per-platform daily caps */}
        <div className="pt-2 border-t border-[#c5a062]/15 space-y-2">
          <div className="flex items-center justify-between">
            <p className="label-overline">Daily Caps (per platform)</p>
            <span className="text-[10px] text-zinc-500">empty = no cap</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['instagram', 'pinterest', 'twitter', 'discord'] as PipelinePlatform[]).map((p) => {
              const value = dailyCaps[p];
              const colour =
                p === 'instagram'
                  ? 'text-pink-300 border-pink-500/30'
                  : p === 'pinterest'
                    ? 'text-red-300 border-red-500/30'
                    : p === 'twitter'
                      ? 'text-sky-300 border-sky-500/30'
                      : 'text-indigo-300 border-indigo-500/30';
              return (
                <label
                  key={p}
                  className={`flex items-center gap-2 px-3 py-2 bg-zinc-800/40 border rounded-xl ${colour}`}
                >
                  <span className="text-[11px] capitalize flex-1">{p}</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={value ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDailyCap(p, raw === '' ? null : Number(raw));
                    }}
                    placeholder="∞"
                    className="w-12 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-white text-center"
                  />
                  <span className="text-[10px] text-zinc-500">/day</span>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-500">
            Scheduler skips any day where a target platform is already at its cap.
            Counts <span className="text-zinc-400">scheduled</span> + <span className="text-zinc-400">pending approval</span> only — posted entries don&apos;t consume a cap.
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-[#c5a062]/15">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-400">
              Pending ideas:{' '}
              <span className="text-white font-medium">{pendingIdeas.length}</span>
            </span>
          </div>
          {pipelineRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-sm text-indigo-400 font-medium">Running</span>
            </div>
          )}
        </div>
      </div>

      {/* In-flight idea card */}
      {pipelineProgress && (
        <ActiveIdeaCard
          progress={pipelineProgress}
          ideas={ideas}
          images={images}
          activeStageKey={activeStageKey}
          onSkip={skipCurrentIdea}
        />
      )}

      {/* Queue */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setQueueExpanded(!queueExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors duration-200"
        >
          <span className="text-sm font-medium text-zinc-300">
            Queue ({pipelineRunning ? pipelineQueue.length : pendingIdeas.length})
          </span>
          {queueExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>
        {queueExpanded && (
          <div className="border-t border-[#c5a062]/15 max-h-60 overflow-y-auto hide-scrollbar">
            {(pipelineRunning ? pipelineQueue : pendingIdeas).length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 text-center">No ideas in queue</p>
            ) : (
              (pipelineRunning ? pipelineQueue : pendingIdeas).map((idea, idx) => (
                <div
                  key={idea.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[#c5a062]/10 last:border-0"
                >
                  <span className="text-xs text-zinc-600 font-mono w-6">{idx + 1}</span>
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                  <span className="text-sm text-zinc-300 truncate">{idea.concept}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Log */}
      <div className="card overflow-hidden">
        <div
          onClick={() => setLogExpanded(!logExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors duration-200 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">
              Pipeline Log ({pipelineLog.length})
            </span>
            {pipelineLog.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); clearPipelineLog(); }}
                className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-red-600/20 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {logExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
        {logExpanded && (
          <div className="border-t border-[#c5a062]/15 max-h-80 overflow-y-auto hide-scrollbar">
            {reversedLog.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 text-center">No log entries yet</p>
            ) : (
              reversedLog.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0"
                >
                  {entry.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">{entry.step}</span>
                      <span className="text-xs text-zinc-500">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 truncate">{entry.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Approval Queue (bulk) */}
      <ApprovalQueue
        posts={(settings.scheduledPosts || []).filter((p) => p.status === 'pending_approval')}
        images={images}
        ideas={ideas}
        onApprove={approveScheduledPost}
        onReject={rejectScheduledPost}
        onBulkApprove={bulkApproveScheduledPosts}
        onBulkReject={bulkRejectScheduledPosts}
      />
    </div>
  );
}
