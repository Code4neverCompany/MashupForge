'use client';

import { useMemo, useState } from 'react';
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
  Sparkles,
  Image as ImageIcon,
  Tag,
  Edit3,
  Calendar,
  Send,
  X,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import { TrendingUp } from 'lucide-react';
import { useMashup } from './MashupContext';
import type { GeneratedImage, Idea, PipelineProgress, ScheduledPost } from '@/types/mashup';

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
    <div className="pt-2 border-t border-[#c5a062]/15">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#c5a062]/60" />
          <span className="label-overline">Best Posting Times</span>
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
          <p className="text-[10px] text-zinc-400">
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
                className="flex flex-col items-center px-2 py-1.5 bg-zinc-800/50 border border-[#c5a062]/15 rounded-lg"
              >
                <span className="text-xs font-mono text-white">{String(t.hour).padStart(2, '0')}:00</span>
                <div className="w-full h-1 bg-zinc-700/80 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00b8cc] to-[#00e6ff]"
                    style={{ width: `${Math.round((t.weight || 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {insights.bestDays?.length > 0 && (
            <div className="flex gap-1.5 mt-1">
              {insights.bestDays.map((d: any, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
                  {d.day} ({Math.round((d.multiplier || 0) * 100)}%)
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {insights && !insights.success && (
        <p className="text-[10px] text-zinc-400">Could not load insights. Using defaults.</p>
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

/**
 * In-flight idea card. Renders while the pipeline is running:
 *  - The concept text + step + per-idea progress bar
 *  - Stage chips driven by the existing STAGES list
 *  - Thumbnails of every image currently being generated for this idea
 *    (the active multi-model `images` set from context)
 *  - A "Skip Idea" button that bails out of the in-flight idea without
 *    stopping the pipeline (handy when one model spins for ages)
 */
function ActiveIdeaCard({
  progress,
  ideas,
  images,
  activeStageKey,
  onSkip,
}: {
  progress: PipelineProgress;
  ideas: Idea[];
  images: GeneratedImage[];
  activeStageKey: string | null;
  onSkip: () => void;
}) {
  // Look up the in-flight idea record for richer rendering. Falls back
  // to a stub built from progress when currentIdeaId isn't set (e.g.
  // during the "Auto-generating ideas" phase between cycles).
  const idea: Pick<Idea, 'concept' | 'context'> | undefined = progress.currentIdeaId
    ? ideas.find((i) => i.id === progress.currentIdeaId)
    : undefined;
  const concept = idea?.concept || progress.currentIdea || '—';
  const context = idea?.context;

  // Active multi-model gen set lives in `images` (cleared/repopulated
  // per generateComparison call). Restrict to ones with a model tag so
  // we don't accidentally pull in legacy single-model placeholders.
  const liveImages = images.filter((img) => img.modelInfo?.modelId);
  const total = progress.total || 1;
  const pct = Math.round((progress.current / total) * 100);

  return (
    <div className="card p-5 space-y-4 border-[#00e6ff]/25 shadow-[0_0_24px_rgba(0,230,255,0.06)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-3.5 h-3.5 text-[#00e6ff] animate-spin shrink-0" />
            <span className="text-sm font-medium text-white">
              Processing idea {progress.current} of {progress.total}
            </span>
            <span className="text-xs text-zinc-500">· {pct}%</span>
          </div>
          <p className="text-sm text-[#00e6ff] truncate" title={concept}>{concept}</p>
          {context && (
            <p className="text-[11px] text-zinc-500 truncate" title={context}>{context}</p>
          )}
        </div>
        <button
          onClick={onSkip}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 text-amber-300 text-xs rounded-xl transition-colors"
          title="Skip this idea — keep the pipeline running"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip Idea
        </button>
      </div>

      {/* Per-idea progress bar */}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Current step */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Current step</span>
        <span className="text-xs text-zinc-300">{progress.currentStep}</span>
      </div>

      {/* Stage chips */}
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((stage) => {
          const isActive = activeStageKey === stage.key;
          const isCompleted =
            activeStageKey != null &&
            STAGES.findIndex((s) => s.key === stage.key) <
              STAGES.findIndex((s) => s.key === activeStageKey);
          const Icon = stage.icon;
          return (
            <span
              key={stage.key}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-colors ${
                isActive
                  ? 'bg-[#00e6ff]/15 text-[#00e6ff] border-[#00e6ff]/40'
                  : isCompleted
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-700'
              }`}
            >
              <Icon className="w-2.5 h-2.5" />
              {stage.label}
            </span>
          );
        })}
      </div>

      {/* Live thumbnails */}
      {liveImages.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#c5a062]/15">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              Generating ({liveImages.length})
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {liveImages.map((img) => {
              const isReady = img.status === 'ready' && (img.url || img.base64);
              const isError = img.status === 'error';
              return (
                <div
                  key={img.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700"
                  title={img.modelInfo?.modelName || img.modelInfo?.modelId}
                >
                  {isReady ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.url || `data:image/png;base64,${img.base64}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      {isError ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      )}
                      <span className="text-[9px] text-zinc-500 px-1 text-center line-clamp-1">
                        {img.modelInfo?.modelName || 'model'}
                      </span>
                    </div>
                  )}
                  {/* Model name badge */}
                  {isReady && (
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm">
                      <p className="text-[9px] text-white truncate">
                        {img.modelInfo?.modelName}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bulk approval queue for pipeline-produced posts. Renders every
 * `pending_approval` post as a card with thumbnail, source idea,
 * model, scheduled slot, and platforms. Supports multi-select with
 * filter pills (idea/topic, model, platform) plus bulk approve/reject.
 */
function ApprovalQueue({
  posts,
  images,
  ideas,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
}: {
  posts: ScheduledPost[];
  images: GeneratedImage[];
  ideas: Idea[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ideaFilter, setIdeaFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  const imageById = useMemo(() => {
    const m = new Map<string, GeneratedImage>();
    for (const img of images) m.set(img.id, img);
    return m;
  }, [images]);

  const ideaById = useMemo(() => {
    const m = new Map<string, Idea>();
    for (const i of ideas) m.set(i.id, i);
    return m;
  }, [ideas]);

  // Build filter option lists from the current pending posts.
  const { ideaOptions, modelOptions, platformOptions } = useMemo(() => {
    const ideaSet = new Set<string>();
    const modelSet = new Set<string>();
    const platSet = new Set<string>();
    for (const p of posts) {
      if (p.sourceIdeaId) ideaSet.add(p.sourceIdeaId);
      const img = imageById.get(p.imageId);
      const mid = img?.modelInfo?.modelId;
      if (mid) modelSet.add(mid);
      for (const pl of p.platforms || []) platSet.add(pl);
    }
    return {
      ideaOptions: Array.from(ideaSet),
      modelOptions: Array.from(modelSet),
      platformOptions: Array.from(platSet),
    };
  }, [posts, imageById]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (ideaFilter && p.sourceIdeaId !== ideaFilter) return false;
      if (modelFilter) {
        const img = imageById.get(p.imageId);
        if (img?.modelInfo?.modelId !== modelFilter) return false;
      }
      if (platformFilter && !(p.platforms || []).includes(platformFilter)) return false;
      return true;
    });
  }, [posts, ideaFilter, modelFilter, platformFilter, imageById]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(filtered.map((p) => p.id)));
  };
  const clearSelection = () => setSelected(new Set());

  const selectedCount = selected.size;
  const visibleSelectedIds = filtered.filter((p) => selected.has(p.id)).map((p) => p.id);

  const handleBulkApprove = () => {
    if (selectedCount === 0) return;
    onBulkApprove(visibleSelectedIds);
    clearSelection();
  };

  const handleBulkReject = () => {
    if (selectedCount === 0) return;
    onBulkReject(visibleSelectedIds);
    clearSelection();
  };

  const handleApproveAllFiltered = () => {
    if (filtered.length === 0) return;
    onBulkApprove(filtered.map((p) => p.id));
    clearSelection();
  };

  const truncateConcept = (s: string | undefined, n = 28) =>
    s ? (s.length > n ? `${s.slice(0, n)}…` : s) : '';

  if (posts.length === 0) return null;

  return (
    <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-300">
            Approval Queue ({posts.length})
            {filtered.length !== posts.length && (
              <span className="text-amber-400/70"> · {filtered.length} shown</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllVisible}
            className="text-[11px] px-2 py-1 bg-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-700 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="text-[11px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filter pills */}
      {(ideaOptions.length > 0 || modelOptions.length > 0 || platformOptions.length > 0) && (
        <div className="space-y-2">
          {ideaOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 mr-1">Topic</span>
              <button
                onClick={() => setIdeaFilter(null)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  ideaFilter === null
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                All
              </button>
              {ideaOptions.map((id) => (
                <button
                  key={id}
                  onClick={() => setIdeaFilter(id)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    ideaFilter === id
                      ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                  title={ideaById.get(id)?.concept || id}
                >
                  {truncateConcept(ideaById.get(id)?.concept) || id.slice(0, 8)}
                </button>
              ))}
            </div>
          )}

          {modelOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 mr-1">Model</span>
              <button
                onClick={() => setModelFilter(null)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  modelFilter === null
                    ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                All
              </button>
              {modelOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => setModelFilter(m)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    modelFilter === m
                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {platformOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 mr-1">Platform</span>
              <button
                onClick={() => setPlatformFilter(null)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  platformFilter === null
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                All
              </button>
              {platformOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    platformFilter === p
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {(selectedCount > 0 || filtered.length !== posts.length) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
          {selectedCount > 0 && (
            <>
              <span className="text-xs text-amber-200">{selectedCount} selected</span>
              <button
                onClick={handleBulkApprove}
                className="text-xs px-3 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 rounded-xl border border-emerald-500/40 transition-colors"
              >
                <Check className="w-3 h-3 inline mr-1" />
                Approve Selected
              </button>
              <button
                onClick={handleBulkReject}
                className="text-xs px-3 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-200 rounded-xl border border-red-500/40 transition-colors"
              >
                <X className="w-3 h-3 inline mr-1" />
                Reject Selected
              </button>
            </>
          )}
          {filtered.length !== posts.length && filtered.length > 0 && (
            <button
              onClick={handleApproveAllFiltered}
              className="text-xs px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-200 rounded-xl border border-amber-500/40 transition-colors"
            >
              Approve All {filtered.length} Matching
            </button>
          )}
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((post) => {
          const img = imageById.get(post.imageId);
          const idea = post.sourceIdeaId ? ideaById.get(post.sourceIdeaId) : undefined;
          const isSelected = selected.has(post.id);
          const modelName = img?.modelInfo?.modelName || img?.modelInfo?.modelId;
          return (
            <div
              key={post.id}
              className={`relative bg-zinc-900/60 rounded-xl border p-3 space-y-2 transition-all ${
                isSelected
                  ? 'border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                  : 'border-[#c5a062]/20 hover:border-[#c5a062]/40'
              }`}
            >
              {/* Select checkbox */}
              <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-5 h-5 bg-zinc-900/80 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(post.id)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

              {/* Thumbnail */}
              <div className="w-full aspect-video rounded-lg overflow-hidden bg-zinc-800">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.url || (img.base64 ? `data:image/png;base64,${img.base64}` : '')}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-zinc-600" />
                  </div>
                )}
              </div>

              {/* Source idea */}
              {idea && (
                <div className="flex items-center gap-1 text-[10px] text-amber-300/80">
                  <Lightbulb className="w-3 h-3" />
                  <span className="truncate">{idea.concept}</span>
                </div>
              )}

              {/* Caption */}
              <p className="text-xs text-zinc-300 line-clamp-2 min-h-[2rem]">
                {post.caption || <span className="text-zinc-600 italic">No caption</span>}
              </p>

              {/* Schedule + model */}
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{post.date} {post.time}</span>
                {modelName && <span className="text-indigo-300/80">{modelName}</span>}
              </div>

              {/* Platforms */}
              {post.platforms && post.platforms.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.platforms.map((pl) => (
                    <span
                      key={pl}
                      className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded"
                    >
                      {pl}
                    </span>
                  ))}
                </div>
              )}

              {/* Per-card actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onApprove(post.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 rounded-lg text-emerald-400 text-xs transition-colors"
                  title="Approve"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  onClick={() => onReject(post.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-red-400 text-xs transition-colors"
                  title="Reject"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  /** Per-platform daily caps editor — empty input = no cap for that platform. */
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
                      <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping" />
                      <div className="relative bg-emerald-500 w-3 h-3 rounded-full" />
                    </div>
                  ) : (
                    <div className={`w-3 h-3 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
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
