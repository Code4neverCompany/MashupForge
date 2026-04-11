'use client';

import { useState } from 'react';
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
  Sparkles,
  Image as ImageIcon,
  Tag,
  Edit3,
  Calendar,
  Send,
  LayoutGrid,
  X,
  RefreshCw,
} from 'lucide-react';
import { TrendingUp } from 'lucide-react';
import { useMashup } from './MashupContext';

type PipelinePlatform = 'instagram' | 'pinterest' | 'twitter' | 'discord';

/** Small widget showing best posting times from engagement data. */
function BestTimesWidget({ settings }: { settings: any }) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/social/best-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: settings.apiKeys?.instagram?.accessToken,
          igAccountId: settings.apiKeys?.instagram?.igAccountId,
        }),
      });
      const data = await res.json();
      setInsights(data);
    } catch {
      setInsights({ success: false, source: 'error' });
    }
    setLoading(false);
  };

  return (
    <div className="pt-2 border-t border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-zinc-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Best Posting Times</span>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="text-[11px] px-2 py-1 bg-indigo-600/20 text-indigo-400 rounded-xl hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : insights ? 'Refresh' : 'Analyze'}
        </button>
      </div>

      {insights?.success && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-600">
            {insights.source === 'instagram'
              ? `Based on ${insights.postCount} Instagram posts`
              : insights.source === 'default'
                ? 'Research-backed defaults (DACH/EU)'
                : 'Research-backed + partial data'}
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {insights.bestTimes?.map((t: any, i: number) => (
              <div
                key={i}
                className="flex flex-col items-center px-2 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg"
              >
                <span className="text-xs font-mono text-white">{String(t.hour).padStart(2, '0')}:00</span>
                <div className="w-full h-1 bg-zinc-700 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${Math.round((t.weight || 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {insights.bestDays?.length > 0 && (
            <div className="flex gap-1.5 mt-1">
              {insights.bestDays.map((d: any, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-900/30 text-emerald-400 rounded">
                  {d.day} ({Math.round((d.multiplier || 0) * 100)}%)
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {insights && !insights.success && (
        <p className="text-[10px] text-zinc-600">Could not load insights. Using defaults.</p>
      )}
    </div>
  );
}

/**
 * Stage definition used to render the horizontal pipeline flow at the top
 * of the panel. The active-stage pulse is driven by the currently-running
 * step name we get back from usePipeline's PipelineProgress.
 */
const STAGES: {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Substring matched against pipelineProgress.currentStep to highlight. */
  matchStep?: string;
  /** Name of the settings toggle that gates this stage (optional). */
  toggleKey?: 'pipelineAutoTag' | 'pipelineAutoCaption' | 'pipelineAutoSchedule' | 'pipelineAutoPost';
}[] = [
  { key: 'idea', label: 'Idea', icon: Lightbulb, matchStep: 'Updating status' },
  { key: 'trending', label: 'Trending', icon: TrendingUp, matchStep: 'Researching trending' },
  { key: 'prompt', label: 'Prompt', icon: Sparkles, matchStep: 'Expanding idea' },
  { key: 'image', label: 'Image', icon: ImageIcon, matchStep: 'Generating' },
  { key: 'tag', label: 'Tag', icon: Tag, matchStep: 'Tagging', toggleKey: 'pipelineAutoTag' },
  { key: 'caption', label: 'Caption', icon: Edit3, matchStep: 'Captioning', toggleKey: 'pipelineAutoCaption' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, matchStep: 'Scheduling', toggleKey: 'pipelineAutoSchedule' },
  { key: 'post', label: 'Post', icon: Send, matchStep: 'Posting', toggleKey: 'pipelineAutoPost' },
];

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
    ideas,
    settings,
    updateSettings,
    images,
    approveScheduledPost,
    rejectScheduledPost,
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

  // Read toggles with their defaults (tag/caption/schedule default ON,
  // post default OFF to match usePipeline's behaviour).
  const autoTag = settings.pipelineAutoTag ?? true;
  const autoCaption = settings.pipelineAutoCaption ?? true;
  const autoSchedule = settings.pipelineAutoSchedule ?? true;
  const autoPost = settings.pipelineAutoPost ?? false;
  const platforms: PipelinePlatform[] = (settings.pipelinePlatforms as PipelinePlatform[]) || [];

  /** Which platforms the user has configured — we only surface these. */
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

  /** Which stage is currently active — used for the pulse highlight. */
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
          <h2 className="text-xl font-semibold text-white">Ideas-to-Content Pipeline</h2>
          <p className="text-sm text-zinc-400">
            Automatically process ideas into images, captions, and scheduled posts
          </p>
        </div>
      </div>

      {/* Stage flow visualization */}
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800/60 p-5 overflow-x-auto">
      <div className="glass-card p-6 h-full flex flex-col">
      <h2 className="text-lg font-semibold text-white mb-6">Automation Pipeline</h2>
      <div className="space-y-4">
        {STAGES.map((stage, idx) => {
          const isActive = activeStageKey === stage.key;
          const isCompleted = idx < STAGES.findIndex(s => s.key === activeStageKey); // Simplified logic
          const Icon = stage.icon;
          return (
            <motion.div 
              key={stage.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`relative p-4 rounded-xl border transition-all ${
                isActive ? 'bg-emerald-600/10 border-emerald-500/30' : 
                isCompleted ? 'bg-zinc-800/40 border-zinc-700/30' : 'bg-zinc-900/20 border-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                {isActive ? (
                  <div className="relative w-3 h-3">
                    <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping" />
                    <div className="relative bg-emerald-500 w-3 h-3 rounded-full" />
                  </div>
                ) : (
                  <div className={`w-3 h-3 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                )}
                <span className={`text-sm font-medium ${isActive ? 'text-emerald-400' : isCompleted ? 'text-white' : 'text-zinc-500'}`}>
                  {stage.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
      </div>

      {/* Controls */}
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Pipeline</span>
            <button
              onClick={togglePipeline}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                pipelineEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
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
                pipelineEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
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
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-900/80 disabled:text-zinc-600 text-white text-sm font-medium rounded-xl transition-colors"
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
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/60">
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
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/60">
          <RefreshCw className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Continuous mode</span>
          <button
            onClick={toggleContinuous}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pipelineContinuous ? 'bg-indigo-600' : 'bg-zinc-700'
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
        <div className="pt-2 border-t border-zinc-800/60 space-y-2">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Stages</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'pipelineAutoTag' as const, label: 'Auto-tag images', value: autoTag },
              { key: 'pipelineAutoCaption' as const, label: 'Auto-caption', value: autoCaption },
              { key: 'pipelineAutoSchedule' as const, label: 'Auto-schedule posts', value: autoSchedule },
              { key: 'pipelineAutoPost' as const, label: 'Auto-post to platforms', value: autoPost },
            ].map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors"
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

        {/* Platform picker */}
        {autoPost && (
          <div className="pt-2 border-t border-zinc-800/60 space-y-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Auto-post to</p>
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

        {/* Stats */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-zinc-800/60">
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

      {/* Progress */}
      {pipelineProgress && (
        <div className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-indigo-500/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              Processing idea {pipelineProgress.current} of {pipelineProgress.total}
            </span>
            <span className="text-xs text-zinc-400">
              {Math.round((pipelineProgress.current / pipelineProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${(pipelineProgress.current / pipelineProgress.total) * 100}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
            <span className="text-xs text-zinc-400">{pipelineProgress.currentStep}</span>
          </div>
          <p className="text-sm text-zinc-300 truncate">{pipelineProgress.currentIdea}</p>
        </div>
      )}

      {/* Queue */}
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800/60 overflow-hidden">
        <button
          onClick={() => setQueueExpanded(!queueExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
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
          <div className="border-t border-zinc-800/60 max-h-60 overflow-y-auto">
            {(pipelineRunning ? pipelineQueue : pendingIdeas).length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 text-center">No ideas in queue</p>
            ) : (
              (pipelineRunning ? pipelineQueue : pendingIdeas).map((idea, idx) => (
                <div
                  key={idea.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0"
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
      <div className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800/60 overflow-hidden">
        <div
          onClick={() => setLogExpanded(!logExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
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
          <div className="border-t border-zinc-800/60 max-h-80 overflow-y-auto">
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
                      <span className="text-xs text-zinc-600">
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

      {/* Pending Approval */}
      {(settings.scheduledPosts || []).filter((p) => p.status === 'pending_approval').length > 0 && (
        <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-300">
                Awaiting Approval ({(settings.scheduledPosts || []).filter((p) => p.status === 'pending_approval').length})
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {(settings.scheduledPosts || [])
              .filter((p) => p.status === 'pending_approval')
              .map((post) => {
                const img = images.find((i) => i.id === post.imageId);
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 bg-zinc-900/80 rounded-xl p-3 border border-zinc-800/60"
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                      {img ? (
                        <img
                          src={img.url || (img.base64 ? `data:image/png;base64,${img.base64}` : '')}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    {/* Caption + schedule */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate">{post.caption || 'No caption'}</p>
                      <p className="text-xs text-zinc-500">
                        {post.date} at {post.time} &rarr; {post.platforms?.join(', ') || 'No platforms'}
                      </p>
                    </div>
                    {/* Actions */}
                    <button
                      onClick={() => approveScheduledPost(post.id)}
                      className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 rounded-lg text-emerald-400 transition-colors"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => rejectScheduledPost(post.id)}
                      className="p-2 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-red-400 transition-colors"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
