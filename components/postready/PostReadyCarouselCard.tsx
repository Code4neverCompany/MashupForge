'use client';

/**
 * V060-001 — Simplified Post Ready card for a carousel (multi-image post).
 *
 * Same layout as PostReadyCard: status pill + colored border, collapsed
 * caption / hashtags, two primary buttons + kebab. Differences:
 *   - Image strip across the top (not a single AspectPreview)
 *   - "Separate" / "Lock Group" lives in the kebab, not a primary button
 */

import { useState } from 'react';
import {
  Check,
  Clock,
  Columns,
  Copy,
  LayoutGrid,
  Loader2,
  MinusCircle,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { CountdownBadge } from './CountdownBadge';
import { InlineScheduleCalendar } from './InlineScheduleCalendar';
import { KebabMenu, type KebabMenuItem } from '../KebabMenu';
import {
  derivePostReadyStatus,
  type PostReadyStatusKind,
} from '@/lib/post-ready-status';
import type { GeneratedImage, PostPlatform, ScheduledPost } from '@/types/mashup';

function platformBadgeClass(p: PostPlatform): string {
  if (p === 'instagram') return 'bg-pink-600/90';
  if (p === 'pinterest') return 'bg-red-600/90';
  if (p === 'twitter') return 'bg-sky-600/90';
  return 'bg-indigo-600/90';
}

function visualsForKind(kind: PostReadyStatusKind): {
  border: string;
  pillBg: string;
  pillText: string;
} {
  switch (kind) {
    case 'posted':
      return {
        border: 'border-emerald-500/60',
        pillBg: 'bg-emerald-500/20 border-emerald-400/50',
        pillText: 'text-emerald-300',
      };
    case 'failed':
      return {
        border: 'border-red-500/60',
        pillBg: 'bg-red-500/20 border-red-400/50',
        pillText: 'text-red-300',
      };
    case 'scheduled':
      return {
        border: 'border-sky-500/60',
        pillBg: 'bg-sky-500/20 border-sky-400/50',
        pillText: 'text-sky-300',
      };
    case 'ready':
    default:
      return {
        border: 'border-[#c5a062]/30',
        pillBg: 'bg-zinc-800/80 border-zinc-700',
        pillText: 'text-zinc-200',
      };
  }
}

const HASHTAG_PREVIEW = 3;

export interface PostReadyCarouselCardProps {
  images: GeneratedImage[];
  /** When true, this is a user-locked group (shows Separate in kebab).
   *  When false, it's an auto-detected group (shows Lock Group instead). */
  isExplicit: boolean;
  scheduledPost: ScheduledPost | undefined;
  allScheduledPosts: ScheduledPost[];
  selectedPlatforms: PostPlatform[];
  available: PostPlatform[];
  busy: 'posting' | 'scheduling' | null | undefined;
  status: string | null | undefined;
  isRegen: boolean;
  copyHighlighted: boolean;

  onPreviewClick: (img: GeneratedImage) => void;
  onCaptionChange: (next: string) => void;
  onTogglePlatform: (p: PostPlatform) => void;
  onPostNow: () => void;
  onSchedule: (date: string, time: string) => void;
  onCopy: () => void;
  onRegen: () => void;
  onUnreadyAll: () => void;
  /** Only invoked when isExplicit is true. */
  onSeparate: () => void;
  /** Only invoked when isExplicit is false. */
  onLockGroup: () => void;
  /** Unschedule all posts in this carousel without rejecting. Only
   *  shown when at least one post is still scheduled. */
  onCancelSchedule?: () => void;
}

export function PostReadyCarouselCard({
  images,
  isExplicit,
  scheduledPost,
  allScheduledPosts,
  selectedPlatforms,
  available,
  busy,
  status,
  isRegen,
  copyHighlighted,
  onPreviewClick,
  onCaptionChange,
  onTogglePlatform,
  onPostNow,
  onSchedule,
  onCopy,
  onRegen,
  onUnreadyAll,
  onSeparate,
  onLockGroup,
  onCancelSchedule,
}: PostReadyCarouselCardProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [hashtagsExpanded, setHashtagsExpanded] = useState(false);

  const anchor = images[0];
  const { kind, label } = derivePostReadyStatus(anchor, scheduledPost);
  const v = visualsForKind(kind);

  const hashtags = anchor.postHashtags ?? [];
  const visibleTags = hashtagsExpanded ? hashtags : hashtags.slice(0, HASHTAG_PREVIEW);
  const hiddenCount = Math.max(0, hashtags.length - HASHTAG_PREVIEW);

  const handleCalendarConfirm = (date: string, time: string) => {
    onSchedule(date, time);
    setCalendarOpen(false);
  };

  const cardKey = `carousel-${anchor.id}`;

  return (
    <div
      className={`bg-zinc-900/80 backdrop-blur-sm border-2 ${v.border} rounded-2xl overflow-visible hover:border-opacity-80 transition-all duration-300 flex flex-col`}
    >
      {/* Status pill row */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-full border ${v.pillBg} ${v.pillText}`}
          aria-label={`Status: ${label}`}
        >
          {kind === 'scheduled' && <Clock className="w-3 h-3" />}
          {kind === 'posted' && <Check className="w-3 h-3" />}
          {kind === 'failed' && <X className="w-3 h-3" />}
          {label}
        </span>
        {kind === 'scheduled' && <CountdownBadge scheduledPost={scheduledPost} />}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#00e6ff]/15 border border-[#00e6ff]/30 text-[10px] font-medium text-[#00e6ff] rounded-full">
          <LayoutGrid className="w-3 h-3" /> Carousel · {images.length}
        </span>
        {isExplicit && (
          <span className="inline-flex items-center px-2 py-0.5 bg-zinc-800/80 text-[10px] font-medium text-zinc-300 rounded-full border border-zinc-700">
            manual
          </span>
        )}
      </div>

      {/* Image strip */}
      <div className="bg-zinc-950 overflow-x-auto">
        <div className="flex gap-1 p-2" style={{ minHeight: 144 }}>
          {images.map((ci) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={ci.id}
              src={ci.url}
              alt={ci.prompt}
              loading="lazy"
              onClick={() => onPreviewClick(ci)}
              className="h-32 w-32 object-cover rounded-lg cursor-zoom-in shrink-0"
            />
          ))}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Shared caption */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Shared caption
          </label>
          {captionExpanded ? (
            <textarea
              autoFocus
              value={anchor.postCaption || ''}
              onChange={(e) => onCaptionChange(e.target.value)}
              onBlur={() => setCaptionExpanded(false)}
              placeholder="No caption yet…"
              rows={4}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-[#c5a062]/50 focus:outline-none resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCaptionExpanded(true)}
              className="w-full text-left text-sm text-zinc-300 line-clamp-2 hover:text-zinc-100 transition-colors"
              title="Tap to edit"
            >
              {anchor.postCaption || (
                <span className="text-zinc-600 italic">No caption yet — tap to edit</span>
              )}
            </button>
          )}
        </div>

        {/* Hashtags */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Hashtags
          </label>
          {hashtags.length === 0 ? (
            <p className="text-[11px] text-zinc-600 italic">No hashtags.</p>
          ) : (
            <div className="flex flex-wrap gap-1 items-center">
              {visibleTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                >
                  {tag}
                </span>
              ))}
              {!hashtagsExpanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHashtagsExpanded(true)}
                  className="px-2 py-0.5 text-[10px] text-[#c5a062] hover:text-[#e0c285] underline-offset-2 hover:underline"
                >
                  +{hiddenCount} more
                </button>
              )}
              {hashtagsExpanded && hashtags.length > HASHTAG_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setHashtagsExpanded(false)}
                  className="px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  show less
                </button>
              )}
            </div>
          )}
        </div>

        {/* Platforms */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Platforms
          </label>
          {available.length === 0 ? (
            <p className="text-[11px] text-amber-400">Configure a platform in Settings.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {available.map((p) => {
                const checked = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onTogglePlatform(p)}
                    className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                      checked
                        ? `${platformBadgeClass(p)} text-white border-transparent`
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

        {/* Primary actions: Post Now + Schedule + kebab */}
        <div className="flex items-center gap-2">
          <button
            disabled={!!busy || selectedPlatforms.length === 0}
            onClick={onPostNow}
            className="flex-1 btn-blue-sm text-[11px] px-2 justify-center"
          >
            {busy === 'posting' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Post Now
          </button>
          <button
            disabled={!!busy || selectedPlatforms.length === 0}
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
            aria-controls={`schedule-calendar-${cardKey}`}
            className="flex-1 btn-gold-sm text-[11px] px-2 justify-center"
          >
            <Clock className="w-3.5 h-3.5" /> Schedule
          </button>
          <KebabMenu
            ariaLabel="More actions"
            triggerClassName="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-40"
            items={(() => {
              const out: KebabMenuItem[] = [
                {
                  kind: 'item',
                  id: 'copy',
                  label: 'Copy caption + tags',
                  icon: copyHighlighted ? Check : Copy,
                  disabled: !anchor.postCaption,
                  onSelect: onCopy,
                },
                {
                  kind: 'item',
                  id: 'regen',
                  label: 'Regenerate caption',
                  icon: isRegen ? Loader2 : RefreshCw,
                  disabled: isRegen,
                  onSelect: onRegen,
                },
                isExplicit
                  ? {
                      kind: 'item',
                      id: 'separate',
                      label: 'Separate carousel',
                      icon: Columns,
                      onSelect: onSeparate,
                    }
                  : {
                      kind: 'item',
                      id: 'lock-group',
                      label: 'Lock as group',
                      icon: LayoutGrid,
                      onSelect: onLockGroup,
                    },
              ];
              if (onCancelSchedule && kind === 'scheduled') {
                out.push({
                  kind: 'item',
                  id: 'cancel-schedule',
                  label: 'Cancel schedule',
                  icon: X,
                  onSelect: onCancelSchedule,
                });
              }
              out.push({
                kind: 'item',
                id: 'unready-all',
                label: 'Move all out of Post Ready',
                icon: MinusCircle,
                destructive: true,
                onSelect: onUnreadyAll,
              });
              return out;
            })()}
          />
        </div>

        {status && (
          <p className={`text-[11px] ${status.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
            {status}
          </p>
        )}
      </div>

      {calendarOpen && (
        <div id={`schedule-calendar-${cardKey}`}>
          <InlineScheduleCalendar
            scheduledPosts={allScheduledPosts}
            selectedPlatforms={selectedPlatforms}
            onConfirm={handleCalendarConfirm}
            onClose={() => setCalendarOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
