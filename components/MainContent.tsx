'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { 
  Loader2, 
  Image as ImageIcon, 
  Download, 
  Sparkles, 
  Maximize2, 
  X, 
  Trash2, 
  Bookmark, 
  BookmarkCheck, 
  LayoutGrid, 
  Settings, 
  RefreshCw, 
  Search, 
  Filter, 
  Video,
  Columns,
  MinusCircle,
  Tag,
  FolderPlus,
  Plus,
  Minus,
  ChevronDown,
  XCircle,
  CheckCircle2,
  Folder,
  Save,
  FolderOpen,
  Zap,
  Palette,
  Sun,
  Camera,
  Ban,
  Edit3,
  Lightbulb,
  Calendar,
  CalendarDays,
  Grid,
  Menu,
  LogOut,
  Copy,
  Check,
  FileJson,
  Wand2,
  Clock,
  Send,
  TrendingUp
} from 'lucide-react';
import {
  useMashup,
  GeneratedImage,
  LEONARDO_MODELS,
  Collection,
  GenerateOptions,
  ScheduledPost,
  ART_STYLES,
  LIGHTING_OPTIONS,
  CAMERA_ANGLES,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  type ViewType,
} from './MashupContext';
// Lazy-loaded — the Pipeline tab pulls in smart-scheduler logic +
// its own local state tree and isn't needed on first paint. ssr:false
// because it reads localStorage during initial render.
const PipelinePanel = dynamic(
  () => import('./PipelinePanel').then((m) => m.PipelinePanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading pipeline…
      </div>
    ),
  }
);
import { streamAIToString, extractJsonArrayFromLLM, extractJsonObjectFromLLM } from '@/lib/aiClient';
import { enhancePromptForModel } from '@/lib/modelOptimizer';
import { getErrorMessage } from '@/lib/errors';
import { useSmartScheduler } from '@/hooks/useSmartScheduler';
import { SmartScheduleModal } from './SmartScheduleModal';
import type { CarouselGroup } from './MashupContext';
import type { PostPlatform } from '@/types/mashup';
import TimePicker24 from './TimePicker24';
import { formatTime24, formatTimeShort } from './TimePicker24';
import { SettingsModal, type PiStatus, type PiBusy } from './SettingsModal';
import { CollectionModal } from './CollectionModal';
import { ImageDetailModal } from './ImageDetailModal';
import { BulkTagModal } from './BulkTagModal';

/**
 * Auto-sizing textarea that grows with its content. Resets to
 * scrollHeight on every render so deletions shrink it too. Shared by
 * Captioning Studio and Post Ready tabs so long captions don't get
 * clipped behind a fixed row count.
 */
interface AutoTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
}
function AutoTextarea({ minRows = 2, className, value, ...rest }: AutoTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={`resize-none overflow-hidden ${className || ''}`}
      {...rest}
    />
  );
}

import { useAuth } from '@/hooks/useAuth';
import { useDesktopConfig } from '@/hooks/useDesktopConfig';
import { showToast } from '@/components/Toast';

