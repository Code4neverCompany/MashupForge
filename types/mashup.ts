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
    provider: 'gemini' | 'leonardo';
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
  provider?: 'gemini' | 'leonardo';
  leonardoModel?: string;
  geminiModel?: string;
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
  enabledProviders: ('gemini' | 'leonardo')[];
  apiKeys: {
    gemini?: string;
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
  defaultProvider: 'gemini' | 'leonardo';
  defaultLeonardoModel: string;
  defaultGeminiModel: string;
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

export type ViewType = 'studio' | 'gallery' | 'compare' | 'captioning' | 'post-ready' | 'ideas';

// ── Constants ───────────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image (Nano Banana 2)' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (Nano Banana Pro)' },
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Nano Banana)' },
];

export const PAID_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-3-flash-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-generate-preview'
];

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

export const LEONARDO_MODELS = [
  { id: 'nano-banana-2', name: 'Nano Banana 2 (Leonardo)' },
  { id: 'gemini-image-2', name: 'Nano Banana Pro (Leonardo)' },
  { id: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', name: 'Leonardo Lightning' },
  { id: '6b645e3a-d64f-4341-a6d8-7a3690fbf042', name: 'Leonardo Vision XL' },
  { id: '1e60896f-3c26-4296-8ecc-53e2afecc132', name: 'Leonardo Diffusion XL' },
  { id: 'aa77f04e-3eec-4034-9c07-d0f619684628', name: 'Leonardo Kino XL' },
  { id: 'ac614f96-1081-4438-81f4-6684fdcb3b8d', name: 'DreamShaper v7' },
  { id: 'd69c8273-6b17-4a30-a13e-d6637ae8cce7', name: '3D Animation Style' },
  { id: '17e4ed9a-45cb-459f-bc66-7f051dd33b70', name: 'Anime Pastel Dream' },
  { id: 'e316348f-7773-490e-adcd-46757c738eb7', name: 'Absolute Reality v1.6' },
  { id: 'phoenix', name: 'Leonardo Phoenix' },
  { id: 'gpt-image-1.5', name: 'GPT Image-1.5' },
];

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

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'];
export const IMAGE_SIZES = ['512px', '1K', '2K', '4K'];

// ── Default Settings ────────────────────────────────────────────────────────

export const defaultSettings: UserSettings = {
  enabledProviders: ['gemini', 'leonardo'],
  apiKeys: {},
  defaultProvider: 'gemini',
  defaultLeonardoModel: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',
  defaultGeminiModel: 'gemini-3.1-flash-image-preview',
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
  ideas: Idea[];
  addIdea: (concept: string, context?: string) => void;
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  deleteIdea: (id: string) => void;
  clearIdeas: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}
