'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { get, set } from 'idb-keyval';

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

const defaultSettings: UserSettings = {
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

export type ViewType = 'studio' | 'gallery' | 'compare' | 'captioning' | 'post-ready' | 'ideas';

interface MashupContextType {
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

const MashupContext = createContext<MashupContextType | null>(null);

export function useMashup() {
  const ctx = useContext(MashupContext);
  if (!ctx) throw new Error('useMashup must be used within MashupProvider');
  return ctx;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

async function applyWatermark(baseImageSrc: string, settings: WatermarkSettings, channelName?: string): Promise<string> {
  if (!settings.enabled) return baseImageSrc;
  if (!settings.image && !channelName) return baseImageSrc;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(baseImageSrc);
        return;
      }

      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = settings.opacity || 0.8;

      const padding = canvas.width * 0.03;

      if (settings.image) {
        const wm = new Image();
        wm.crossOrigin = "anonymous";
        wm.onload = () => {
          const wmWidth = canvas.width * (settings.scale || 0.15);
          const wmHeight = (wm.height / wm.width) * wmWidth;

          let x = 0, y = 0;
          switch (settings.position) {
            case 'top-left': x = padding; y = padding; break;
            case 'top-right': x = canvas.width - wmWidth - padding; y = padding; break;
            case 'bottom-left': x = padding; y = canvas.height - wmHeight - padding; break;
            case 'bottom-right': x = canvas.width - wmWidth - padding; y = canvas.height - wmHeight - padding; break;
            case 'center': x = (canvas.width - wmWidth) / 2; y = (canvas.height - wmHeight) / 2; break;
          }

          ctx.drawImage(wm, x, y, wmWidth, wmHeight);
          resolve(canvas.toDataURL('image/png'));
        };
        wm.onerror = () => resolve(baseImageSrc);
        wm.src = settings.image;
      } else if (channelName) {
        // Text watermark
        const fontSize = canvas.width * (settings.scale || 0.05);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Add shadow for visibility
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const metrics = ctx.measureText(channelName);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        let x = 0, y = 0;
        switch (settings.position) {
          case 'top-left': x = padding; y = padding; break;
          case 'top-right': x = canvas.width - textWidth - padding; y = padding; break;
          case 'bottom-left': x = padding; y = canvas.height - textHeight - padding; break;
          case 'bottom-right': x = canvas.width - textWidth - padding; y = canvas.height - textHeight - padding; break;
          case 'center': x = (canvas.width - textWidth) / 2; y = (canvas.height - textHeight) / 2; break;
        }

        ctx.fillText(channelName, x, y);
        resolve(canvas.toDataURL('image/png'));
      }
    };
    img.onerror = () => resolve(baseImageSrc);
    img.src = baseImageSrc.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(baseImageSrc)}` : (baseImageSrc.startsWith('data:') ? baseImageSrc : `data:image/jpeg;base64,${baseImageSrc}`);
  });
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

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'];
export const IMAGE_SIZES = ['512px', '1K', '2K', '4K'];

export function MashupProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>('compare');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [savedImages, setSavedImages] = useState<GeneratedImage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [comparisonResults, setComparisonResults] = useState<GeneratedImage[]>([]);
  const [comparisonPrompt, setComparisonPrompt] = useState('');
  const [comparisonOptions, setComparisonOptions] = useState<GenerateOptions>({
    aspectRatio: '1:1',
    imageSize: '1K',
    negativePrompt: ''
  });
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load saved images, collections and settings from local storage/IndexedDB on mount
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Migrate from localStorage if needed
        let storedImages = localStorage.getItem('mashup_saved_images');
        if (storedImages) {
          try {
            const images = JSON.parse(storedImages).map((img: GeneratedImage) => ({
              ...img,
              tags: img.tags?.map(t => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t)
            }));
            await set('mashup_saved_images', images);
            localStorage.removeItem('mashup_saved_images');
            setSavedImages(images);
          } catch (e) {
            console.error('Failed to migrate from localStorage', e);
            const idbImages = await get('mashup_saved_images');
            if (idbImages) {
              const cleanedImages = idbImages.map((img: GeneratedImage) => ({
                ...img,
                tags: img.tags?.map(t => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t)
              }));
              setSavedImages(cleanedImages);
            }
          }
        } else {
          const idbImages = await get('mashup_saved_images');
          if (idbImages) {
            const cleanedImages = idbImages.map((img: GeneratedImage) => ({
              ...img,
              tags: img.tags?.map(t => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t)
            }));
            setSavedImages(cleanedImages);
          }
        }

        const storedCollections = localStorage.getItem('mashup_collections');
        if (storedCollections) {
          const collections = JSON.parse(storedCollections);
          await set('mashup_collections', collections);
          localStorage.removeItem('mashup_collections');
          setCollections(collections);
        } else {
          const idbCollections = await get('mashup_collections');
          if (idbCollections) setCollections(idbCollections);
        }

        const storedSettings = localStorage.getItem('mashup_settings');
        if (storedSettings) {
          const settings = JSON.parse(storedSettings);
          await set('mashup_settings', settings);
          localStorage.removeItem('mashup_settings');
          setSettings(prev => ({ ...prev, ...settings }));
        } else {
          const idbSettings = await get('mashup_settings');
          if (idbSettings) setSettings(prev => ({ ...prev, ...idbSettings }));
        }

        const idbComparisonResults = await get('mashup_comparison_results');
        if (idbComparisonResults) {
          setComparisonResults(idbComparisonResults);
        }

        const idbIdeas = await get('mashup_ideas');
        if (idbIdeas) {
          setIdeas(idbIdeas);
        }
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      set('mashup_comparison_results', comparisonResults);
      set('mashup_ideas', ideas);
    }
  }, [comparisonResults, ideas, isLoaded]);

  const getModelName = (id: string, provider: 'gemini' | 'leonardo') => {
    if (provider === 'gemini') {
      return GEMINI_MODELS.find(m => m.id === id)?.name || id;
    }
    return LEONARDO_MODELS.find(m => m.id === id)?.name || id;
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await set('mashup_settings', updated);
    } catch (e) {
      console.error('Failed to save settings to IndexedDB', e);
    }
  };

  const generatePostContent = async (image: GeneratedImage): Promise<GeneratedImage | undefined> => {
    if (!image.prompt) return;
    
    const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const res = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a Social Media Manager for the channel "${settings.channelName || 'MultiverseMashupAI'}". 
      Generate a high-engagement Instagram caption for this image prompt: "${image.prompt}".
      The caption should be professional yet edgy, fitting the "Master Content Creator" persona.
      Include fitting emojis.
      Include a set of relevant hashtags, and MUST include #${settings.channelName || 'MultiverseMashupAI'}.
      Format the output as a JSON object with "caption" (string) and "hashtags" (array of strings) properties.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caption: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    try {
      const data = JSON.parse(res.text || '{}');
      if (data.caption) {
        const updatedImg = { ...image, postCaption: data.caption, postHashtags: data.hashtags };
        saveImage(updatedImg);
        setImages(prev => prev.map(img => 
          img.id === image.id ? { ...img, postCaption: data.caption, postHashtags: data.hashtags } : img
        ));
        return updatedImg;
      }
    } catch (e) {
      console.error('Failed to parse post content:', e);
    }
    return undefined;
  };

  const saveImage = (img: GeneratedImage) => {
    setSavedImages(prev => {
      const exists = prev.some(i => i.id === img.id);
      let next;
      if (exists) {
        next = prev.map(i => i.id === img.id ? { ...i, ...img } : i);
      } else {
        next = [{ ...img, savedAt: Date.now() }, ...prev];
      }
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const deleteImage = (id: string, fromSaved: boolean) => {
    if (fromSaved) {
      setSavedImages(prev => {
        const next = prev.filter(i => i.id !== id);
        set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
        return next;
      });
    } else {
      setImages(prev => prev.filter(i => i.id !== id));
    }
  };

  const updateImageTags = (id: string, tags: string[]) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === id ? { ...img, tags } : img);
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const createCollection = async (name?: string, description?: string, imageIds?: string[]) => {
    let finalName = name;
    let finalDesc = description;

    if ((!finalName || !finalDesc) && imageIds && imageIds.length > 0) {
      const sampleImages = savedImages
        .filter(img => imageIds.includes(img.id))
        .slice(0, 5);
      
      if (sampleImages.length > 0) {
        const aiInfo = await autoGenerateCollectionInfo(sampleImages);
        if (aiInfo) {
          if (!finalName) finalName = aiInfo.name;
          if (!finalDesc) finalDesc = aiInfo.description;
        }
      }
    }

    if (!finalName) {
      finalName = `Collection ${collections.length + 1}`;
    }

    const newCollection: Collection = {
      id: `col-${Date.now()}`,
      name: finalName,
      description: finalDesc,
      createdAt: Date.now()
    };
    setCollections(prev => {
      const next = [...prev, newCollection];
      localStorage.setItem('mashup_collections', JSON.stringify(next));
      return next;
    });
    return newCollection;
  };

  const bulkUpdateImageTags = (ids: string[], tags: string[], mode: 'append' | 'replace') => {
    setSavedImages(prev => {
      const next = prev.map(img => {
        if (ids.includes(img.id)) {
          let newTags = tags;
          if (mode === 'append') {
            const existingTags = img.tags || [];
            // Filter out duplicates and handle the "Marvel 4k" vs "Marvel", "4k" issue
            // We assume the input tags are already clean
            newTags = Array.from(new Set([...existingTags, ...tags]));
          }
          return { ...img, tags: newTags };
        }
        return img;
      });
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const deleteCollection = (id: string) => {
    setCollections(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('mashup_collections', JSON.stringify(next));
      return next;
    });
    setSavedImages(prev => {
      const next = prev.map(img => img.collectionId === id ? { ...img, collectionId: undefined } : img);
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const addImageToCollection = (imageId: string, collectionId: string) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === imageId ? { ...img, collectionId } : img);
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const removeImageFromCollection = (imageId: string) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === imageId ? { ...img, collectionId: undefined } : img);
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
  };

  const toggleApproveImage = (id: string) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === id ? { ...img, approved: !img.approved } : img);
      set('mashup_saved_images', next).catch(err => console.error('Failed to save to IndexedDB', err));
      return next;
    });
    setImages(prev => prev.map(img => img.id === id ? { ...img, approved: !img.approved } : img));
  };

  const autoTagImage = async (id: string, providedImg?: GeneratedImage) => {
    const img = providedImg || [...images, ...savedImages].find(i => i.id === id);
    if (!img) return;

    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this image prompt: "${img.prompt}".
        Generate a set of 5-8 fitting tags for a gallery. 
        Include:
        - Universe/Franchise (e.g., "Warhammer 40k" - NEVER use "Warhammer 40,000", "Star Wars", "Marvel")
        - Character names
        - Style (e.g., "Cinematic", "Cyberpunk", "Grimdark")
        - Themes (e.g., "Battle", "Portrait", "Landscape")
        Return ONLY a JSON array of strings.`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      
      let tags = JSON.parse(response.text || '[]');
      if (Array.isArray(tags)) {
        tags = tags.map(t => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t);
        updateImageTags(id, tags);
      }
    } catch (error) {
      console.error('Error auto-tagging image:', error);
    }
  };

  const setImageStatus = (id: string, status: 'generating' | 'animating' | 'ready') => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, status } : img));
    setSavedImages(prev => prev.map(img => img.id === id ? { ...img, status } : img));
  };

  const autoGenerateCollectionInfo = async (sampleImages: GeneratedImage[] | string[]) => {
    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      
      let context = '';
      if (sampleImages.length > 0 && typeof sampleImages[0] === 'string') {
        context = (sampleImages as string[]).map((p, i) => `${i+1}. ${p}`).join('\n');
      } else {
        context = (sampleImages as GeneratedImage[]).map((img, i) => 
          `${i+1}. Prompt: ${img.prompt}, Model: ${img.modelInfo?.modelName || 'Unknown'}, Provider: ${img.modelInfo?.provider || 'Unknown'}`
        ).join('\n');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze these image details that belong to a new collection:
        ${context}
        
        Generate a fitting, catchy name (max 5 words) and a brief, engaging description (max 20 words) for this collection.
        Incorporate the model or artist style if relevant to make it specific and informative.
        Return ONLY a JSON object with "name" and "description" keys.`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      
      const data = JSON.parse(response.text || '{}');
      return {
        name: data.name || 'New Collection',
        description: data.description || 'A collection of amazing mashups.'
      };
    } catch (error) {
      console.error('Error auto-generating collection info:', error);
      return { name: 'New Collection', description: 'A collection of amazing mashups.' };
    }
  };

  const generateComparison = async (prompt: string, modelIds: string[], options?: GenerateOptions) => {
    setIsGenerating(true);
    const comparisonId = `comp-group-${Date.now()}`;
    
    // Construct the final prompt with style, lighting, and angle if provided
    let finalPrompt = prompt;
    if (options?.style || options?.lighting || options?.angle) {
      const parts = [prompt];
      if (options.style) parts.push(`Art style: ${options.style}`);
      if (options.lighting) parts.push(`Lighting: ${options.lighting}`);
      if (options.angle) parts.push(`Camera angle: ${options.angle}`);
      parts.push('Highly detailed, cinematic composition.');
      finalPrompt = parts.join('. ');
    }

    const placeholders: GeneratedImage[] = modelIds.map((modelId, idx) => ({
      id: `comp-placeholder-${Date.now()}-${idx}`,
      comparisonId,
      prompt: finalPrompt,
      status: 'generating',
      url: '',
      modelInfo: {
        provider: LEONARDO_MODELS.some(m => m.id === modelId) ? 'leonardo' : 'gemini',
        modelId,
        modelName: getModelName(modelId, LEONARDO_MODELS.some(m => m.id === modelId) ? 'leonardo' : 'gemini')
      }
    }));
    setComparisonResults(prev => [...placeholders, ...prev]);
    setProgress('Preparing comparison...');

    try {
      for (let i = 0; i < modelIds.length; i++) {
        const modelId = modelIds[i];
        const isLeonardo = LEONARDO_MODELS.some(m => m.id === modelId);
        const provider = isLeonardo ? 'leonardo' : 'gemini';
        const modelName = getModelName(modelId, provider);
        
        setProgress(`Generating with ${modelName}...`);
        
        try {
          let imageUrl = '';
          let base64Data = '';
          let imageId = '';
          let seed = 0;

          if (isLeonardo) {
            const modelNameLower = modelName.toLowerCase();
            const isXL = modelNameLower.includes('xl') || modelNameLower.includes('lightning') || modelId === 'gemini-image-2' || modelId === 'nano-banana-2';
            
            let width = isXL ? 1024 : 768;
            let height = isXL ? 1024 : 768;
            const currentAspectRatio = options?.aspectRatio || '1:1';

            if (currentAspectRatio === '16:9') { 
              width = isXL ? 1376 : 1024; 
              height = isXL ? 768 : 576; 
            } else if (currentAspectRatio === '9:16') { 
              width = isXL ? 768 : 576; 
              height = isXL ? 1376 : 1024; 
            } else if (currentAspectRatio === '4:3') { 
              width = isXL ? 1200 : 896; 
              height = isXL ? 896 : 672; 
            } else if (currentAspectRatio === '3:4') { 
              width = isXL ? 896 : 672; 
              height = isXL ? 1200 : 896; 
            } else if (currentAspectRatio === '4:1') { 
              width = isXL ? 1584 : 1024; 
              height = isXL ? 672 : 256; 
            } else if (currentAspectRatio === '1:4') { 
              width = isXL ? 672 : 256; 
              height = isXL ? 1584 : 1024; 
            }

            const res = await fetch('/api/leonardo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: finalPrompt,
                modelId,
                width,
                height,
                negativePrompt: options?.negativePrompt,
                apiKey: settings.apiKeys.leonardo
              }),
            });
            
            if (res.ok) {
              const data = await res.json();
              if (data.generationId) {
                let status = 'PENDING';
                let attempts = 0;
                while (status !== 'COMPLETE' && attempts < 150) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  attempts++;
                  const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
                  if (!statusRes.ok) break;
                  const statusData = await statusRes.json();
                  status = statusData.status;
                  if (status === 'COMPLETE') {
                    imageUrl = statusData.url;
                    imageId = statusData.imageId;
                    seed = statusData.seed;
                  } else if (status === 'FAILED') {
                    break;
                  }
                }
              }
            }
          } else {
            const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            const imgRes = await ai.models.generateContent({
              model: modelId,
              contents: finalPrompt,
              config: {
                imageConfig: { aspectRatio: options?.aspectRatio || "1:1" },
              },
            });
            
            for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                base64Data = part.inlineData.data || '';
                imageUrl = `data:image/jpeg;base64,${base64Data}`;
                break;
              }
            }
          }

          if (imageUrl || base64Data) {
            const newImg: GeneratedImage = {
              id: `comp-${Date.now()}-${modelId}`,
              comparisonId,
              url: imageUrl,
              base64: base64Data || undefined,
              prompt: finalPrompt,
              imageId,
              seed,
              status: 'ready',
              negativePrompt: options?.negativePrompt,
              aspectRatio: options?.aspectRatio,
              imageSize: options?.imageSize,
              modelInfo: { provider, modelId, modelName }
            };
            setComparisonResults(prev => prev.map(img => img.id === placeholders[i].id ? newImg : img));
          } else {
            setComparisonResults(prev => prev.filter(img => img.id !== placeholders[i].id));
          }
        } catch (err) {
          console.error(`Failed to generate with ${modelName}`, err);
          setImages(prev => prev.filter(img => img.id !== placeholders[i].id));
        }
      }
    } catch (e) {
      console.error('Comparison failed', e);
      setProgress('Comparison failed. Check your API keys.');
    } finally {
      setIsGenerating(false);
    }
  };

  const pickComparisonWinner = async (id: string) => {
    const winnerImg = comparisonResults.find(img => img.id === id);
    if (!winnerImg || !winnerImg.url) return;

    setComparisonResults(prev => prev.map(img => {
      if (img.id === id) {
        return { ...img, winner: true };
      }
      return img;
    }));

    // Process for main gallery
    let finalUrl = winnerImg.url;
    let finalBase64 = winnerImg.base64;

    // Apply watermark (force enabled for picked pictures)
    const watermarkSettings: WatermarkSettings = {
      ...(settings.watermark || { enabled: false, image: null, position: 'bottom-right', opacity: 0.8, scale: 0.05 }),
      enabled: true,
    };
    finalUrl = await applyWatermark(finalUrl, watermarkSettings, settings.channelName || 'Multiverse Mashup');
    finalBase64 = undefined; // Watermarked image is now a data URL

    // Create new image for main gallery
    const galleryImg: GeneratedImage = {
      ...winnerImg,
      id: `img-${Date.now()}-winner`,
      url: finalUrl,
      base64: finalBase64,
      status: 'ready'
    };

    // Add to main gallery (savedImages)
    saveImage(galleryImg);
  };

  const generateImages = async (customPrompts?: string[], append: boolean = false, options?: GenerateOptions) => {
    setIsGenerating(true);
    const placeholders: GeneratedImage[] = (customPrompts || [1, 2, 3, 4]).map((_, idx) => ({
      id: `placeholder-${Date.now()}-${idx}`,
      prompt: typeof _ === 'string' ? _ : 'Generating...',
      status: 'generating',
      url: '',
    }));

    if (!append) {
      setImages(placeholders);
    } else {
      setImages(prev => [...prev, ...placeholders]);
    }
    
    setProgress(append ? 'Generating image...' : 'Brainstorming crossover concepts...');

    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      let itemsToGenerate: { 
        prompt: string, 
        aspectRatio?: string, 
        tags?: string[], 
        selectedNiches?: string[], 
        selectedGenres?: string[],
        negativePrompt?: string
      }[] = [];
      const isLeonardo = options?.provider ? options.provider === 'leonardo' : settings.defaultProvider === 'leonardo';

      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const tagRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze this image prompt: "${prompt}". Generate a set of 5-8 fitting tags for a gallery. Include Universe/Franchise, Character names, Style, and Themes. Return ONLY a JSON array of strings.`,
            config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(tagRes.text || '[]');
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      const systemContext = `${settings.agentPrompt || 'You are a Master Content Creator.'} 
      Active Niches: ${settings.agentNiches?.join(', ') || 'None'}.
      Active Genres: ${settings.agentGenres?.join(', ') || 'None'}.
      Recommended Niches: ${RECOMMENDED_NICHES.join(', ')}.
      Recommended Genres: ${RECOMMENDED_GENRES.join(', ')}.
      
      INTELLIGENT SELECTION:
      1. For each prompt, choose the most fitting Niches and Genres from the ACTIVE lists.
      2. If a RECOMMENDED (but inactive) tag is significantly better for the specific prompt, you may pick it.
      3. Smartly select the most appropriate aspect ratio (e.g., "16:9", "9:16", "1:1", "4:3", "3:4").
      4. Generate a set of fitting tags for the gallery (characters, universe, themes).
      
      CRITICAL: Use Google Search to research current social media trends, popular crossover memes, and viral "what if" scenarios for Star Wars, Marvel, DC, and Warhammer 40k. Base your ideas on these real-world trends.
      Focus heavily on alternative universes, different timelines, and epic crossovers.
      Ensure the prompts are safe and do not contain restricted content.
      
      DIVERSITY MANDATE: You MUST generate highly diverse ideas. Do NOT repeat the same characters, themes, or scenarios across the prompts. Ensure a wide variety of characters from the mentioned franchises are used. Do not get stuck on a single character (like Dr. Doom, Darth Vader, Batman, etc.). Each prompt must feature completely different primary characters and settings.`;

      if (options?.skipEnhance && customPrompts) {
        itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
      } else if (!customPrompts || customPrompts.length === 0) {
        // Generate 4 distinct crossover prompts with smart aspect ratios
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `${systemContext}
          Generate 4 completely distinct, highly detailed image generation prompts. 
          Ensure maximum variety in characters, franchises, and settings. Do NOT repeat characters.
          Return ONLY a JSON array of 4 objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)
          
          Random Seed: ${Math.random()}`,
          config: {
            tools: [{ googleSearch: {} }],
            toolConfig: { includeServerSideToolInvocations: true },
            temperature: 1.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { 
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedNiches: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedGenres: { type: Type.ARRAY, items: { type: Type.STRING } },
                  negativePrompt: { type: Type.STRING }
                }
              },
            },
          },
        });

        try {
          itemsToGenerate = JSON.parse(promptRes.text || '[]');
        } catch (e) {
          console.error('Failed to parse prompts:', e);
          itemsToGenerate = [
            { prompt: 'A Space Marine from Warhammer 40k wielding a lightsaber from Star Wars, standing on a desolate alien planet.', aspectRatio: '16:9', tags: ['Warhammer 40k', 'Star Wars', 'Crossover'] },
            { prompt: 'Batman wearing an Iron Man suit, perched on a gargoyle in a futuristic cyberpunk Gotham.', aspectRatio: '9:16', tags: ['DC', 'Marvel', 'Crossover'] },
            { prompt: 'Gandalf the White casting a spell alongside Doctor Strange in the Mirror Dimension.', aspectRatio: '16:9', tags: ['Marvel', 'Fantasy', 'Crossover'] },
            { prompt: 'Darth Vader commanding a fleet of Star Destroyers over Hogwarts castle.', aspectRatio: '16:9', tags: ['Star Wars', 'Harry Potter', 'Crossover'] },
          ];
        }

        if (!Array.isArray(itemsToGenerate) || itemsToGenerate.length === 0) {
          throw new Error('Failed to generate prompts');
        }

        itemsToGenerate = itemsToGenerate.slice(0, 4);
      } else {
        // Enhance custom prompts using the Master Content Creator persona
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `${systemContext}
          The user wants to generate images based on these ideas: ${JSON.stringify(customPrompts)}. 
          Enhance these ideas into highly detailed, cinematic image generation prompts. 
          Return ONLY a JSON array of objects, each with:
          - "prompt": string
          - "aspectRatio": string
          - "tags": array of strings
          - "selectedNiches": array of strings
          - "selectedGenres": array of strings
          - "negativePrompt": string (a smart, specific negative prompt for this exact image to avoid common artifacts or clashing elements)`,
          config: {
            temperature: 1.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { 
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedNiches: { type: Type.ARRAY, items: { type: Type.STRING } },
                  selectedGenres: { type: Type.ARRAY, items: { type: Type.STRING } },
                  negativePrompt: { type: Type.STRING }
                }
              },
            },
          },
        });

        try {
          itemsToGenerate = JSON.parse(promptRes.text || '[]');
        } catch (e) {
          console.error('Failed to parse enhanced prompts:', e);
          itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
        }
        
        if (!Array.isArray(itemsToGenerate) || itemsToGenerate.length === 0) {
          itemsToGenerate = customPrompts.map(p => ({ prompt: p, aspectRatio: options?.aspectRatio }));
        } else {
          itemsToGenerate = itemsToGenerate.slice(0, customPrompts.length);
        }
      }

      // Check for API key selection for gemini-3.1-flash-image-preview
      if (!isLeonardo && typeof window !== 'undefined' && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }

      for (let i = 0; i < itemsToGenerate.length; i++) {
        const item = itemsToGenerate[i];
        const currentAspectRatio = item.aspectRatio || options?.aspectRatio || '1:1';
        
        const selectedModel = isLeonardo 
          ? (options?.leonardoModel || settings.defaultLeonardoModel)
          : (options?.geminiModel || settings.defaultGeminiModel);

        const isGeminiModel = GEMINI_MODELS.some(m => m.id === selectedModel);
        const currentProvider = isGeminiModel ? 'gemini' : 'leonardo';
        let modelName = getModelName(selectedModel, currentProvider);
        const isCurrentLeonardo = currentProvider === 'leonardo';
        
        setProgress(`Generating image ${i + 1} of ${itemsToGenerate.length} with ${modelName}...`);
        try {
          const generatedNegativePrompt = item.negativePrompt || options?.negativePrompt;
          const finalPrompt = generatedNegativePrompt 
            ? `${item.prompt}\nDo not include: ${generatedNegativePrompt}`
            : item.prompt;

          // Use Gemini API only if NOT using Leonardo provider AND model is in GEMINI_MODELS
          let useGeminiApi = isGeminiModel;
          let usedGeminiFallback = false;

            if (!useGeminiApi) {
              try {
                // Convert aspect ratio to width/height roughly
                const modelNameLower = modelName.toLowerCase();
                const isXL = modelNameLower.includes('xl') || 
                             modelNameLower.includes('lightning') || 
                             selectedModel === 'gemini-image-2' ||
                             selectedModel === 'nano-banana-2';
                
                let width = isXL ? 1024 : 768;
                let height = isXL ? 1024 : 768;
              
              if (currentAspectRatio === '16:9') { 
                width = isXL ? 1376 : 1024; 
                height = isXL ? 768 : 576; 
              } else if (currentAspectRatio === '9:16') { 
                width = isXL ? 768 : 576; 
                height = isXL ? 1376 : 1024; 
              } else if (currentAspectRatio === '4:3') { 
                width = isXL ? 1200 : 896; 
                height = isXL ? 896 : 672; 
              } else if (currentAspectRatio === '3:4') { 
                width = isXL ? 896 : 672; 
                height = isXL ? 1200 : 896; 
              } else if (currentAspectRatio === '4:1') { 
                width = isXL ? 1584 : 1024; 
                height = isXL ? 672 : 256; 
              } else if (currentAspectRatio === '1:4') { 
                width = isXL ? 672 : 256; 
                height = isXL ? 1584 : 1024; 
              }

              const res = await fetch('/api/leonardo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: item.prompt,
                  negative_prompt: generatedNegativePrompt,
                  modelId: selectedModel,
                  width,
                  height,
                  seed: options?.seed,
                  guidance_scale: options?.cfgScale,
                  apiKey: settings.apiKeys.leonardo
                })
              });

              if (!res.ok) {
                let errMessage = 'Leonardo API failed';
                try {
                  const errData = await res.json();
                  errMessage = errData.error || errMessage;
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
                while (status !== 'COMPLETE' && attempts < 150) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  attempts++;
                  const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
                  if (!statusRes.ok) {
                    const errText = await statusRes.text();
                    throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
                  }
                  const statusData = await statusRes.json();
                  status = statusData.status;
                  if (status === 'COMPLETE') {
                    let finalUrl = statusData.url;
                    if (settings.watermark?.enabled) {
                      finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
                    }
                    const generatedTags = await ensureTags(item.prompt, item.tags);
                    setImages(prev => prev.map(img => img.id === placeholders[i].id ? {
                      id: `img-${Date.now()}-${i}`,
                      url: finalUrl,
                      prompt: item.prompt,
                      tags: generatedTags,
                      imageId: statusData.imageId,
                      seed: statusData.seed,
                      negativePrompt: generatedNegativePrompt,
                      aspectRatio: currentAspectRatio,
                      status: 'ready',
                      modelInfo: {
                        provider: 'leonardo',
                        modelId: selectedModel,
                        modelName: getModelName(selectedModel, 'leonardo')
                      }
                    } : img));
                  } else if (status === 'FAILED') {
                    throw new Error(statusData.error || 'Leonardo generation failed');
                  }
                }
                if (status !== 'COMPLETE') {
                  throw new Error('Timeout waiting for Leonardo generation');
                }
              }
            } catch (err) {
              console.error('Leonardo generation failed:', err);
              throw err;
            }
          }

          if (useGeminiApi) {
            const selectedGeminiModel = selectedModel;
            modelName = getModelName(selectedGeminiModel, 'gemini');
            
            // Check for API key selection if it's a paid model and we haven't checked yet
            if (PAID_MODELS.includes(selectedGeminiModel) && typeof window !== 'undefined' && (window as any).aistudio) {
              const hasKey = await (window as any).aistudio.hasSelectedApiKey();
              if (!hasKey) {
                await (window as any).aistudio.openSelectKey();
              }
            }

            // Use process.env.API_KEY for paid models if available
            const apiKey = (PAID_MODELS.includes(selectedGeminiModel) && process.env.API_KEY) 
              ? process.env.API_KEY 
              : (process.env.API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY);

            const imageAi = new GoogleGenAI({ apiKey });
            
            const imageConfig: any = {};
            
            let finalAspectRatio = currentAspectRatio;
            if (selectedGeminiModel === 'gemini-2.5-flash-image') {
              const unsupportedRatios = ['1:4', '1:8', '4:1', '8:1'];
              if (unsupportedRatios.includes(finalAspectRatio)) {
                finalAspectRatio = finalAspectRatio.startsWith('1:') ? '9:16' : '16:9';
              }
            }
            imageConfig.aspectRatio = finalAspectRatio;
            
            if (selectedGeminiModel !== 'gemini-2.5-flash-image') {
              imageConfig.imageSize = options?.imageSize || '1K';
            }
            
            const imgRes = await imageAi.models.generateContent({
              model: selectedGeminiModel,
              contents: {
                parts: [{ text: finalPrompt }],
              },
              config: {
                imageConfig,
              },
            });

            let base64Data = '';
            for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                base64Data = part.inlineData.data || '';
                break;
              }
            }

            if (base64Data) {
              let finalUrl = `data:image/jpeg;base64,${base64Data}`;
              const generatedTags = await ensureTags(item.prompt, item.tags);
              let newImg: GeneratedImage = {
                id: `img-${Date.now()}-${i}`,
                base64: base64Data,
                prompt: item.prompt,
                tags: generatedTags,
                negativePrompt: generatedNegativePrompt,
                aspectRatio: currentAspectRatio,
                imageSize: options?.imageSize || '1K',
                status: 'ready',
                modelInfo: {
                  provider: 'gemini',
                  modelId: selectedGeminiModel,
                  modelName: getModelName(selectedGeminiModel, 'gemini')
                }
              };
              
              if (settings.watermark?.enabled) {
                finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
                newImg = {
                  ...newImg,
                  url: finalUrl,
                };
                delete newImg.base64;
              } else {
                newImg.url = finalUrl;
              }
              setImages(prev => prev.map(img => img.id === placeholders[i].id ? newImg : img));
            }
          }
        } catch (imgError: any) {
            console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);
            
            // Handle 403/404 errors by prompting for API key selection
            const errStr = typeof imgError === 'string' ? imgError : (imgError.message || JSON.stringify(imgError));
            if (errStr.includes('PERMISSION_DENIED') || errStr.includes('NOT_FOUND') || errStr.includes('403') || errStr.includes('404')) {
              if (typeof window !== 'undefined' && (window as any).aistudio) {
                console.log('Detected API key issue, prompting for key selection...');
                (window as any).aistudio.openSelectKey();
              }
            }
          }
        }
        setProgress('');
      } catch (error) {
      console.error('Generation error:', error);
      setProgress('An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const rerollImage = async (id: string, prompt: string, options?: GenerateOptions) => {
    setIsGenerating(true);
    setProgress('Rerolling image...');
    
    // Set the specific image to a loading state
    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating' } : img));

    try {
      const isLeonardo = options?.provider ? options.provider === 'leonardo' : settings.defaultProvider === 'leonardo';
      const selectedModel = isLeonardo 
        ? (options?.leonardoModel || settings.defaultLeonardoModel)
        : (options?.geminiModel || settings.defaultGeminiModel);

      const useGeminiApi = !isLeonardo && selectedModel.startsWith('gemini-');

      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const ensureTags = async (prompt: string, existingTags?: string[]) => {
        if (existingTags && existingTags.length > 0) return existingTags;
        try {
          const tagRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze this image prompt: "${prompt}". Generate a set of 5-8 fitting tags for a gallery. Include Universe/Franchise, Character names, Style, and Themes. Return ONLY a JSON array of strings.`,
            config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(tagRes.text || '[]');
        } catch (e) {
          console.error('Failed to auto-tag during generation', e);
          return ['Mashup'];
        }
      };

      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${settings.agentPrompt || 'You are a Master Content Creator.'} 
        Platform Niches: ${settings.agentNiches?.join(', ') || 'None'}.
        Target Genres: ${settings.agentGenres?.join(', ') || 'None'}.
        The user wants to re-roll an image based on this idea: "${prompt}". Enhance this idea into a highly detailed, cinematic image generation prompt. You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers. Return ONLY the enhanced prompt as a single string.`,
      });
      const enhancedPrompt = promptRes.text || prompt;

      const finalPrompt = options?.negativePrompt 
        ? `${enhancedPrompt}\nDo not include: ${options.negativePrompt}`
        : enhancedPrompt;

      let newImg: GeneratedImage | null = null;
      let usedGeminiFallback = false;

      if (!useGeminiApi) {
        try {
          const modelName = getModelName(selectedModel, 'leonardo').toLowerCase();
          const isXL = modelName.includes('xl') || 
                       modelName.includes('lightning') || 
                       selectedModel === 'gemini-image-2';
          
          let width = isXL ? 1024 : 768;
          let height = isXL ? 1024 : 768;
          
          const currentAspectRatio = options?.aspectRatio || '1:1';
          if (currentAspectRatio === '16:9') { 
            width = isXL ? 1376 : 1024; 
            height = isXL ? 768 : 576; 
          } else if (currentAspectRatio === '9:16') { 
            width = isXL ? 768 : 576; 
            height = isXL ? 1376 : 1024; 
          } else if (currentAspectRatio === '4:3') { 
            width = isXL ? 1200 : 896; 
            height = isXL ? 896 : 672; 
          } else if (currentAspectRatio === '3:4') { 
            width = isXL ? 896 : 672; 
            height = isXL ? 1200 : 896; 
          } else if (currentAspectRatio === '4:1') { 
            width = isXL ? 1584 : 1024; 
            height = isXL ? 672 : 256; 
          } else if (currentAspectRatio === '1:4') { 
            width = isXL ? 672 : 256; 
            height = isXL ? 1584 : 1024; 
          }

          const res = await fetch('/api/leonardo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: finalPrompt,
              negative_prompt: options?.negativePrompt,
              modelId: selectedModel,
              width,
              height,
              seed: options?.seed,
              guidance_scale: options?.cfgScale,
              apiKey: settings.apiKeys.leonardo
            })
          });

          if (!res.ok) {
            let errMessage = 'Leonardo API failed';
            try {
              const errData = await res.json();
              errMessage = errData.error || errMessage;
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
            while (status !== 'COMPLETE' && attempts < 150) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              attempts++;
              const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
              if (!statusRes.ok) {
                const errText = await statusRes.text();
                throw new Error(`Failed to check status: ${errText.slice(0, 100)}`);
              }
              const statusData = await statusRes.json();
              status = statusData.status;
              if (status === 'COMPLETE') {
                let finalUrl = statusData.url;
                if (settings.watermark?.enabled) {
                  finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
                }
                const generatedTags = await ensureTags(enhancedPrompt, []);
                  newImg = {
                    id: `img-${Date.now()}-reroll`,
                    url: finalUrl,
                    prompt: enhancedPrompt,
                    tags: generatedTags,
                    imageId: statusData.imageId,
                    seed: statusData.seed,
                    negativePrompt: options?.negativePrompt,
                    aspectRatio: options?.aspectRatio || '1:1',
                    status: 'ready',
                    modelInfo: {
                      provider: 'leonardo',
                      modelId: selectedModel,
                      modelName: getModelName(selectedModel, 'leonardo')
                    }
                  };
              } else if (status === 'FAILED') {
                throw new Error(statusData.error || 'Leonardo generation failed');
              }
            }
            if (status !== 'COMPLETE') {
              throw new Error('Timeout waiting for Leonardo generation');
            }
          }
        } catch (err) {
          console.error('Leonardo reroll failed:', err);
          throw err;
        }
      }

      if (useGeminiApi) {
        const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
        const imageAi = new GoogleGenAI({ apiKey: geminiApiKey });
        const selectedGeminiModel = selectedModel;
        const imageConfig: any = {};
        
        let finalAspectRatio = options?.aspectRatio || '1:1';
        if (selectedGeminiModel === 'gemini-2.5-flash-image') {
          const unsupportedRatios = ['1:4', '1:8', '4:1', '8:1'];
          if (unsupportedRatios.includes(finalAspectRatio)) {
            finalAspectRatio = finalAspectRatio.startsWith('1:') ? '9:16' : '16:9';
          }
        }
        imageConfig.aspectRatio = finalAspectRatio;
        
        if (selectedGeminiModel !== 'gemini-2.5-flash-image') {
          imageConfig.imageSize = options?.imageSize || '1K';
        }

        const imgRes = await imageAi.models.generateContent({
          model: selectedGeminiModel,
          contents: finalPrompt,
          config: {
            imageConfig,
          },
        });

        let base64Data = '';
        for (const part of imgRes.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Data = part.inlineData.data || '';
            break;
          }
        }

        if (base64Data) {
          let finalUrl = `data:image/jpeg;base64,${base64Data}`;
          const generatedTags = await ensureTags(enhancedPrompt, []);
          if (settings.watermark?.enabled) {
            finalUrl = await applyWatermark(finalUrl, settings.watermark, settings.channelName);
            newImg = {
              id: `img-${Date.now()}-reroll`,
              url: finalUrl,
              prompt: enhancedPrompt,
              tags: generatedTags,
              aspectRatio: finalAspectRatio,
              imageSize: options?.imageSize || '1K',
              status: 'ready',
              modelInfo: {
                provider: 'gemini',
                modelId: selectedGeminiModel,
                modelName: getModelName(selectedGeminiModel, 'gemini')
              }
            };
          } else {
            newImg = {
              id: `img-${Date.now()}-reroll`,
              base64: base64Data,
              url: finalUrl,
              prompt: enhancedPrompt,
              tags: generatedTags,
              aspectRatio: finalAspectRatio,
              imageSize: options?.imageSize || '1K',
              status: 'ready',
              modelInfo: {
                provider: 'gemini',
                modelId: selectedGeminiModel,
                modelName: getModelName(selectedGeminiModel, 'gemini')
              }
            };
          }
        }
      }

      if (newImg) {
        setImages(prev => {
          // Replace the placeholder/original image with the new one
          return prev.map(img => img.id === id ? newImg! : img);
        });
      } else {
        // Reset status if failed
        setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'ready' } : img));
      }

      setProgress('');
    } catch (error) {
      console.error('Reroll error:', error);
      setProgress('An error occurred during reroll.');
    } finally {
      setIsGenerating(false);
    }
  };

  const clearComparison = () => {
    setComparisonResults([]);
    set('mashup_comparison_results', []);
  };

  const deleteComparisonResult = (id: string) => {
    setComparisonResults(prev => {
      const updated = prev.filter(img => img.id !== id);
      set('mashup_comparison_results', updated);
      return updated;
    });
  };

  const generateNegativePrompt = async (idea: string) => {
    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this image generation idea: "${idea}". 
        Generate a concise negative prompt (comma-separated list of things to avoid) to ensure high quality, avoiding common AI artifacts, blurry textures, or elements that would clash with this specific theme. 
        Return ONLY the negative prompt string.`,
      });
      return res.text || '';
    } catch (e) {
      console.error('Failed to generate negative prompt', e);
      return '';
    }
  };

  const addIdea = (concept: string, context?: string) => {
    const newIdea: Idea = {
      id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      concept,
      context,
      createdAt: Date.now(),
      status: 'idea'
    };
    setIdeas(prev => [newIdea, ...prev]);
  };

  const updateIdeaStatus = (id: string, status: 'idea' | 'in-work' | 'done') => {
    setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea));
  };

  const deleteIdea = (id: string) => {
    setIdeas(prev => prev.filter(idea => idea.id !== id));
  };

  const clearIdeas = () => {
    setIdeas([]);
  };

  return (
    <MashupContext.Provider value={{ 
      isLoaded,
      view,
      setView,
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
      bulkUpdateImageTags,
      toggleApproveImage,
      generateComparison,
      pickComparisonWinner,
      comparisonResults,
      clearComparison,
      deleteComparisonResult,
      generateNegativePrompt,
      autoTagImage,
      setImageStatus,
      autoGenerateCollectionInfo,
      comparisonPrompt,
      setComparisonPrompt,
      comparisonOptions,
      setComparisonOptions,
      ideas,
      addIdea,
      updateIdeaStatus,
      deleteIdea,
      clearIdeas,
      isSidebarOpen,
      setIsSidebarOpen
    }}>
      {children}
    </MashupContext.Provider>
  );
};