export function MainContent() {
  const { logout } = useAuth();
  const { isDesktop, credentials: desktopCreds } = useDesktopConfig();
  const { 
    images, 
    savedImages, 
    collections,
    isGenerating, 
    progress, 
    settings, 
    updateSettings, 
    generateImages, 
    generatePostContent,
    rerollImage, 
    saveImage, 
    deleteImage,
    updateImageTags,
    createCollection,
    deleteCollection,
    addImageToCollection,
    removeImageFromCollection,
    toggleApproveImage,
    generateComparison,
    pickComparisonWinner,
    comparisonResults,
    clearComparison,
    deleteComparisonResult,
    autoTagImage,
    autoGenerateCollectionInfo,
    bulkUpdateImageTags,
    setImageStatus,
    view,
    setView,
    comparisonPrompt,
    setComparisonPrompt,
    comparisonOptions,
    setComparisonOptions,
    ideas,
    clearIdeas,
    updateIdeaStatus,
    deleteIdea,
    isSidebarOpen,
    setIsSidebarOpen
  } = useMashup();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [filterModel, setFilterModel] = useState('all');
  const [filterUniverse, setFilterUniverse] = useState('all');
  const [tagQuery, setTagQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState('all');
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [dragOverCollection, setDragOverCollection] = useState<string | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [isAutoTagging, setIsAutoTagging] = useState(false);

  const checkApiKey = async () => {
    const w = window as typeof window & { aistudio?: { hasSelectedApiKey(): Promise<boolean>; openSelectKey(): Promise<void> } };
    if (typeof window !== 'undefined' && w.aistudio) {
      const has = await w.aistudio.hasSelectedApiKey();
      setHasApiKey(has);
      if (!has) {
        await w.aistudio.openSelectKey();
        const nowHas = await w.aistudio.hasSelectedApiKey();
        setHasApiKey(nowHas);
      }
    }
  };
  
  // Comparison state
  const [comparisonModels, setComparisonModels] = useState<string[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  /** Per-model parameter preview (set by pi when prompt changes). */
  const [modelPreviews, setModelPreviews] = useState<Record<string, { prompt?: string; style?: string; aspectRatio?: string; negativePrompt?: string; lighting?: string; angle?: string }>>({});
  const [isPushing, setIsPushing] = useState(false);
  // Track which image is currently having its caption generated so we can
  // show a per-card spinner while the pi caption request runs. Keyed by
  // image id.
  const [preparingPostId, setPreparingPostId] = useState<string | null>(null);

  // Captioning Studio tab state
  const [captioningFilter, setCaptioningFilter] = useState<'all' | 'captioned' | 'uncaptioned'>('all');
  // Whether the tab auto-groups similar images into carousel cards
  // (reuses the Post Ready computeCarouselView logic). Default ON.
  const [captioningGrouped, setCaptioningGrouped] = useState(true);
  // When grouping is OFF, users can check individual cards and manually
  // promote a selection to a carousel group.
  const [captioningSelected, setCaptioningSelected] = useState<Set<string>>(new Set());
  // Carousel picker modal: multi-source image picker for grouping
  // savedImages into a carousel from ANY subset (not just auto-detected).
  const [showCarouselPicker, setShowCarouselPicker] = useState(false);
  const [pickerTargetGroupId, setPickerTargetGroupId] = useState<string | null>(null);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  // Post-Ready manual carousel grouping selection (parallel to
  // captioningSelected). Lets the user check 2+ Post-Ready single cards
  // and promote them into a carousel group without leaving the tab.
  const [postReadySelected, setPostReadySelected] = useState<Set<string>>(new Set());
  const [batchCaptioning, setBatchCaptioning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  // Captioning tab "remove" confirmation — tracks which image id is pending
  // confirmation so we can show an inline ✓/✗ pair instead of window.confirm.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  // Image id currently copied (for the brief "Copied" affordance on the
  // Post Ready tab). Auto-clears after a short timeout.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Post Ready scheduling state ────────────────────────────────────
  // PostPlatform is exported from @/types/mashup and shared with the
  // useSmartScheduler hook + SmartScheduleModal component.

  // Per-card platform selection (defaults set when the card first renders).
  const [postPlatformSel, setPostPlatformSel] = useState<Record<string, PostPlatform[]>>({});
  // Per-card date/time pickers.
  const [postSchedule, setPostSchedule] = useState<Record<string, { date: string; time: string }>>({});
  // Per-card posting spinner state ('posting' | 'scheduling' | null).
  const [postBusy, setPostBusy] = useState<Record<string, 'posting' | 'scheduling' | null>>({});
  // Transient status line per card ('Posted!', 'Scheduled for ...', error msg).
  const [postStatus, setPostStatus] = useState<Record<string, string | null>>({});
  // Post Ready view toggle + calendar navigation.
  const [postReadyView, setPostReadyView] = useState<'grid' | 'calendar'>('grid');
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  // Inline edit popover state for the week view — only one open at a time.
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  // Drag state for rescheduling scheduled posts via HTML5 DnD.
  const [dragPostId, setDragPostId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  // Click-to-schedule: when the user clicks an empty calendar cell, open
  // a modal with an image picker + platform toggles + time. `time` is a
  // full HH:MM string so picking e.g. 14:30 doesn't silently truncate to
  // the hour. null when closed.
  const [calendarSlotClick, setCalendarSlotClick] = useState<{
    date: string;
    time: string;
    imageId?: string;
    platforms?: PostPlatform[];
  } | null>(null);

  // Batch "Schedule All" mini-modal state.
  const [showScheduleAll, setShowScheduleAll] = useState(false);

  const hasPlatformCreds = (p: PostPlatform): boolean => {
    switch (p) {
      case 'instagram':
        if (settings.apiKeys.instagram?.accessToken && settings.apiKeys.instagram?.igAccountId) return true;
        if (isDesktop && desktopCreds.hasInstagramToken && desktopCreds.hasInstagramAccountId) return true;
        return false;
      case 'pinterest':
        if (settings.apiKeys.pinterest?.accessToken) return true;
        if (isDesktop && desktopCreds.hasPinterestCreds) return true;
        return false;
      case 'twitter':
        if (settings.apiKeys.twitter?.appKey && settings.apiKeys.twitter?.appSecret &&
            settings.apiKeys.twitter?.accessToken && settings.apiKeys.twitter?.accessSecret) return true;
        if (isDesktop && desktopCreds.hasTwitterCreds) return true;
        return false;
      case 'discord':
        if (settings.apiKeys.discordWebhook) return true;
        if (isDesktop && desktopCreds.hasDiscordCreds) return true;
        return false;
    }
  };

  const availablePlatforms = (): PostPlatform[] => {
    return (['instagram', 'pinterest', 'twitter', 'discord'] as PostPlatform[]).filter(hasPlatformCreds);
  };

  // PROP-016: smart scheduler hook — owns slot computation state.
  const smartScheduler = useSmartScheduler({
    postCount: 1,                          // updated per-call via trigger options
    scheduledPosts: settings.scheduledPosts || [],
    defaultPlatforms: availablePlatforms(),
    igAccessToken: settings.apiKeys?.instagram?.accessToken,
    igAccountId: settings.apiKeys?.instagram?.igAccountId,
  });

  /** Return the per-card selection, initialising to "all available" on first access. */
  const getSelectedPlatforms = (id: string): PostPlatform[] => {
    if (postPlatformSel[id]) return postPlatformSel[id];
    return availablePlatforms();
  };

  const togglePlatformFor = (id: string, p: PostPlatform) => {
    setPostPlatformSel((prev) => {
      const current = prev[id] || availablePlatforms();
      const next = current.includes(p) ? current.filter((x) => x !== p) : [...current, p];
      return { ...prev, [id]: next };
    });
  };

  /** Default schedule — today's date, an hour from now. Memoised per image id. */
  const getSchedule = (id: string): { date: string; time: string } => {
    if (postSchedule[id]) return postSchedule[id];
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { date, time };
  };

  const setScheduleFor = (id: string, patch: Partial<{ date: string; time: string }>) => {
    setPostSchedule((prev) => ({
      ...prev,
      [id]: { ...getSchedule(id), ...patch },
    }));
  };

  const buildCredentialsPayload = () => ({
    instagram: settings.apiKeys.instagram,
    twitter: settings.apiKeys.twitter,
    pinterest: settings.apiKeys.pinterest,
    discord: { webhookUrl: settings.apiKeys.discordWebhook },
  });

  /** Post a single image immediately to the selected platforms. */
  const postImageNow = async (img: GeneratedImage, platforms: PostPlatform[]) => {
    if (platforms.length === 0) return;
    setPostBusy((prev) => ({ ...prev, [img.id]: 'posting' }));
    setPostStatus((prev) => ({ ...prev, [img.id]: null }));
    try {
      const res = await fetch('/api/social/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: formatPost(img),
          platforms,
          mediaUrl: img.url,
          mediaBase64: img.base64,
          credentials: buildCredentialsPayload(),
        }),
      });
      let data: { error?: string };
      try {
        data = await res.json() as { error?: string };
      } catch {
        throw new Error(`Server error (HTTP ${res.status}) — check logs`);
      }
      if (!res.ok) throw new Error(data.error || 'Post failed');
      setPostStatus((prev) => ({
        ...prev,
        [img.id]: `Posted to ${platforms.join(', ')} ✓`,
      }));
    } catch (e: unknown) {
      setPostStatus((prev) => ({
        ...prev,
        [img.id]: `Error: ${getErrorMessage(e)}`,
      }));
    } finally {
      setPostBusy((prev) => ({ ...prev, [img.id]: null }));
    }
  };

  /**
   * Persist or update a ScheduledPost in settings.scheduledPosts.
   *
   * If an existing non-carousel scheduled post already references this
   * image, we patch it in place instead of appending — otherwise clicking
   * Schedule after editing the date/time/caption would create a duplicate
   * card for the same image. Carousel-bound posts are owned by
   * scheduleCarousel and intentionally skipped here.
   */
  const scheduleImage = (img: GeneratedImage, platforms: PostPlatform[], date: string, time: string) => {
    if (!date || !time || platforms.length === 0) return;
    const caption = formatPost(img);
    updateSettings((prev) => {
      const existingPosts = prev.scheduledPosts || [];
      const editableIdx = existingPosts.findIndex(
        (p) => p.imageId === img.id && !p.carouselGroupId
      );
      if (editableIdx !== -1) {
        return {
          scheduledPosts: existingPosts.map((p, i) =>
            i === editableIdx ? { ...p, date, time, platforms, caption } : p
          ),
        };
      }
      const scheduled: ScheduledPost = {
        id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageId: img.id,
        date,
        time,
        platforms,
        caption,
        status: 'scheduled',
      };
      return { scheduledPosts: [...existingPosts, scheduled] };
    });
    setPostStatus((prev) => ({
      ...prev,
      [img.id]: `Scheduled for ${date} ${time}`,
    }));
  };

  // ── Calendar helpers ───────────────────────────────────────────────
  /** Start-of-day for a Date (strips time). */
  const startOfDay = (d: Date) => {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n;
  };
  /** Monday-anchored start of the week containing d. */
  const startOfWeek = (d: Date) => {
    const n = startOfDay(d);
    const day = n.getDay(); // 0=Sun
    const mondayOffset = (day + 6) % 7; // days to subtract to reach Monday
    n.setDate(n.getDate() - mondayOffset);
    return n;
  };
  const addDays = (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  };
  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  /** Colour class for a scheduled-post status badge on the calendar. */
  const calendarColorFor = (status?: 'pending_approval' | 'scheduled' | 'posted' | 'failed'): string => {
    if (status === 'posted') return 'bg-emerald-500/80 border-emerald-400/60 text-emerald-50';
    if (status === 'failed') return 'bg-red-500/80 border-red-400/60 text-red-50';
    if (status === 'pending_approval') return 'bg-indigo-500/80 border-indigo-400/60 text-indigo-50';
    return 'bg-amber-500/80 border-amber-400/60 text-amber-50';
  };
  /** 24-hour labels 00..23 used by the week-view row header. */
  const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

  /** Look up the most recent scheduled post for an image id. */
  const latestScheduleFor = (imageId: string): ScheduledPost | undefined => {
    const all = settings.scheduledPosts || [];
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].imageId === imageId) return all[i];
    }
    return undefined;
  };

  // ── Carousel grouping (Post Ready tab) ─────────────────────────────
  type PostItem =
    | { kind: 'single'; img: GeneratedImage }
    | { kind: 'carousel'; id: string; images: GeneratedImage[]; group?: CarouselGroup };

  /** 5-minute window for auto-grouping same-prompt batches. */
  const CAROUSEL_AUTO_WINDOW_MS = 5 * 60 * 1000;

  /**
   * Group post-ready images into singles + carousels. Explicit groups in
   * settings.carouselGroups take precedence. Remaining images are
   * auto-grouped when 2+ share the same prompt and were saved within
   * CAROUSEL_AUTO_WINDOW_MS of each other.
   */
  const computeCarouselView = useCallback((ready: GeneratedImage[]): PostItem[] => {
    const items: PostItem[] = [];
    const handled = new Set<string>();

    const explicitGroups = settings.carouselGroups || [];
    for (const g of explicitGroups) {
      const imgs = g.imageIds
        .map((id) => ready.find((i) => i.id === id))
        .filter((i): i is GeneratedImage => !!i);
      if (imgs.length === 0) continue;
      items.push({ kind: 'carousel', id: g.id, images: imgs, group: g });
      for (const i of imgs) handled.add(i.id);
    }

    const remaining = ready.filter((i) => !handled.has(i.id));
    remaining.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    for (let i = 0; i < remaining.length; i++) {
      if (handled.has(remaining[i].id)) continue;
      const anchor = remaining[i];
      const siblings = [anchor];
      for (let j = i + 1; j < remaining.length; j++) {
        const cand = remaining[j];
        if (handled.has(cand.id)) continue;
        if (
          cand.prompt === anchor.prompt &&
          Math.abs((cand.savedAt || 0) - (anchor.savedAt || 0)) <= CAROUSEL_AUTO_WINDOW_MS
        ) {
          siblings.push(cand);
        }
      }
      if (siblings.length > 1) {
        items.push({
          kind: 'carousel',
          id: `auto-${anchor.id}`,
          images: siblings,
        });
        for (const s of siblings) handled.add(s.id);
      } else {
        items.push({ kind: 'single', img: anchor });
        handled.add(anchor.id);
      }
    }

    items.sort((a, b) => {
      const aT = a.kind === 'single' ? a.img.savedAt || 0 : Math.max(...a.images.map((i) => i.savedAt || 0));
      const bT = b.kind === 'single' ? b.img.savedAt || 0 : Math.max(...b.images.map((i) => i.savedAt || 0));
      return bT - aT;
    });
    return items;
  }, [settings.carouselGroups]);

  /**
   * Persist a manual carousel group. If imageIds has fewer than 2
   * entries we auto-ungroup instead (a carousel of 1 is just a post).
   */
  const persistCarouselGroup = useCallback((id: string, imageIds: string[], patch?: Partial<CarouselGroup>) => {
    const groups = settings.carouselGroups || [];
    if (imageIds.length < 2) {
      updateSettings({ carouselGroups: groups.filter((g) => g.id !== id) });
      return;
    }
    const existing = groups.find((g) => g.id === id);
    if (existing) {
      updateSettings({
        carouselGroups: groups.map((g) => (g.id === id ? { ...g, ...patch, imageIds } : g)),
      });
    } else {
      updateSettings({
        carouselGroups: [...groups, { id, imageIds, status: 'draft', ...patch }],
      });
    }
  }, [settings.carouselGroups, updateSettings]);

  /** Separate a carousel — drop the explicit group and its images revert to singles. */
  const separateCarousel = (groupId: string) => {
    const groups = settings.carouselGroups || [];
    updateSettings({ carouselGroups: groups.filter((g) => g.id !== groupId) });
  };

  /** Remove a single image from a carousel group. Auto-ungroups at <2. */
  const removeFromCarousel = (groupId: string, imageId: string) => {
    const groups = settings.carouselGroups || [];
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const nextIds = g.imageIds.filter((id) => id !== imageId);
    persistCarouselGroup(groupId, nextIds);
  };

  /** Open the multi-source image picker for an existing or new group. */
  const openCarouselPicker = (targetGroupId: string | null) => {
    setPickerTargetGroupId(targetGroupId);
    // Seed selection with the group's current members when editing.
    if (targetGroupId) {
      const g = (settings.carouselGroups || []).find((x) => x.id === targetGroupId);
      setPickerSelected(new Set(g?.imageIds || []));
    } else {
      setPickerSelected(new Set());
    }
    setShowCarouselPicker(true);
  };

  /** Confirm picker selection → persist a new or updated carousel group. */
  const confirmCarouselPicker = () => {
    const ids = Array.from(pickerSelected);
    if (ids.length < 2) {
      setShowCarouselPicker(false);
      return;
    }
    const id = pickerTargetGroupId || `manual-${ids[0]}`;
    persistCarouselGroup(id, ids);
    setShowCarouselPicker(false);
    setPickerTargetGroupId(null);
    setPickerSelected(new Set());
    // After creating a fresh group, flip the tab into grouped view so
    // the user sees the result immediately.
    if (!pickerTargetGroupId) setCaptioningGrouped(true);
  };

  /**
   * Schedule a whole carousel: creates one ScheduledPost per image in the
   * group at the shared date/time/platforms. The auto-post worker picks
   * these up when the time hits; Instagram carousel-mode is still handled
   * by postCarouselNow when the user clicks Post Now.
   *
   * If an existing carouselGroupId already covers exactly this set of
   * images, we patch those posts in place so re-editing date/time/caption
   * doesn't duplicate the carousel.
   */
  const scheduleCarousel = (
    item: Extract<PostItem, { kind: 'carousel' }>,
    platforms: PostPlatform[],
    date: string,
    time: string
  ) => {
    if (platforms.length === 0 || !date || !time || item.images.length === 0) return;
    const caption = item.group?.caption || formatPost(item.images[0]);
    const imageIds = new Set(item.images.map((i) => i.id));

    updateSettings((prev) => {
      const existingPosts = prev.scheduledPosts || [];

      // Find an existing carouselGroupId whose posts cover exactly this
      // item's image set. Iterating to the end means the LAST match wins
      // if the user somehow has stale duplicates — newest grouping is kept.
      const byGroup = new Map<string, ScheduledPost[]>();
      for (const p of existingPosts) {
        if (!p.carouselGroupId || !imageIds.has(p.imageId)) continue;
        const list = byGroup.get(p.carouselGroupId) || [];
        list.push(p);
        byGroup.set(p.carouselGroupId, list);
      }
      let matchGroupId: string | null = null;
      for (const [gid, posts] of byGroup) {
        const postImgIds = new Set(posts.map((p) => p.imageId));
        if (
          postImgIds.size === imageIds.size &&
          [...imageIds].every((id) => postImgIds.has(id))
        ) {
          matchGroupId = gid;
        }
      }

      if (matchGroupId) {
        return {
          scheduledPosts: existingPosts.map((p) =>
            p.carouselGroupId === matchGroupId
              ? { ...p, date, time, platforms, caption }
              : p
          ),
        };
      }

      const nowStamp = Date.now();
      const groupId = `carousel-grp-${nowStamp}-${Math.random().toString(36).slice(2, 8)}`;
      const newPosts: ScheduledPost[] = item.images.map((img, idx) => ({
        id: `post-${nowStamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        imageId: img.id,
        date,
        time,
        platforms,
        caption,
        status: 'scheduled' as const,
        carouselGroupId: groupId,
      }));
      return { scheduledPosts: [...existingPosts, ...newPosts] };
    });
    setPostStatus((prev) => ({
      ...prev,
      [`carousel-${item.id}`]: `Scheduled carousel for ${date} ${time}`,
    }));
  };

  /** Post a whole carousel now — fans out to platforms with the full mediaUrls array. */
  const postCarouselNow = async (
    item: Extract<PostItem, { kind: 'carousel' }>,
    platforms: PostPlatform[]
  ) => {
    if (platforms.length === 0 || item.images.length === 0) return;
    const key = `carousel-${item.id}`;
    setPostBusy((prev) => ({ ...prev, [key]: 'posting' }));
    setPostStatus((prev) => ({ ...prev, [key]: null }));
    try {
      const caption = item.group?.caption || formatPost(item.images[0]);
      const mediaUrls = item.images.map((i) => i.url).filter(Boolean) as string[];
      const res = await fetch('/api/social/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          platforms,
          mediaUrls,
          credentials: buildCredentialsPayload(),
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Carousel post failed');
      setPostStatus((prev) => ({ ...prev, [key]: `Posted carousel to ${platforms.join(', ')} ✓` }));
    } catch (e: unknown) {
      setPostStatus((prev) => ({ ...prev, [key]: `Error: ${getErrorMessage(e)}` }));
    } finally {
      setPostBusy((prev) => ({ ...prev, [key]: null }));
    }
  };

  /** Write text to clipboard and flash a "Copied" state on the given key. */
  const copyWithFeedback = async (text: string, feedbackKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(feedbackKey);
      setTimeout(() => {
        setCopiedId((current) => (current === feedbackKey ? null : current));
      }, 1500);
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  /** Format a single image's caption + hashtags as a ready-to-paste post. */
  const formatPost = (img: GeneratedImage): string => {
    const caption = img.postCaption || '';
    const tags = (img.postHashtags || []).join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  };

  /** Merge partial updates into an image and persist. */
  const patchImage = (img: GeneratedImage, patch: Partial<GeneratedImage>) => {
    saveImage({ ...img, ...patch });
  };

  /** Remove one hashtag by index and persist. */
  const removeHashtag = (img: GeneratedImage, index: number) => {
    const next = (img.postHashtags || []).filter((_, i) => i !== index);
    patchImage(img, { postHashtags: next });
  };

  /**
   * Generate captions for every visible uncaptioned image. Sequential —
   * pi serializes prompts anyway, and we get cleaner progress reporting.
   */
  const batchCaptionImages = async (candidates: GeneratedImage[]) => {
    const targets = candidates.filter((img) => !img.postCaption);
    if (targets.length === 0) return;
    setBatchCaptioning(true);
    setBatchProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        setPreparingPostId(targets[i].id);
        try {
          await generatePostContent(targets[i]);
        } catch {
          // individual batch failure — continue to next image
        }
        setBatchProgress({ done: i + 1, total: targets.length });
      }
    } finally {
      setPreparingPostId(null);
      setBatchCaptioning(false);
      // Leave the final progress on screen briefly so the user sees "N/N".
      setTimeout(() => setBatchProgress(null), 2000);
    }
  };

  /** Download a JSON file of all post-ready items. */
  const exportPostsAsJson = (items: GeneratedImage[]) => {
    const payload = items.map((img) => ({
      id: img.id,
      prompt: img.prompt,
      url: img.url,
      caption: img.postCaption || '',
      hashtags: img.postHashtags || [],
      tags: img.tags || [],
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mashup-posts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Pi.dev runtime status, polled when the Settings panel is open.
  const [piStatus, setPiStatus] = useState<PiStatus | null>(null);
  const [piBusy, setPiBusy] = useState<PiBusy>(null);
  const [piError, setPiError] = useState<string | null>(null);
  const [piSetupMsg, setPiSetupMsg] = useState<string | null>(null);
  const piAutoBootRef = useRef(false);

  const refreshPiStatus = async (): Promise<PiStatus | null> => {
    try {
      const res = await fetch('/api/pi/status');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json() as PiStatus;
      setPiStatus(data);
      return data;
    } catch (e: unknown) {
      setPiError(getErrorMessage(e) || 'Failed to fetch pi status');
      return null;
    }
  };

  // Autonomous pi boot: on first mount, check status → install if missing
  // → start if installed but not running. Runs once per page load. Auth is
  // the only step that requires user action (Sign In button below).
  useEffect(() => {
    if (piAutoBootRef.current) return;
    piAutoBootRef.current = true;
    (async () => {
      const initial = await refreshPiStatus();
      if (!initial) return;

      let s = initial;
      if (!s.installed) {
        setPiBusy('install');
        try {
          const res = await fetch('/api/pi/install', { method: 'POST' });
          const data = await res.json() as { success?: boolean; stderr?: string; error?: string };
          if (!res.ok || data.success === false) {
            setPiError(data.stderr || data.error || 'Auto-install failed');
          }
        } catch (e) {
          setPiError(getErrorMessage(e) || 'Auto-install failed');
        } finally {
          setPiBusy(null);
        }
        s = (await refreshPiStatus()) || s;
      }

      if (s.installed && s.authenticated && !s.running) {
        setPiBusy('start');
        try {
          const res = await fetch('/api/pi/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: settings.agentPrompt || '' }),
          });
          const data = await res.json() as { success?: boolean; error?: string };
          if (!res.ok || data.success === false) {
            setPiError(data.error || 'Auto-start failed');
          }
        } catch (e) {
          setPiError(getErrorMessage(e) || 'Auto-start failed');
        } finally {
          setPiBusy(null);
        }
        await refreshPiStatus();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showSettings) refreshPiStatus();
  }, [showSettings]);

  // handlePiInstall / handlePiStart / handlePiStop intentionally removed —
  // pi install + start are autonomous (see piAutoBootRef effect). Only the
  // auth step (handlePiSetup → /api/pi/setup) requires user interaction.

  const handlePiSetup = async () => {
    setPiBusy('setup');
    setPiError(null);
    try {
      const res = await fetch('/api/pi/setup', { method: 'POST' });
      const data = await res.json() as { success?: boolean; error?: string; tmuxSession?: string };
      if (!res.ok || data.success === false) {
        setPiError(data.error || 'Setup failed');
      } else {
        setPiSetupMsg(data.tmuxSession || 'pi-setup');
      }
    } finally {
      setPiBusy(null);
    }
  };

  const PREDEFINED_PROMPTS = [
    "Darth Vader as a Space Marine in the Warhammer 40k universe, grimdark style",
    "Iron Man's Hulkbuster armor redesigned by Mandalorian armorers, Beskar plating",
    "Batman investigating a Genestealer Cult in the underhive of Necromunda",
    "The Millennium Falcon being chased by a fleet of Borg Cubes",
    "Wonder Woman wielding a Thunder Hammer leading a charge against Chaos Daemons"
  ];

  /**
   * Set when the user pushes an Idea Board concept into Compare — tells
   * the comparisonResults watcher below to auto-collapse the resulting
   * images into a single CarouselGroup once they're all ready, but only
   * when pipelineCarouselMode is on. Ref (not state) so flipping it
   * doesn't cause a re-render and the watcher reads the freshest value.
   */
  const pendingIdeaCarouselRef = useRef(false);

  const handlePushIdeaToCompare = async (prompt: string) => {
    setIsPushing(true);
    setView('compare');
    // Arm the carousel watcher — if the user has carousel mode on, the
    // Compare results from this run will auto-group. Harmless if mode
    // is off; the watcher just clears the flag.
    pendingIdeaCarouselRef.current = true;
    try {
      const text = await streamAIToString(
        `Analyze and enhance this generation prompt: "${prompt}".
        Provide an improved, highly detailed cinematic prompt.
        Also provide a fitting negative prompt (e.g., ugly, blurry, poorly drawn).
        Smartly detect and provide the best fitting parameters for this specific scene:
        - Art style from: ${ART_STYLES.join(', ')}
        - Lighting from: ${LIGHTING_OPTIONS.join(', ')}
        - Camera angle from: ${CAMERA_ANGLES.join(', ')}
        - Aspect ratio from: ${['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].join(', ')}
        - Image size from: ${['512px', '1K', '2K', '4K'].join(', ')}

        CRITICAL ASPECT RATIO RULES:
        - If the prompt describes an epic scene, landscape, wide battle, or cinematic vista, you MUST select "16:9".
        - If the prompt describes a character portrait, single character focus, or vertical subject, you MUST select "9:16".
        - Otherwise, select "1:1" or another appropriate ratio.

        Return ONLY a JSON object with:
        - "enhancedPrompt": string
        - "negativePrompt": string
        - "style": string
        - "lighting": string
        - "angle": string
        - "aspectRatio": string
        - "imageSize": string`,
        { mode: 'enhance' }
      );
      const data = extractJsonObjectFromLLM(text);
      const pickString = (v: unknown): string | undefined =>
        typeof v === 'string' ? v : undefined;
      const enhancedPrompt = pickString(data.enhancedPrompt);
      const negativePrompt = pickString(data.negativePrompt);
      const styleStr = pickString(data.style);
      const lightingStr = pickString(data.lighting);
      const angleStr = pickString(data.angle);
      const aspectRatioStr = pickString(data.aspectRatio);
      const imageSizeStr = pickString(data.imageSize);

      setComparisonPrompt(enhancedPrompt || prompt);
      setComparisonOptions(prev => ({
        ...prev,
        negativePrompt: negativePrompt || '',
        style: styleStr && ART_STYLES.includes(styleStr) ? styleStr : ART_STYLES[0],
        lighting: lightingStr && LIGHTING_OPTIONS.includes(lightingStr) ? lightingStr : LIGHTING_OPTIONS[0],
        angle: angleStr && CAMERA_ANGLES.includes(angleStr) ? angleStr : CAMERA_ANGLES[0],
        aspectRatio: aspectRatioStr && ['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].includes(aspectRatioStr) ? aspectRatioStr : '16:9',
        imageSize: imageSizeStr && ['512px', '1K', '2K', '4K'].includes(imageSizeStr) ? imageSizeStr : '1K',
      }));
    } catch {
      setComparisonPrompt(prompt);
    } finally {
      setIsPushing(false);
    }
  };

  /**
   * Auto-collapse Ideas Board comparison runs into a single carousel.
   * Fires when: (1) the user just pushed an idea into Compare (ref armed),
   * (2) pipelineCarouselMode is on, and (3) all comparisonResults are in
   * the 'ready' state with usable media. Creates one CarouselGroup in
   * settings.carouselGroups and disarms the ref so a subsequent manual
   * Compare run isn't also grouped.
   */
  useEffect(() => {
    if (!pendingIdeaCarouselRef.current) return;
    if (!settings.pipelineCarouselMode) {
      pendingIdeaCarouselRef.current = false;
      return;
    }
    if (comparisonResults.length < 2) return;
    const allReady = comparisonResults.every(
      (img) => img.status === 'ready' && (img.base64 || img.url),
    );
    if (!allReady) return;
    pendingIdeaCarouselRef.current = false;
    const nowStamp = Date.now();
    const groupId = `carousel-idea-${nowStamp}-${Math.random().toString(36).slice(2, 8)}`;
    persistCarouselGroup(
      groupId,
      comparisonResults.map((i) => i.id),
      { status: 'draft' },
    );
  }, [comparisonResults, settings.pipelineCarouselMode, persistCarouselGroup]);

  useEffect(() => {
    const storedModels = localStorage.getItem('mashup_comparison_models');
    if (storedModels) {
      try {
        const parsed = JSON.parse(storedModels);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setComparisonModels(parsed);
          return;
        }
      } catch {
        // parse failure — fall through to defaults below
      }
    }
    // Default: all three models selected
    setComparisonModels(LEONARDO_MODELS.map(m => m.id));
  }, []);

  useEffect(() => {
    localStorage.setItem('mashup_comparison_models', JSON.stringify(comparisonModels));
  }, [comparisonModels]);

  /** Preview per-model parameters whenever the prompt or models change. */
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!comparisonPrompt.trim() || comparisonModels.length === 0) {
      setModelPreviews({});
      return;
    }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const previews: Record<string, { prompt?: string; style?: string; aspectRatio?: string; negativePrompt?: string; lighting?: string; angle?: string }> = {};
      await Promise.all(comparisonModels.map(async (modelId) => {
        try {
          const enh = await enhancePromptForModel(comparisonPrompt, modelId, {
            style: comparisonOptions.style,
            aspectRatio: comparisonOptions.aspectRatio,
            negativePrompt: comparisonOptions.negativePrompt,
          });
          previews[modelId] = {
            prompt: enh.prompt,
            style: enh.style,
            aspectRatio: enh.aspectRatio,
            negativePrompt: enh.negativePrompt,
          };
        } catch { /* ignore */ }
      }));
      setModelPreviews(prev => {
        const same = Object.keys(prev).length === Object.keys(previews).length
          && Object.entries(prev).every(([k, v]) => JSON.stringify(v) === JSON.stringify(previews[k]));
        return same ? prev : previews;
      });
    }, 800);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [
    comparisonPrompt,
    comparisonModels,
    comparisonOptions.style,
    comparisonOptions.aspectRatio,
    comparisonOptions.negativePrompt,
  ]);

  // Auto-posting effect
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!settings.scheduledPosts || settings.scheduledPosts.length === 0) return;

      const now = new Date();
      // Snapshot the list of posts we'll consider for THIS tick. We only
      // compute statuses against this snapshot, but persist via a
      // functional updater that merges patches by id — so any new posts
      // the user (or the pipeline) added during the async loop are
      // preserved instead of being clobbered.
      const snapshot = [...settings.scheduledPosts];

      // Shared credentials payload — same shape as postCarouselNow /
      // postImageNow so the /api/social/post route doesn't care whether
      // the publish was triggered manually or by the worker.
      const credentials = {
        instagram: settings.apiKeys.instagram,
        twitter: settings.apiKeys.twitter,
        pinterest: settings.apiKeys.pinterest,
        discord: { webhookUrl: settings.apiKeys.discordWebhook },
      };

      // Posts handled as part of a carousel group — we skip these when
      // we encounter their siblings later in the loop so each group is
      // published exactly once.
      const processedIds = new Set<string>();
      // id → next status. Applied via functional updater at the end so
      // we never overwrite the latest scheduledPosts list.
      const statusPatches = new Map<string, ScheduledPost['status']>();

      for (const post of snapshot) {
        if (processedIds.has(post.id)) continue;
        if (post.status !== 'scheduled') continue;
        const postDate = new Date(`${post.date}T${post.time}:00`);
        if (now < postDate) continue;

        // ── Carousel branch ────────────────────────────────────────
        if (post.carouselGroupId) {
          const groupPosts = snapshot.filter(
            (p) => p.carouselGroupId === post.carouselGroupId && p.status === 'scheduled'
          );

          // They share a date/time by construction, but double-check
          // in case the user edited one of them.
          const allDue = groupPosts.every((p) => {
            const d = new Date(`${p.date}T${p.time}:00`);
            return now >= d;
          });
          if (!allDue) {
            groupPosts.forEach((gp) => processedIds.add(gp.id));
            continue;
          }

          const groupImages = groupPosts
            .map((gp) => savedImages.find((img) => img.id === gp.imageId))
            .filter((x): x is GeneratedImage => !!x);

          if (groupImages.length === 0) {
            groupPosts.forEach((gp) => {
              statusPatches.set(gp.id, 'failed');
              processedIds.add(gp.id);
            });
            continue;
          }

          try {
            const mediaUrls = groupImages.map((i) => i.url).filter(Boolean) as string[];
            const res = await fetch('/api/social/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: post.caption,
                platforms: post.platforms,
                mediaUrls,
                credentials,
              }),
            });
            let data: { error?: string };
            try { data = await res.json() as { error?: string }; }
            catch { throw new Error(`Server error (HTTP ${res.status})`); }
            if (!res.ok) throw new Error(data.error || 'Failed to post carousel');

            groupPosts.forEach((gp) => {
              statusPatches.set(gp.id, 'posted');
              processedIds.add(gp.id);
            });
          } catch {
            groupPosts.forEach((gp) => {
              statusPatches.set(gp.id, 'failed');
              processedIds.add(gp.id);
            });
          }
          continue;
        }

        // ── Single-image branch (existing behaviour) ─────────────
        const image = savedImages.find((img) => img.id === post.imageId);
        if (!image) {
          statusPatches.set(post.id, 'failed');
          continue;
        }

        try {
          const res = await fetch('/api/social/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: post.caption,
              platforms: post.platforms,
              mediaUrl: image.url,
              mediaBase64: image.base64,
              credentials,
            }),
          });

          let data: { error?: string };
          try { data = await res.json() as { error?: string }; }
          catch { throw new Error(`Server error (HTTP ${res.status})`); }
          if (!res.ok) throw new Error(data.error || 'Failed to post');

          statusPatches.set(post.id, 'posted');
        } catch {
          statusPatches.set(post.id, 'failed');
        }
      }

      if (statusPatches.size > 0) {
        updateSettings((prev) => ({
          scheduledPosts: (prev.scheduledPosts || []).map((p) =>
            statusPatches.has(p.id) ? { ...p, status: statusPatches.get(p.id)! } : p
          ),
        }));
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [settings.scheduledPosts, settings.apiKeys, savedImages, updateSettings]);

  const allTags = useMemo(
    () => Array.from(new Set(savedImages.flatMap(img => img.tags || []))).sort(),
    [savedImages],
  );

  const displayedImages = useMemo(() => (view === 'studio' ? images : savedImages)
    .filter(img => {
      const matchesSearch = img.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           img.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesModel = filterModel === 'all' || img.modelInfo?.modelId === filterModel;
      const matchesUniverse = filterUniverse === 'all' || img.universe === filterUniverse;
      const matchesCollection = selectedCollectionId === 'all' || img.collectionId === selectedCollectionId;

      const matchesTag = !tagQuery.trim() || (() => {
        const query = tagQuery.toLowerCase();
        const orParts = query.split(/\s+or\s+|,/i);
        return orParts.some(part => {
          const andParts = part.trim().split(/\s+and\s+|;/i);
          return andParts.every(term => {
            term = term.trim();
            if (term.startsWith('not ') || term.startsWith('-')) {
              const excluded = term.replace(/^not\s+|-/, '').trim();
              return !img.tags?.some(t => t.toLowerCase() === excluded);
            } else {
              return img.tags?.some(t => t.toLowerCase() === term);
            }
          });
        });
      })();

      return matchesSearch && matchesModel && matchesUniverse && matchesCollection && matchesTag;
    })
    .sort((a, b) => {
      const timeA = a.savedAt || 0;
      const timeB = b.savedAt || 0;
      return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
    }),
    [view, images, savedImages, searchQuery, filterModel, filterUniverse, selectedCollectionId, tagQuery, sortBy],
  );

  const postReadyImages = useMemo(
    () => savedImages.filter((i) => i.isPostReady === true),
    [savedImages],
  );

  const galleryStats = useMemo(() => {
    let tagged = 0;
    let captioned = 0;
    for (const img of savedImages) {
      if (img.tags && img.tags.length > 0) tagged++;
      if (img.postCaption) captioned++;
    }
    return { total: savedImages.length, tagged, captioned };
  }, [savedImages]);

  const handlePushToCompare = (prompt: string, options: GenerateOptions) => {
    setComparisonPrompt(prompt);
    setComparisonOptions(options);
    setView('compare');
  };

  const handleCompare = async () => {
    if (comparisonModels.length < 2) {
      showToast('Please select at least 2 models to compare.', 'error');
      return;
    }
    if (!comparisonPrompt.trim()) {
      showToast('Please enter a prompt for comparison.', 'error');
      return;
    }

    setIsComparing(true);
    try {
      await generateComparison(comparisonPrompt, comparisonModels, comparisonOptions, modelPreviews);
    } catch {
      // generateComparison already surfaces error via setComparisonError
    } finally {
      setIsComparing(false);
    }
  };

  const handleAnimate = async (img: GeneratedImage, isBatch: boolean = false) => {
    if (!img.imageId) {
      if (!isBatch) showToast('Only images generated with Leonardo.AI can be animated currently.', 'error');
      return;
    }
    
    setImageStatus(img.id, 'animating');
    
    try {
      let duration = settings.defaultAnimationDuration || 5;
      let style = settings.defaultAnimationStyle || 'Standard';

      // Dynamically determine best duration and style
      try {
        const dynamicText = await streamAIToString(
          `Analyze this image prompt: "${img.prompt}".
        Determine the best video animation duration (3, 5, or 10 seconds) and the best animation style (Standard, Cinematic, Dynamic, Slow Motion, Fast Motion).
        - Use 3 or 5 seconds for simple actions or portraits.
        - Use 10 seconds for complex scenes, epic landscapes, or slow-motion.
        - Choose a style that fits the mood (e.g., Cinematic for epic scenes, Dynamic for action, Slow Motion for dramatic moments).
        Return ONLY a JSON object with keys "duration" (number) and "style" (string).`,
          { mode: 'generate' }
        );
        const dynamicSettings = extractJsonObjectFromLLM(dynamicText);
        const rawDuration = dynamicSettings.duration;
        if (rawDuration === 3 || rawDuration === 5 || rawDuration === 10) {
          duration = rawDuration;
        }
        const rawStyle = dynamicSettings.style;
        if (typeof rawStyle === 'string' && rawStyle.length > 0) {
          style = rawStyle;
        }

        // Update settings in UI to reflect the dynamically chosen values
        updateSettings({
          defaultAnimationDuration: duration as 3 | 5 | 10,
          defaultAnimationStyle: style
        });
      } catch {
        // parse failure — use settings defaults for duration/style
      }

      let videoPrompt = style === 'Standard' ? img.prompt : `${img.prompt}. Motion style: ${style}`;
      try {
        const enhanced = await streamAIToString(
          `The user wants to animate an image based on this prompt: "${img.prompt}". Enhance this prompt for a video animation. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers for Star Wars, Marvel, DC, and Warhammer 40k. Motion style: ${style}. Return ONLY the enhanced animation prompt as a single string.`,
          { mode: 'enhance' }
        );
        if (enhanced.trim()) videoPrompt = enhanced.trim();
      } catch {
        // enhancement failed — proceed with original videoPrompt
      }

      const res = await fetch('/api/leonardo-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          imageId: img.imageId,
          duration: duration,
          model: settings.defaultVideoModel || 'ray-v2',
          apiKey: settings.apiKeys.leonardo
        })
      });

      if (!res.ok) {
        let errMessage = 'Failed to animate image';
        try {
          const err = await res.json() as { error?: string };
          errMessage = err.error || errMessage;
        } catch (e) {
          const text = await res.text();
          errMessage = `Server error (${res.status}): ${text.slice(0, 100)}...`;
        }
        throw new Error(errMessage);
      }

      const data = await res.json() as { generationId?: string };

      if (data.generationId) {
        let status = 'PENDING';
        let attempts = 0;
        let videoUrl = '';
        
        while (status !== 'COMPLETE' && attempts < 60) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
          const statusRes = await fetch(`/api/leonardo/${data.generationId}`);
          if (!statusRes.ok) {
            const errText = await statusRes.text();
            throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
          }
          const statusData = await statusRes.json() as { status?: string; url?: string; error?: string };
          status = statusData.status ?? 'PENDING';
          if (status === 'COMPLETE') {
            videoUrl = statusData.url ?? '';
          } else if (status === 'FAILED') {
            throw new Error(statusData.error || 'Leonardo video generation failed');
          }
        }
        
        if (status !== 'COMPLETE') {
          throw new Error('Timeout waiting for Leonardo video generation');
        }
        
        if (videoUrl) {
          let finalVideoUrl = videoUrl;
          // Watermark logic for video could be added here if supported by a backend service, 
          // but since we can't easily overlay video watermarks in browser without ffmpeg,
          // we will handle it via CSS overlay in the UI.

          const ensureTags = async (prompt: string, existingTags?: string[]) => {
            if (existingTags && existingTags.length > 0) return existingTags;
            try {
              const text = await streamAIToString(
                `Analyze this image prompt: "${prompt}". Generate 5-8 fitting tags (universe, character, style, theme). Return ONLY a JSON array of strings.`,
                { mode: 'tag' }
              );
              const parsed = extractJsonArrayFromLLM(text);
              const strTags = parsed.filter((t): t is string => typeof t === 'string');
              return strTags.length > 0 ? strTags : ['Mashup'];
            } catch {
              return ['Mashup'];
            }
          };

          const generatedTags = await ensureTags(videoPrompt, img.tags);

          const newImg: GeneratedImage = {
            id: `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: finalVideoUrl,
            prompt: `Animated: ${img.prompt}`,
            tags: generatedTags,
            savedAt: Date.now(),
            isVideo: true,
            modelInfo: {
              provider: 'leonardo',
              modelId: settings.defaultVideoModel || 'ray-v2',
              modelName: settings.defaultVideoModel === 'kling-video-o-3' ? 'Kling O3 Omni' : settings.defaultVideoModel === 'kling-3.0' ? 'Kling 3.0' : settings.defaultVideoModel === 'ray-v2' ? 'Ray V2' : 'Ray V1'
            }
          };
          saveImage(newImg);
          if (!isBatch) showToast('Video generated and saved to gallery!', 'success');
        }
      }
    } catch (e: unknown) {
      if (!isBatch) showToast(`Animation failed: ${getErrorMessage(e)}`, 'error');
    } finally {
      setImageStatus(img.id, 'ready');
    }
  };

  const handleBatchAnimate = async () => {
    const imagesToAnimate = savedImages.filter(img => selectedForBatch.has(img.id) && img.imageId && !img.isVideo);
    if (imagesToAnimate.length === 0) {
      showToast('No valid Leonardo images selected for animation.', 'error');
      return;
    }
    setSelectedForBatch(new Set());
    await Promise.allSettled(imagesToAnimate.map(img => handleAnimate(img, true)));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <header className="h-16 glass-panel header-line relative flex items-center justify-between px-4 md:px-6 shrink-0 z-10">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-[#00e6ff]/15 border border-[#00e6ff]/25 hidden sm:flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#00e6ff]" />
          </div>
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-white truncate max-w-[120px] sm:max-w-none">Mashup Studio</h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <div className="relative hidden md:block">
            <div className="flex bg-zinc-900/60 rounded-xl p-1 border border-[#c5a062]/15 overflow-x-auto hide-scrollbar snap-x">
              {['ideas', 'compare', 'gallery', 'captioning', 'post-ready', 'pipeline'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v as ViewType)}
                  className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 shrink-0 snap-start z-10 ${view === v ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {view === v && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-[#00e6ff]/10 border border-[#00e6ff]/20 rounded-lg"
                      transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {v === 'ideas' && <Lightbulb className="w-4 h-4 hidden sm:block" />}
                    {v === 'compare' && <Sparkles className="w-4 h-4 hidden sm:block" />}
                    {v === 'gallery' && <LayoutGrid className="w-4 h-4 hidden sm:block" />}
                    {v === 'captioning' && <Edit3 className="w-4 h-4 hidden sm:block" />}
                    {v === 'post-ready' && <Save className="w-4 h-4 hidden sm:block" />}
                    {v === 'pipeline' && <Zap className="w-4 h-4 hidden sm:block" />}
                    {v === 'compare'
                      ? 'Studio'
                      : v.charAt(0).toUpperCase() + v.slice(1).replace('-', ' ')}
                  </span>
                </button>
              ))}
            </div>
            {/* Scroll affordance — fades right edge when tabs overflow at tablet width */}
            <div className="pointer-events-none absolute right-0 inset-y-0 w-8 rounded-r-xl bg-gradient-to-l from-[#050505] to-transparent" />
          </div>

          <button
            onClick={logout}
            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {!hasApiKey && (
            <button
              onClick={checkApiKey}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-lg font-medium text-xs border border-amber-500/20 transition-all animate-pulse shrink-0"
            >
              <Tag className="w-3 h-3" />
              Select API Key
            </button>
          )}

          {view === 'compare' && (
            <button
              onClick={handleCompare}
              disabled={isComparing || comparisonModels.length < 2 || !comparisonPrompt.trim()}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-[#00e6ff] hover:bg-[#33eaff] text-[#050505] disabled:opacity-50 disabled:hover:bg-[#00e6ff] rounded-xl font-semibold text-sm transition-all duration-200 shadow-[0_0_16px_rgba(0,230,255,0.2)] hover:shadow-[0_0_24px_rgba(0,230,255,0.35)] shrink-0"
            >
              {isComparing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <Columns className="w-4 h-4" />
                  Compare Models
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Mobile bottom nav — replaces the header tab bar below md */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#050505]/95 backdrop-blur-xl border-t border-[#c5a062]/20 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="flex justify-around items-stretch px-1 py-1">
          {([
            { key: 'ideas', icon: Lightbulb, label: 'Ideas' },
            { key: 'compare', icon: Sparkles, label: 'Studio' },
            { key: 'gallery', icon: LayoutGrid, label: 'Gallery' },
            { key: 'captioning', icon: Edit3, label: 'Caption' },
            { key: 'post-ready', icon: Save, label: 'Post' },
            { key: 'pipeline', icon: Zap, label: 'Pipeline' },
          ] as const).map(({ key, icon: Icon, label }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] min-w-[44px] rounded-lg transition-all duration-200 ${
                  active ? 'text-[#00e6ff] bg-[#00e6ff]/8' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {view === 'gallery' && (
                <div className="mb-6 space-y-4">
                  {/* Section header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="icon-box-blue">
                        <Bookmark className="w-5 h-5 text-[#00e6ff]" />
                      </div>
                      <div>
                        <h2 className="type-title">Gallery</h2>
                        <p className="type-muted">{galleryStats.total} saved images</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>{galleryStats.total} images</span>
                      <span className="text-zinc-700">·</span>
                      <span>{galleryStats.tagged} tagged</span>
                      <span className="text-zinc-700">·</span>
                      <span>{galleryStats.captioned} captioned</span>
                      <span className="text-zinc-700">·</span>
                      <span>{postReadyImages.length} post-ready</span>
                    </div>
                  </div>

                  {/* Filter card */}
                  <div className="flex flex-col gap-4 card p-4 md:p-5">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                      <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search by prompt or tags..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#00e6ff]/20 focus:border-[#00e6ff]/35 transition-all duration-200"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {selectedForBatch.size > 0 && (
                          <>
                            <span className="px-2 py-1 text-[11px] font-medium bg-[#00e6ff]/15 text-[#00e6ff] rounded-full border border-[#00e6ff]/30">
                              {selectedForBatch.size} selected
                            </span>
                            <button
                              onClick={handleBatchAnimate}
                              className="btn-blue-sm py-2"
                            >
                              <Video className="w-3.5 h-3.5" />
                              Batch Animate
                            </button>
                            <button
                              onClick={() => setShowBulkTagModal(true)}
                              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
                            >
                              <Tag className="w-3.5 h-3.5" />
                              Bulk Tag
                            </button>
                          </>
                        )}
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-zinc-500" />
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                            className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                          >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Model pills */}
                    <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800/60">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider self-center mr-1">
                        Model
                      </span>
                      <button
                        onClick={() => setFilterModel('all')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                          filterModel === 'all'
                            ? 'bg-[#00e6ff]/15 text-[#00e6ff] border border-[#00e6ff]/30'
                            : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800/60'
                        }`}
                      >
                        All
                      </button>
                      {LEONARDO_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setFilterModel(m.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                            filterModel === m.id
                              ? 'bg-[#00e6ff]/15 text-[#00e6ff] border border-[#00e6ff]/30'
                              : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800/60'
                          }`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>

                    {/* Universe + Collection + Tag query */}
                    <div className="flex flex-wrap gap-3 pt-3 border-t border-zinc-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Universe</span>
                        <select
                          value={filterUniverse}
                          onChange={(e) => setFilterUniverse(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                        >
                          <option value="all">All Universes</option>
                          <option value="Marvel">Marvel</option>
                          <option value="DC">DC</option>
                          <option value="Star Wars">Star Wars</option>
                          <option value="Warhammer 40k">Warhammer 40k</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Collection</span>
                        <select
                          value={selectedCollectionId}
                          onChange={(e) => setSelectedCollectionId(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                        >
                          <option value="all">All Collections</option>
                          {collections.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Tags</span>
                        <div className="relative flex-1">
                          <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="e.g. Marvel OR DC; NOT Grimdark"
                            value={tagQuery}
                            onChange={(e) => setTagQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 transition-colors"
                          />
                        </div>
                        {tagQuery && (
                          <button
                            onClick={() => setTagQuery('')}
                            className="p-1 text-zinc-500 hover:text-white"
                            aria-label="Clear search query"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {view === 'ideas' && (
                <div className="space-y-6 h-full flex flex-col">
                  {/* Section header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="icon-box-gold">
                        <Lightbulb className="w-5 h-5 text-[#c5a062]" />
                      </div>
                      <div>
                        <h2 className="type-title">Ideas Board</h2>
                        <p className="type-muted">Review, approve, and push brainstormed ideas to the Studio</p>
                      </div>
                    </div>
                    <button
                      onClick={clearIdeas}
                      className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-xl font-medium transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  </div>

                  {/* Kanban columns */}
                  <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-[500px]">
                    {(['idea', 'in-work', 'done'] as const).map((status) => {
                      const statusCfg = {
                        'idea': {
                          icon: Lightbulb,
                          label: 'Idea',
                          iconColor: 'text-amber-400',
                          iconBg: 'bg-amber-600/20 border-amber-500/30',
                          hoverBorder: 'hover:border-amber-500/30',
                        },
                        'in-work': {
                          icon: Zap,
                          label: 'In Work',
                          iconColor: 'text-emerald-400',
                          iconBg: 'bg-emerald-600/20 border-emerald-500/30',
                          hoverBorder: 'hover:border-emerald-500/30',
                        },
                        'done': {
                          icon: CheckCircle2,
                          label: 'Done',
                          iconColor: 'text-zinc-300',
                          iconBg: 'bg-zinc-800/80 border-zinc-700/60',
                          hoverBorder: 'hover:border-zinc-500/30',
                        },
                      }[status];
                      const StatusIcon = statusCfg.icon;
                      return (
                        <div
                          key={status}
                          className="flex-1 card p-4 flex flex-col gap-4"
                          onDragOver={(e) => {
                            e.preventDefault();
                            // STORY-132: explicit move effect — without
                            // this Chromium shows a no-entry cursor and
                            // refuses the drop even with a handler bound.
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            // STORY-132 followup: WebView2 and some sandboxed
                            // Chromium contexts strip non-MIME type keys on
                            // drop, so getData('ideaId') returned empty even
                            // when dragstart set it. Read 'text/plain' with a
                            // prefix and fall back to the legacy key for any
                            // cached old build still in someone's DOM.
                            const raw =
                              e.dataTransfer.getData('text/plain') ||
                              e.dataTransfer.getData('ideaId');
                            const ideaId = raw.startsWith('idea:') ? raw.slice(5) : raw;
                            if (ideaId) updateIdeaStatus(ideaId, status);
                          }}
                        >
                          <h3 className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center ${statusCfg.iconBg}`}>
                                <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.iconColor}`} />
                              </span>
                              <span className="text-sm font-semibold text-white">{statusCfg.label}</span>
                            </span>
                            <span className="bg-zinc-800/80 text-zinc-400 rounded-full px-2 py-0.5 text-[10px]">
                              {ideas.filter((i) => i.status === status).length}
                            </span>
                          </h3>
                          <div className="flex flex-col gap-3 overflow-y-auto hide-scrollbar flex-1">
                            {ideas.filter((i) => i.status === status).length === 0 && (
                              <div className="flex-1 flex flex-col items-center justify-center py-10 border-2 border-dashed border-zinc-800/60 rounded-xl text-zinc-600 text-xs gap-2 select-none">
                                <StatusIcon className={`w-6 h-6 ${statusCfg.iconColor} opacity-30`} />
                                {status === 'idea' ? 'No ideas yet — generate some in the sidebar' : `Drag cards here`}
                              </div>
                            )}
                            {ideas.filter((i) => i.status === status).map((idea) => (
                              <div
                                key={idea.id}
                                draggable
                                onDragStart={(e) => {
                                  // STORY-132 followup: use 'text/plain' with
                                  // a prefix so WebView2 doesn't strip the
                                  // payload on drop. Keep the legacy key for
                                  // one release as a belt-and-suspenders.
                                  e.dataTransfer.setData('text/plain', `idea:${idea.id}`);
                                  e.dataTransfer.setData('ideaId', idea.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                className={`card p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${statusCfg.hoverBorder}`}
                              >
                                {idea.context && <h4 className="text-sm font-bold text-amber-400">{idea.context}</h4>}
                                <p className="text-xs text-zinc-300 line-clamp-4">{idea.concept}</p>
                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#c5a062]/15">
                                  <span className="text-[10px] text-zinc-500">
                                    {new Date(idea.createdAt).toLocaleDateString()}
                                  </span>
                                  <div className="flex gap-1">
                                    {status === 'idea' && (
                                      <button
                                        onClick={() => updateIdeaStatus(idea.id, 'in-work')}
                                        className="btn-blue-sm text-[10px] py-1 px-2 rounded-lg"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    {status === 'in-work' && (
                                      <>
                                        <button
                                          onClick={() => handlePushIdeaToCompare(idea.concept)}
                                          disabled={isPushing}
                                          className="btn-blue-sm text-[10px] py-1 px-2 rounded-lg gap-1"
                                        >
                                          {isPushing ? <Loader2 className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                                          To Studio
                                        </button>
                                        <button
                                          onClick={() => updateIdeaStatus(idea.id, 'done')}
                                          className="btn-blue-sm text-[10px] py-1 px-2 rounded-lg"
                                        >
                                          Done
                                        </button>
                                      </>
                                    )}
                                    <button
                                      onClick={() => deleteIdea(idea.id)}
                                      className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-1 rounded-lg"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {view === 'compare' && (
                <div className="space-y-8">
                  {/* Section header */}
                  <div className="flex items-center gap-3">
                    <div className="icon-box-blue">
                      <Sparkles className="w-5 h-5 text-[#00e6ff]" />
                    </div>
                    <div>
                      <h2 className="type-title">Mashup Studio</h2>
                      <p className="type-muted">Generate images with different AI models and artistic styles</p>
                    </div>
                  </div>

                  <div className="card p-6 space-y-6">
                    <div className="flex flex-wrap justify-end gap-2">
                        <select
                          className="text-xs bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 max-w-[150px]"
                          onChange={(e) => {
                            if (e.target.value) {
                              setComparisonPrompt(e.target.value);
                              e.target.value = ''; // Reset selection
                            }
                          }}
                        >
                          <option value="">Suggestions...</option>
                          {PREDEFINED_PROMPTS.map((p, i) => (
                            <option key={i} value={p}>{p.substring(0, 30)}...</option>
                          ))}
                        </select>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Select Models</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {LEONARDO_MODELS.map(model => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setComparisonModels(prev => 
                                  prev.includes(model.id) 
                                    ? prev.filter(id => id !== model.id)
                                    : [...prev, model.id]
                                );
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left flex items-center justify-between ${
                                comparisonModels.includes(model.id)
                                  ? 'bg-[#c5a062]/15 border-[#c5a062] text-[#c5a062]'
                                  : 'bg-zinc-900 border-zinc-800/60 text-zinc-400 hover:border-[#c5a062]/40'
                              }`}
                            >
                              <span className="truncate mr-2">{model.name}</span>
                              {comparisonModels.includes(model.id) && <BookmarkCheck className="w-3 h-3 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-[#00e6ff] flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Image Prompt
                        </label>
                        <textarea
                          value={comparisonPrompt}
                          onChange={(e) => setComparisonPrompt(e.target.value)}
                          placeholder="Enter a prompt to compare across models..."
                          rows={10}
                          className="w-full bg-zinc-900/60 border border-[#00e6ff]/20 rounded-xl p-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00e6ff]/20 focus:border-[#00e6ff]/35 min-h-[240px] resize-y shadow-inner shadow-[rgba(0,230,255,0.04)] transition-all duration-200"
                        />
                      </div>

                      {/* AI-Optimized Parameters — read-only per-model indicators.
                          pi pre-computes optimal params per model via
                          lib/modelOptimizer whenever the prompt changes.
                          During generation the same optimizer runs again
                          so these pills accurately preview what will be sent. */}
                      <div className="bg-zinc-900/50 border border-[#c5a062]/15 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <Sparkles className="w-3 h-3" />
                          <span className="uppercase tracking-wider font-medium">AI-Optimized Parameters</span>
                          <span className="text-[10px] text-zinc-600">— pi auto-tunes per model</span>
                        </div>
                        {comparisonModels.length > 0 ? (
                          <div className="space-y-2">
                            {comparisonModels.map((modelId) => {
                              const model = LEONARDO_MODELS.find(
                                (m) => m.id === modelId || m.apiModelId === modelId
                              );
                              const preview = modelPreviews[modelId];
                              const fallbackRatio = model?.aspectRatios?.[0]?.label || '1:1';
                              return (
                                <div key={modelId} className="flex flex-col gap-1">
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    {model?.name || modelId}
                                  </span>
                                  {preview && (
                                    <details className="mt-2 text-xs border border-zinc-800/60 rounded-lg overflow-hidden">
                                      <summary className="px-3 py-2 cursor-pointer hover:bg-zinc-800/50 flex items-center gap-2 text-zinc-400">
                                        <span className="text-indigo-400">AI Optimized</span>
                                        <span className="text-zinc-600">|</span>
                                        <span>{preview.style || 'Auto'}</span>
                                        <span className="text-zinc-600">|</span>
                                        <span>{preview.aspectRatio || fallbackRatio}</span>
                                        {preview.negativePrompt && (
                                          <>
                                            <span className="text-zinc-600">|</span>
                                            <span className="text-red-400/70">Negative: yes</span>
                                          </>
                                        )}
                                      </summary>
                                      <div className="px-3 py-2 space-y-2 border-t border-zinc-800 bg-zinc-900/30">
                                        {preview.prompt && (
                                          <div>
                                            <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Enhanced Prompt</span>
                                            <p className="text-zinc-300 mt-0.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">{preview.prompt}</p>
                                          </div>
                                        )}
                                        {preview.style && (
                                          <div>
                                            <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Style</span>
                                            <p className="text-zinc-300 mt-0.5">{preview.style}</p>
                                          </div>
                                        )}
                                        {preview.aspectRatio && (
                                          <div>
                                            <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Aspect Ratio</span>
                                            <p className="text-zinc-300 mt-0.5">{preview.aspectRatio}</p>
                                          </div>
                                        )}
                                        {preview.negativePrompt && (
                                          <div>
                                            <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Negative Prompt</span>
                                            <p className="text-zinc-300 mt-0.5">{preview.negativePrompt}</p>
                                          </div>
                                        )}
                                      </div>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-zinc-600">
                            Select at least 2 models above to see per-model parameters
                          </p>
                        )}
                      </div>

                      <button
                        onClick={handleCompare}
                        disabled={isComparing || comparisonModels.length < 2 || !comparisonPrompt.trim()}
                        className="btn-cta shadow-[0_0_28px_rgba(0,230,255,0.22)]"
                      >
                        {isComparing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Generate {comparisonModels.length} Images
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {comparisonResults.length > 0 && view === 'compare' && (
                    <div className="space-y-12">
                      <div className="flex justify-end">
                        <button
                          onClick={clearComparison}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Clear Comparison History
                        </button>
                      </div>
                      {Object.entries(
                        comparisonResults.reduce((acc, img) => {
                          const id = img.comparisonId || 'default';
                          if (!acc[id]) acc[id] = [];
                          acc[id].push(img);
                          return acc;
                        }, {} as Record<string, GeneratedImage[]>)
                      ).map(([compId, group]) => (
                        <div key={compId} className="space-y-4">
                          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2 min-w-0">
                                <Columns className="w-4 h-4 shrink-0" />
                                <span className="truncate">Comparison: {group[0]?.prompt.slice(0, 50)}...</span>
                              </h3>
                              <button
                                onClick={() => {
                                  group.forEach(img => deleteComparisonResult(img.id));
                                }}
                                className="shrink-0 text-[10px] text-zinc-600 hover:text-red-400 transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete Group
                              </button>
                            </div>
                            <span className="shrink-0 text-[10px] text-zinc-500 uppercase tracking-widest">
                              {new Date(parseInt(compId.split('-')[2]) || Date.now()).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            {group.map((img) => (
                              <motion.div
                                key={img.id}
                                whileHover={{ scale: 1.02, y: -4, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                                className={`group relative bg-zinc-900 rounded-2xl overflow-hidden border transition-all duration-300 ${img.winner ? 'border-green-500 ring-2 ring-green-500/20' : 'border-zinc-800 shadow-xl'}`}
                              >
                                <div className="absolute top-0 left-0 right-0 z-20 bg-black/60 backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-white/10">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                      {img.modelInfo?.modelName || 'Model'}
                                    </span>
                                    {img.winner && (
                                      <span className="bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">Winner</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest">
                                      {img.modelInfo?.provider || 'Provider'}
                                    </span>
                                    <button
                                      onClick={() => deleteComparisonResult(img.id)}
                                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                      title="Delete Result"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <div
                                  className="aspect-square relative overflow-hidden bg-zinc-950 cursor-pointer"
                                  onClick={() => { if (img.status !== 'generating') setSelectedImage(img); }}
                                >
                                  {img.status === 'generating' ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/50 backdrop-blur-sm">
                                      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                      <span className="text-xs text-zinc-400 font-medium">Generating...</span>
                                    </div>
                                  ) : (
                                    <>
                                      <Image
                                        src={img.url || `data:image/jpeg;base64,${img.base64}`}
                                        alt={img.prompt}
                                        fill
                                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 pointer-events-none">
                                        <div className="flex gap-3 pointer-events-auto">
                                          <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={(e) => { e.stopPropagation(); pickComparisonWinner(img.id); }}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${img.winner ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-[#00e6ff] hover:bg-[#33eaff] active:bg-[#00b8cc] text-[#050505]'}`}
                                          >
                                            {img.winner ? <CheckCircle2 className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                            {img.winner ? 'Picked' : 'Keep this version'}
                                          </motion.button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'studio' && isGenerating && progress && (
                <div className="mb-8 flex items-center justify-center gap-3 text-indigo-400 bg-indigo-500/10 py-3 px-4 rounded-xl border border-indigo-500/20">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium text-sm">{progress}</span>
                </div>
              )}

              {view === 'captioning' && (() => {
                // Source of truth: savedImages (persisted). Captioning is a
                // curated workflow — ephemeral gallery images shouldn't
                // pollute this tab. Images promoted to Post Ready are
                // excluded so the two tabs form a clean pipeline.
                const all = savedImages.filter((i) => !i.isPostReady && i.approved);
                const captioned = all.filter((i) => !!i.postCaption);
                const uncaptioned = all.filter((i) => !i.postCaption);
                const visible =
                  captioningFilter === 'captioned'
                    ? captioned
                    : captioningFilter === 'uncaptioned'
                      ? uncaptioned
                      : all;

                return (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="icon-box-blue">
                          <Edit3 className="w-5 h-5 text-[#00e6ff]" />
                        </div>
                        <div>
                        <h2 className="type-title">Captioning Studio</h2>
                        <p className="text-xs text-zinc-500 mt-1">
                          {captioned.length} / {all.length} captioned
                          {batchProgress && (
                            <span className="ml-3 text-[#00e6ff]">
                              Batch: {batchProgress.done}/{batchProgress.total}
                            </span>
                          )}
                        </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Filter tabs */}
                        <div className="flex bg-zinc-900 border border-zinc-800/60 rounded-full p-0.5">
                          {(['all', 'captioned', 'uncaptioned'] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setCaptioningFilter(f)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                captioningFilter === f
                                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              {f === 'all' ? 'All' : f === 'captioned' ? 'Captioned' : 'Uncaptioned'}
                            </button>
                          ))}
                        </div>

                        {/* Group Similar toggle */}
                        <button
                          onClick={() => {
                            setCaptioningGrouped(!captioningGrouped);
                            // Leaving grouped mode clears any stale selection.
                            if (captioningGrouped) setCaptioningSelected(new Set());
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 border ${
                            captioningGrouped
                              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          {captioningGrouped ? 'Grouped' : 'Group Similar'}
                        </button>

                        {/* Create Carousel — always visible in grouped mode.
                            Opens the multi-source picker so the user can
                            pick any combination of images. */}
                        {captioningGrouped && (
                          <button
                            onClick={() => openCarouselPicker(null)}
                            className="btn-blue-sm rounded-full"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Create Carousel
                          </button>
                        )}

                        {/* Manual "Group Selected" — only when grouping toggle is off
                            and the user has picked 2+ images with checkboxes. */}
                        {!captioningGrouped && captioningSelected.size >= 2 && (
                          <button
                            onClick={() => {
                              const ids = Array.from(captioningSelected);
                              persistCarouselGroup(`manual-${ids[0]}`, ids);
                              setCaptioningSelected(new Set());
                              setCaptioningGrouped(true);
                            }}
                            className="btn-blue-sm rounded-full"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Group Selected ({captioningSelected.size})
                          </button>
                        )}

                        <button
                          onClick={() => batchCaptionImages(visible)}
                          disabled={batchCaptioning || uncaptioned.length === 0}
                          className="btn-blue-sm rounded-full"
                        >
                          {batchCaptioning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                          Batch Caption
                        </button>
                      </div>
                    </div>

                    {/* Empty state */}
                    {all.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
                        <ImageIcon className="w-10 h-10 text-zinc-700" />
                        <p className="text-sm text-zinc-500">
                          No saved images yet. Save images from the gallery to start captioning.
                        </p>
                        <button
                          onClick={() => setView('gallery')}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
                        >
                          Go to Gallery
                        </button>
                      </div>
                    ) : visible.length === 0 ? (
                      <div className="py-12 text-center text-sm text-zinc-500">
                        No {captioningFilter} images in this view.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {(captioningGrouped ? computeCarouselView(visible) : visible.map((img) => ({ kind: 'single' as const, img }))).map((entry) => {
                          // ── Carousel card (captioning) ────────────────
                          if (entry.kind === 'carousel') {
                            const anchor = entry.images[0];
                            const isWorking = preparingPostId === anchor.id;
                            const isExplicit = !!entry.group;
                            return (
                              <div
                                key={`c-${entry.id}`}
                                className="card overflow-hidden flex flex-col"
                              >
                                {/* Image strip */}
                                <div className="relative bg-zinc-950 overflow-x-auto">
                                  <div className="flex gap-1 p-2" style={{ minHeight: 140 }}>
                                    {entry.images.map((ci) => (
                                      <div key={ci.id} className="relative shrink-0 group/ci">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={ci.url}
                                          alt={ci.prompt}
                                          loading="lazy"
                                          onClick={() => setSelectedImage(ci)}
                                          className="h-32 w-32 object-cover rounded-lg cursor-zoom-in"
                                        />
                                        {isExplicit && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeFromCarousel(entry.id, ci.id);
                                            }}
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/ci:opacity-100 transition-opacity"
                                            title="Remove from carousel"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 bg-[#00e6ff]/15 border border-[#00e6ff]/30 text-[10px] font-medium text-[#00e6ff] rounded-full">
                                    <LayoutGrid className="w-3 h-3" /> Carousel · {entry.images.length} images
                                  </span>
                                  {isExplicit && (
                                    <button
                                      onClick={() => openCarouselPicker(entry.id)}
                                      className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full flex items-center gap-1 transition-colors"
                                      title="Add more images to this carousel"
                                    >
                                      <Plus className="w-3 h-3" /> Add
                                    </button>
                                  )}
                                  {isWorking && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-xs text-white">
                                      <Loader2 className="w-4 h-4 animate-spin" /> Generating caption…
                                    </div>
                                  )}
                                </div>

                                {/* Shared caption body */}
                                <div className="flex-1 p-4 space-y-3">
                                  <p className="text-[11px] text-zinc-500 line-clamp-2" title={anchor.prompt}>
                                    {anchor.prompt}
                                  </p>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Shared caption
                                    </label>
                                    <AutoTextarea
                                      value={anchor.postCaption || ''}
                                      onChange={(e) => {
                                        // Fan edits to every image so Post Now
                                        // and Copy All pick up the same text.
                                        for (const ci of entry.images) {
                                          patchImage(ci, { postCaption: e.target.value });
                                        }
                                      }}
                                      placeholder="No caption yet…"
                                      minRows={2}
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-[#c5a062]/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  {(anchor.postHashtags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {(anchor.postHashtags ?? []).map((tag, i) => (
                                        <span
                                          key={`${tag}-${i}`}
                                          className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Footer actions */}
                                <div className="border-t border-[#c5a062]/15 p-3 flex items-center gap-2">
                                  <button
                                    disabled={isWorking || batchCaptioning}
                                    onClick={async () => {
                                      // Generate ONE caption using the anchor's
                                      // prompt, then fan it out to every image.
                                      setPreparingPostId(anchor.id);
                                      try {
                                        const withCaption = await generatePostContent(anchor);
                                        if (withCaption?.postCaption) {
                                          for (const ci of entry.images) {
                                            if (ci.id === anchor.id) continue;
                                            patchImage(ci, {
                                              postCaption: withCaption.postCaption,
                                              postHashtags: withCaption.postHashtags,
                                            });
                                          }
                                        }
                                      } finally {
                                        setPreparingPostId(null);
                                      }
                                    }}
                                    className="btn-blue-sm flex-1 justify-center"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {anchor.postCaption ? 'Regenerate' : 'Generate'}
                                  </button>
                                  <button
                                    disabled={!anchor.postCaption}
                                    onClick={() => {
                                      // Mark every image in the group as ready.
                                      for (const ci of entry.images) {
                                        patchImage(ci, { isPostReady: true });
                                      }
                                    }}
                                    className="btn-blue-sm justify-center"
                                    title="Mark all as ready to post"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  {isExplicit ? (
                                    <button
                                      onClick={() => separateCarousel(entry.id)}
                                      className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                      title="Ungroup"
                                    >
                                      <Columns className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => persistCarouselGroup(`manual-${anchor.id}`, entry.images.map((i) => i.id))}
                                      className="btn-blue-sm justify-center"
                                      title="Lock this auto-detected grouping"
                                    >
                                      <LayoutGrid className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          // ── Single-image card (original) ─────────────
                          const img = entry.img;
                          const isWorking = preparingPostId === img.id;
                          const isSelected = captioningSelected.has(img.id);
                          return (
                            <div
                              key={img.id}
                              className={`bg-zinc-900/80 backdrop-blur-sm border rounded-2xl overflow-hidden flex flex-col transition-all duration-200 ${
                                isSelected ? 'border-[#00e6ff]/50 shadow-[0_0_16px_rgba(0,230,255,0.08)]' : 'border-[#c5a062]/20 hover:border-[#c5a062]/40'
                              }`}
                            >
                              {/* Thumbnail */}
                              <div className="relative aspect-square bg-zinc-950">
                                {img.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img.url}
                                    alt={img.prompt}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-zinc-700" />
                                  </div>
                                )}
                                {isWorking && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-xs text-white">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating caption…
                                  </div>
                                )}
                                {/* Selection checkbox (manual grouping) —
                                    only shown when grouping toggle is OFF. */}
                                {!captioningGrouped && (
                                  <div className="absolute top-3 left-3 z-20">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const next = new Set(captioningSelected);
                                        if (e.target.checked) next.add(img.id);
                                        else next.delete(img.id);
                                        setCaptioningSelected(next);
                                      }}
                                      className="w-5 h-5 rounded border-zinc-600 bg-zinc-900/80 backdrop-blur-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-[#c5a062]"
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Body */}
                              <div className="flex-1 p-4 space-y-3">
                                <p className="text-[11px] text-zinc-500 line-clamp-2" title={img.prompt}>
                                  {img.prompt}
                                </p>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    Caption
                                  </label>
                                  <AutoTextarea
                                    value={img.postCaption || ''}
                                    onChange={(e) => patchImage(img, { postCaption: e.target.value })}
                                    placeholder="No caption yet…"
                                    minRows={2}
                                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-[#c5a062]/50 focus:outline-none transition-colors"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    Hashtags
                                  </label>
                                  {(img.postHashtags || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(img.postHashtags ?? []).map((tag, i) => (
                                        <span
                                          key={`${tag}-${i}`}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                                        >
                                          {tag}
                                          <button
                                            onClick={() => removeHashtag(img, i)}
                                            className="text-zinc-500 hover:text-red-400"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-zinc-600 italic">No hashtags.</p>
                                  )}
                                </div>
                              </div>

                              {/* Footer actions */}
                              <div className="border-t border-zinc-800 p-3 flex items-center gap-2">
                                <button
                                  disabled={isWorking || batchCaptioning}
                                  onClick={async () => {
                                    setPreparingPostId(img.id);
                                    try {
                                      await generatePostContent(img);
                                    } finally {
                                      setPreparingPostId(null);
                                    }
                                  }}
                                  className="btn-blue-sm flex-1 justify-center"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {img.postCaption ? 'Regenerate' : 'Generate'}
                                </button>
                                <button
                                  disabled={!img.postCaption}
                                  onClick={() => patchImage(img, { isPostReady: true })}
                                  className="btn-blue-sm justify-center"
                                  title="Mark as ready to post"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                {pendingRemoveId === img.id ? (
                                  <div className="flex gap-1" title="Remove from Captioning? Image stays in Gallery.">
                                    <button
                                      onClick={() => {
                                        patchImage(img, { postCaption: '', postHashtags: [], tags: [] });
                                        setPendingRemoveId(null);
                                      }}
                                      className="px-2 py-1.5 text-xs bg-red-600/90 hover:bg-red-500 text-white rounded-lg flex items-center gap-1 transition-colors"
                                      title="Confirm remove"
                                    >
                                      <Check className="w-3 h-3" /> Remove
                                    </button>
                                    <button
                                      onClick={() => setPendingRemoveId(null)}
                                      className="px-2 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setPendingRemoveId(img.id)}
                                    className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/80 text-red-400 hover:text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                    title="Remove from Captioning (image stays in Gallery)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })()}
              {view === 'post-ready' && (() => {
                const ready = postReadyImages;
                // Carousel-aware view used by Smart Schedule so grouped
                // posts consume one slot each instead of N individual slots.
                const postItems = computeCarouselView(ready);
                const available = availablePlatforms();

                const copyAllPosts = () => {
                  const formatted = ready.map(formatPost).join('\n\n---\n\n');
                  copyWithFeedback(formatted, '__all__');
                };

                const postAllNow = async () => {
                  for (const img of ready) {
                    const sel = getSelectedPlatforms(img.id);
                    if (sel.length > 0) {
                      // Sequential — each platform call can be slow and we
                      // want per-card status badges to update in order.
                      await postImageNow(img, sel);
                    }
                  }
                };

                const platformBadgeClass = (p: PostPlatform) => {
                  if (p === 'instagram') return 'bg-pink-600/90';
                  if (p === 'pinterest') return 'bg-red-600/90';
                  if (p === 'twitter') return 'bg-sky-600/90';
                  return 'bg-indigo-600/90';
                };

                return (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="icon-box-blue">
                          <Save className="w-5 h-5 text-[#00e6ff]" />
                        </div>
                        <div>
                          <h2 className="type-title">Post Ready</h2>
                          <p className="text-xs text-zinc-500 mt-1">
                            {ready.length} posts ready / {savedImages.length} total saved images
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Grid / Calendar view toggle */}
                        <div className="flex bg-zinc-900 border border-zinc-800/60 rounded-full p-0.5 mr-1">
                          <button
                            onClick={() => setPostReadyView('grid')}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                              postReadyView === 'grid'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Grid
                          </button>
                          <button
                            onClick={() => setPostReadyView('calendar')}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                              postReadyView === 'calendar'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            Calendar
                          </button>
                        </div>
                        <button
                          onClick={copyAllPosts}
                          disabled={ready.length === 0}
                          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          {copiedId === '__all__' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copy All
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => exportPostsAsJson(ready)}
                          disabled={ready.length === 0}
                          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <FileJson className="w-3.5 h-3.5" /> Export JSON
                        </button>
                        {/* Create Carousel — opens the lifted multi-source
                            picker. Source pool is every approved saved
                            image so users can mix Post-Ready and
                            Captioning-stage images into one carousel. */}
                        <button
                          onClick={() => openCarouselPicker(null)}
                          className="btn-blue-sm rounded-lg"
                          title="Group images into a single multi-image carousel post"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" /> Create Carousel
                        </button>
                        {/* Group Selected — quick-promote the checkboxed
                            single Post-Ready cards into a carousel group
                            without opening the picker. Mirrors the
                            captioning-tab manual flow. */}
                        {postReadySelected.size >= 2 && (
                          <button
                            onClick={() => {
                              const ids = Array.from(postReadySelected);
                              persistCarouselGroup(`manual-${ids[0]}`, ids);
                              setPostReadySelected(new Set());
                            }}
                            className="btn-blue-sm rounded-lg"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Group Selected ({postReadySelected.size})
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await smartScheduler.trigger(postItems.length);
                            setShowScheduleAll(true);
                          }}
                          disabled={ready.length === 0 || available.length === 0 || smartScheduler.loading}
                          aria-busy={smartScheduler.loading}
                          aria-label={smartScheduler.loading ? 'Analysing best posting times…' : 'Schedule with optimal posting times'}
                          className="btn-gold-sm rounded-lg"
                          title={smartScheduler.loading ? 'Analysing best posting times…' : 'Schedule with optimal posting times'}
                        >
                          {smartScheduler.loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <TrendingUp className="w-3.5 h-3.5" />
                          )}
                          {smartScheduler.loading ? 'Analysing…' : 'Smart Schedule'}
                        </button>
                        <button
                          onClick={postAllNow}
                          disabled={ready.length === 0 || available.length === 0}
                          className="btn-blue-sm rounded-lg"
                          title="Post every image to its selected platforms"
                        >
                          <Send className="w-3.5 h-3.5" /> Post All Now
                        </button>
                      </div>
                    </div>

                    {available.length === 0 && (
                      <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                        No social platform credentials configured. Add Instagram or Pinterest keys in Settings to enable posting.
                      </div>
                    )}

                    {/* Calendar view */}
                    {postReadyView === 'calendar' && (() => {
                      const scheduled = settings.scheduledPosts || [];
                      const imgById = new Map(savedImages.map((i) => [i.id, i]));
                      const today = startOfDay(new Date());

                      if (calendarMode === 'week') {
                        const weekStart = startOfWeek(calendarDate);
                        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
                        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        const rangeLabel = `${toYMD(weekStart)} → ${toYMD(addDays(weekStart, 6))}`;

                        return (
                          <div className="card overflow-hidden">
                            {/* Calendar header */}
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 border-b border-[#c5a062]/15">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setCalendarDate(addDays(calendarDate, -7))}
                                  className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                                >
                                  ‹
                                </button>
                                <button
                                  onClick={() => setCalendarDate(new Date())}
                                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                                >
                                  Today
                                </button>
                                <button
                                  onClick={() => setCalendarDate(addDays(calendarDate, 7))}
                                  className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                                >
                                  ›
                                </button>
                                <span className="ml-3 text-sm text-zinc-300">{rangeLabel}</span>
                              </div>
                              <div className="flex bg-zinc-900 border border-zinc-800/60 rounded-full p-0.5">
                                {(['week', 'month'] as const).map((m) => (
                                  <button
                                    key={m}
                                    onClick={() => setCalendarMode(m)}
                                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                      calendarMode === m
                                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                  >
                                    {m === 'week' ? 'Week' : 'Month'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Inline edit popover — rendered above the grid
                                whenever a post is selected. Click outside
                                (or the Close button) to dismiss. */}
                            {editingPostId && (() => {
                              const editing = scheduled.find((p) => p.id === editingPostId);
                              if (!editing) return null;
                              const editingImg = imgById.get(editing.imageId);
                              const togglePlatformInPost = (plat: string) => {
                                const next = editing.platforms.includes(plat)
                                  ? editing.platforms.filter((x) => x !== plat)
                                  : [...editing.platforms, plat];
                                updateSettings((prev) => ({
                                  scheduledPosts: (prev.scheduledPosts || []).map((sp) =>
                                    sp.id === editing.id ? { ...sp, platforms: next } : sp
                                  ),
                                }));
                              };
                              const patchField = (patch: Partial<ScheduledPost>) => {
                                updateSettings((prev) => ({
                                  scheduledPosts: (prev.scheduledPosts || []).map((sp) =>
                                    sp.id === editing.id ? { ...sp, ...patch } : sp
                                  ),
                                }));
                              };
                              return (
                                <div className="m-4 bg-zinc-950/90 backdrop-blur border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-emerald-400" />
                                      Edit scheduled post
                                    </h4>
                                    <button
                                      onClick={() => setEditingPostId(null)}
                                      className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                                      <input
                                        type="date"
                                        value={editing.date}
                                        onChange={(e) => patchField({ date: e.target.value })}
                                        className="w-full bg-zinc-900 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                      <TimePicker24
                                        value={editing.time}
                                        onChange={(v) => patchField({ time: v })}
                                        className="w-full bg-zinc-900 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Platforms</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(['instagram', 'pinterest', 'twitter', 'discord'] as PostPlatform[]).map((p) => {
                                        const checked = editing.platforms.includes(p);
                                        return (
                                          <button
                                            key={p}
                                            type="button"
                                            onClick={() => togglePlatformInPost(p)}
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
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Caption</label>
                                    <p className="text-xs text-zinc-300 bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-2 line-clamp-3">
                                      {editing.caption || '(no caption)'}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        if (editingImg) setSelectedImage(editingImg);
                                      }}
                                      disabled={!editingImg}
                                      className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-xl flex items-center gap-1.5"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" /> View Image
                                    </button>
                                    <button
                                      onClick={() => {
                                        updateSettings((prev) => ({
                                          scheduledPosts: (prev.scheduledPosts || []).filter((sp) => sp.id !== editing.id),
                                        }));
                                        setEditingPostId(null);
                                      }}
                                      className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-500 text-white rounded-xl flex items-center gap-1.5"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                    <div className="flex-1" />
                                    <button
                                      onClick={() => setEditingPostId(null)}
                                      className="btn-blue-sm"
                                    >
                                      <Check className="w-3.5 h-3.5" /> Done
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Week grid: 1 hour label column + 7 day columns */}
                            <div className="overflow-x-auto">
                              <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] border-b border-zinc-800/60 sticky top-0 bg-zinc-900/95 backdrop-blur">
                                <div />
                                {days.map((d, i) => {
                                  const isToday = toYMD(d) === toYMD(today);
                                  return (
                                    <div
                                      key={i}
                                      className={`px-3 py-2 text-center border-l border-zinc-800/60 ${
                                        isToday ? 'text-emerald-400' : 'text-zinc-400'
                                      }`}
                                    >
                                      <div className="text-[10px] font-bold uppercase tracking-wider">{dayNames[i]}</div>
                                      <div className="text-sm font-semibold">{d.getDate()}</div>
                                    </div>
                                  );
                                })}
                              </div>

                              {HOUR_LABELS.map((label, hour) => (
                                <div
                                  key={label}
                                  className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] border-b border-zinc-800/40"
                                >
                                  <div className="px-2 py-2 text-[10px] text-zinc-600 text-right font-mono">{label}</div>
                                  {days.map((d, i) => {
                                    const dateStr = toYMD(d);
                                    const postsAtSlot = scheduled.filter((p) => {
                                      if (p.date !== dateStr) return false;
                                      const [hh] = p.time.split(':').map(Number);
                                      return hh === hour;
                                    });
                                    const cellKey = `${dateStr}:${hour}`;
                                    const isDragOver = dragOverCell === cellKey;
                                    const isEmpty = postsAtSlot.length === 0;
                                    return (
                                      <div
                                        key={i}
                                        onClick={() => {
                                          if (isEmpty) {
                                            setCalendarSlotClick({
                                              date: dateStr,
                                              time: `${String(hour).padStart(2, '0')}:00`,
                                            });
                                          }
                                        }}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          if (dragOverCell !== cellKey) setDragOverCell(cellKey);
                                        }}
                                        onDragLeave={() => {
                                          if (dragOverCell === cellKey) setDragOverCell(null);
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          const postId = e.dataTransfer.getData('postId');
                                          setDragOverCell(null);
                                          setDragPostId(null);
                                          if (!postId) return;
                                          // Rewrite the post's date/time in
                                          // settings.scheduledPosts. Time is
                                          // pinned to HH:00 — finer resolution
                                          // needs the edit popover.
                                          const newTime = `${String(hour).padStart(2, '0')}:00`;
                                          updateSettings((prev) => ({
                                            scheduledPosts: (prev.scheduledPosts || []).map((sp) =>
                                              sp.id === postId ? { ...sp, date: dateStr, time: newTime } : sp
                                            ),
                                          }));
                                        }}
                                        className={`border-l border-zinc-800/60 min-h-[40px] p-1 space-y-1 transition-colors ${
                                          isDragOver
                                            ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5'
                                            : isEmpty
                                              ? 'cursor-pointer hover:bg-emerald-500/5'
                                              : ''
                                        }`}
                                      >
                                        {postsAtSlot.map((p) => {
                                          return (
                                            <button
                                              key={p.id}
                                              draggable
                                              onDragStart={(e) => {
                                                e.dataTransfer.setData('postId', p.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                                setDragPostId(p.id);
                                              }}
                                              onDragEnd={() => setDragPostId(null)}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingPostId((current) => (current === p.id ? null : p.id));
                                              }}
                                              className={`relative w-full text-left px-2 py-1 rounded-xl border text-[10px] truncate cursor-grab active:cursor-grabbing ${calendarColorFor(p.status)} ${
                                                dragPostId === p.id ? 'opacity-50' : ''
                                              }`}
                                              title={`${p.time} · ${p.platforms.join(', ')}\n${p.caption}`}
                                            >
                                              {p.time} · {p.platforms.join(',')}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // ── Month view ────────────────────────────────────
                      const firstOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
                      const firstOfNext = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
                      const gridStart = startOfWeek(firstOfMonth);
                      const totalCells = Math.ceil((firstOfNext.getTime() - gridStart.getTime()) / (24 * 3600 * 1000));
                      const weeks = Math.ceil(totalCells / 7);
                      const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
                      const monthLabel = calendarDate.toLocaleDateString(undefined, {
                        month: 'long',
                        year: 'numeric',
                      });
                      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                      return (
                        <div className="card overflow-hidden">
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 border-b border-[#c5a062]/15">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setCalendarDate(
                                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1)
                                  )
                                }
                                className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                              >
                                ‹
                              </button>
                              <button
                                onClick={() => setCalendarDate(new Date())}
                                className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                              >
                                Today
                              </button>
                              <button
                                onClick={() =>
                                  setCalendarDate(
                                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1)
                                  )
                                }
                                className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                              >
                                ›
                              </button>
                              <span className="ml-3 text-sm text-zinc-300">{monthLabel}</span>
                            </div>
                            <div className="flex bg-zinc-900 border border-zinc-800/60 rounded-full p-0.5">
                              {(['week', 'month'] as const).map((m) => (
                                <button
                                  key={m}
                                  onClick={() => setCalendarMode(m)}
                                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                    calendarMode === m
                                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                      : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  {m === 'week' ? 'Week' : 'Month'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-7 border-b border-zinc-800/60">
                            {dayNames.map((d) => (
                              <div key={d} className="px-2 py-2 text-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                {d}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7">
                            {cells.map((d, i) => {
                              const dateStr = toYMD(d);
                              const inMonth = d.getMonth() === calendarDate.getMonth();
                              const postsForDay = scheduled.filter((p) => p.date === dateStr);
                              const isToday = dateStr === toYMD(today);
                              // Group by status to colour the dots.
                              const hasPosted = postsForDay.some((p) => p.status === 'posted');
                              const hasScheduled = postsForDay.some((p) => p.status === 'scheduled' || !p.status);
                              const hasFailed = postsForDay.some((p) => p.status === 'failed');
                              return (
                                <div
                                  key={i}
                                  onClick={() => {
                                    setCalendarMode('week');
                                    setCalendarDate(d);
                                  }}
                                  className={`group/mc relative h-24 border-t border-l border-zinc-800/40 p-1.5 text-left cursor-pointer transition-colors ${
                                    inMonth ? 'bg-zinc-900/40 hover:bg-zinc-900' : 'bg-zinc-950 text-zinc-700'
                                  } ${(i + 1) % 7 === 0 ? 'border-r' : ''}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div
                                      className={`text-xs font-medium ${
                                        isToday ? 'text-emerald-400' : inMonth ? 'text-zinc-300' : 'text-zinc-700'
                                      }`}
                                    >
                                      {d.getDate()}
                                    </div>
                                    {inMonth && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCalendarSlotClick({ date: dateStr, time: '12:00' });
                                        }}
                                        className="opacity-0 group-hover/mc:opacity-100 w-5 h-5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-opacity"
                                        title="Schedule a post for this day"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {postsForDay.length > 0 && (
                                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                                      <div className="flex gap-0.5">
                                        {hasPosted && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                        {hasScheduled && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                                        {hasFailed && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                      </div>
                                      <span className="text-[10px] text-zinc-400">{postsForDay.length}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Click-to-schedule modal */}
                    {calendarSlotClick && (() => {
                      const slot = calendarSlotClick;
                      const selectedImageId =
                        slot.imageId || (postReadyImages.length === 1 ? postReadyImages[0].id : undefined);
                      const selectedImage = selectedImageId
                        ? savedImages.find((i) => i.id === selectedImageId)
                        : undefined;
                      const selectedPlatforms = slot.platforms || available;
                      const day = new Date(`${slot.date}T00:00:00`);
                      const dayLabel = day.toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      });

                      const createScheduledPost = () => {
                        if (!selectedImage || selectedPlatforms.length === 0) return;
                        const newPost: ScheduledPost = {
                          id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          imageId: selectedImage.id,
                          date: slot.date,
                          time: slot.time,
                          platforms: selectedPlatforms,
                          caption: formatPost(selectedImage),
                          status: 'scheduled',
                        };
                        updateSettings((prev) => ({
                          scheduledPosts: [...(prev.scheduledPosts || []), newPost],
                        }));
                        setCalendarSlotClick(null);
                      };

                      const postImmediately = async () => {
                        if (!selectedImage || selectedPlatforms.length === 0) return;
                        await postImageNow(selectedImage, selectedPlatforms);
                        setCalendarSlotClick(null);
                      };

                      return (
                        <div
                          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
                          onClick={() => setCalendarSlotClick(null)}
                        >
                          <div
                            className="bg-zinc-900/90 backdrop-blur-xl border-0 sm:border border-zinc-800/60 rounded-none sm:rounded-2xl w-full sm:max-w-xl h-full sm:h-auto max-h-[100dvh] sm:max-h-[85vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
                              <div className="flex items-center gap-3">
                                <div className="icon-box-blue">
                                  <Clock className="w-5 h-5 text-[#00e6ff]" />
                                </div>
                                <div>
                                  <h3 className="type-title">Schedule Post</h3>
                                  <p className="text-xs text-zinc-500">{dayLabel}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => setCalendarSlotClick(null)}
                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                              {/* Image picker */}
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                  Image
                                </label>
                                {postReadyImages.length === 0 ? (
                                  <p className="text-xs text-amber-400">
                                    No post-ready images yet. Go to the Gallery and click
                                    &quot;Prepare for Post&quot; on an image first.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                    {postReadyImages.map((img) => {
                                      const isSel = img.id === selectedImageId;
                                      return (
                                        <motion.button
                                          key={img.id}
                                          whileHover={{ scale: 1.03, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={() =>
                                            setCalendarSlotClick({ ...slot, imageId: img.id })
                                          }
                                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                            isSel
                                              ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                                              : 'border-zinc-800/60 hover:border-zinc-600'
                                          }`}
                                        >
                                          {img.url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={img.url}
                                              alt={img.prompt}
                                              loading="lazy"
                                              className="w-full h-full object-cover"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                              <ImageIcon className="w-5 h-5 text-zinc-700" />
                                            </div>
                                          )}
                                          {isSel && (
                                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                              <Check className="w-2.5 h-2.5 text-white" />
                                            </div>
                                          )}
                                        </motion.button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Platforms */}
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
                                          onClick={() => {
                                            const next = checked
                                              ? selectedPlatforms.filter((x) => x !== p)
                                              : [...selectedPlatforms, p];
                                            setCalendarSlotClick({ ...slot, platforms: next });
                                          }}
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

                              {/* Time (editable) */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                                  <input
                                    type="date"
                                    value={slot.date}
                                    onChange={(e) => setCalendarSlotClick({ ...slot, date: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                  <TimePicker24
                                    value={slot.time}
                                    onChange={(v) => setCalendarSlotClick({ ...slot, time: v })}
                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800/60">
                              <button
                                onClick={() => setCalendarSlotClick(null)}
                                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={postImmediately}
                                disabled={!selectedImage || selectedPlatforms.length === 0}
                                className="btn-blue-sm"
                              >
                                <Send className="w-3.5 h-3.5" /> Post Now
                              </button>
                              <button
                                onClick={createScheduledPost}
                                disabled={!selectedImage || selectedPlatforms.length === 0}
                                className="btn-gold-sm"
                              >
                                <Clock className="w-3.5 h-3.5" /> Schedule
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Grid view — empty state or card grid */}
                    {postReadyView === 'grid' && (
                    ready.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
                        <Save className="w-10 h-10 text-zinc-700" />
                        <p className="text-sm text-zinc-500">
                          No posts ready yet. Go to the Gallery and click{' '}
                          <span className="text-emerald-400">&quot;Prepare for Post&quot;</span> on
                          an image, or caption it in the Captioning Studio and mark it ready.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setView('gallery')}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
                          >
                            Open Gallery
                          </button>
                          <button
                            onClick={() => setView('captioning')}
                            className="btn-blue-sm px-4 py-2 text-sm rounded-lg"
                          >
                            Captioning Studio
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {computeCarouselView(ready).map((item) => {
                          // ── Carousel card branch ───────────────────────
                          if (item.kind === 'carousel') {
                            const key = `carousel-${item.id}`;
                            const busy = postBusy[key];
                            const status = postStatus[key];
                            const anchor = item.images[0];
                            const isExplicit = !!item.group;
                            const selPlatforms = getSelectedPlatforms(key);
                            const carouselSchedule = getSchedule(key);
                            const isCarouselRegen = preparingPostId === anchor.id;
                            return (
                              <div
                                key={item.id}
                                className="bg-zinc-900/80 backdrop-blur-sm border border-[#c5a062]/20 rounded-2xl overflow-hidden hover:border-[#c5a062]/40 transition-all duration-300 flex flex-col"
                              >
                                {/* Horizontal image strip */}
                                <div className="relative bg-zinc-950 overflow-x-auto">
                                  <div className="flex gap-1 p-2" style={{ minHeight: 160 }}>
                                    {item.images.map((ci) => (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        key={ci.id}
                                        src={ci.url}
                                        alt={ci.prompt}
                                        loading="lazy"
                                        onClick={() => setSelectedImage(ci)}
                                        className="h-36 w-36 object-cover rounded-lg cursor-zoom-in shrink-0"
                                      />
                                    ))}
                                  </div>
                                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 bg-[#00e6ff]/15 border border-[#00e6ff]/30 text-[10px] font-medium text-[#00e6ff] rounded-full">
                                    <LayoutGrid className="w-3 h-3" /> Carousel · {item.images.length} images
                                  </span>
                                  {isExplicit && (
                                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 text-[10px] font-medium text-zinc-300 rounded-full border border-zinc-700">
                                      manual
                                    </span>
                                  )}
                                </div>

                                {/* Shared caption (anchor image's) */}
                                <div className="p-4 space-y-3 border-b border-[#c5a062]/15">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Shared caption
                                    </label>
                                    <AutoTextarea
                                      value={anchor.postCaption || ''}
                                      onChange={(e) => {
                                        // Edit caption on every image in the carousel
                                        // so the route sends a consistent copy.
                                        for (const ci of item.images) {
                                          patchImage(ci, { postCaption: e.target.value });
                                        }
                                      }}
                                      placeholder="No caption yet…"
                                      minRows={2}
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-[#c5a062]/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  {(anchor.postHashtags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {(anchor.postHashtags ?? []).map((tag, i) => (
                                        <span
                                          key={`${tag}-${i}`}
                                          className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-zinc-500 line-clamp-2" title={anchor.prompt}>
                                    {anchor.prompt}
                                  </p>
                                </div>

                                {/* Platform picker + actions */}
                                <div className="p-4 space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Platforms
                                    </label>
                                    {available.length === 0 ? (
                                      <p className="text-[11px] text-amber-400">Configure a platform in Settings.</p>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5">
                                        {available.map((p) => {
                                          const checked = selPlatforms.includes(p);
                                          return (
                                            <button
                                              key={p}
                                              type="button"
                                              onClick={() => togglePlatformFor(key, p)}
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

                                  {/* Date + time */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                                      <input
                                        type="date"
                                        value={carouselSchedule.date}
                                        onChange={(e) => setScheduleFor(key, { date: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                      <TimePicker24
                                        value={carouselSchedule.time}
                                        onChange={(v) => setScheduleFor(key, { time: v })}
                                        className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0 || !carouselSchedule.date || !carouselSchedule.time}
                                      onClick={() => scheduleCarousel(item, selPlatforms, carouselSchedule.date, carouselSchedule.time)}
                                      className="btn-gold-sm text-[11px] px-2 justify-center"
                                    >
                                      <Clock className="w-3.5 h-3.5" /> Schedule
                                    </button>
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0}
                                      onClick={() => postCarouselNow(item, selPlatforms)}
                                      className="btn-blue-sm text-[11px] px-2 justify-center"
                                    >
                                      {busy === 'posting' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Send className="w-3.5 h-3.5" />
                                      )}
                                      Post Now
                                    </button>
                                  </div>

                                  {/* Secondary row: copy caption, regen, unready all */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <button
                                      onClick={() => copyWithFeedback(formatPost(anchor), `all-${key}`)}
                                      disabled={!anchor.postCaption}
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      {copiedId === `all-${key}` ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                      Copy
                                    </button>
                                    <button
                                      disabled={isCarouselRegen || !!busy}
                                      onClick={async () => {
                                        setPreparingPostId(anchor.id);
                                        try {
                                          const withCaption = await generatePostContent(anchor);
                                          if (withCaption?.postCaption) {
                                            for (const ci of item.images) {
                                              if (ci.id === anchor.id) continue;
                                              patchImage(ci, { postCaption: withCaption.postCaption, postHashtags: withCaption.postHashtags });
                                            }
                                          }
                                        } finally {
                                          setPreparingPostId(null);
                                        }
                                      }}
                                      className="px-2 py-1.5 text-[10px] bg-[#00e6ff]/15 hover:bg-[#00e6ff]/25 border border-[#00e6ff]/30 disabled:opacity-50 text-[#00e6ff] rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      {isCarouselRegen ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-3 h-3" />
                                      )}
                                      Regen
                                    </button>
                                    <button
                                      onClick={() => {
                                        for (const ci of item.images) {
                                          patchImage(ci, { isPostReady: false });
                                        }
                                      }}
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-red-500/80 text-white rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <MinusCircle className="w-3 h-3" />
                                      Unready
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isExplicit ? (
                                      <button
                                        onClick={() => separateCarousel(item.id)}
                                        className="flex-1 px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                      >
                                        <Columns className="w-3 h-3" /> Separate
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => persistCarouselGroup(`manual-${anchor.id}`, item.images.map((i) => i.id))}
                                        className="flex-1 px-2 py-1.5 text-[10px] bg-[#00e6ff]/15 hover:bg-[#00e6ff]/25 border border-[#00e6ff]/30 text-[#00e6ff] rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                        title="Save this auto-detected grouping"
                                      >
                                        <LayoutGrid className="w-3 h-3" /> Lock Group
                                      </button>
                                    )}
                                  </div>

                                  {status && (
                                    <p className={`text-[11px] ${status.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                      {status}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          // ── Single-image card branch (original) ───────
                          const img = item.img;
                          const isRegen = preparingPostId === img.id;
                          const selPlatforms = getSelectedPlatforms(img.id);
                          const schedule = getSchedule(img.id);
                          const busy = postBusy[img.id];
                          const status = postStatus[img.id];
                          const scheduled = latestScheduleFor(img.id);
                          // Status badge — latest scheduled post takes precedence
                          // so the user sees posted/failed/scheduled feedback
                          // for retrospective runs even after reload.
                          const badge = scheduled?.status === 'posted'
                            ? { text: 'Posted', color: 'bg-emerald-600' }
                            : scheduled?.status === 'failed'
                              ? { text: 'Failed', color: 'bg-red-600' }
                              : scheduled?.status === 'scheduled'
                                ? { text: `Scheduled ${scheduled.date} ${formatTimeShort(scheduled.time)}`, color: 'bg-amber-600' }
                                : { text: 'Ready', color: 'bg-emerald-600' };
                          return (
                            <div
                              key={img.id}
                              className="bg-zinc-900/80 backdrop-blur-sm border border-[#c5a062]/20 rounded-2xl overflow-hidden flex flex-col md:flex-row hover:border-[#c5a062]/40 transition-all duration-300"
                            >
                              {/* Image */}
                              <div className="relative md:w-48 md:shrink-0 aspect-square bg-zinc-950">
                                {img.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img.url}
                                    alt={img.prompt}
                                    loading="lazy"
                                    onClick={() => setSelectedImage(img)}
                                    className="w-full h-full object-cover cursor-zoom-in"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-zinc-700" />
                                  </div>
                                )}
                                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 ${badge.color}/90 text-[10px] font-medium text-white rounded-full`}>
                                  <Check className="w-3 h-3" /> {badge.text}
                                </span>
                                {/* Carousel-grouping checkbox — top-right.
                                    Lets users multi-select single cards
                                    and bulk-group them via the header
                                    "Group Selected" button. */}
                                <label
                                  className="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 bg-black/60 backdrop-blur-sm rounded cursor-pointer hover:bg-black/80 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Select for grouping"
                                >
                                  <input
                                    type="checkbox"
                                    checked={postReadySelected.has(img.id)}
                                    onChange={(e) => {
                                      const next = new Set(postReadySelected);
                                      if (e.target.checked) next.add(img.id);
                                      else next.delete(img.id);
                                      setPostReadySelected(next);
                                    }}
                                    className="w-4 h-4 accent-[#00e6ff] cursor-pointer"
                                  />
                                </label>
                              </div>

                              {/* Right column */}
                              <div className="flex-1 flex flex-col">
                                {/* Caption + hashtags */}
                                <div className="flex-1 p-4 space-y-3 border-b border-[#c5a062]/15">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Caption
                                    </label>
                                    <AutoTextarea
                                      value={img.postCaption || ''}
                                      onChange={(e) => patchImage(img, { postCaption: e.target.value })}
                                      placeholder="No caption yet…"
                                      minRows={2}
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-[#c5a062]/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Hashtags
                                    </label>
                                    {(img.postHashtags || []).length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {(img.postHashtags ?? []).map((tag, i) => (
                                          <span
                                            key={`${tag}-${i}`}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                                          >
                                            {tag}
                                            <button
                                              onClick={() => removeHashtag(img, i)}
                                              className="text-zinc-500 hover:text-red-400"
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-zinc-600 italic">No hashtags.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Platform + scheduling */}
                                <div className="p-4 space-y-3">
                                  {/* Platform toggles — only show ones with creds */}
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
                                          const checked = selPlatforms.includes(p);
                                          return (
                                            <button
                                              key={p}
                                              type="button"
                                              onClick={() => togglePlatformFor(img.id, p)}
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

                                  {/* Date + time */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        Date
                                      </label>
                                      <input
                                        type="date"
                                        value={schedule.date}
                                        onChange={(e) => setScheduleFor(img.id, { date: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        Time
                                      </label>
                                      <TimePicker24
                                        value={schedule.time}
                                        onChange={(v) => setScheduleFor(img.id, { time: v })}
                                        className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#c5a062]/30"
                                      />
                                    </div>
                                  </div>

                                  {/* Action row */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0 || !schedule.date || !schedule.time}
                                      onClick={() => scheduleImage(img, selPlatforms, schedule.date, schedule.time)}
                                      className="btn-gold-sm text-[11px] px-2 justify-center"
                                    >
                                      <Clock className="w-3.5 h-3.5" /> Schedule
                                    </button>
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0}
                                      onClick={() => postImageNow(img, selPlatforms)}
                                      className="btn-blue-sm text-[11px] px-2 justify-center"
                                    >
                                      {busy === 'posting' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Send className="w-3.5 h-3.5" />
                                      )}
                                      Post Now
                                    </button>
                                  </div>

                                  {/* Secondary row: copy, regen, unready */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <button
                                      onClick={() => copyWithFeedback(formatPost(img), `all-${img.id}`)}
                                      disabled={!img.postCaption}
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      {copiedId === `all-${img.id}` ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                      Copy
                                    </button>
                                    <button
                                      disabled={isRegen}
                                      onClick={async () => {
                                        setPreparingPostId(img.id);
                                        try {
                                          await generatePostContent(img);
                                        } finally {
                                          setPreparingPostId(null);
                                        }
                                      }}
                                      className="px-2 py-1.5 text-[10px] bg-[#00e6ff]/15 hover:bg-[#00e6ff]/25 border border-[#00e6ff]/30 disabled:opacity-50 text-[#00e6ff] rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      {isRegen ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-3 h-3" />
                                      )}
                                      Regen
                                    </button>
                                    <button
                                      onClick={() => patchImage(img, { isPostReady: false })}
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-red-500/80 text-white rounded-xl flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <MinusCircle className="w-3 h-3" />
                                      Unready
                                    </button>
                                  </div>

                                  {/* Inline status line */}
                                  {status && (
                                    <p className={`text-[11px] ${status.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                      {status}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                    )}

                    {/* Schedule-All modal — extracted to SmartScheduleModal (PROP-016) */}
                    {showScheduleAll && (
                      <SmartScheduleModal
                        slots={smartScheduler.slots}
                        source={smartScheduler.source}
                        form={smartScheduler.form}
                        available={available}
                        postCount={postItems.length}
                        onFormChange={(patch) => smartScheduler.setForm((prev) => ({ ...prev, ...patch }))}
                        onClose={() => { setShowScheduleAll(false); smartScheduler.clear(); }}
                        onConfirm={() => {
                          // Dispatch per PostItem (carousel-aware) so grouped carousels
                          // consume one slot and route to scheduleCarousel.
                          const form = smartScheduler.form;
                          const slots = smartScheduler.slots;
                          const dispatch = (item: PostItem, date: string, time: string) => {
                            if (item.kind === 'carousel') {
                              scheduleCarousel(item, form.platforms, date, time);
                            } else {
                              scheduleImage(item.img, form.platforms, date, time);
                            }
                          };
                          if (slots.length >= postItems.length) {
                            for (let i = 0; i < postItems.length; i++) {
                              dispatch(postItems[i], slots[i].date, slots[i].time);
                            }
                          } else {
                            for (const item of postItems) {
                              dispatch(item, form.date, form.time);
                            }
                          }
                          setShowScheduleAll(false);
                          smartScheduler.clear();
                        }}
                      />
                    )}
                  </div>
                );
              })()}
              {view === 'pipeline' && <PipelinePanel />}

              {/* Carousel multi-source picker modal — lifted out of the
                  Captioning view so Post-Ready (and any other tab) can
                  trigger it. Source pool is every approved saved image
                  regardless of post-ready status. */}
              {showCarouselPicker && (() => {
                const pickerSource = savedImages.filter((i) => i.approved);
                return (
                  <div
                    className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
                    onClick={() => setShowCarouselPicker(false)}
                  >
                    <div
                      className="bg-zinc-900/95 backdrop-blur-xl border-0 sm:border border-[#c5a062]/25 rounded-none sm:rounded-2xl w-full sm:max-w-4xl h-full sm:h-auto max-h-[100dvh] sm:max-h-[85vh] flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
                        <div className="flex items-center gap-3">
                          <div className="icon-box-blue">
                            <LayoutGrid className="w-5 h-5 text-[#00e6ff]" />
                          </div>
                          <div>
                            <h3 className="type-title">
                              {pickerTargetGroupId ? 'Edit Carousel' : 'Create Carousel'}
                            </h3>
                            <p className="text-xs text-zinc-500">
                              Pick 2 or more images to group them into a single multi-image post.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowCarouselPicker(false)}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-5">
                        {pickerSource.length === 0 ? (
                          <p className="text-sm text-zinc-500 text-center py-8">
                            No approved saved images yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {pickerSource.map((img) => {
                              const inAnotherGroup = (settings.carouselGroups || []).some(
                                (g) => g.id !== pickerTargetGroupId && g.imageIds.includes(img.id)
                              );
                              const selected = pickerSelected.has(img.id);
                              return (
                                <motion.button
                                  key={img.id}
                                  whileHover={inAnotherGroup ? undefined : { scale: 1.03, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                                  whileTap={inAnotherGroup ? undefined : { scale: 0.9 }}
                                  onClick={() => {
                                    if (inAnotherGroup) return;
                                    const next = new Set(pickerSelected);
                                    if (next.has(img.id)) next.delete(img.id);
                                    else next.add(img.id);
                                    setPickerSelected(next);
                                  }}
                                  disabled={inAnotherGroup}
                                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                    inAnotherGroup
                                      ? 'border-zinc-800/40 opacity-30 cursor-not-allowed'
                                      : selected
                                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                                        : 'border-zinc-800/60 hover:border-zinc-600'
                                  }`}
                                  title={inAnotherGroup ? 'Already in another carousel' : img.prompt}
                                >
                                  {img.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={img.url}
                                      alt={img.prompt}
                                      loading="lazy"
                                      className="w-full h-full object-cover"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                      <ImageIcon className="w-6 h-6 text-zinc-700" />
                                    </div>
                                  )}
                                  {img.isPostReady && (
                                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-emerald-600/90 text-[8px] font-medium text-white rounded">
                                      Post Ready
                                    </span>
                                  )}
                                  {selected && (
                                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                      <Check className="w-3 h-3" />
                                    </div>
                                  )}
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-4 border-t border-zinc-800/60">
                        <span className="text-xs text-zinc-500">
                          {pickerSelected.size} selected
                          {pickerSelected.size < 2 && (
                            <span className="text-amber-400 ml-2">
                              Pick at least 2 images to form a carousel.
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCarouselPicker(false)}
                            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={confirmCarouselPicker}
                            disabled={pickerSelected.size < 2}
                            className="btn-blue-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {pickerTargetGroupId ? 'Update Carousel' : 'Create Carousel'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(view === 'studio' || view === 'gallery') && (
                displayedImages.length === 0 && !isGenerating ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="h-full flex flex-col items-center justify-center text-zinc-500 py-20"
            >
              <div className="w-24 h-24 mb-6 rounded-full bg-zinc-900/50 border border-zinc-800/60 flex items-center justify-center">
                {view === 'gallery' ? <Bookmark className="w-10 h-10 text-zinc-700" /> : <ImageIcon className="w-10 h-10 text-zinc-700" />}
              </div>
              <h2 className="text-xl font-medium text-zinc-300 mb-2">
                {view === 'gallery' ? 'Your Gallery is Empty' : 'No Images Generated Yet'}
              </h2>
              <p className="text-sm max-w-md text-center text-zinc-500">
                {view === 'gallery'
                  ? 'Save your favorite mashups from the Studio to build your collection.'
                  : 'Click "Generate Mashup" to create 4 unique crossover images from famous fantasy universes using Leonardo.AI.'}
              </p>
            </motion.div>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-12`}>
              {displayedImages.map((img, idx) => {
                const isSaved = savedImages.some(s => s.id === img.id);
                return (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1, ease: "easeOut" }}
                    whileHover={{ scale: 1.02, y: -4, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                    onClick={() => setSelectedImage(img)}
                    className={`group relative bg-zinc-900/80 backdrop-blur-sm border rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer ${
                      dragOverCollection ? 'ring-2 ring-[#00e6ff] border-[#00e6ff]/50' : 'border-[#c5a062]/20 hover:border-[#c5a062]/60 hover:shadow-[0_8px_40px_rgba(197,160,98,0.18),0_0_0_1px_rgba(197,160,98,0.15)]'
                    }`}
                    draggable={view === 'gallery'}
                    onDragStart={(e) => {
                      const native = e as unknown as React.DragEvent;
                      native.dataTransfer.setData('imageId', img.id);
                      native.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div
                      className={`aspect-square relative overflow-hidden bg-zinc-950 ${img.approved ? 'ring-2 ring-emerald-500/60 ring-inset' : ''}`}
                    >
                      {(img.status === 'generating' || img.status === 'animating') && (
                        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                            <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-indigo-400 animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-white uppercase tracking-widest">
                              {img.status === 'generating' ? 'Materializing' : 'Animating'}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {img.status === 'generating' ? 'Crafting across universes...' : 'Breathing life into pixels...'}
                            </p>
                          </div>
                        </div>
                      )}
                      {img.status === 'error' && (
                        <div className="absolute inset-0 z-40 bg-red-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4 text-center">
                          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                            <XCircle className="w-6 h-6 text-red-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-red-300 uppercase tracking-widest">Generation Failed</p>
                            <p className="text-[10px] text-red-200/80 max-w-[90%] leading-tight">
                              {img.error || 'Unknown error'}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteImage(img.id, view === 'gallery');
                            }}
                            className="mt-1 px-3 py-1 text-[10px] bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {view === 'gallery' && !img.isVideo && img.imageId && (
                        <div className="absolute top-4 left-4 z-30">
                          <input
                            type="checkbox"
                            checked={selectedForBatch.has(img.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newSet = new Set(selectedForBatch);
                              if (e.target.checked) newSet.add(img.id);
                              else newSet.delete(img.id);
                              setSelectedForBatch(newSet);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded border-zinc-600 bg-zinc-900/80 backdrop-blur-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-[#c5a062]"
                          />
                        </div>
                      )}
                      
                      {img.isVideo ? (
                        <div className="relative w-full h-full">
                          {/* CDN-expiry fallback — revealed when video onError fires */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-zinc-700" />
                          </div>
                          <video
                            src={img.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          {settings.watermark?.enabled && (
                            <div className={`absolute pointer-events-none z-10 ${
                              settings.watermark.position === 'bottom-right' ? 'bottom-2 right-2' :
                              settings.watermark.position === 'bottom-left' ? 'bottom-2 left-2' :
                              settings.watermark.position === 'top-right' ? 'top-2 right-2' :
                              settings.watermark.position === 'top-left' ? 'top-2 left-2' : 'bottom-2 right-2'
                            }`} style={{ opacity: settings.watermark.opacity || 0.8 }}>
                              {settings.watermark.image ? (
                                <Image src={settings.watermark.image} alt="Watermark" fill className="object-contain" referrerPolicy="no-referrer" />
                              ) : settings.channelName ? (
                                <span className="text-white bg-black/50 px-2 py-1 rounded text-xs font-bold">{settings.channelName}</span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* CDN-expiry fallback — sits behind Image at z-0;
                              revealed automatically when onError hides the img */}
                          <div className="absolute inset-0 flex items-center justify-center z-0">
                            <ImageIcon className="w-8 h-8 text-zinc-700" />
                          </div>
                          <Image
                            src={img.url || `data:image/jpeg;base64,${img.base64}`}
                            alt={img.prompt}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </>
                      )}
                      
                      {/* Hover glow overlay — warm-gold from below, cool-blue at top edge */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[6] bg-gradient-to-t from-[#c5a062]/12 via-transparent to-[#00e6ff]/6" />

                      {/* Permanent approved indicator — bottom-left so
                          it avoids the top-right action row AND the
                          top-left batch-select checkbox in gallery view.
                          Paired with the inset emerald ring on the image
                          for a clear approved state. */}
                      {img.approved && (
                        <div
                          className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-emerald-500/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-full shadow-lg"
                          title="Approved"
                        >
                          <BookmarkCheck className="w-3 h-3" />
                          <span className="text-[9px] font-medium">Approved</span>
                        </div>
                      )}

                      {/* Top Actions Overlay — compact icon row.
                          Buttons shrunk from w-10→w-8 and icons w-5→w-4
                          so all 7 fit comfortably on one line without
                          colliding with the approved indicator. */}
                      <div className="absolute top-0 left-0 right-0 p-2 flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                        {img.imageId && !img.isVideo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAnimate(img); }}
                            disabled={img.status === 'animating'}
                            className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-indigo-500/80 text-white rounded-lg backdrop-blur-md transition-colors"
                            title="Animate Image"
                          >
                            {img.status === 'animating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                          </button>
                        )}
                        {view === 'studio' && !img.isVideo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); rerollImage(img.id, img.prompt); }}
                            disabled={isGenerating}
                            className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-emerald-500/80 text-white rounded-lg backdrop-blur-md transition-colors"
                            title="Re-roll Image"
                          >
                            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleApproveImage(img.id); }}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg backdrop-blur-md transition-colors ${
                            img.approved
                              ? 'bg-emerald-500 text-white'
                              : 'bg-black/50 hover:bg-emerald-500/80 text-white'
                          }`}
                          title={img.approved ? 'Unapprove Image' : 'Approve Image'}
                        >
                          <BookmarkCheck className="w-4 h-4" />
                        </button>
                        {view === 'gallery' && (
                          <div className="relative group/col">
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-emerald-500/80 text-white rounded-lg backdrop-blur-md transition-colors"
                              title="Add to Collection"
                            >
                              <FolderPlus className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800/60 rounded-xl shadow-2xl opacity-0 invisible group-hover/col:opacity-100 group-hover/col:visible transition-all z-50 p-2">
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-1 mb-1">Add to Collection</p>
                              {collections.map(col => (
                                <button
                                  key={col.id}
                                  onClick={(e) => { e.stopPropagation(); addImageToCollection(img.id, col.id); }}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverCollection(col.id); }}
                                  onDragLeave={() => setDragOverCollection(null)}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const droppedImageId = e.dataTransfer.getData('imageId');
                                    if (droppedImageId) addImageToCollection(droppedImageId, col.id);
                                    setDragOverCollection(null);
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                                    dragOverCollection === col.id ? 'bg-emerald-500 text-white scale-105' :
                                    img.collectionId === col.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                  }`}
                                >
                                  {col.name}
                                </button>
                              ))}
                              {img.collectionId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeImageFromCollection(img.id); }}
                                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors mt-1 border-t border-zinc-800 pt-2"
                                >
                                  Remove from Collection
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowCollectionModal(true); }}
                                className="w-full text-left px-3 py-2 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors mt-1 border-t border-zinc-800 pt-2 flex items-center gap-2"
                              >
                                <Plus className="w-3 h-3" />
                                New Collection
                              </button>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); saveImage(img); }}
                          disabled={isSaved}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg backdrop-blur-md transition-colors ${
                            isSaved
                              ? 'bg-emerald-500/80 text-white cursor-default'
                              : 'bg-black/50 hover:bg-black/80 text-white'
                          }`}
                          title={isSaved ? 'Saved to Gallery' : 'Save to Gallery'}
                        >
                          {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                        <button
                          disabled={preparingPostId === img.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (preparingPostId) return;
                            setPreparingPostId(img.id);
                            try {
                              if (!img.approved) toggleApproveImage(img.id);
                              if (!img.postCaption) await generatePostContent(img);
                              await saveImage({ ...img, isPostReady: true });
                              setView('post-ready');
                            } finally {
                              setPreparingPostId(null);
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-emerald-500/80 disabled:opacity-60 disabled:hover:bg-black/50 text-white rounded-lg backdrop-blur-md transition-colors"
                          title={preparingPostId === img.id ? 'Generating caption…' : 'Prepare for Post'}
                        >
                          {preparingPostId === img.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteImage(img.id, view === 'gallery'); }}
                          className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-red-500/80 text-white rounded-lg backdrop-blur-md transition-colors"
                          title="Delete Image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Bottom Overlay — model badge + prompt + download.
                          The card itself is clickable to open the image,
                          so no explicit "View Details" button. */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
                        {img.modelInfo?.modelName && (
                          <span className="self-start mb-1.5 px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase bg-[#c5a062]/20 text-[#c5a062] border border-[#c5a062]/30 rounded-full pointer-events-none select-none">
                            {img.modelInfo.modelName}
                          </span>
                        )}
                        <p className="text-xs text-zinc-200 line-clamp-2 mb-3 font-medium leading-relaxed shadow-sm pointer-events-auto">
                          {img.prompt}
                        </p>
                        <div className="flex gap-2 pointer-events-auto">
                          <a
                            href={img.url || `data:image/jpeg;base64,${img.base64}`}
                            download={`mashup-${idx + 1}.jpg`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition-colors"
                            title="Download Image"
                            target={img.url ? "_blank" : undefined}
                            rel={img.url ? "noopener noreferrer" : undefined}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      </div>

                      {/* Animating Overlay */}
                      {img.status === 'animating' && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
                          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                          <span className="text-sm font-medium text-white">Generating Video...</span>
                        </div>
                      )}
                    </div>
                    {/* Tag pills row (Gallery view only) */}
                    {view === 'gallery' && img.tags && img.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-zinc-800/60">
                        {img.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-[9px] bg-[#c5a062]/10 text-[#c5a062]/80 border border-[#c5a062]/20 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {img.tags.length > 5 && (
                          <span className="px-1.5 py-0.5 text-[9px] text-zinc-600">
                            +{img.tags.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {/* Skeleton placeholders if generating */}
              {isGenerating && Array.from({ length: 4 }).map((_, idx) => (
                <motion.div 
                  key={`skeleton-${idx}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="aspect-square bg-zinc-900/50 rounded-2xl border border-zinc-800/50 flex flex-col items-center justify-center animate-pulse"
                >
                  <ImageIcon className="w-12 h-12 text-zinc-800 mb-4" />
                  <div className="h-4 bg-zinc-800 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                </motion.div>
              ))}
            </div>
          )
        )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {selectedImage && (
        <ImageDetailModal
          image={selectedImage}
          onImageChange={setSelectedImage}
          settings={settings}
          updateSettings={updateSettings}
          collections={collections}
          selectedForBatch={selectedForBatch}
          updateImageTags={updateImageTags}
          addImageToCollection={addImageToCollection}
          removeImageFromCollection={removeImageFromCollection}
          createCollection={createCollection}
          handleAnimate={handleAnimate}
          toggleApproveImage={toggleApproveImage}
          deleteImage={deleteImage}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          settings={settings}
          updateSettings={updateSettings}
          isDesktop={isDesktop}
          piStatus={piStatus}
          piBusy={piBusy}
          piError={piError}
          piSetupMsg={piSetupMsg}
          handlePiSetup={handlePiSetup}
          refreshPiStatus={refreshPiStatus}
          collections={collections}
          savedImages={savedImages}
          deleteCollection={deleteCollection}
          openCollectionModal={() => setShowCollectionModal(true)}
        />
      )}

      {showCollectionModal && (
        <CollectionModal
          onClose={() => setShowCollectionModal(false)}
          name={newCollectionName}
          onNameChange={setNewCollectionName}
          description={newCollectionDesc}
          onDescriptionChange={setNewCollectionDesc}
          onCreate={async () => {
            const imageIds = selectedForBatch.size > 0 ? Array.from(selectedForBatch) : undefined;
            await createCollection(newCollectionName.trim() || undefined, newCollectionDesc.trim() || undefined, imageIds);
            setNewCollectionName('');
            setNewCollectionDesc('');
            setShowCollectionModal(false);
            if (imageIds) setSelectedForBatch(new Set());
          }}
        />
      )}

      {/* Bulk Tag Modal */}
      <AnimatePresence>
        {showBulkTagModal && (
          <BulkTagModal
            onClose={() => setShowBulkTagModal(false)}
            selectedForBatch={selectedForBatch}
            clearBatch={() => setSelectedForBatch(new Set())}
            bulkUpdateImageTags={bulkUpdateImageTags}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

