import React from 'react';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface GeneratedImage {
  id: string;
  base64?: string;
  url?: string;
  prompt: string;
  imageId?: string;
  savedAt?: number;
  isVideo?: boolean;
  tags?: string[];
  collectionId?: string;
  postCaption?: string;
  postHashtags?: string[];
  approved?: boolean;
  isPostReady?: boolean;
  winner?: boolean;
  comparisonId?: string;
  status?: 'generating' | 'animating' | 'ready';
  modelInfo?: {
    provider: 'leonardo';
    modelId: string;
    modelName: string;
  };
  universe?: string;
  style?: string;
  seed?: number;
  negativePrompt?: string;
  aspectRatio?: string;
  imageSize?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface GenerateOptions {
  negativePrompt?: string;
  aspectRatio?: string;
  imageSize?: string;
  provider?: 'leonardo';
  leonardoModel?: string;
  skipEnhance?: boolean;
  style?: string;
  lighting?: string;
  angle?: string;
  seed?: number;
  cfgScale?: number;
}

export interface WatermarkSettings {
  enabled: boolean;
  image: string | null;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number;
  scale: number;
}

export interface AgentPersonality {
  id: string;
  name: string;
  prompt: string;
  niches: string[];
  genres: string[];
}

export interface Idea {
  id: string;
  concept: string;
  context?: string;
  createdAt: number;
  status: 'idea' | 'in-work' | 'done';
}

export interface ScheduledPost {
  id: string;
  imageId: string;
  date: string;
  time: string;
  platforms: string[];
  caption: string;
  status?: 'scheduled' | 'posted' | 'failed';
}

export interface UserSettings {
  enabledProviders: 'leonardo'[];
  apiKeys: {
    leonardo?: string;
    instagram?: {
      accessToken: string;
      igAccountId: string;
    };
    twitter?: {
      appKey: string;
      appSecret: string;
      accessToken: string;
      accessSecret: string;
    };
    discordWebhook?: string;
  };
  defaultLeonardoModel: string;
  defaultVideoModel?: string;
  defaultAnimationDuration?: 3 | 5 | 10;
  defaultAnimationStyle?: string;
  watermark?: WatermarkSettings;
  agentPrompt?: string;
  agentNiches?: string[];
  agentGenres?: string[];
  channelName?: string;
  savedPersonalities?: AgentPersonality[];
  scheduledPosts?: ScheduledPost[];
}

export type ViewType = 'studio' | 'gallery' | 'compare' | 'captioning' | 'post-ready' | 'ideas' | 'pipeline';

export interface PipelineLogEntry {
  timestamp: Date;
  step: string;
  ideaId: string;
  status: 'success' | 'error';
  message: string;
}

export interface PipelineProgress {
  current: number;
  total: number;
  currentStep: string;
  currentIdea: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const RECOMMENDED_NICHES = [
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

export const RECOMMENDED_GENRES = [
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

// ── Leonardo Models (API-documented) ──────────────────────────────────────

export interface LeonardoModelConfig {
  id: string;
  name: string;
  apiModelId: string;
  version: 'v2';
  supportsStyleIds: boolean;
  supportsQuality: boolean;      // GPT Image-1.5 only
  supportsGuidance: boolean;
  maxQuantity: number;
  aspectRatios: { label: string; width: number; height: number }[];
  styles?: { name: string; uuid: string }[];
}

// Shared styles for Nano Banana 2 and Nano Banana Pro (API-documented, 19 styles)
const LEONARDO_SHARED_STYLES = [
  { name: 'None', uuid: '556c1ee5-ec38-42e8-955a-1e82dad0ffa1' },
  { name: 'Dynamic', uuid: '111dc692-d470-4eec-b791-3475abac4c46' },
  { name: 'Creative', uuid: '6fedbf1f-4a17-45ec-84fb-92fe524a29ef' },
  { name: 'Ray Traced', uuid: 'b504f83c-3326-4947-82e1-7fe9e839ec0f' },
  { name: 'Pro Color Photography', uuid: '7c3f932b-a572-47cb-9b9b-f20211e63b5b' },
  { name: 'Portrait', uuid: '8e2bc543-6ee2-45f9-bcd9-594b6ce84dcd' },
  { name: 'Portrait Cinematic', uuid: '4edb03c9-8a26-4041-9d01-f85b5d4abd71' },
  { name: 'Portrait Fashion', uuid: '0d34f8e1-46d4-428f-8ddd-4b11811fa7c9' },
  { name: 'Fashion', uuid: '594c4a08-a522-4e0e-b7ff-e4dac4b6b622' },
  { name: 'Stock Photo', uuid: '5bdc3f2a-1be6-4d1c-8e77-992a30824a2c' },
  { name: 'Illustration', uuid: '645e4195-f63d-4715-a3f2-3fb1e6eb8c70' },
  { name: '3D Render', uuid: 'debdf72a-91a4-467b-bf61-cc02bdeb69c6' },
  { name: 'Game Concept', uuid: '09d2b5b5-d7c5-4c02-905d-9f84051640f4' },
  { name: 'Acrylic', uuid: '3cbb655a-7ca4-463f-b697-8a03ad67327c' },
  { name: 'Watercolor', uuid: '1db308ce-c7ad-4d10-96fd-592fa6b75cc4' },
  { name: 'Graphic Design 2D', uuid: '703d6fe5-7f1c-4a9e-8da0-5331f214d5cf' },
  { name: 'Graphic Design 3D', uuid: '7d7c2bc5-4b12-4ac3-81a9-630057e9e89f' },
  { name: 'Pro B&W Photography', uuid: '22a9a7d2-2166-4d86-80ff-22e2643adbcf' },
  { name: 'Pro Film Photography', uuid: '581ba6d6-5aac-4492-bebe-54c424a0d46e' },
];

export const LEONARDO_MODELS: LeonardoModelConfig[] = [
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    apiModelId: 'nano-banana-2',
    version: 'v2',
    supportsStyleIds: true,
    supportsQuality: false,
    supportsGuidance: true,
    maxQuantity: 8,
    aspectRatios: [
      { label: '1:1', width: 1024, height: 1024 },
      { label: '2:3', width: 848, height: 1264 },
      { label: '3:2', width: 1264, height: 848 },
      { label: '3:4', width: 896, height: 1200 },
      { label: '4:3', width: 1200, height: 896 },
      { label: '4:5', width: 928, height: 1152 },
      { label: '5:4', width: 1152, height: 928 },
      { label: '9:16', width: 768, height: 1376 },
      { label: '16:9', width: 1376, height: 768 },
      { label: '21:9', width: 1584, height: 672 },
    ],
    styles: LEONARDO_SHARED_STYLES,
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    apiModelId: 'gemini-image-2',
    version: 'v2',
    supportsStyleIds: true,
    supportsQuality: false,
    supportsGuidance: true,
    maxQuantity: 8,
    aspectRatios: [
      { label: '1:1', width: 1024, height: 1024 },
      { label: '2:3', width: 1024, height: 1536 },
      { label: '3:2', width: 1536, height: 1024 },
    ],
    styles: LEONARDO_SHARED_STYLES,
  },
  {
    id: 'gpt-image-1.5',
    name: 'GPT Image-1.5',
    apiModelId: 'gpt-image-1.5',
    version: 'v2',
    supportsStyleIds: false,
    supportsQuality: true,
    supportsGuidance: true,
    maxQuantity: 4,
    aspectRatios: [
      { label: '1:1', width: 1024, height: 1024 },
      { label: '2:3', width: 1024, height: 1536 },
      { label: '3:2', width: 1536, height: 1024 },
    ],
  },
];

/** Get a Leonardo model config by its id */
export function getLeonardoModel(modelId: string): LeonardoModelConfig | undefined {
  return LEONARDO_MODELS.find(m => m.id === modelId || m.apiModelId === modelId);
}

/** Get aspect ratio dimensions for a Leonardo model */
export function getLeonardoDimensions(modelId: string, aspectRatio: string): { width: number; height: number } {
  const model = getLeonardoModel(modelId);
  const ar = model?.aspectRatios.find(a => a.label === aspectRatio);
  return ar ? { width: ar.width, height: ar.height } : { width: 1024, height: 1024 };
}

export const ART_STYLES = [
  'Cinematic', 'Digital Art', 'Oil Painting', 'Cyberpunk', 'Sketch',
  'Hyper-realistic', 'Vibrant Anime', 'Dark Fantasy', 'Steampunk', 'Minimalist'
];

export const LIGHTING_OPTIONS = [
  'Golden Hour', 'Dramatic', 'Neon', 'Soft', 'Volumetric',
  'Studio Lighting', 'Moonlight', 'Harsh Sunlight', 'Bioluminescent', 'Ethereal'
];

export const CAMERA_ANGLES = [
  'Wide Shot', 'Close-up', 'Low Angle', 'Top-down', 'Bird\'s Eye',
  'Eye Level', 'Dutch Angle', 'Macro', 'Panoramic', 'Portrait'
];

export const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const IMAGE_SIZES = ['1K', '2K', '4K'];

// ── Default Settings ────────────────────────────────────────────────────────

export const defaultSettings: UserSettings = {
  enabledProviders: ['leonardo'],
  apiKeys: {},
  defaultLeonardoModel: 'nano-banana-2',
  defaultAnimationDuration: 3,
  defaultAnimationStyle: 'DYNAMIC',
  defaultVideoModel: 'kling-video-o-3',
  watermark: {
    enabled: false,
    image: null,
    position: 'bottom-right',
    opacity: 0.8,
    scale: 0.15
  },
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
  ],
  agentPrompt: `You are a Master Content Creator and Social Media Growth Strategist. Your mission is to generate high-impact, viral-potential image prompts that drive massive traffic and engagement. You specialize in the 'Multiverse Mashup' niche, blending iconic universes like Marvel, DC, Star Wars, and Warhammer 40k. Your tone is professional yet edgy, focusing on 'what if' scenarios, alternative timelines, and epic cinematic crossovers. Every prompt you generate must be optimized for visual storytelling, high contrast, and emotional resonance to capture attention on platforms like Instagram, TikTok, and Twitter. Research current social media trends, popular crossover memes, and viral "what if" scenarios for these franchises to ensure your output is optimized for virality. Use the provided focus tags to strictly influence the style, theme, and technical execution of your output. CRITICAL: You must ensure extreme variety in your ideas. Do not repeatedly use the same characters (e.g., do not just generate ideas about Dr. Doom, Darth Vader, or Batman). Explore the vast rosters of these universes to create unique and unexpected mashups.`,
  channelName: 'MultiverseMashupAI',
  savedPersonalities: []
};

// ── Context Type ────────────────────────────────────────────────────────────

export interface MashupContextType {
  isLoaded: boolean;
  view: ViewType;
  setView: (view: ViewType) => void;
  images: GeneratedImage[];
  savedImages: GeneratedImage[];
  collections: Collection[];
  isGenerating: boolean;
  progress: string;
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  generateImages: (customPrompts?: string[], append?: boolean, options?: GenerateOptions) => Promise<void>;
  generatePostContent: (image: GeneratedImage) => Promise<GeneratedImage | undefined>;
  rerollImage: (id: string, prompt: string, options?: GenerateOptions) => Promise<void>;
  saveImage: (img: GeneratedImage) => void;
  deleteImage: (id: string, fromSaved: boolean) => void;
  updateImageTags: (id: string, tags: string[]) => void;
  createCollection: (name?: string, description?: string, imageIds?: string[]) => Promise<Collection>;
  bulkUpdateImageTags: (ids: string[], tags: string[], mode: 'append' | 'replace') => void;
  deleteCollection: (id: string) => void;
  addImageToCollection: (imageId: string, collectionId: string) => void;
  removeImageFromCollection: (imageId: string) => void;
  toggleApproveImage: (id: string) => void;
  generateComparison: (prompt: string, modelIds: string[], options?: GenerateOptions) => Promise<void>;
  autoTagImage: (id: string) => Promise<void>;
  setImageStatus: (id: string, status: 'generating' | 'animating' | 'ready') => void;
  autoGenerateCollectionInfo: (sampleImages: GeneratedImage[] | string[]) => Promise<{ name: string; description: string } | undefined>;
  comparisonResults: GeneratedImage[];
  pickComparisonWinner: (id: string) => Promise<void>;
  clearComparison: () => void;
  deleteComparisonResult: (id: string) => void;
  generateNegativePrompt: (idea: string) => Promise<string>;
  comparisonPrompt: string;
  setComparisonPrompt: React.Dispatch<React.SetStateAction<string>>;
  comparisonOptions: GenerateOptions;
  setComparisonOptions: React.Dispatch<React.SetStateAction<GenerateOptions>>;
  generationError: string | null;
  clearGenerationError: () => void;
  comparisonError: string | null;
  clearComparisonError: () => void;
  ideas: Idea[];
  addIdea: (concept: string, context?: string) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  deleteIdea: (id: string) => void;
  clearIdeas: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pipelineEnabled: boolean;
  pipelineRunning: boolean;
  pipelineQueue: Idea[];
  pipelineProgress: PipelineProgress | null;
  pipelineLog: PipelineLogEntry[];
  pipelineDelay: number;
  setPipelineDelay: (delay: number) => void;
  togglePipeline: () => void;
  startPipeline: () => void;
  stopPipeline: () => void;
}
