'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Maximize,
  MinusCircle,
  Tag,
  FolderPlus,
  Plus,
  Minus,
  ChevronDown,
  Layers,
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
  Instagram
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
  IMAGE_SIZES
} from './MashupContext';
import { PipelinePanel } from './PipelinePanel';
import { streamAIToString } from '@/lib/aiClient';
import type { CarouselGroup } from './MashupContext';

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

export function MainContent() {
  const { logout } = useAuth();
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
  const [bulkTagsInput, setBulkTagsInput] = useState('');
  const [bulkTagMode, setBulkTagMode] = useState<'append' | 'replace'>('append');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [isAutoTagging, setIsAutoTagging] = useState(false);

  const checkApiKey = async () => {
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      const has = await (window as any).aistudio.hasSelectedApiKey();
      setHasApiKey(has);
      if (!has) {
        await (window as any).aistudio.openSelectKey();
        const nowHas = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(nowHas);
      }
    }
  };
  
  // Comparison state
  const [comparisonModels, setComparisonModels] = useState<string[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
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
  const [batchCaptioning, setBatchCaptioning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  // Image id currently copied (for the brief "Copied" affordance on the
  // Post Ready tab). Auto-clears after a short timeout.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Post Ready scheduling state ────────────────────────────────────
  type PostPlatform = 'instagram' | 'pinterest' | 'twitter' | 'discord';

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
  const [scheduleAllForm, setScheduleAllForm] = useState<{ date: string; time: string; platforms: PostPlatform[] }>({
    date: '',
    time: '',
    platforms: [],
  });

  const hasPlatformCreds = (p: PostPlatform): boolean => {
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

  const availablePlatforms = (): PostPlatform[] => {
    return (['instagram', 'pinterest', 'twitter', 'discord'] as PostPlatform[]).filter(hasPlatformCreds);
  };

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Post failed');
      setPostStatus((prev) => ({
        ...prev,
        [img.id]: `Posted to ${platforms.join(', ')} ✓`,
      }));
    } catch (err: any) {
      setPostStatus((prev) => ({
        ...prev,
        [img.id]: `Error: ${err?.message || 'failed'}`,
      }));
    } finally {
      setPostBusy((prev) => ({ ...prev, [img.id]: null }));
    }
  };

  /** Persist a new ScheduledPost in settings.scheduledPosts. */
  const scheduleImage = (img: GeneratedImage, platforms: PostPlatform[], date: string, time: string) => {
    if (!date || !time || platforms.length === 0) return;
    const scheduled: ScheduledPost = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      imageId: img.id,
      date,
      time,
      platforms,
      caption: formatPost(img),
      status: 'scheduled',
    };
    const next = [...(settings.scheduledPosts || []), scheduled];
    updateSettings({ scheduledPosts: next });
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
  const calendarColorFor = (status?: 'scheduled' | 'posted' | 'failed'): string => {
    if (status === 'posted') return 'bg-emerald-500/80 border-emerald-400/60 text-emerald-50';
    if (status === 'failed') return 'bg-red-500/80 border-red-400/60 text-red-50';
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
  const computeCarouselView = (ready: GeneratedImage[]): PostItem[] => {
    const items: PostItem[] = [];
    const handled = new Set<string>();

    // Explicit groups first — respect the user's manual grouping decisions.
    const explicitGroups = settings.carouselGroups || [];
    for (const g of explicitGroups) {
      const imgs = g.imageIds
        .map((id) => ready.find((i) => i.id === id))
        .filter((i): i is GeneratedImage => !!i);
      if (imgs.length === 0) continue;
      items.push({ kind: 'carousel', id: g.id, images: imgs, group: g });
      for (const i of imgs) handled.add(i.id);
    }

    // Auto-group the remaining by prompt + savedAt proximity.
    const remaining = ready.filter((i) => !handled.has(i.id));
    // Stable sort by savedAt so proximity grouping is deterministic.
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

    // Preserve original order (newest-first for a better UX — savedAt desc).
    items.sort((a, b) => {
      const aT = a.kind === 'single' ? a.img.savedAt || 0 : Math.max(...a.images.map((i) => i.savedAt || 0));
      const bT = b.kind === 'single' ? b.img.savedAt || 0 : Math.max(...b.images.map((i) => i.savedAt || 0));
      return bT - aT;
    });
    return items;
  };

  /**
   * Persist a manual carousel group. If imageIds has fewer than 2
   * entries we auto-ungroup instead (a carousel of 1 is just a post).
   */
  const persistCarouselGroup = (id: string, imageIds: string[], patch?: Partial<CarouselGroup>) => {
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
  };

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
   */
  const scheduleCarousel = (
    item: Extract<PostItem, { kind: 'carousel' }>,
    platforms: PostPlatform[],
    date: string,
    time: string
  ) => {
    if (platforms.length === 0 || !date || !time || item.images.length === 0) return;
    const caption = item.group?.caption || formatPost(item.images[0]);
    const nowStamp = Date.now();
    // Every post in the carousel gets the same carouselGroupId so the
    // auto-post worker can pick them up as a single multi-image call
    // instead of publishing each image independently.
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
    updateSettings({
      scheduledPosts: [...(settings.scheduledPosts || []), ...newPosts],
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Carousel post failed');
      setPostStatus((prev) => ({ ...prev, [key]: `Posted carousel to ${platforms.join(', ')} ✓` }));
    } catch (err: any) {
      setPostStatus((prev) => ({ ...prev, [key]: `Error: ${err?.message || 'failed'}` }));
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
    } catch (err) {
      console.error('Clipboard write failed', err);
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
        } catch (err) {
          console.error('Batch caption failed for', targets[i].id, err);
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
  interface PiStatus {
    installed: boolean;
    authenticated: boolean;
    running: boolean;
    provider: string | null;
    model: string | null;
    modelsAvailable: number;
    lastError: string | null;
  }
  const [piStatus, setPiStatus] = useState<PiStatus | null>(null);
  const [piBusy, setPiBusy] = useState<null | 'install' | 'start' | 'stop' | 'setup'>(null);
  const [piError, setPiError] = useState<string | null>(null);
  const [piSetupMsg, setPiSetupMsg] = useState<string | null>(null);

  const refreshPiStatus = async () => {
    try {
      const res = await fetch('/api/pi/status');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setPiStatus(data);
    } catch (err: any) {
      setPiError(err?.message || 'Failed to fetch pi status');
    }
  };

  useEffect(() => {
    if (showSettings) refreshPiStatus();
  }, [showSettings]);

  const handlePiInstall = async () => {
    setPiBusy('install');
    setPiError(null);
    try {
      const res = await fetch('/api/pi/install', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setPiError(data.stderr || data.error || 'Install failed');
      }
      await refreshPiStatus();
    } finally {
      setPiBusy(null);
    }
  };

  const handlePiStart = async () => {
    setPiBusy('start');
    setPiError(null);
    try {
      const res = await fetch('/api/pi/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: settings.aiSystemPrompt || '' }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setPiError(data.error || 'Start failed');
      }
      await refreshPiStatus();
    } finally {
      setPiBusy(null);
    }
  };

  const handlePiStop = async () => {
    setPiBusy('stop');
    try {
      await fetch('/api/pi/stop', { method: 'POST' });
      await refreshPiStatus();
    } finally {
      setPiBusy(null);
    }
  };

  const handlePiSetup = async () => {
    setPiBusy('setup');
    setPiError(null);
    try {
      const res = await fetch('/api/pi/setup', { method: 'POST' });
      const data = await res.json();
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

  const handleGenerateIdea = async () => {
    setIsGeneratingIdea(true);
    try {
      const text = await streamAIToString(
        `Generate a highly creative, peak, up-to-date crossover mashup idea strictly limited to these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus on "what if" scenarios, alternative universes, different timelines, and epic crossovers. Make it highly detailed, cinematic, and unique. CRITICAL DIVERSITY MANDATE: completely random and diverse. Do NOT use common or overused characters like Dr. Doom, Darth Vader, or Batman. Dig deep into franchise lore. Return ONLY the idea as a single string. Random Seed: ${Math.random()}`,
        { mode: 'idea' }
      );
      const newIdea = text.trim();
      setComparisonPrompt(newIdea);
      if (newIdea) {
        await autoSelectParameters(newIdea);
      }
    } catch (error) {
      console.error('Error generating idea:', error);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const autoSelectParameters = async (mashupIdea: string) => {
    setIsAutoSelecting(true);
    try {
      const text = await streamAIToString(
        `Analyze this mashup idea: "${mashupIdea}".
        First, identify the core mood (e.g., dark, whimsical, tense, romantic) and genre (e.g., cyberpunk, high fantasy, noir) implied by the idea.
        Then, SMARTLY select the most appropriate parameters that specifically enhance this mood and genre, rather than just defaulting to generic cinematic qualities.
        Select the best Art Style from: ${ART_STYLES.join(', ')}.
        Select the best Lighting from: ${LIGHTING_OPTIONS.join(', ')}.
        Select the best Camera Angle from: ${CAMERA_ANGLES.join(', ')}.
        Select the best Aspect Ratio from: ${ASPECT_RATIOS.join(', ')}.

        CRITICAL ASPECT RATIO RULES:
        - If the prompt describes an epic scene, landscape, wide battle, or cinematic vista, you MUST select "16:9".
        - If the prompt describes a character portrait, single character focus, or vertical subject, you MUST select "9:16".
        - Otherwise, select "1:1" or another appropriate ratio.

        Return ONLY a JSON object with keys: style, lighting, angle, aspectRatio.`,
        { mode: 'generate' }
      );
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const params = JSON.parse(cleaned || '{}');
      setComparisonOptions(prev => ({
        ...prev,
        style: params.style || prev.style,
        lighting: params.lighting || prev.lighting,
        angle: params.angle || prev.angle,
        aspectRatio: params.aspectRatio || prev.aspectRatio,
        negativePrompt: params.negativePrompt || prev.negativePrompt
      }));
    } catch (error) {
      console.error('Error auto-selecting parameters:', error);
    } finally {
      setIsAutoSelecting(false);
    }
  };

  const handlePushIdeaToCompare = async (prompt: string) => {
    setIsPushing(true);
    setView('compare');
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
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(cleaned || '{}');
      
      setComparisonPrompt(data.enhancedPrompt || prompt);
      setComparisonOptions(prev => ({
        ...prev,
        negativePrompt: data.negativePrompt || '',
        style: ART_STYLES.includes(data.style) ? data.style : ART_STYLES[0],
        lighting: LIGHTING_OPTIONS.includes(data.lighting) ? data.lighting : LIGHTING_OPTIONS[0],
        angle: CAMERA_ANGLES.includes(data.angle) ? data.angle : CAMERA_ANGLES[0],
        aspectRatio: ['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].includes(data.aspectRatio) ? data.aspectRatio : '16:9',
        imageSize: ['512px', '1K', '2K', '4K'].includes(data.imageSize) ? data.imageSize : '1K'
      }));
    } catch (error) {
      console.error('Error pushing idea to compare:', error);
      setComparisonPrompt(prompt);
    } finally {
      setIsPushing(false);
    }
  };

  useEffect(() => {
    const storedModels = localStorage.getItem('mashup_comparison_models');
    if (storedModels) {
      try {
        setComparisonModels(JSON.parse(storedModels));
      } catch (e) {
        console.error('Failed to parse stored comparison models', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('mashup_comparison_models', JSON.stringify(comparisonModels));
  }, [comparisonModels]);

  // Auto-posting effect
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!settings.scheduledPosts || settings.scheduledPosts.length === 0) return;

      const now = new Date();
      let hasUpdates = false;
      const updatedPosts = [...settings.scheduledPosts];

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

      for (let i = 0; i < updatedPosts.length; i++) {
        const post = updatedPosts[i];
        if (processedIds.has(post.id)) continue;
        if (post.status !== 'scheduled') continue;
        const postDate = new Date(`${post.date}T${post.time}:00`);
        if (now < postDate) continue;

        // ── Carousel branch ────────────────────────────────────────
        if (post.carouselGroupId) {
          const groupPosts = updatedPosts.filter(
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
              const idx = updatedPosts.findIndex((p) => p.id === gp.id);
              if (idx !== -1) updatedPosts[idx] = { ...gp, status: 'failed' };
              processedIds.add(gp.id);
            });
            hasUpdates = true;
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to post carousel');

            groupPosts.forEach((gp) => {
              const idx = updatedPosts.findIndex((p) => p.id === gp.id);
              if (idx !== -1) updatedPosts[idx] = { ...gp, status: 'posted' };
              processedIds.add(gp.id);
            });
            hasUpdates = true;
          } catch (e: any) {
            console.error(
              'Auto-post carousel failed for group',
              post.carouselGroupId,
              e?.message || e
            );
            groupPosts.forEach((gp) => {
              const idx = updatedPosts.findIndex((p) => p.id === gp.id);
              if (idx !== -1) updatedPosts[idx] = { ...gp, status: 'failed' };
              processedIds.add(gp.id);
            });
            hasUpdates = true;
          }
          continue;
        }

        // ── Single-image branch (existing behaviour) ─────────────
        const image = savedImages.find((img) => img.id === post.imageId);
        if (!image) {
          updatedPosts[i] = { ...post, status: 'failed' };
          hasUpdates = true;
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

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to post');

          updatedPosts[i] = { ...post, status: 'posted' };
          hasUpdates = true;
        } catch (e: any) {
          console.error('Auto-post failed for', post.id, e?.message || e);
          updatedPosts[i] = { ...post, status: 'failed' };
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        updateSettings({ scheduledPosts: updatedPosts });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [settings.scheduledPosts, settings.apiKeys, savedImages, updateSettings]);

  const ALL_MODELS = [...LEONARDO_MODELS];

  const RECOMMENDED_NICHES = [
    'Multiverse Mashup', 
    'Fan Fiction & Lore', 
    'Merchandise & Collectibles', 
    'Cosplay & Fan Art', 
    'Pop Culture Crossovers', 
    'Alternate Realities', 
    'Sci-Fi & Fantasy', 
    'Retro & Nostalgia', 
    'Cyberpunk & Futurism', 
    'Grimdark & Gothic', 
    'Street-Level Heroes', 
    'Galactic Empires', 
    'Eldritch Horrors', 
    'Mythic Legends'
  ];

  const RECOMMENDED_GENRES = [
    'Visual Storytelling', 
    'High Contrast', 
    'Emotional Resonance', 
    'Cinematic Crossovers', 
    'What If Scenarios', 
    'Alternative Timelines', 
    'Epic Battles', 
    'Character Dialogues', 
    'Behind-the-Scenes Concepts', 
    'Meme-worthy Mashups', 
    'Deep Lore Explorations', 
    'Hyper-Realistic', 
    'Dramatic Lighting', 
    'Epic Action', 
    'Concept Art', 
    'Digital Illustration', 
    'Noir & Gritty', 
    'Vibrant & Neon', 
    'Surreal & Abstract', 
    'Minimalist Design'
  ];

  const allTags = Array.from(new Set(savedImages.flatMap(img => img.tags || []))).sort();

  const displayedImages = (view === 'studio' ? images : savedImages)
    .filter(img => {
      const matchesSearch = img.prompt.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           img.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesModel = filterModel === 'all' || img.modelInfo?.modelId === filterModel;
      const matchesUniverse = filterUniverse === 'all' || img.universe === filterUniverse;
      const matchesCollection = selectedCollectionId === 'all' || img.collectionId === selectedCollectionId;
      
      const matchesTag = !tagQuery.trim() || (() => {
        const query = tagQuery.toLowerCase();
        // Split by OR (comma or 'or')
        const orParts = query.split(/\s+or\s+|,/i);
        return orParts.some(part => {
          // Split by AND (semicolon or 'and')
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
    });

  const handlePushToCompare = (prompt: string, options: GenerateOptions) => {
    setComparisonPrompt(prompt);
    setComparisonOptions(options);
    setView('compare');
  };

  const handleCompare = async () => {
    if (comparisonModels.length < 2) {
      alert('Please select at least 2 models to compare.');
      return;
    }
    if (!comparisonPrompt.trim()) {
      alert('Please enter a prompt for comparison.');
      return;
    }

    setIsComparing(true);
    try {
      await generateComparison(comparisonPrompt, comparisonModels, comparisonOptions);
    } catch (e) {
      console.error('Comparison failed', e);
    } finally {
      setIsComparing(false);
    }
  };

  const handleAnimate = async (img: GeneratedImage, isBatch: boolean = false) => {
    if (!img.imageId) {
      if (!isBatch) alert('Only images generated with Leonardo.AI can be animated currently.');
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
        const cleaned = dynamicText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const dynamicSettings = JSON.parse(cleaned || '{}');
        if (dynamicSettings.duration && [3, 5, 10].includes(dynamicSettings.duration)) {
          duration = dynamicSettings.duration;
        }
        if (dynamicSettings.style) {
          style = dynamicSettings.style;
        }

        // Update settings in UI to reflect the dynamically chosen values
        updateSettings({
          defaultAnimationDuration: duration as 3 | 5 | 10,
          defaultAnimationStyle: style
        });
      } catch (e) {
        console.error('Failed to parse dynamic video settings', e);
      }

      let videoPrompt = style === 'Standard' ? img.prompt : `${img.prompt}. Motion style: ${style}`;
      try {
        const enhanced = await streamAIToString(
          `The user wants to animate an image based on this prompt: "${img.prompt}". Enhance this prompt for a video animation. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers for Star Wars, Marvel, DC, and Warhammer 40k. Motion style: ${style}. Return ONLY the enhanced animation prompt as a single string.`,
          { mode: 'enhance' }
        );
        if (enhanced.trim()) videoPrompt = enhanced.trim();
      } catch (e) {
        console.error('Failed to enhance video prompt, using fallback', e);
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
          const err = await res.json();
          errMessage = err.error || errMessage;
        } catch (e) {
          const text = await res.text();
          errMessage = `Server error (${res.status}): ${text.slice(0, 100)}...`;
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      
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
          const statusData = await statusRes.json();
          status = statusData.status;
          if (status === 'COMPLETE') {
            videoUrl = statusData.url;
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
              const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const parsed = JSON.parse(cleaned);
              return Array.isArray(parsed) ? parsed : (parsed?.tags || ['Mashup']);
            } catch (e) {
              console.error('Failed to auto-tag during generation', e);
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
          if (!isBatch) alert('Video generated and saved to gallery!');
        }
      }
    } catch (error: any) {
      console.error('Animation error:', error);
      if (!isBatch) alert(`Animation failed: ${error.message}`);
    } finally {
      setImageStatus(img.id, 'ready');
    }
  };

  const handleBatchAnimate = async () => {
    const imagesToAnimate = savedImages.filter(img => selectedForBatch.has(img.id) && img.imageId && !img.isVideo);
    if (imagesToAnimate.length === 0) {
      alert('No valid Leonardo images selected for animation.');
      return;
    }
    setSelectedForBatch(new Set());
    await Promise.allSettled(imagesToAnimate.map(img => handleAnimate(img, true)));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 shrink-0 bg-zinc-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-indigo-600 hidden sm:flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-white truncate max-w-[120px] sm:max-w-none">Mashup Studio</h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800 overflow-x-auto hide-scrollbar snap-x">
            <button
              onClick={() => setView('ideas')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'ideas' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Lightbulb className="w-4 h-4 hidden sm:block" />
              Ideas
            </button>
            <button
              onClick={() => setView('compare')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'compare' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Sparkles className="w-4 h-4 hidden sm:block" />
              Studio
            </button>
            <button
              onClick={() => setView('gallery')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'gallery' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <LayoutGrid className="w-4 h-4 hidden sm:block" />
              Gallery ({savedImages.length})
            </button>
            <button
              onClick={() => setView('captioning')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'captioning' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Edit3 className="w-4 h-4 hidden sm:block" />
              Captioning
            </button>
            <button
              onClick={() => setView('post-ready')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'post-ready' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Save className="w-4 h-4 hidden sm:block" />
              Post Ready
            </button>
            <button
              onClick={() => setView('pipeline')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'pipeline' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Zap className="w-4 h-4 hidden sm:block" />
              Pipeline
            </button>
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
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:hover:bg-white rounded-lg font-medium text-sm transition-colors shrink-0"
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
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
                      <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                        <Bookmark className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">Gallery</h2>
                        <p className="text-sm text-zinc-400">{savedImages.length} saved images</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>{savedImages.length} images</span>
                      <span className="text-zinc-700">·</span>
                      <span>{savedImages.filter((i) => i.tags && i.tags.length > 0).length} tagged</span>
                      <span className="text-zinc-700">·</span>
                      <span>{savedImages.filter((i) => i.postCaption).length} captioned</span>
                      <span className="text-zinc-700">·</span>
                      <span>{savedImages.filter((i) => i.isPostReady).length} post-ready</span>
                    </div>
                  </div>

                  {/* Filter card */}
                  <div className="flex flex-col gap-4 bg-zinc-900/80 backdrop-blur-sm p-4 md:p-5 rounded-2xl border border-zinc-800/60">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                      <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search by prompt or tags..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 transition-colors"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {selectedForBatch.size > 0 && (
                          <>
                            <span className="px-2 py-1 text-[11px] font-medium bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                              {selectedForBatch.size} selected
                            </span>
                            <button
                              onClick={handleBatchAnimate}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
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
                            className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
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
                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800/60'
                        }`}
                      >
                        All
                      </button>
                      {ALL_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setFilterModel(m.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                            filterModel === m.id
                              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
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
                          className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
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
                          className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
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
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors"
                          />
                        </div>
                        {tagQuery && (
                          <button
                            onClick={() => setTagQuery('')}
                            className="p-1 text-zinc-500 hover:text-white"
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
                      <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">Ideas Board</h2>
                        <p className="text-sm text-zinc-400">Review, approve, and push brainstormed ideas to the Studio</p>
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
                          className="flex-1 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl p-4 flex flex-col gap-4"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const ideaId = e.dataTransfer.getData('ideaId');
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
                            {ideas.filter((i) => i.status === status).map((idea) => (
                              <div
                                key={idea.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('ideaId', idea.id)}
                                className={`bg-zinc-950/80 border border-zinc-800/60 rounded-xl p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing transition-colors ${statusCfg.hoverBorder}`}
                              >
                                {idea.context && <h4 className="text-sm font-bold text-amber-400">{idea.context}</h4>}
                                <p className="text-xs text-zinc-300 line-clamp-4">{idea.concept}</p>
                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-800/60">
                                  <span className="text-[10px] text-zinc-500">
                                    {new Date(idea.createdAt).toLocaleDateString()}
                                  </span>
                                  <div className="flex gap-1">
                                    {status === 'idea' && (
                                      <button
                                        onClick={() => updateIdeaStatus(idea.id, 'in-work')}
                                        className="text-[10px] bg-emerald-600/80 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    {status === 'in-work' && (
                                      <>
                                        <button
                                          onClick={() => handlePushIdeaToCompare(idea.concept)}
                                          disabled={isPushing}
                                          className="text-[10px] bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-50 text-white px-2 py-1 rounded-lg flex items-center gap-1"
                                        >
                                          {isPushing ? <Loader2 className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                                          To Studio
                                        </button>
                                        <button
                                          onClick={() => updateIdeaStatus(idea.id, 'done')}
                                          className="text-[10px] bg-emerald-600/80 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg"
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
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">Mashup Studio</h2>
                      <p className="text-sm text-zinc-400">Generate images with different AI models and artistic styles</p>
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl p-6 space-y-6">
                    <div className="flex flex-wrap justify-end gap-2">
                        <select
                          className="text-xs bg-zinc-950 border border-zinc-800/60 rounded-xl px-2 py-1 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 max-w-[150px]"
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
                        <button
                          onClick={handleGenerateIdea}
                          disabled={isGeneratingIdea}
                          className="text-xs bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors border border-emerald-500/20"
                        >
                          {isGeneratingIdea ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Generate Idea
                        </button>
                        <button
                          onClick={() => autoSelectParameters(comparisonPrompt)}
                          disabled={isAutoSelecting || !comparisonPrompt.trim()}
                          className="text-xs bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors border border-emerald-500/20 disabled:opacity-50"
                        >
                          {isAutoSelecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Auto-Select Params
                        </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Select Models</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {ALL_MODELS.map(model => (
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
                                  ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                                  : 'bg-zinc-900 border-zinc-800/60 text-zinc-400 hover:border-zinc-700/50'
                              }`}
                            >
                              <span className="truncate mr-2">{model.name}</span>
                              {comparisonModels.includes(model.id) && <BookmarkCheck className="w-3 h-3 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Image Prompt
                        </label>
                        <textarea
                          value={comparisonPrompt}
                          onChange={(e) => setComparisonPrompt(e.target.value)}
                          placeholder="Enter a prompt to compare across models..."
                          className="w-full bg-zinc-950/80 border border-emerald-500/30 rounded-xl p-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-h-[100px] resize-none shadow-inner shadow-emerald-500/5"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-red-400/70 flex items-center gap-2">
                          <Ban className="w-4 h-4" />
                          Negative Prompt (Optional)
                        </label>
                        <input
                          type="text"
                          value={comparisonOptions.negativePrompt || ''}
                          onChange={(e) => setComparisonOptions(prev => ({ ...prev, negativePrompt: e.target.value }))}
                          placeholder="What to avoid (e.g. blurry, low quality, extra limbs)..."
                          className="w-full bg-zinc-950/80 border border-red-500/20 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 shadow-inner shadow-red-500/5"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <Palette className="w-3 h-3" /> Art Style
                          </label>
                          <select
                            value={comparisonOptions.style || ART_STYLES[0]}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, style: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                          >
                            {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <Sun className="w-3 h-3" /> Lighting
                          </label>
                          <select
                            value={comparisonOptions.lighting || LIGHTING_OPTIONS[0]}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, lighting: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                          >
                            {LIGHTING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <Camera className="w-3 h-3" /> Camera Angle
                          </label>
                          <select
                            value={comparisonOptions.angle || CAMERA_ANGLES[0]}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, angle: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                          >
                            {CAMERA_ANGLES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <ImageIcon className="w-3 h-3" /> Aspect Ratio
                          </label>
                          <select
                            value={comparisonOptions.aspectRatio}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, aspectRatio: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                          >
                            {['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].map(ar => <option key={ar} value={ar}>{ar}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <Maximize className="w-3 h-3" /> Image Size
                          </label>
                          <select
                            value={comparisonOptions.imageSize}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, imageSize: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                          >
                            {['512px', '1K', '2K', '4K'].map(size => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>

                      </div>

                      <button
                        onClick={handleCompare}
                        disabled={isComparing || comparisonModels.length < 2 || !comparisonPrompt.trim()}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <div className="flex items-center gap-4">
                              <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                                <Columns className="w-4 h-4" />
                                Comparison: {group[0]?.prompt.slice(0, 50)}...
                              </h3>
                              <button
                                onClick={() => {
                                  group.forEach(img => deleteComparisonResult(img.id));
                                }}
                                className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete Group
                              </button>
                            </div>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              {new Date(parseInt(compId.split('-')[2]) || Date.now()).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            {group.map((img) => (
                              <div key={img.id} className={`group relative bg-zinc-900 rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-1 ${img.winner ? 'border-green-500 ring-2 ring-green-500/20' : 'border-zinc-800 shadow-xl'}`}>
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
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 pointer-events-none">
                                        <div className="flex gap-3 pointer-events-auto">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); pickComparisonWinner(img.id); }}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${img.winner ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                          >
                                            {img.winner ? <CheckCircle2 className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                            {img.winner ? 'Picked' : 'Keep this version'}
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
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
                // pollute this tab.
                const all = savedImages;
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
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                          <Edit3 className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                        <h2 className="text-xl font-semibold text-white">Captioning Studio</h2>
                        <p className="text-xs text-zinc-500 mt-1">
                          {captioned.length} / {all.length} captioned
                          {batchProgress && (
                            <span className="ml-3 text-emerald-400">
                              Batch: {batchProgress.done}/{batchProgress.total}
                            </span>
                          )}
                        </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
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
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center gap-1.5 transition-colors"
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
                            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center gap-1.5 transition-colors"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Group Selected ({captioningSelected.size})
                          </button>
                        )}

                        <button
                          onClick={() => batchCaptionImages(visible)}
                          disabled={batchCaptioning || uncaptioned.length === 0}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-full flex items-center gap-1.5 transition-colors"
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
                                className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl overflow-hidden flex flex-col"
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
                                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600/90 text-[10px] font-medium text-white rounded-full">
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
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  {(anchor.postHashtags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {anchor.postHashtags!.map((tag, i) => (
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
                                <div className="border-t border-zinc-800/60 p-3 flex items-center gap-2">
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
                                    className="flex-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
                                    className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
                                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
                              className={`bg-zinc-900/80 backdrop-blur-sm border rounded-2xl overflow-hidden flex flex-col transition-colors ${
                                isSelected ? 'border-emerald-500/60' : 'border-zinc-800/60 hover:border-zinc-700/50'
                              }`}
                            >
                              {/* Thumbnail */}
                              <div className="relative aspect-square bg-zinc-950">
                                {img.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img.url}
                                    alt={img.prompt}
                                    className="w-full h-full object-cover"
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
                                      className="w-5 h-5 rounded border-zinc-600 bg-zinc-900/80 backdrop-blur-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
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
                                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    Hashtags
                                  </label>
                                  {(img.postHashtags || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {img.postHashtags!.map((tag, i) => (
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
                                  className="flex-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md flex items-center justify-center gap-1.5 transition-colors"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {img.postCaption ? 'Regenerate' : 'Generate'}
                                </button>
                                <button
                                  disabled={!img.postCaption}
                                  onClick={() => patchImage(img, { isPostReady: true })}
                                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                  title="Mark as ready to post"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('Delete this caption and remove the image from the gallery?')) {
                                      deleteImage(img.id, true);
                                    }
                                  }}
                                  className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-500 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                  title="Delete image"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Carousel multi-source picker modal */}
                    {showCarouselPicker && (
                      <div
                        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowCarouselPicker(false)}
                      >
                        <div
                          className="bg-zinc-900/95 backdrop-blur border border-zinc-800/60 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                                <LayoutGrid className="w-5 h-5 text-indigo-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-white">
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
                            {all.length === 0 ? (
                              <p className="text-sm text-zinc-500 text-center py-8">
                                No saved images yet.
                              </p>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {all.map((img) => {
                                  // When editing, already-in-group images are
                                  // pre-selected. Images that belong to a
                                  // DIFFERENT explicit group are greyed out
                                  // so you can't pull them out accidentally.
                                  const inAnotherGroup = (settings.carouselGroups || []).some(
                                    (g) => g.id !== pickerTargetGroupId && g.imageIds.includes(img.id)
                                  );
                                  const selected = pickerSelected.has(img.id);
                                  return (
                                    <button
                                      key={img.id}
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
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                          <ImageIcon className="w-6 h-6 text-zinc-700" />
                                        </div>
                                      )}
                                      {selected && (
                                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                          <Check className="w-3 h-3" />
                                        </div>
                                      )}
                                    </button>
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
                                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {pickerTargetGroupId ? 'Update Carousel' : 'Create Carousel'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {view === 'post-ready' && (() => {
                const all = savedImages;
                const ready = all.filter((i) => i.isPostReady === true);
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
                      // eslint-disable-next-line no-await-in-loop
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
                        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                          <Save className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-white">Post Ready</h2>
                          <p className="text-xs text-zinc-500 mt-1">
                            {ready.length} posts ready / {all.length} total saved images
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
                        <button
                          onClick={() => {
                            // Seed the mini-modal with the default schedule
                            // (one hour from now) and all available platforms.
                            const d = new Date(Date.now() + 60 * 60 * 1000);
                            setScheduleAllForm({
                              date: d.toISOString().slice(0, 10),
                              time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                              platforms: available,
                            });
                            setShowScheduleAll(true);
                          }}
                          disabled={ready.length === 0 || available.length === 0}
                          className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                          title="Schedule every post-ready image"
                        >
                          <Clock className="w-3.5 h-3.5" /> Schedule All
                        </button>
                        <button
                          onClick={postAllNow}
                          disabled={ready.length === 0 || available.length === 0}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                          title="Post every image to its selected platforms"
                        >
                          <Send className="w-3.5 h-3.5" /> Post All Now
                        </button>
                      </div>
                    </div>

                    {available.length === 0 && (
                      <div className="px-4 py-3 bg-amber-900/20 border border-amber-800/40 rounded-lg text-xs text-amber-300">
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
                          <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl overflow-hidden">
                            {/* Calendar header */}
                            <div className="flex items-center justify-between p-4 border-b border-zinc-800/60">
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
                                updateSettings({
                                  scheduledPosts: (settings.scheduledPosts || []).map((sp) =>
                                    sp.id === editing.id ? { ...sp, platforms: next } : sp
                                  ),
                                });
                              };
                              const patchField = (patch: Partial<ScheduledPost>) => {
                                updateSettings({
                                  scheduledPosts: (settings.scheduledPosts || []).map((sp) =>
                                    sp.id === editing.id ? { ...sp, ...patch } : sp
                                  ),
                                });
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
                                        className="w-full bg-zinc-900 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                      <input
                                        type="time"
                                        value={editing.time}
                                        onChange={(e) => patchField({ time: e.target.value })}
                                        className="w-full bg-zinc-900 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                                        updateSettings({
                                          scheduledPosts: (settings.scheduledPosts || []).filter((sp) => sp.id !== editing.id),
                                        });
                                        setEditingPostId(null);
                                      }}
                                      className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-500 text-white rounded-xl flex items-center gap-1.5"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                    <div className="flex-1" />
                                    <button
                                      onClick={() => setEditingPostId(null)}
                                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-1.5"
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
                                          updateSettings({
                                            scheduledPosts: (settings.scheduledPosts || []).map((sp) =>
                                              sp.id === postId ? { ...sp, date: dateStr, time: newTime } : sp
                                            ),
                                          });
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
                                              className={`relative w-full text-left px-2 py-1 rounded-md border text-[10px] truncate cursor-grab active:cursor-grabbing ${calendarColorFor(p.status)} ${
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
                        <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl overflow-hidden">
                          <div className="flex items-center justify-between p-4 border-b border-zinc-800/60">
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
                      const postReady = savedImages.filter((i) => i.isPostReady === true);
                      const selectedImageId =
                        slot.imageId || (postReady.length === 1 ? postReady[0].id : undefined);
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
                        updateSettings({
                          scheduledPosts: [...(settings.scheduledPosts || []), newPost],
                        });
                        setCalendarSlotClick(null);
                      };

                      const postImmediately = async () => {
                        if (!selectedImage || selectedPlatforms.length === 0) return;
                        await postImageNow(selectedImage, selectedPlatforms);
                        setCalendarSlotClick(null);
                      };

                      return (
                        <div
                          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                          onClick={() => setCalendarSlotClick(null)}
                        >
                          <div
                            className="bg-zinc-900/95 backdrop-blur border border-zinc-800/60 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between p-5 border-b border-zinc-800/60">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                                  <Clock className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-semibold text-white">Schedule Post</h3>
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
                                {postReady.length === 0 ? (
                                  <p className="text-xs text-amber-400">
                                    No post-ready images yet. Go to the Gallery and click
                                    &quot;Prepare for Post&quot; on an image first.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                    {postReady.map((img) => {
                                      const isSel = img.id === selectedImageId;
                                      return (
                                        <button
                                          key={img.id}
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
                                              className="w-full h-full object-cover"
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
                                        </button>
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
                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                  <input
                                    type="time"
                                    value={slot.time}
                                    onChange={(e) => setCalendarSlotClick({ ...slot, time: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" /> Post Now
                              </button>
                              <button
                                onClick={createScheduledPost}
                                disabled={!selectedImage || selectedPlatforms.length === 0}
                                className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-1.5"
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
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
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
                            return (
                              <div
                                key={item.id}
                                className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 rounded-2xl overflow-hidden hover:border-zinc-700/50 transition-all duration-300 flex flex-col"
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
                                        onClick={() => setSelectedImage(ci)}
                                        className="h-36 w-36 object-cover rounded-lg cursor-zoom-in shrink-0"
                                      />
                                    ))}
                                  </div>
                                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600/90 text-[10px] font-medium text-white rounded-full">
                                    <LayoutGrid className="w-3 h-3" /> Carousel · {item.images.length} images
                                  </span>
                                  {isExplicit && (
                                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 text-[10px] font-medium text-zinc-300 rounded-full border border-zinc-700">
                                      manual
                                    </span>
                                  )}
                                </div>

                                {/* Shared caption (anchor image's) */}
                                <div className="p-4 space-y-3 border-b border-zinc-800/60">
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
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  {(anchor.postHashtags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {anchor.postHashtags!.map((tag, i) => (
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

                                  {/* Date + time (same key-namespace as cells) */}
                                  {(() => {
                                    const carouselSchedule = getSchedule(key);
                                    return (
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                                          <input
                                            type="date"
                                            value={carouselSchedule.date}
                                            onChange={(e) => setScheduleFor(key, { date: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                                          <input
                                            type="time"
                                            value={carouselSchedule.time}
                                            onChange={(e) => setScheduleFor(key, { time: e.target.value })}
                                            className="w-full bg-zinc-950 border border-zinc-800/60 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0}
                                      onClick={() => {
                                        const sch = getSchedule(key);
                                        scheduleCarousel(item, selPlatforms, sch.date, sch.time);
                                      }}
                                      className="px-2 py-1.5 text-[11px] bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                      <Clock className="w-3.5 h-3.5" /> Schedule
                                    </button>
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0}
                                      onClick={() => postCarouselNow(item, selPlatforms)}
                                      className="px-2 py-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                      {busy === 'posting' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Send className="w-3.5 h-3.5" />
                                      )}
                                      Post Now
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
                                        className="flex-1 px-2 py-1.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
                                ? { text: `Scheduled ${scheduled.date} ${scheduled.time}`, color: 'bg-amber-600' }
                                : { text: 'Ready', color: 'bg-emerald-600' };
                          return (
                            <div
                              key={img.id}
                              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col md:flex-row"
                            >
                              {/* Image */}
                              <div className="relative md:w-48 md:shrink-0 aspect-square bg-zinc-950">
                                {img.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img.url}
                                    alt={img.prompt}
                                    onClick={() => setSelectedImage(img)}
                                    className="w-full h-full object-cover cursor-zoom-in"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-zinc-700" />
                                  </div>
                                )}
                                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 ${badge.color}/90 text-[10px] font-medium text-white rounded-full`}>
                                  <Check className="w-3 h-3" /> {badge.text}
                                </span>
                              </div>

                              {/* Right column */}
                              <div className="flex-1 flex flex-col">
                                {/* Caption + hashtags */}
                                <div className="flex-1 p-4 space-y-3 border-b border-zinc-800">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Caption
                                    </label>
                                    <AutoTextarea
                                      value={img.postCaption || ''}
                                      onChange={(e) => patchImage(img, { postCaption: e.target.value })}
                                      placeholder="No caption yet…"
                                      minRows={2}
                                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      Hashtags
                                    </label>
                                    {(img.postHashtags || []).length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {img.postHashtags!.map((tag, i) => (
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
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        Time
                                      </label>
                                      <input
                                        type="time"
                                        value={schedule.time}
                                        onChange={(e) => setScheduleFor(img.id, { time: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                      />
                                    </div>
                                  </div>

                                  {/* Action row */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0 || !schedule.date || !schedule.time}
                                      onClick={() => scheduleImage(img, selPlatforms, schedule.date, schedule.time)}
                                      className="px-2 py-1.5 text-[11px] bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-md flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                      <Clock className="w-3.5 h-3.5" /> Schedule
                                    </button>
                                    <button
                                      disabled={!!busy || selPlatforms.length === 0}
                                      onClick={() => postImageNow(img, selPlatforms)}
                                      className="px-2 py-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-md flex items-center justify-center gap-1.5 transition-colors"
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
                                  <div className="grid grid-cols-3 gap-2">
                                    <button
                                      onClick={() => copyWithFeedback(formatPost(img), `all-${img.id}`)}
                                      disabled={!img.postCaption}
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-md flex items-center justify-center gap-1 transition-colors"
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
                                      className="px-2 py-1.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md flex items-center justify-center gap-1 transition-colors"
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
                                      className="px-2 py-1.5 text-[10px] bg-zinc-800 hover:bg-red-500/80 text-white rounded-md flex items-center justify-center gap-1 transition-colors"
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

                    {/* Schedule-All mini modal */}
                    {showScheduleAll && (
                      <div
                        className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
                        onClick={() => setShowScheduleAll(false)}
                      >
                        <div
                          className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-5 space-y-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                              <Clock className="w-5 h-5 text-amber-400" />
                              Schedule {ready.length} posts
                            </h3>
                            <button
                              onClick={() => setShowScheduleAll(false)}
                              className="p-1 text-zinc-400 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                              <input
                                type="date"
                                value={scheduleAllForm.date}
                                onChange={(e) => setScheduleAllForm({ ...scheduleAllForm, date: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                              <input
                                type="time"
                                value={scheduleAllForm.time}
                                onChange={(e) => setScheduleAllForm({ ...scheduleAllForm, time: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Platforms</label>
                            <div className="flex flex-wrap gap-1.5">
                              {available.map((p) => {
                                const checked = scheduleAllForm.platforms.includes(p);
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() =>
                                      setScheduleAllForm({
                                        ...scheduleAllForm,
                                        platforms: checked
                                          ? scheduleAllForm.platforms.filter((x) => x !== p)
                                          : [...scheduleAllForm.platforms, p],
                                      })
                                    }
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

                          <p className="text-[11px] text-zinc-500">
                            Every post-ready image will be scheduled for the same timestamp. The auto-post worker will publish them one at a time when the time hits.
                          </p>

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setShowScheduleAll(false)}
                              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={
                                scheduleAllForm.platforms.length === 0 ||
                                !scheduleAllForm.date ||
                                !scheduleAllForm.time
                              }
                              onClick={() => {
                                for (const img of ready) {
                                  scheduleImage(
                                    img,
                                    scheduleAllForm.platforms,
                                    scheduleAllForm.date,
                                    scheduleAllForm.time
                                  );
                                }
                                setShowScheduleAll(false);
                              }}
                              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5" /> Schedule All
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {view === 'pipeline' && <PipelinePanel />}

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
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 pb-12`}>
              {displayedImages.map((img, idx) => {
                const isSaved = savedImages.some(s => s.id === img.id);
                return (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1, ease: "easeOut" }}
                    onClick={() => setSelectedImage(img)}
                    className={`group relative bg-zinc-900/80 backdrop-blur-sm border rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:border-emerald-500/30 ${
                      dragOverCollection ? 'ring-2 ring-emerald-500 border-emerald-500/60' : 'border-zinc-800/60 hover:border-zinc-700/50'
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
                            className="w-5 h-5 rounded border-zinc-600 bg-zinc-900/80 backdrop-blur-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                          />
                        </div>
                      )}
                      
                      {img.isVideo ? (
                        <div className="relative w-full h-full">
                          <video
                            src={img.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
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
                        <Image
                          src={img.url || `data:image/jpeg;base64,${img.base64}`}
                          alt={img.prompt}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      
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

                      {/* Bottom Overlay — prompt + download.
                          The card itself is clickable to open the image,
                          so no explicit "View Details" button. */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
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
                            className="px-1.5 py-0.5 text-[9px] bg-zinc-800/80 text-zinc-400 rounded-full"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full h-full flex flex-col md:flex-row"
          >
            {/* Image Area - Full Window Dynamic */}
            <div className="flex-1 relative bg-black flex items-center justify-center p-4 md:p-8 overflow-hidden">
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-6 left-6 z-50 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all border border-white/10"
              >
                <X className="w-6 h-6" />
              </button>

              {selectedImage.isVideo ? (
                <div className="relative w-full h-full flex items-center justify-center group">
                  <video
                    src={selectedImage.url}
                    autoPlay
                    loop
                    controls
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                  />
                  {settings.watermark?.enabled && settings.watermark.image && (
                    <div 
                      className="absolute pointer-events-none"
                      style={{
                        top: settings.watermark.position.includes('top') ? '10px' : settings.watermark.position === 'center' ? '50%' : 'auto',
                        bottom: settings.watermark.position.includes('bottom') ? '10px' : 'auto',
                        left: settings.watermark.position.includes('left') ? '10px' : settings.watermark.position === 'center' ? '50%' : 'auto',
                        right: settings.watermark.position.includes('right') ? '10px' : 'auto',
                        transform: settings.watermark.position === 'center' ? 'translate(-50%, -50%)' : 'none',
                        opacity: settings.watermark.opacity,
                        width: `${settings.watermark.scale * 100}%`,
                        maxWidth: '200px'
                      }}
                    >
                      <Image src={settings.watermark.image} alt="Watermark" fill className="object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  {settings.watermark?.enabled && !settings.watermark.image && settings.channelName && (
                    <div 
                      className="absolute pointer-events-none text-white font-bold drop-shadow-md"
                      style={{
                        top: settings.watermark.position.includes('top') ? '10px' : settings.watermark.position === 'center' ? '50%' : 'auto',
                        bottom: settings.watermark.position.includes('bottom') ? '10px' : 'auto',
                        left: settings.watermark.position.includes('left') ? '10px' : settings.watermark.position === 'center' ? '50%' : 'auto',
                        right: settings.watermark.position.includes('right') ? '10px' : 'auto',
                        transform: settings.watermark.position === 'center' ? 'translate(-50%, -50%)' : 'none',
                        opacity: settings.watermark.opacity,
                        fontSize: `${Math.max(12, settings.watermark.scale * 40)}px`
                      }}
                    >
                      @{settings.channelName}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center group">
                  <Image
                    src={selectedImage.url || `data:image/jpeg;base64,${selectedImage.base64}`}
                    alt={selectedImage.prompt}
                    fill
                    className="object-contain shadow-2xl rounded-lg select-none"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-black/60 backdrop-blur-md text-white/60 text-[10px] px-2 py-1 rounded uppercase tracking-widest border border-white/5">
                      Original Size View
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Area */}
            <div className="w-full md:w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Model</h4>
                    <p className="text-xs text-white">{selectedImage.modelInfo?.modelName || 'Unknown'}</p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Provider</h4>
                    <p className="text-xs text-white capitalize">{selectedImage.modelInfo?.provider || 'Unknown'}</p>
                  </div>
                  {selectedImage.imageSize && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Image Size</h4>
                      <p className="text-xs text-white">{selectedImage.imageSize}</p>
                    </div>
                  )}
                  {selectedImage.aspectRatio && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Aspect Ratio</h4>
                      <p className="text-xs text-white">{selectedImage.aspectRatio}</p>
                    </div>
                  )}
                  {selectedImage.seed !== undefined && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Seed</h4>
                      <p className="text-xs text-white font-mono">{selectedImage.seed}</p>
                    </div>
                  )}
                  {selectedImage.universe && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Universe</h4>
                      <p className="text-xs text-white">{selectedImage.universe}</p>
                    </div>
                  )}
                </div>

                {selectedImage.negativePrompt && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                      <XCircle className="w-3 h-3" />
                      Negative Prompt
                    </h4>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400 leading-relaxed italic">
                      {selectedImage.negativePrompt}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    Prompt
                  </h4>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-300 leading-relaxed group relative">
                    {selectedImage.prompt}
                    <button 
                      onClick={() => navigator.clipboard.writeText(selectedImage.prompt)}
                      className="absolute top-2 right-2 p-1.5 bg-zinc-900 text-zinc-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Copy Prompt"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Tagging System */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Tag className="w-3 h-3" />
                    Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedImage.tags?.map(tag => (
                      <span 
                        key={tag} 
                        className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-lg border border-zinc-700 flex items-center gap-1 group"
                      >
                        {tag}
                        <button 
                          onClick={() => {
                            const newTags = selectedImage.tags?.filter(t => t !== tag) || [];
                            updateImageTags(selectedImage.id, newTags);
                            setSelectedImage({ ...selectedImage, tags: newTags });
                          }}
                          className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add tag..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val && !selectedImage.tags?.includes(val)) {
                            const newTags = [...(selectedImage.tags || []), val];
                            updateImageTags(selectedImage.id, newTags);
                            setSelectedImage({ ...selectedImage, tags: newTags });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="bg-transparent border border-dashed border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500 w-24"
                    />
                  </div>
                </div>

                {/* Collection Management */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <FolderPlus className="w-3 h-3" />
                    Collection
                  </h4>
                  <select
                    value={selectedImage.collectionId || ''}
                    onChange={(e) => {
                      const colId = e.target.value;
                      if (colId) {
                        addImageToCollection(selectedImage.id, colId);
                        setSelectedImage({ ...selectedImage, collectionId: colId });
                      } else {
                        removeImageFromCollection(selectedImage.id);
                        setSelectedImage({ ...selectedImage, collectionId: undefined });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="">None</option>
                    {collections.map(col => (
                      <option key={col.id} value={col.id}>{col.name}</option>
                    ))}
                  </select>
                  
                  <div className="space-y-2 pt-2">
                    <input 
                      type="text" 
                      placeholder="New collection name..." 
                      id="new-col-name"
                      className="w-full bg-transparent border-b border-zinc-800 text-xs text-zinc-400 py-1 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="Description (optional)..." 
                        id="new-col-desc"
                        className="flex-1 bg-transparent border-b border-zinc-800 text-[10px] text-zinc-500 py-1 focus:outline-none focus:border-indigo-500"
                      />
                      <button 
                        onClick={async () => {
                          const nameInput = document.getElementById('new-col-name') as HTMLInputElement;
                          const descInput = document.getElementById('new-col-desc') as HTMLInputElement;
                          
                          if (!nameInput.value.trim()) {
                            await createCollection(undefined, undefined, Array.from(selectedForBatch).length > 0 ? Array.from(selectedForBatch) : undefined);
                          } else {
                            createCollection(nameInput.value.trim(), descInput.value.trim(), Array.from(selectedForBatch).length > 0 ? Array.from(selectedForBatch) : undefined);
                          }
                          
                          nameInput.value = '';
                          descInput.value = '';
                        }}
                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-all flex items-center gap-1"
                        title="Create Collection"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">Add</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-zinc-800 space-y-4">
                  {selectedImage.imageId && !selectedImage.isVideo && (
                    <div className="space-y-4 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>Duration</span>
                        <select
                          value={settings.defaultAnimationDuration || 5}
                          onChange={(e) => updateSettings({ defaultAnimationDuration: Number(e.target.value) as 5 | 10 })}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white focus:outline-none"
                        >
                          <option value={5}>5s</option>
                          <option value={10}>10s</option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleAnimate(selectedImage)}
                        disabled={selectedImage.status === 'animating'}
                        className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                      >
                        {selectedImage.status === 'animating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                        {selectedImage.status === 'animating' ? 'Animating...' : 'Animate to Video'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        toggleApproveImage(selectedImage.id);
                        setSelectedImage({ ...selectedImage, approved: !selectedImage.approved });
                      }}
                      className={`flex-1 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg uppercase tracking-widest text-xs ${
                        selectedImage.approved 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                      }`}
                    >
                      <BookmarkCheck className="w-4 h-4" />
                      {selectedImage.approved ? 'Approved' : 'Approve'}
                    </button>
                    <a
                      href={selectedImage.url || `data:image/jpeg;base64,${selectedImage.base64}`}
                      download={selectedImage.isVideo ? `mashup-video.mp4` : `mashup-detail.jpg`}
                      className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 uppercase tracking-widest text-xs"
                      target={selectedImage.url ? "_blank" : undefined}
                      rel={selectedImage.url ? "noopener noreferrer" : undefined}
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                    <button
                      onClick={() => {
                        deleteImage(selectedImage.id, true);
                        setSelectedImage(null);
                      }}
                      className="w-14 h-14 flex items-center justify-center bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded-2xl transition-all border border-zinc-700"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-950/50 shrink-0">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* API Keys Section */}
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <label className="text-sm font-medium text-zinc-300">API Keys</label>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Leonardo API Key</label>
                  <input
                    type="password"
                    value={settings.apiKeys.leonardo || ''}
                    onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, leonardo: e.target.value } })}
                    placeholder="••••••••••••••••"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <h4 className="text-sm font-bold text-white">Free Social Posting Setup</h4>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Instagram Graph API (Free)</label>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={settings.apiKeys.instagram?.igAccountId || ''}
                        onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, instagram: { ...settings.apiKeys.instagram, igAccountId: e.target.value } as any } })}
                        placeholder="Instagram Business Account ID"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <input
                        type="password"
                        value={settings.apiKeys.instagram?.accessToken || ''}
                        onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, instagram: { ...settings.apiKeys.instagram, accessToken: e.target.value } as any } })}
                        placeholder="Long-lived Page Access Token"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">Requires a Facebook Developer App linked to an Instagram Business account.</p>
                  </div>

                  {/* Pinterest */}
                  <div className="space-y-2 pt-3 border-t border-zinc-800/60">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pinterest API</label>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="password"
                        value={settings.apiKeys.pinterest?.accessToken || ''}
                        onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, pinterest: { ...settings.apiKeys.pinterest, accessToken: e.target.value } as any } })}
                        placeholder="Pinterest Access Token"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <input
                        type="text"
                        value={settings.apiKeys.pinterest?.boardId || ''}
                        onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, pinterest: { ...settings.apiKeys.pinterest, boardId: e.target.value } as any } })}
                        placeholder="Board ID (optional — defaults to account's first board)"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Create an app at developers.pinterest.com with <code>pins:write</code> and <code>boards:read</code> scopes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-2">Image Generation Settings</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Leonardo Model</label>
                    <select
                      value={settings.defaultLeonardoModel}
                      onChange={(e) => updateSettings({ defaultLeonardoModel: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      {LEONARDO_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pi.dev — the AI engine for chat, ideas, captions, tags */}
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-2">Pi.dev AI Engine</h4>
                <p className="text-[11px] text-zinc-500 -mt-2">
                  All text AI runs through <code>pi</code> as a subprocess.
                  Configure provider/model + API keys in your terminal:{' '}
                  <code className="text-zinc-300">pi config</code>.
                </p>

                {/* Status row */}
                <div className="flex items-center gap-3">
                  {(() => {
                    const s = piStatus;
                    let label = 'Checking…';
                    let color = 'bg-zinc-700';
                    if (s) {
                      if (!s.installed) { label = 'Not Installed'; color = 'bg-red-600'; }
                      else if (!s.authenticated) { label = 'Not Authenticated'; color = 'bg-amber-600'; }
                      else if (s.running) { label = 'Running'; color = 'bg-emerald-600'; }
                      else { label = 'Ready'; color = 'bg-indigo-600'; }
                    }
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-white ${color}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                        {label}
                      </span>
                    );
                  })()}
                  {piStatus?.provider && piStatus?.model && (
                    <span className="text-[11px] text-zinc-400">
                      {piStatus.provider}/{piStatus.model}
                    </span>
                  )}
                  {piStatus && piStatus.modelsAvailable > 0 && (
                    <span className="text-[11px] text-zinc-500">
                      {piStatus.modelsAvailable} models available
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {piStatus && !piStatus.installed && (
                    <button
                      onClick={handlePiInstall}
                      disabled={piBusy !== null}
                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {piBusy === 'install' ? 'Installing…' : 'Install Pi'}
                    </button>
                  )}
                  {piStatus?.installed && !piStatus.running && (
                    <button
                      onClick={handlePiStart}
                      disabled={piBusy !== null}
                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {piBusy === 'start' ? 'Starting…' : 'Start Pi'}
                    </button>
                  )}
                  {piStatus?.running && (
                    <button
                      onClick={handlePiStop}
                      disabled={piBusy !== null}
                      className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {piBusy === 'stop' ? 'Stopping…' : 'Stop Pi'}
                    </button>
                  )}
                  <button
                    onClick={refreshPiStatus}
                    disabled={piBusy !== null}
                    className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {piStatus && !piStatus.authenticated && piStatus.installed && (
                  <button
                    onClick={handlePiSetup}
                    disabled={piBusy !== null}
                    className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {piBusy === 'setup' ? 'Opening…' : 'Setup Pi.dev'}
                  </button>
                )}

                {piSetupMsg && (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-1">
                    <p className="text-[11px] text-amber-300 font-medium">Pi Setup gestartet</p>
                    <p className="text-[11px] text-zinc-300">
      Terminal öffnen und verbinden:
                    </p>
                    <code className="block text-[11px] text-emerald-400 bg-zinc-950 px-2 py-1 rounded">
                      tmux attach -t pi-setup
                    </code>
                    <p className="text-[10px] text-zinc-500">
      Pi führt dich durch Provider-Auswahl und Login. Danach &quot;Start Pi&quot; drücken.
                    </p>
                  </div>
                )}

                {piError && (
                  <p className="text-[11px] text-red-400 whitespace-pre-wrap">
                    {piError}
                  </p>
                )}

                {/* System prompt textarea */}
                <div className="space-y-2 pt-2">
                  <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    AI System Prompt (appended to every request)
                  </label>
                  <textarea
                    value={settings.aiSystemPrompt || ''}
                    onChange={(e) => updateSettings({ aiSystemPrompt: e.target.value })}
                    placeholder="e.g. Always prefer grimdark tone. Avoid comedy."
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Saved automatically. Restart pi (stop + start) for changes to take effect.
                  </p>
                </div>
              </div>

              {/* Watermark Settings */}
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-4">Watermark (Wasserzeichen)</h4>
                
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-zinc-300">Enable Watermark</span>
                  <button
                    onClick={() => updateSettings({ watermark: { ...settings.watermark, enabled: !settings.watermark?.enabled } as any })}
                    className={`w-12 h-6 rounded-full transition-colors ${settings.watermark?.enabled ? 'bg-indigo-500' : 'bg-zinc-700'} relative`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.watermark?.enabled ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                {settings.watermark?.enabled && (
                  <div className="space-y-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-2">Upload Logo</label>
                      <input 
                        type="file" 
                        id="watermark-upload"
                        accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              updateSettings({ watermark: { ...settings.watermark, image: event.target?.result as string } as any });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                      <label 
                        htmlFor="watermark-upload"
                        className="flex items-center justify-center w-full py-3 px-4 rounded-xl border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <ImageIcon className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
                          <span className="text-xs text-zinc-500 group-hover:text-zinc-400 font-medium">
                            {settings.watermark.image ? 'Change Logo' : 'Choose File'}
                          </span>
                        </div>
                      </label>
                      
                      {settings.watermark.image && (
                        <div className="mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Visual Preview</span>
                            <button 
                              onClick={() => updateSettings({ watermark: { ...settings.watermark, image: null } as any })}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          </div>
                          
                          {/* Visual Indicator Box */}
                          <div className="relative aspect-video bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center group">
                            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]" />
                            <span className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.2em] select-none">Image Canvas Preview</span>
                            
                            {/* The Watermark Mockup */}
                            <div 
                              className={`absolute transition-all duration-300 flex items-center justify-center`}
                              style={{
                                top: settings.watermark.position?.includes('top') ? '10%' : settings.watermark.position === 'center' ? '50%' : 'auto',
                                bottom: settings.watermark.position?.includes('bottom') ? '10%' : 'auto',
                                left: settings.watermark.position?.includes('left') ? '10%' : settings.watermark.position === 'center' ? '50%' : 'auto',
                                right: settings.watermark.position?.includes('right') ? '10%' : 'auto',
                                transform: settings.watermark.position === 'center' ? 'translate(-50%, -50%)' : 'none',
                                opacity: settings.watermark.opacity || 0.8,
                                width: `${(settings.watermark.scale || 0.15) * 100}%`,
                                aspectRatio: '1/1',
                                maxWidth: '40%',
                                maxHeight: '40%'
                              }}
                            >
                              <Image 
                                src={settings.watermark.image} 
                                alt="Watermark preview" 
                                fill
                                className="object-contain drop-shadow-lg" 
                                unoptimized
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                            <Folder className="w-4 h-4 text-indigo-400" />
                          </div>
                          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Manage Collections</h4>
                        </div>
                        <button 
                          onClick={() => setShowCollectionModal(true)}
                          className="flex items-center gap-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          New
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                        {collections.map(col => (
                          <div key={col.id} className="group bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between hover:border-zinc-700 transition-all">
                            <div className="space-y-0.5">
                              <h5 className="text-xs font-bold text-white">{col.name}</h5>
                              <p className="text-[9px] text-zinc-600 uppercase tracking-tighter">
                                {savedImages.filter(img => img.collectionId === col.id).length} Images
                              </p>
                            </div>
                            <button 
                              onClick={() => deleteCollection(col.id)}
                              className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Delete Collection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {collections.length === 0 && (
                          <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                            <p className="text-[10px] text-zinc-500 italic">No collections created yet.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                          <Tag className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Social Media Settings</h4>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.1em]">Channel Name (for Hashtags)</label>
                        <input 
                          type="text"
                          value={settings.channelName || ''}
                          onChange={(e) => updateSettings({ channelName: e.target.value })}
                          placeholder="e.g. MultiverseMashupAI"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Position</label>
                        <select 
                          value={settings.watermark.position || 'bottom-right'}
                          onChange={(e) => updateSettings({ watermark: { ...settings.watermark, position: e.target.value as any } as any })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                        >
                          <option value="bottom-right">Bottom Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="top-left">Top Left</option>
                          <option value="center">Center</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Opacity</label>
                        <select 
                          value={settings.watermark.opacity || 0.8}
                          onChange={(e) => updateSettings({ watermark: { ...settings.watermark, opacity: parseFloat(e.target.value) } as any })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                        >
                          {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(val => (
                            <option key={val} value={val}>{Math.round(val * 100)}%</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Size (Relative to Image)</label>
                      <select 
                        value={settings.watermark.scale || 0.15}
                        onChange={(e) => updateSettings({ watermark: { ...settings.watermark, scale: parseFloat(e.target.value) } as any })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map(val => (
                          <option key={val} value={val}>{Math.round(val * 100)}%</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Video Generation Settings */}
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-4">Default Video Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Default Duration</label>
                    <select 
                      value={settings.defaultAnimationDuration || 5}
                      onChange={(e) => updateSettings({ defaultAnimationDuration: Number(e.target.value) as 5 | 10 })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                    >
                      <option value={5}>5 Seconds</option>
                      <option value={10}>10 Seconds</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Animation Style</label>
                    <select 
                      value={settings.defaultAnimationStyle || 'DYNAMIC'}
                      onChange={(e) => updateSettings({ defaultAnimationStyle: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                    >
                      <option value="DYNAMIC">Dynamic</option>
                      <option value="STATIC">Static</option>
                      <option value="CINEMATIC">Cinematic</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Leonardo Video Model</label>
                    <select 
                      value={settings.defaultVideoModel || 'kling-3.0'}
                      onChange={(e) => updateSettings({ defaultVideoModel: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                    >
                      <option value="kling-video-o-3">Kling O3 Omni (New)</option>
                      <option value="kling-3.0">Kling 3.0 (Pro Quality)</option>
                      <option value="ray-v2">Ray V2 (High Quality)</option>
                      <option value="ray-v1">Ray V1 (Standard)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Agent Personality Settings */}
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-4">AI Agent Personality</h4>
                <div className="space-y-6 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Content Creator Prompt</label>
                    <textarea 
                      value={settings.agentPrompt}
                      onChange={(e) => updateSettings({ agentPrompt: e.target.value })}
                      placeholder="Define who the agent is, how it speaks, and what it focuses on..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[120px] resize-none leading-relaxed"
                    />
                    <p className="text-[10px] text-zinc-500 leading-tight">
                      This prompt defines the &quot;personality&quot; of the AI when it brainstorms crossover concepts or enhances your prompts.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Platform Niches</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {settings.agentNiches?.map(n => (
                            <span 
                              key={n} 
                              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-lg border border-emerald-500/20 flex items-center gap-1 group"
                            >
                              {n}
                              <button 
                                onClick={() => updateSettings({ agentNiches: settings.agentNiches?.filter(t => t !== n) })}
                                className="text-emerald-500 hover:text-red-400 transition-all"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Add custom niche..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value.trim();
                              if (val && !settings.agentNiches?.includes(val)) {
                                updateSettings({ agentNiches: [...(settings.agentNiches || []), val] });
                                e.currentTarget.value = '';
                              }
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                        <div className="pt-2">
                          <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-tight font-semibold">Recommended Niches</p>
                          <div className="flex flex-wrap gap-1.5">
                            {RECOMMENDED_NICHES.filter(n => !settings.agentNiches?.includes(n)).map(n => (
                              <button
                                key={n}
                                onClick={() => updateSettings({ agentNiches: [...(settings.agentNiches || []), n] })}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-emerald-400 text-[9px] rounded-md border border-zinc-800 transition-all flex items-center gap-1"
                              >
                                <Plus className="w-2 h-2" />
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Target Genres</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {settings.agentGenres?.map(g => (
                            <span 
                              key={g} 
                              className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] rounded-lg border border-indigo-500/20 flex items-center gap-1 group"
                            >
                              {g}
                              <button 
                                onClick={() => updateSettings({ agentGenres: settings.agentGenres?.filter(t => t !== g) })}
                                className="text-indigo-500 hover:text-red-400 transition-all"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Add custom genre..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value.trim();
                              if (val && !settings.agentGenres?.includes(val)) {
                                updateSettings({ agentGenres: [...(settings.agentGenres || []), val] });
                                e.currentTarget.value = '';
                              }
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        <div className="pt-2">
                          <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-tight font-semibold">Recommended Genres</p>
                          <div className="flex flex-wrap gap-1.5">
                            {RECOMMENDED_GENRES.filter(g => !settings.agentGenres?.includes(g)).map(g => (
                              <button
                                key={g}
                                onClick={() => updateSettings({ agentGenres: [...(settings.agentGenres || []), g] })}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-indigo-400 text-[9px] rounded-md border border-zinc-800 transition-all flex items-center gap-1"
                              >
                                <Plus className="w-2 h-2" />
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Saved Personalities */}
                  <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Saved Personalities</label>
                      <button 
                        onClick={() => {
                          const name = prompt('Enter a name for this personality:');
                          if (name) {
                            const newPersonality = {
                              id: `p-${Date.now()}`,
                              name,
                              prompt: settings.agentPrompt || '',
                              niches: settings.agentNiches || [],
                              genres: settings.agentGenres || []
                            };
                            updateSettings({ 
                              savedPersonalities: [...(settings.savedPersonalities || []), newPersonality] 
                            });
                          }
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        <Save className="w-3 h-3" />
                        Save Current
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {settings.savedPersonalities?.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 group">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">{p.name}</span>
                            <span className="text-[10px] text-zinc-500">{p.niches.length} Niches • {p.genres.length} Genres</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => updateSettings({ 
                                agentPrompt: p.prompt,
                                agentNiches: p.niches,
                                agentGenres: p.genres
                              })}
                              className="p-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition-all"
                              title="Load Personality"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => updateSettings({ 
                                savedPersonalities: settings.savedPersonalities?.filter(pers => pers.id !== p.id) 
                              })}
                              className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!settings.savedPersonalities || settings.savedPersonalities.length === 0) && (
                        <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                          <p className="text-xs text-zinc-500 italic">No saved personalities yet.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => updateSettings({ 
                      agentPrompt: `You are a Master Content Creator and Social Media Growth Strategist. Your mission is to generate high-impact, viral-potential image prompts that drive massive traffic and engagement. You specialize in the 'Multiverse Mashup' niche, blending iconic universes like Marvel, DC, Star Wars, and Warhammer 40k. Your tone is professional yet edgy, focusing on 'what if' scenarios, alternative timelines, and epic cinematic crossovers. Every prompt you generate must be optimized for visual storytelling, high contrast, and emotional resonance to capture attention on platforms like Instagram, TikTok, and Twitter. Research current social media trends, popular crossover memes, and viral "what if" scenarios for these franchises to ensure your output is optimized for virality. Use the provided focus tags to strictly influence the style, theme, and technical execution of your output.`,
                      agentNiches: [
                        'Multiverse Mashup', 
                        'Fan Fiction & Lore', 
                        'Merchandise & Collectibles', 
                        'Cosplay & Fan Art', 
                        'Pop Culture Crossovers', 
                        'Alternate Realities', 
                        'Sci-Fi & Fantasy', 
                        'Retro & Nostalgia', 
                        'Cyberpunk & Futurism', 
                        'Grimdark & Gothic', 
                        'Street-Level Heroes', 
                        'Galactic Empires', 
                        'Eldritch Horrors', 
                        'Mythic Legends'
                      ],
                      agentGenres: [
                        'Visual Storytelling', 
                        'High Contrast', 
                        'Emotional Resonance', 
                        'Cinematic Crossovers', 
                        'What If Scenarios', 
                        'Alternative Timelines', 
                        'Epic Battles', 
                        'Character Dialogues', 
                        'Behind-the-Scenes Concepts', 
                        'Meme-worthy Mashups', 
                        'Deep Lore Explorations', 
                        'Hyper-Realistic', 
                        'Dramatic Lighting', 
                        'Epic Action', 
                        'Concept Art', 
                        'Digital Illustration', 
                        'Noir & Gritty', 
                        'Vibrant & Neon', 
                        'Surreal & Abstract', 
                        'Minimalist Design'
                      ]
                    })}
                    className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl font-bold transition-all border border-zinc-800 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset to Default Agent Personality
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showCollectionModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create New Collection</h3>
              <button onClick={() => setShowCollectionModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Collection Name</label>
                <input 
                  type="text" 
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="e.g., Epic Battles, Cyberpunk DC..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description (Optional)</label>
                <textarea 
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  placeholder="What is this collection about?"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[100px] resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowCollectionModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const imageIds = selectedForBatch.size > 0 ? Array.from(selectedForBatch) : undefined;
                  await createCollection(newCollectionName.trim() || undefined, newCollectionDesc.trim() || undefined, imageIds);
                  setNewCollectionName('');
                  setNewCollectionDesc('');
                  setShowCollectionModal(false);
                  if (imageIds) setSelectedForBatch(new Set());
                }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Create Collection
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      <AnimatePresence>
        {showBulkTagModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-indigo-400" />
                  Bulk Tagging ({selectedForBatch.size} Images)
                </h3>
                <button onClick={() => setShowBulkTagModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Tags (Comma separated)</label>
                  <input 
                    type="text"
                    value={bulkTagsInput}
                    onChange={(e) => setBulkTagsInput(e.target.value)}
                    placeholder="e.g. Marvel, Cinematic, 4k"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setBulkTagMode('append')}
                    className={`flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                      bulkTagMode === 'append' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    Append
                  </button>
                  <button
                    onClick={() => setBulkTagMode('replace')}
                    className={`flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                      bulkTagMode === 'replace' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    Replace
                  </button>
                </div>
              </div>
              <div className="p-6 bg-zinc-950/50 flex gap-3">
                <button
                  onClick={() => setShowBulkTagModal(false)}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    let tags = bulkTagsInput.split(',').map(t => t.trim()).filter(t => t !== '');
                    // If no commas, try splitting by space but keep known phrases together
                    if (tags.length === 1 && tags[0].includes(' ')) {
                      const knownPhrases = ['warhammer 40k', 'star wars', 'marvel cinematic universe', 'dc comics'];
                      const lowerInput = tags[0].toLowerCase();
                      let tempInput = tags[0];
                      knownPhrases.forEach(phrase => {
                        if (lowerInput.includes(phrase)) {
                          const placeholder = `__PHRASE_${phrase.replace(/\s+/g, '_')}__`;
                          tempInput = tempInput.replace(new RegExp(phrase, 'gi'), placeholder);
                        }
                      });
                      tags = tempInput.split(/\s+/).map(t => {
                        if (t.startsWith('__PHRASE_') && t.endsWith('__')) {
                          return t.replace('__PHRASE_', '').replace('__', '').replace(/_/g, ' ');
                        }
                        return t;
                      }).filter(t => t);
                    }

                    if (tags.length > 0) {
                      bulkUpdateImageTags(Array.from(selectedForBatch), tags, bulkTagMode);
                      setShowBulkTagModal(false);
                      setBulkTagsInput('');
                      setSelectedForBatch(new Set());
                    }
                  }}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
                >
                  Apply Tags
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

