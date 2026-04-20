'use client';

/**
 * V060-001 — Simplified Post Ready card (single image).
 *
 * Three rows top-to-bottom:
 *   1. Status pill + colored status border (Ready/Scheduled/Posted/Failed)
 *   2. Image preview (left) | caption + hashtags + platform chips (right)
 *   3. Two primary buttons (Post Now, Schedule) + kebab menu
 *
 * Schedule opens an inline calendar (heatmap ON by default) below the
 * card; clicking a time confirms the schedule and closes the calendar.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Loader2,
  MinusCircle,
  MoreVertical,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { AspectPreview } from './AspectPreview';
import { InlineScheduleCalendar } from './InlineScheduleCalendar';
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

export interface PostReadyCardProps {
  img: GeneratedImage;
  scheduledPost: ScheduledPost | undefined;
  /** Full list of scheduled posts — fed to the calendar so taken slots
   *  show as struck-through. */
  allScheduledPosts: ScheduledPost[];
  selectedPlatforms: PostPlatform[];
  available: PostPlatform[];
  busy: 'posting' | 'scheduling' | null | undefined;
  /** Per-card transient status string from postStatus[id]. */
  status: string | null | undefined;
  /** True while a regen LLM call is in flight for this image. */
  isRegen: boolean;
  /** Optional carousel-grouping checkbox state — when omitted, no
   *  checkbox renders (used by the carousel-card variant which
   *  doesn't expose grouping). */
  groupingChecked?: boolean;
  onGroupingToggle?: (checked: boolean) => void;
  /** Selected for the bulk "Copy" feedback flag — mirrors copiedId === `all-${id}`. */
  copyHighlighted: boolean;

  // ── Handlers ──────────────────────────────────────────────────────
  onPreviewClick: () => void;
  onCaptionChange: (next: string) => void;
  onRemoveHashtag: (idx: number) => void;
  onTogglePlatform: (p: PostPlatform) => void;
  onPostNow: () => void;
  onSchedule: (date: string, time: string) => void;
  onCopy: () => void;
  onRegen: () => void;
  onUnready: () => void;
}

/** Map post lifecycle → border + pill colors. */
function statusVisuals(status: PostReadyStatusKind): {
  border: string;
  pillBg: string;
  pillText: string;
} {
  switch (status) {
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

export function PostReadyCard({
  img,
  scheduledPost,
  allScheduledPosts,
  selectedPlatforms,
  available,
  busy,
  status,
  isRegen,
  groupingChecked,
  onGroupingToggle,
  copyHighlighted,
  onPreviewClick,
  onCaptionChange,
  onRemoveHashtag,
  onTogglePlatform,
  onPostNow,
  onSchedule,
  onCopy,
  onRegen,
  onUnready,
}: PostReadyCardProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [hashtagsExpanded, setHashtagsExpanded] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabRef = useRef<HTMLDivElement>(null);

  const { kind, label } = derivePostReadyStatus(img, scheduledPost);
  const v = statusVisuals(kind);

  // Close kebab when clicking outside.
  useEffect(() => {
    if (!kebabOpen) return;
    const onDown = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setKebabOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [kebabOpen]);

  const hashtags = img.postHashtags ?? [];
  const visibleTags = hashtagsExpanded ? hashtags : hashtags.slice(0, HASHTAG_PREVIEW);
  const hiddenCount = Math.max(0, hashtags.length - HASHTAG_PREVIEW);

  const handleCalendarConfirm = (date: string, time: string) => {
    onSchedule(date, time);
    setCalendarOpen(false);
  };

  return (
    <div
      className={`bg-zinc-900/80 backdrop-blur-sm border-2 ${v.border} rounded-2xl overflow-visible hover:border-opacity-80 transition-all duration-300`}
    >
      {/* Status pill row — top of card */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-full border ${v.pillBg} ${v.pillText}`}
          aria-label={`Status: ${label}`}
        >
          {kind === 'scheduled' && <Clock className="w-3 h-3" />}
          {kind === 'posted' && <Check className="w-3 h-3" />}
          {kind === 'failed' && <X className="w-3 h-3" />}
          {label}
        </span>
      </div>

      <div className="flex flex-col md:flex-row">
        <AspectPreview
          src={img.url}
          alt={img.prompt}
          selectedPlatforms={selectedPlatforms}
          onClick={onPreviewClick}
          overlay={
            onGroupingToggle ? (
              <label
                className="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 bg-black/60 backdrop-blur-sm rounded cursor-pointer hover:bg-black/80 transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="Select for grouping"
              >
                <input
                  type="checkbox"
                  checked={!!groupingChecked}
                  onChange={(e) => onGroupingToggle(e.target.checked)}
                  className="w-4 h-4 accent-[#00e6ff] cursor-pointer"
                />
              </label>
            ) : undefined
          }
        />

        <div className="flex-1 p-3 space-y-3 min-w-0">
          {/* Caption — collapsed 2-line preview, click to edit */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Caption
            </label>
            {captionExpanded ? (
              <textarea
                autoFocus
                value={img.postCaption || ''}
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
                aria-expanded={false}
                title="Tap to edit"
              >
                {img.postCaption || (
                  <span className="text-zinc-600 italic">No caption yet — tap to edit</span>
                )}
              </button>
            )}
          </div>

          {/* Hashtags — collapsed 3 + N more */}
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                  >
                    {tag}
                    {hashtagsExpanded && (
                      <button
                        onClick={() => onRemoveHashtag(i)}
                        className="text-zinc-500 hover:text-red-400"
                        aria-label={`Remove ${tag}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
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

          {/* Platform chips */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Platforms
            </label>
            {available.length === 0 ? (
              <p className="text-[11px] text-amber-400">
                Configure a platform in Settings first.
              </p>
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

          {/* Primary action row — Post Now + Schedule + kebab */}
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
              aria-controls={`schedule-calendar-${img.id}`}
              className="flex-1 btn-gold-sm text-[11px] px-2 justify-center"
            >
              <Clock className="w-3.5 h-3.5" /> Schedule
            </button>
            <div className="relative" ref={kebabRef}>
              <button
                type="button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={kebabOpen}
                onClick={() => setKebabOpen((v) => !v)}
                className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {kebabOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-20 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl shadow-black/50 py-1"
                >
                  <KebabItem
                    icon={copyHighlighted ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    label="Copy caption + tags"
                    disabled={!img.postCaption}
                    onClick={() => {
                      onCopy();
                      setKebabOpen(false);
                    }}
                  />
                  <KebabItem
                    icon={isRegen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    label="Regenerate caption"
                    disabled={isRegen}
                    onClick={() => {
                      onRegen();
                      setKebabOpen(false);
                    }}
                  />
                  <KebabItem
                    icon={<MinusCircle className="w-3.5 h-3.5" />}
                    label="Move out of Post Ready"
                    danger
                    onClick={() => {
                      onUnready();
                      setKebabOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Inline transient status */}
          {status && (
            <p className={`text-[11px] ${status.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {status}
            </p>
          )}
        </div>
      </div>

      {/* Inline calendar — opens below card body */}
      {calendarOpen && (
        <div id={`schedule-calendar-${img.id}`}>
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

export interface KebabItemProps {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export function KebabItem({ icon, label, disabled, danger, onClick }: KebabItemProps) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'text-zinc-200 hover:bg-red-500/20 hover:text-red-200'
          : 'text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
