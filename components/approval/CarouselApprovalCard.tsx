// V040-DES-003: top-level carousel card for the approval queue.
// Composes thumbnail strip + status pill + review panel + degrade
// notice. Handlers are the existing per-post approve/reject callbacks;
// "approve carousel" loops over images to call them N times.
//
// Mutation of CarouselGroup.imageIds and schema work (per-image status
// persistence, true degrade transition) are flagged complex in the
// V040-DES-001 spec and remain PROP-gated. This component shows the
// visual + interaction layer cleanly on top of whatever state the
// parent feeds it.

import { useMemo, useState } from 'react';
import { Check, X, ChevronDown, Layers, Lightbulb } from 'lucide-react';
import type { GeneratedImage, Idea, ScheduledPost } from '@/types/mashup';
import { CarouselStatusPill, type CarouselImageState } from './CarouselStatusPill';
import { CarouselThumbnailStrip } from './CarouselThumbnailStrip';
import { CarouselReviewPanel } from './CarouselReviewPanel';
import { DegradeNotice } from './DegradeNotice';
import { canRejectMoreInCarousel } from '@/lib/carousel-degrade-guard';

export function CarouselApprovalCard({
  groupId,
  posts,
  imagesById,
  idea,
  selected,
  onToggleSelect,
  onApprovePost,
  onRejectPost,
}: {
  groupId: string;
  posts: ScheduledPost[];
  imagesById: Map<string, GeneratedImage>;
  idea?: Idea;
  selected: boolean;
  onToggleSelect: () => void;
  onApprovePost: (postId: string) => void;
  onRejectPost: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Local optimistic state so the user sees per-image feedback before
  // the parent commits (or before we add persistence). Maps image id →
  // local state; absent = 'pending'.
  const [localStatus, setLocalStatus] = useState<Record<string, CarouselImageState>>({});

  const images = useMemo(
    () => posts.map((p) => imagesById.get(p.imageId)).filter((i): i is GeneratedImage => !!i),
    [posts, imagesById],
  );

  // Map imageId → the owning post (so we can fire approve/reject by post.id)
  const postByImage = useMemo(() => {
    const m = new Map<string, ScheduledPost>();
    for (const p of posts) m.set(p.imageId, p);
    return m;
  }, [posts]);

  const statuses: Record<string, CarouselImageState> = useMemo(() => {
    const out: Record<string, CarouselImageState> = {};
    for (const img of images) out[img.id] = localStatus[img.id] ?? 'pending';
    return out;
  }, [images, localStatus]);

  const counts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    for (const img of images) {
      const st = statuses[img.id];
      if (st === 'approved') approved++;
      else if (st === 'rejected') rejected++;
      else pending++;
    }
    return { pending, approved, rejected, total: images.length };
  }, [images, statuses]);

  // Per-image reject is gated when the carousel is at the 2-image floor,
  // so the user cannot accidentally degrade it to a single-image post the
  // auto-poster would refuse to fan out. The whole-carousel reject is
  // intentionally NOT gated — that's an explicit kill action.
  const nonRejectedCount = counts.pending + counts.approved;
  const rejectGuarded = !canRejectMoreInCarousel(nonRejectedCount);

  const approveImage = (imageId: string) => {
    const post = postByImage.get(imageId);
    if (!post) return;
    setLocalStatus((prev) => ({ ...prev, [imageId]: 'approved' }));
    onApprovePost(post.id);
  };

  const rejectImage = (imageId: string) => {
    if (rejectGuarded) return;
    const post = postByImage.get(imageId);
    if (!post) return;
    setLocalStatus((prev) => ({ ...prev, [imageId]: 'rejected' }));
    onRejectPost(post.id);
  };

  const approveRemaining = () => {
    for (const img of images) {
      if ((statuses[img.id] ?? 'pending') === 'pending') approveImage(img.id);
    }
  };

  const approveCarousel = () => {
    approveRemaining();
  };

  const rejectCarousel = () => {
    // Whole-carousel reject bypasses the per-image guard — the user is
    // explicitly killing the group, not accidentally degrading it.
    for (const img of images) {
      const st = statuses[img.id] ?? 'pending';
      if (st === 'rejected') continue;
      const post = postByImage.get(img.id);
      if (!post) continue;
      setLocalStatus((prev) => ({ ...prev, [img.id]: 'rejected' }));
      onRejectPost(post.id);
    }
  };

  const firstPost = posts[0];
  const caption = firstPost?.caption;
  const date = firstPost?.date;
  const time = firstPost?.time;
  const platforms = firstPost?.platforms ?? [];
  const onThumbClick = () => setExpanded(true);

  return (
    <div
      className={`relative bg-zinc-900/60 rounded-xl border p-3 space-y-3 transition-all ${
        selected
          ? 'border-[#c5a062]/60 shadow-[0_0_12px_rgba(197,160,98,0.18)]'
          : counts.rejected === counts.total
            ? 'border-red-500/40'
            : counts.pending === 0
              ? 'border-emerald-500/40'
              : counts.approved > 0
                ? 'border-[#c5a062]/40'
                : 'border-indigo-500/25'
      }`}
    >
      <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-5 h-5 bg-zinc-900/80 rounded cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 accent-[#c5a062] cursor-pointer"
          aria-label={`Select carousel ${groupId}`}
        />
      </label>

      <div className="flex items-center justify-between pl-7 gap-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Layers className="w-3.5 h-3.5 text-indigo-300" />
          <span className="font-medium">Carousel · {images.length} images</span>
        </div>
        <CarouselStatusPill {...counts} />
      </div>

      {!expanded && (
        <CarouselThumbnailStrip
          images={images}
          statuses={statuses}
          onThumbClick={onThumbClick}
        />
      )}

      {expanded && (
        <CarouselReviewPanel
          images={images}
          statuses={statuses}
          captionPreview={caption}
          rejectGuarded={rejectGuarded}
          onApproveImage={approveImage}
          onRejectImage={rejectImage}
          onApproveRemaining={approveRemaining}
          onRejectCarousel={rejectCarousel}
          onCollapse={() => setExpanded(false)}
        />
      )}

      {!expanded && (
        <>
          {idea && (
            <div className="flex items-center gap-1 text-[10px] text-[#c5a062]/80">
              <Lightbulb className="w-3 h-3" />
              <span className="truncate">{idea.concept}</span>
            </div>
          )}

          <p className="text-xs text-zinc-300 line-clamp-2 min-h-[2rem]">
            {caption || <span className="text-zinc-600 italic">No caption</span>}
          </p>

          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>{date} {time}</span>
            {platforms.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {platforms.map((pl) => (
                  <span key={pl} className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                    {pl}
                  </span>
                ))}
              </div>
            )}
          </div>

          <DegradeNotice visible={rejectGuarded} />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition-colors"
            >
              Review
              <ChevronDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={approveCarousel}
              disabled={counts.pending === 0}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 text-xs font-medium rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Approve carousel
            </button>
            <button
              type="button"
              onClick={rejectCarousel}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-medium rounded-lg transition-colors"
              aria-label="Reject carousel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
