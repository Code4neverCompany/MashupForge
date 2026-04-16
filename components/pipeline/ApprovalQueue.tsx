'use client';

import { useMemo, useState } from 'react';
import { Calendar, Check, X, Lightbulb, Image as ImageIcon } from 'lucide-react';
import type { GeneratedImage, Idea, ScheduledPost } from '@/types/mashup';

export function ApprovalQueue({
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
    <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 p-4 sm:p-5 space-y-4">
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
            onClick={handleApproveAllFiltered}
            disabled={filtered.length === 0}
            className="text-[11px] px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-xl border border-emerald-500/30 transition-colors disabled:opacity-40"
          >
            <Check className="w-3 h-3 inline mr-1" />
            Approve All ({filtered.length})
          </button>
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

      {/* Bulk action bar — shown only when items are selected */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
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
              <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-5 h-5 bg-zinc-900/80 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(post.id)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

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

              {idea && (
                <div className="flex items-center gap-1 text-[10px] text-amber-300/80">
                  <Lightbulb className="w-3 h-3" />
                  <span className="truncate">{idea.concept}</span>
                </div>
              )}

              <p className="text-xs text-zinc-300 line-clamp-2 min-h-[2rem]">
                {post.caption || <span className="text-zinc-600 italic">No caption</span>}
              </p>

              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{post.date} {post.time}</span>
                {modelName && <span className="text-indigo-300/80">{modelName}</span>}
              </div>

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
