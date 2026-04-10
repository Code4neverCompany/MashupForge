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
  Menu
} from 'lucide-react';
import { 
  useMashup, 
  GeneratedImage, 
  GEMINI_MODELS, 
  LEONARDO_MODELS,
  LEONARDO_STYLES,
  Collection,
  GenerateOptions,
  ScheduledPost,
  ART_STYLES,
  LIGHTING_OPTIONS,
  CAMERA_ANGLES,
  ASPECT_RATIOS,
  IMAGE_SIZES
} from './MashupContext';
import { GoogleGenAI, Type } from '@google/genai';

export function MainContent() {
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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a Master Content Creator. Generate a highly creative, peak, and up-to-date crossover mashup idea. You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers between these specific franchises. Incorporate trending concepts or recent news from these franchises by searching the web for the latest trends, movies, or rumors. Make it highly detailed, cinematic, and unique. CRITICAL DIVERSITY MANDATE: You must generate a completely random and diverse idea. Do NOT use common or overused characters like Dr. Doom, Darth Vader, or Batman. Dig deep into the lore of these franchises to find unique character combinations and unexpected scenarios. Return ONLY the idea as a single string. Random Seed: ${Math.random()}`,
        config: {
          tools: [{ googleSearch: {} }],
          toolConfig: { includeServerSideToolInvocations: true },
          temperature: 1.2,
        }
      });
      const newIdea = response.text?.trim() || '';
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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this mashup idea: "${mashupIdea}".
        First, identify the core mood (e.g., dark, whimsical, tense, romantic) and genre (e.g., cyberpunk, high fantasy, noir) implied by the idea.
        Then, SMARTLY select the most appropriate parameters that specifically enhance this mood and genre, rather than just defaulting to generic cinematic qualities.
        Select the best Art Style from: ${ART_STYLES.join(', ')}.
        Select the best Lighting from: ${LIGHTING_OPTIONS.join(', ')}.
        Select the best Camera Angle from: ${CAMERA_ANGLES.join(', ')}.
        Select the best Aspect Ratio from: ${ASPECT_RATIOS.join(', ')}.
        Select the best Leonardo Style from: DYNAMIC, RAYTRACED, CINEMATIC, PHOTOREALISTIC, ANIME, CREATIVE, VIBRANT, PORTRAIT, SKETCH_BW, NONE.
        
        Also, generate a fitting negative prompt (what to avoid in the image) for this specific concept.
        
        CRITICAL ASPECT RATIO RULES:
        - If the prompt describes an epic scene, landscape, wide battle, or cinematic vista, you MUST select "16:9".
        - If the prompt describes a character portrait, single character focus, or vertical subject, you MUST select "9:16".
        - Otherwise, select "1:1" or another appropriate ratio.

        Return ONLY a JSON object with keys: style, lighting, angle, aspectRatio, negativePrompt, leonardoStyle.`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      
      const params = JSON.parse(response.text || '{}');
      setComparisonOptions(prev => ({
        ...prev,
        style: params.style || prev.style,
        lighting: params.lighting || prev.lighting,
        angle: params.angle || prev.angle,
        aspectRatio: params.aspectRatio || prev.aspectRatio,
        negativePrompt: params.negativePrompt || prev.negativePrompt,
        leonardoStyle: params.leonardoStyle || prev.leonardoStyle
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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      
      let data: any = null;
      
      try {
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: `Analyze and enhance this generation prompt: "${prompt}". 
          Provide an improved, highly detailed cinematic prompt. 
          Also provide a fitting negative prompt (e.g., ugly, blurry, poorly drawn).
          Smartly detect and provide the best fitting parameters for this specific scene:
          - Art style from: ${ART_STYLES.join(', ')}
          - Lighting from: ${LIGHTING_OPTIONS.join(', ')}
          - Camera angle from: ${CAMERA_ANGLES.join(', ')}
          - Aspect ratio from: ${['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].join(', ')}
          - Image size from: ${['512px', '1K', '2K', '4K'].join(', ')}
          - Leonardo style from: DYNAMIC, RAYTRACED, CINEMATIC, PHOTOREALISTIC, ANIME, CREATIVE, VIBRANT, PORTRAIT, SKETCH_BW, NONE
          
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
          - "imageSize": string
          - "leonardoStyle": string`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                enhancedPrompt: { type: Type.STRING },
                negativePrompt: { type: Type.STRING },
                style: { type: Type.STRING },
                lighting: { type: Type.STRING },
                angle: { type: Type.STRING },
                aspectRatio: { type: Type.STRING },
                imageSize: { type: Type.STRING },
                leonardoStyle: { type: Type.STRING }
              }
            }
          }
        });
        data = JSON.parse(res.text || '{}');
      } catch (e: any) {
        console.warn('Failed to enhance prompt with Pro model, trying Flash...', e.message);
        try {
          const res = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze and enhance this generation prompt: "${prompt}". 
            Provide an improved, highly detailed cinematic prompt. 
            Also provide a fitting negative prompt.
            Smartly detect and provide the best fitting parameters:
            - Art style from: ${ART_STYLES.join(', ')}
            - Lighting from: ${LIGHTING_OPTIONS.join(', ')}
            - Camera angle from: ${CAMERA_ANGLES.join(', ')}
            - Aspect ratio from: 1:1, 16:9, 9:16, 3:4, 4:3
            - Image size: 512px, 1K, 2K
            - Leonardo style: DYNAMIC, RAYTRACED, CINEMATIC, PHOTOREALISTIC, ANIME, CREATIVE, VIBRANT, PORTRAIT, SKETCH_BW, NONE
            
            Return ONLY a JSON object with: enhancedPrompt, negativePrompt, style, lighting, angle, aspectRatio, imageSize, leonardoStyle`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  enhancedPrompt: { type: Type.STRING },
                  negativePrompt: { type: Type.STRING },
                  style: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  angle: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  imageSize: { type: Type.STRING },
                  leonardoStyle: { type: Type.STRING }
                }
              }
            }
          });
          data = JSON.parse(res.text || '{}');
        } catch (e2) {
          console.error('Failed to enhance prompt for comparison (all models failed):', e2);
          // Fallback to original prompt
          data = {
            enhancedPrompt: prompt,
            negativePrompt: 'ugly, blurry, poorly drawn, low quality',
            style: 'Cinematic',
            lighting: 'Cinematic',
            angle: 'Eye Level',
            aspectRatio: '16:9',
            imageSize: '1K',
            leonardoStyle: 'DYNAMIC'
          };
        }
      }

      setComparisonPrompt(data.enhancedPrompt || prompt);
      setComparisonOptions(prev => ({
        ...prev,
        negativePrompt: data.negativePrompt || '',
        style: ART_STYLES.includes(data.style) ? data.style : ART_STYLES[0],
        lighting: LIGHTING_OPTIONS.includes(data.lighting) ? data.lighting : LIGHTING_OPTIONS[0],
        angle: CAMERA_ANGLES.includes(data.angle) ? data.angle : CAMERA_ANGLES[0],
        aspectRatio: ['1:1', '16:9', '9:16', '3:4', '4:3', '4:1', '1:4'].includes(data.aspectRatio) ? data.aspectRatio : '16:9',
        imageSize: ['512px', '1K', '2K', '4K'].includes(data.imageSize) ? data.imageSize : '1K',
        leonardoStyle: data.leonardoStyle || 'DYNAMIC'
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

      for (let i = 0; i < updatedPosts.length; i++) {
        const post = updatedPosts[i];
        if (post.status === 'scheduled') {
          const postDate = new Date(`${post.date}T${post.time}:00`);
          if (now >= postDate) {
            // Time to post!
            const image = savedImages.find(img => img.id === post.imageId);
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
                  credentials: {
                    instagram: settings.apiKeys.instagram,
                    twitter: settings.apiKeys.twitter,
                    discord: { webhookUrl: settings.apiKeys.discordWebhook }
                  }
                })
              });

              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to post');
              
              updatedPosts[i] = { ...post, status: 'posted' };
              hasUpdates = true;
            } catch (e: any) {
              console.error('Auto-post failed for', post.id, e.message || e);
              updatedPosts[i] = { ...post, status: 'failed' };
              hasUpdates = true;
            }
          }
        }
      }

      if (hasUpdates) {
        updateSettings({ scheduledPosts: updatedPosts });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [settings.scheduledPosts, settings.apiKeys, savedImages, updateSettings]);

  const ALL_MODELS = [...GEMINI_MODELS, ...LEONARDO_MODELS];

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
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      // Dynamically determine best duration and style
      const dynamicSettingsRes = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Analyze this image prompt: "${img.prompt}".
        Determine the best video animation duration (3, 5, or 10 seconds) and the best animation style (Standard, Cinematic, Dynamic, Slow Motion, Fast Motion).
        - Use 3 or 5 seconds for simple actions or portraits.
        - Use 10 seconds for complex scenes, epic landscapes, or slow-motion.
        - Choose a style that fits the mood (e.g., Cinematic for epic scenes, Dynamic for action, Slow Motion for dramatic moments).
        Return ONLY a JSON object with keys "duration" (number) and "style" (string).`,
        config: {
          responseMimeType: 'application/json',
        }
      });

      let duration = settings.defaultAnimationDuration || 5;
      let style = settings.defaultAnimationStyle || 'Standard';

      try {
        const dynamicSettings = JSON.parse(dynamicSettingsRes.text || '{}');
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

      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${settings.agentPrompt || 'You are a Master Content Creator.'} The user wants to animate an image based on this prompt: "${img.prompt}". Enhance this prompt for a video animation. Focus heavily on "what if" scenarios, alternative universes, different timelines, and epic crossovers for Star Wars, Marvel, DC, and Warhammer 40k. Motion style: ${style}. Return ONLY the enhanced animation prompt as a single string.`,
      });
      const videoPrompt = promptRes.text || (style === 'Standard' ? img.prompt : `${img.prompt}. Motion style: ${style}`);

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
          const statusRes = await fetch(`/api/leonardo/${data.generationId}?apiKey=${settings.apiKeys.leonardo || ''}`);
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
              onClick={() => setView('compare')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'compare' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Sparkles className="w-4 h-4 hidden sm:block" />
              Studio
            </button>
            <button
              onClick={() => setView('ideas')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 shrink-0 snap-start ${view === 'ideas' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Lightbulb className="w-4 h-4 hidden sm:block" />
              Ideas
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
          </div>

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
                <div className="mb-8 flex flex-col gap-4 bg-zinc-900/50 p-4 md:p-6 rounded-2xl border border-zinc-800">
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:w-96">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text" 
                        placeholder="Search by prompt or tags..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      {selectedForBatch.size > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleBatchAnimate}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2 text-sm"
                          >
                            <Video className="w-4 h-4" />
                            Batch Animate ({selectedForBatch.size})
                          </button>
                          <button
                            onClick={() => setShowBulkTagModal(true)}
                            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 text-sm"
                          >
                            <Tag className="w-4 h-4" />
                            Bulk Tag
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-zinc-500" />
                        <select 
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-4 border-t border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Model:</span>
                      <select 
                        value={filterModel}
                        onChange={(e) => setFilterModel(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        <option value="all">All Models</option>
                        {ALL_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Universe:</span>
                      <select 
                        value={filterUniverse}
                        onChange={(e) => setFilterUniverse(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        <option value="all">All Universes</option>
                        <option value="Marvel">Marvel</option>
                        <option value="DC">DC</option>
                        <option value="Star Wars">Star Wars</option>
                        <option value="Warhammer 40k">Warhammer 40k</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">Tag Query:</span>
                      <div className="relative flex-1">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                        <input 
                          type="text"
                          placeholder="e.g. Marvel OR DC; NOT Grimdark"
                          value={tagQuery}
                          onChange={(e) => setTagQuery(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
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

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Collection:</span>
                      <select 
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        <option value="all">All Collections</option>
                        {collections.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {view === 'ideas' && (
                <div className="space-y-6 h-full flex flex-col">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Ideas Board</h2>
                      <p className="text-zinc-400 text-sm">Review, approve, and push brainstormed ideas to the comparison studio.</p>
                    </div>
                    <button
                      onClick={clearIdeas}
                      className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-[500px]">
                    {['idea', 'in-work', 'done'].map((status) => (
                      <div 
                        key={status}
                        className="flex-1 bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4 flex flex-col gap-4"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const ideaId = e.dataTransfer.getData('ideaId');
                          if (ideaId) updateIdeaStatus(ideaId, status as 'idea' | 'in-work' | 'done');
                        }}
                      >
                        <h3 className="font-bold text-white flex items-center justify-between capitalize">
                          {status.replace('-', ' ')} 
                          <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1 rounded-full">
                            {ideas.filter(i => i.status === status).length}
                          </span>
                        </h3>
                        <div className="flex flex-col gap-3 overflow-y-auto hide-scrollbar flex-1">
                          {ideas.filter(i => i.status === status).map(idea => (
                            <div 
                              key={idea.id} 
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('ideaId', idea.id)}
                              className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing hover:border-indigo-500/50 transition-colors"
                            >
                              {idea.context && <h4 className="text-sm font-bold text-indigo-400">{idea.context}</h4>}
                              <p className="text-xs text-zinc-300 line-clamp-4">{idea.concept}</p>
                              <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-800">
                                <span className="text-[10px] text-zinc-500">{new Date(idea.createdAt).toLocaleDateString()}</span>
                                <div className="flex gap-1">
                                  {status === 'idea' && (
                                    <button onClick={() => updateIdeaStatus(idea.id, 'in-work')} className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-md">Approve</button>
                                  )}
                                  {status === 'in-work' && (
                                    <>
                                      <button 
                                        onClick={() => handlePushIdeaToCompare(idea.concept)} 
                                        disabled={isPushing}
                                        className="text-[10px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2 py-1 rounded-md flex items-center gap-1"
                                      >
                                        {isPushing ? <Loader2 className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                                        To Studio
                                      </button>
                                      <button onClick={() => updateIdeaStatus(idea.id, 'done')} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-md">Done</button>
                                    </>
                                  )}
                                  <button onClick={() => deleteIdea(idea.id)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded-md">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'compare' && (
                <div className="space-y-8">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-white">Multiverse Mashup Studio</h2>
                        <p className="text-zinc-400 text-sm">Generate and compare crossover ideas across different AI models.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[150px]"
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
                          className="text-xs bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-indigo-500/20"
                        >
                          {isGeneratingIdea ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Generate Idea
                        </button>
                        <button
                          onClick={() => autoSelectParameters(comparisonPrompt)}
                          disabled={isAutoSelecting || !comparisonPrompt.trim()}
                          className="text-xs bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-indigo-500/20 disabled:opacity-50"
                        >
                          {isAutoSelecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Auto-Select Params
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Select Models to Compare</label>
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
                                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                              }`}
                            >
                              <span className="truncate mr-2">{model.name}</span>
                              {comparisonModels.includes(model.id) && <BookmarkCheck className="w-3 h-3 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-indigo-400 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Pushed Prompt
                        </label>
                        <textarea
                          value={comparisonPrompt}
                          onChange={(e) => setComparisonPrompt(e.target.value)}
                          placeholder="Enter a prompt to compare across models..."
                          className="w-full bg-zinc-950/80 border border-indigo-500/30 rounded-xl p-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[100px] resize-none shadow-inner shadow-indigo-500/5"
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
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
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
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
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
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                          >
                            {CAMERA_ANGLES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <Sparkles className="w-3 h-3" /> Leonardo Style
                          </label>
                          <select
                            value={comparisonOptions.leonardoStyle || 'DYNAMIC'}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, leonardoStyle: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                          >
                            {LEONARDO_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            <ImageIcon className="w-3 h-3" /> Aspect Ratio
                          </label>
                          <select
                            value={comparisonOptions.aspectRatio}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, aspectRatio: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
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
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                          >
                            {['512px', '1K', '2K', '4K'].map(size => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                            Seed / Chaos
                          </label>
                          <input
                            type="number"
                            value={comparisonOptions.seed || ''}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, seed: e.target.value === '' ? undefined : parseInt(e.target.value) }))}
                            placeholder="Random (Leave empty)"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                            <span>CFG Scale / Stylize</span>
                            <span className="text-indigo-400">{comparisonOptions.cfgScale || 7}</span>
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={comparisonOptions.cfgScale || 7}
                            onChange={(e) => setComparisonOptions(prev => ({ ...prev, cfgScale: parseInt(e.target.value) }))}
                            className="w-full accent-indigo-500"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleCompare}
                        disabled={isComparing || comparisonModels.length < 2 || !comparisonPrompt.trim()}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                      >
                        {isComparing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Comparing Models...
                          </>
                        ) : (
                          <>
                            <Columns className="w-5 h-5" />
                            Compare {comparisonModels.length} Models
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
                                <div className="aspect-square relative overflow-hidden bg-zinc-950">
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
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                                        <div className="flex gap-3">
                                          <button
                                            onClick={() => pickComparisonWinner(img.id)}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${img.winner ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                          >
                                            {img.winner ? <CheckCircle2 className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                            {img.winner ? 'Picked' : 'Keep this version'}
                                          </button>
                                          <button
                                            onClick={() => setSelectedImage(img)}
                                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                                          >
                                            <Maximize2 className="w-4 h-4" />
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

              {view === 'captioning' && <CaptioningView setView={setView} />}
              {view === 'post-ready' && <PostReadyView />}

              {(view === 'studio' || view === 'gallery') && (
                displayedImages.length === 0 && !isGenerating ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="h-full flex flex-col items-center justify-center text-zinc-500 py-20"
            >
              <div className="w-24 h-24 mb-6 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                {view === 'gallery' ? <Bookmark className="w-10 h-10 text-zinc-700" /> : <ImageIcon className="w-10 h-10 text-zinc-700" />}
              </div>
              <h2 className="text-xl font-medium text-zinc-300 mb-2">
                {view === 'gallery' ? 'Your Gallery is Empty' : 'No Images Generated Yet'}
              </h2>
              <p className="text-sm max-w-md text-center text-zinc-500">
                {view === 'gallery' 
                  ? 'Save your favorite mashups from the Studio to build your personal collection.' 
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
                    className="group relative bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 hover:border-zinc-700"
                  >
                    <div 
                      className={`aspect-square relative overflow-hidden bg-zinc-950 cursor-pointer ${img.approved ? 'ring-4 ring-indigo-500 ring-inset' : ''}`}
                      onClick={() => setSelectedImage(img)}
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
                      {img.approved && (
                        <div className="absolute top-4 right-4 z-30 bg-indigo-500 text-white p-1 rounded-full shadow-lg">
                          <BookmarkCheck className="w-4 h-4" />
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
                            className="w-5 h-5 rounded border-zinc-600 bg-zinc-900/80 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
                      
                      {/* Top Actions Overlay */}
                      <div className="absolute top-0 left-0 right-0 p-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                        {img.imageId && !img.isVideo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAnimate(img); }}
                            disabled={img.status === 'animating'}
                            className="w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-indigo-500/80 text-white rounded-xl backdrop-blur-md transition-colors"
                            title="Animate Image"
                          >
                            {img.status === 'animating' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                          </button>
                        )}
                        {view === 'studio' && !img.isVideo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); rerollImage(img.id, img.prompt); }}
                            disabled={isGenerating}
                            className="w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-indigo-500/80 text-white rounded-xl backdrop-blur-md transition-colors"
                            title="Re-roll Image"
                          >
                            <RefreshCw className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleApproveImage(img.id); }}
                          className={`w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition-colors ${
                            img.approved 
                              ? 'bg-indigo-500 text-white' 
                              : 'bg-black/50 hover:bg-indigo-500/80 text-white'
                          }`}
                          title={img.approved ? "Unapprove Image" : "Approve Image"}
                        >
                          <BookmarkCheck className="w-5 h-5" />
                        </button>
                        {view === 'gallery' && (
                          <div className="relative group/col">
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-indigo-500/80 text-white rounded-xl backdrop-blur-md transition-colors"
                              title="Add to Collection"
                            >
                              <FolderPlus className="w-5 h-5" />
                            </button>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/col:opacity-100 group-hover/col:visible transition-all z-50 p-2">
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-1 mb-1">Add to Collection</p>
                              {collections.map(col => (
                                <button
                                  key={col.id}
                                  onClick={(e) => { e.stopPropagation(); addImageToCollection(img.id, col.id); }}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                                    img.collectionId === col.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
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
                                className="w-full text-left px-3 py-2 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors mt-1 border-t border-zinc-800 pt-2 flex items-center gap-2"
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
                          className={`w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition-colors ${
                            isSaved 
                              ? 'bg-indigo-500/80 text-white cursor-default' 
                              : 'bg-black/50 hover:bg-black/80 text-white'
                          }`}
                          title={isSaved ? "Saved to Gallery" : "Save to Gallery"}
                        >
                          {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!img.approved) toggleApproveImage(img.id);
                            if (!img.postCaption) await generatePostContent(img);
                            await saveImage({ ...img, isPostReady: true });
                            setView('post-ready');
                          }}
                          className="w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-emerald-500/80 text-white rounded-xl backdrop-blur-md transition-colors"
                          title="Prepare for Post"
                        >
                          <Save className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteImage(img.id, view === 'gallery'); }}
                          className="w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-red-500/80 text-white rounded-xl backdrop-blur-md transition-colors"
                          title="Delete Image"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Bottom Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 pointer-events-none">
                        <p className="text-sm text-zinc-200 line-clamp-3 mb-4 font-medium leading-relaxed shadow-sm pointer-events-auto">
                          {img.prompt}
                        </p>
                        <div className="flex gap-3 pointer-events-auto">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedImage(img); }}
                            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                          >
                            <Maximize2 className="w-4 h-4" />
                            View Details
                          </button>
                          <a
                            href={img.url || `data:image/jpeg;base64,${img.base64}`}
                            download={`mashup-${idx + 1}.jpg`}
                            onClick={(e) => e.stopPropagation()}
                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                            title="Download Image"
                            target={img.url ? "_blank" : undefined}
                            rel={img.url ? "noopener noreferrer" : undefined}
                          >
                            <Download className="w-4 h-4" />
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
              {/* Provider Selection */}
              <div className="space-y-4">
                <label className="text-sm font-medium text-zinc-300">Active Providers</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      const newProviders = settings.enabledProviders.includes('gemini')
                        ? settings.enabledProviders.filter(p => p !== 'gemini')
                        : [...settings.enabledProviders, 'gemini'];
                      if (newProviders.length === 0) return;
                      updateSettings({ 
                        enabledProviders: newProviders as any,
                        defaultProvider: !newProviders.includes(settings.defaultProvider) 
                          ? (newProviders[0] as any) 
                          : settings.defaultProvider
                      });
                    }}
                    className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                      settings.enabledProviders.includes('gemini')
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    <Zap className="w-6 h-6" />
                    <span className="text-xs font-bold uppercase tracking-wider text-center">Gemini Image Generation</span>
                  </button>
                  <button
                    onClick={() => {
                      const newProviders = settings.enabledProviders.includes('leonardo')
                        ? settings.enabledProviders.filter(p => p !== 'leonardo')
                        : [...settings.enabledProviders, 'leonardo'];
                      if (newProviders.length === 0) return;
                      updateSettings({ 
                        enabledProviders: newProviders as any,
                        defaultProvider: !newProviders.includes(settings.defaultProvider) 
                          ? (newProviders[0] as any) 
                          : settings.defaultProvider
                      });
                    }}
                    className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                      settings.enabledProviders.includes('leonardo')
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    <Palette className="w-6 h-6" />
                    <span className="text-xs font-bold uppercase tracking-wider">Leonardo.AI</span>
                  </button>
                </div>
              </div>

              {/* API Keys Section */}
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <label className="text-sm font-medium text-zinc-300">API Keys</label>
                {settings.enabledProviders.includes('gemini') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gemini API Key</label>
                    <input
                      type="password"
                      value={settings.apiKeys.gemini || ''}
                      onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, gemini: e.target.value } })}
                      placeholder="••••••••••••••••"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                )}
                {settings.enabledProviders.includes('leonardo') && (
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
                )}
                
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
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <h4 className="text-lg font-medium text-white mb-2">Image Generation Settings</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Provider</label>
                    <select
                      value={settings.defaultProvider}
                      onChange={(e) => updateSettings({ defaultProvider: e.target.value as 'gemini' | 'leonardo' })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      {settings.enabledProviders.includes('gemini') && <option value="gemini">Google Gemini</option>}
                      {settings.enabledProviders.includes('leonardo') && <option value="leonardo">Leonardo.AI</option>}
                    </select>
                  </div>

                  {settings.enabledProviders.includes('gemini') && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Gemini Model</label>
                      <select
                        value={settings.defaultGeminiModel}
                        onChange={(e) => updateSettings({ defaultGeminiModel: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      >
                        {GEMINI_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {settings.enabledProviders.includes('leonardo') && (
                    <>
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

                      <div className="space-y-2">
                        <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Leonardo Style</label>
                        <select
                          value={settings.defaultLeonardoStyle}
                          onChange={(e) => updateSettings({ defaultLeonardoStyle: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                          {LEONARDO_STYLES.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
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

function CaptioningView({ setView }: { setView: (v: 'studio' | 'gallery' | 'compare' | 'captioning' | 'post-ready') => void }) {
  const { savedImages, generatePostContent, settings, saveImage, saveImages } = useMashup();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const captioningImages = savedImages.filter(img => img.approved && !img.isPostReady);

  // Group images by groupId
  const groupedCaptioningItems = React.useMemo(() => {
    const groups: Record<string, GeneratedImage[]> = {};
    const ungrouped: GeneratedImage[] = [];
    
    captioningImages.forEach(img => {
      if (img.groupId) {
        if (!groups[img.groupId]) groups[img.groupId] = [];
        groups[img.groupId].push(img);
      } else {
        ungrouped.push(img);
      }
    });
    
    const items: { id: string, images: GeneratedImage[], isGroup: boolean }[] = [];
    
    // Add groups
    Object.entries(groups).forEach(([groupId, imgs]) => {
      items.push({ id: groupId, images: imgs, isGroup: true });
    });
    
    // Add ungrouped
    ungrouped.forEach(img => {
      items.push({ id: img.id, images: [img], isGroup: false });
    });
    
    // Sort by newest image in item
    return items.sort((a, b) => {
      const timeA = Math.max(...a.images.map(i => i.savedAt || 0));
      const timeB = Math.max(...b.images.map(i => i.savedAt || 0));
      return timeB - timeA;
    });
  }, [captioningImages]);

  const handleGroupSelected = async () => {
    if (selectedForBatch.size < 2) return;
    const groupId = `group-${Date.now()}`;
    const ids = Array.from(selectedForBatch);
    const imgsToUpdate = savedImages.filter(img => ids.includes(img.id)).map(img => ({ ...img, groupId }));
    saveImages(imgsToUpdate);
    setSelectedForBatch(new Set());
  };

  const handleUngroup = async (groupId: string) => {
    const imgsToUpdate = savedImages.filter(img => img.groupId === groupId).map(img => ({ ...img, groupId: undefined }));
    saveImages(imgsToUpdate);
    if (selectedImage?.groupId === groupId) setSelectedImage(null);
  };

  useEffect(() => {
    if (selectedImage && !showSuccess) {
      const updated = savedImages.find(img => img.id === selectedImage.id);
      if (updated) {
        // Only auto-update if the selected image currently has NO caption (e.g. it was just generated)
        if (!selectedImage.postCaption && updated.postCaption) {
          setSelectedImage(updated);
        }
      } else {
        setSelectedImage(null);
      }
    }
  }, [savedImages, selectedImage, showSuccess]);

  const handleSaveContent = async () => {
    if (!selectedImage) return;
    setIsSaving(true);
    try {
      if (selectedImage.groupId) {
        const groupImgs = savedImages.filter(img => img.groupId === selectedImage.groupId);
        const updatedImgs = groupImgs.map(img => ({ 
          ...img, 
          isPostReady: true, 
          postCaption: selectedImage.postCaption, 
          postHashtags: selectedImage.postHashtags 
        }));
        saveImages(updatedImgs);
      } else {
        await saveImage({ ...selectedImage, isPostReady: true });
      }
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedImage(null);
        setView('post-ready');
      }, 1000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchMove = async () => {
    if (selectedForBatch.size === 0) return;
    setIsBatchProcessing(true);
    try {
      for (const id of Array.from(selectedForBatch)) {
        const img = savedImages.find(i => i.id === id);
        if (img) {
          let updatedImg = img;
          if (!img.postCaption) {
            const generated = await generatePostContent(img);
            if (generated) updatedImg = generated;
          }
          await saveImage({ ...updatedImg, isPostReady: true });
        }
      }
      setSelectedForBatch(new Set());
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleRemove = async (img: GeneratedImage, e: React.MouseEvent) => {
    e.stopPropagation();
    await saveImage({ ...img, approved: false });
    if (selectedImage?.id === img.id) setSelectedImage(null);
    setSelectedForBatch(prev => {
      const next = new Set(prev);
      next.delete(img.id);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white tracking-tight">Captioning Studio</h2>
          <p className="text-zinc-400 text-sm">Review, edit, and finalize your AI-generated captions and hashtags.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedForBatch.size >= 2 && (
            <button
              onClick={handleGroupSelected}
              className="px-4 py-2 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
            >
              <Layers className="w-4 h-4" />
              Group Selected into One Post ({selectedForBatch.size})
            </button>
          )}
          {selectedForBatch.size > 0 && (
            <button
              onClick={handleBatchMove}
              disabled={isBatchProcessing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
            >
              {isBatchProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Batch Move to Post Ready ({selectedForBatch.size})
            </button>
          )}
        </div>
      </div>

      {captioningImages.length === 0 ? (
        <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto">
            <Edit3 className="w-8 h-8 text-zinc-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">No images waiting for captions</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              Go to your Gallery and click the &quot;Prepare for Post&quot; button on any image to send it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* List of ready posts */}
          <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
            {groupedCaptioningItems.map(item => {
              const mainImg = item.images[0];
              const isSelected = selectedImage?.id === mainImg.id || (selectedImage?.groupId && selectedImage.groupId === item.id);
              
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedImage(mainImg)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer relative ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/50' 
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    {item.isGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUngroup(item.id);
                        }}
                        className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                        title="Ungroup Post"
                      >
                        <MinusCircle className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        item.images.forEach(img => handleRemove(img, e));
                      }}
                      className="p-1.5 bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                      title="Remove from Captioning"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {!item.isGroup && (
                      <input
                        type="checkbox"
                        checked={selectedForBatch.has(mainImg.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedForBatch(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(mainImg.id);
                            else next.delete(mainImg.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500/50 bg-zinc-900"
                      />
                    )}
                  </div>
                  
                  <div className="relative w-20 h-20 flex-shrink-0">
                    {item.images.slice(0, 3).map((img, idx) => (
                      <div 
                        key={img.id}
                        className="absolute rounded-xl overflow-hidden border border-zinc-800 bg-zinc-800 transition-all"
                        style={{ 
                          width: '100%', 
                          height: '100%',
                          top: idx * -4,
                          left: idx * 4,
                          zIndex: 10 - idx,
                          opacity: 1 - (idx * 0.2)
                        }}
                      >
                        <Image 
                          src={img.url || `data:image/jpeg;base64,${img.base64}`} 
                          alt="" 
                          fill 
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                    {item.isGroup && (
                      <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md z-20 shadow-lg">
                        {item.images.length}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 ml-4">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-white font-medium truncate">
                        {item.isGroup ? `Multi-Image Post: ${mainImg.prompt.slice(0, 30)}...` : mainImg.prompt}
                      </p>
                    </div>
                    {mainImg.postCaption ? (
                      <p className="text-xs text-zinc-500 line-clamp-2">{mainImg.postCaption}</p>
                    ) : (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          const updated = await generatePostContent(mainImg);
                          if (updated && selectedImage?.id === updated.id) {
                            setSelectedImage(updated);
                          }
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                      >
                        Generate Post Content
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Instagram Preview */}
          <div className="sticky top-8">
            {selectedImage ? (
              <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden max-w-[400px] mx-auto shadow-2xl">
                {/* Header */}
                <div className="p-3 flex items-center justify-between border-b border-zinc-900">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 via-red-500 to-purple-600 p-[2px]">
                      <div className="w-full h-full rounded-full bg-black border-2 border-black flex items-center justify-center overflow-hidden">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-white tracking-tight">{settings.channelName || 'MultiverseMashupAI'}</span>
                  </div>
                  <button className="text-white">
                    <X className="w-4 h-4 rotate-45" />
                  </button>
                </div>

                {/* Image */}
                <div className="relative aspect-square bg-zinc-900">
                  {selectedImage.groupId ? (
                    <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar">
                      {savedImages.filter(img => img.groupId === selectedImage.groupId).map((img, idx) => (
                        <div key={img.id} className="w-full h-full flex-shrink-0 snap-center relative">
                          <Image 
                            src={img.url || `data:image/jpeg;base64,${img.base64}`} 
                            alt="" 
                            fill 
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white font-bold">
                            {idx + 1} / {savedImages.filter(i => i.groupId === selectedImage.groupId).length}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedImage.isVideo ? (
                    <video
                      src={selectedImage.url}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image 
                      src={selectedImage.url || `data:image/jpeg;base64,${selectedImage.base64}`} 
                      alt="" 
                      fill 
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>

                {/* Actions */}
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button className="text-white hover:text-zinc-400 transition-colors">
                        <svg aria-label="Like" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.077 2.5 12.194 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.03.044.06.091.092.144.032-.053.062-.1.092-.144a4.21 4.21 0 0 1 3.675-1.941m0-2a6.21 6.21 0 0 0-5.421 3.146 6.21 6.21 0 0 0-5.421-3.146 6.91 6.91 0 0 0-6.91 7.115c0 4.115 3.036 6.299 5.456 8.385a54.73 54.73 0 0 0 4.875 3.775 1 1 0 0 0 1 0 54.73 54.73 0 0 0 4.875-3.775c2.42-2.086 5.456-4.27 5.456-8.385a6.91 6.91 0 0 0-6.91-7.115z"></path></svg>
                      </button>
                      <button className="text-white hover:text-zinc-400 transition-colors">
                        <svg aria-label="Comment" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      </button>
                      <button className="text-white hover:text-zinc-400 transition-colors">
                        <svg aria-label="Share Post" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><line fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" x1="22" x2="9.218" y1="3" y2="10.083"></line><polygon fill="none" points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon></svg>
                      </button>
                    </div>
                    <button className="text-white hover:text-zinc-400 transition-colors">
                      <svg aria-label="Save" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></polygon></svg>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">1,234 likes</p>
                    <div className="text-xs leading-relaxed">
                      <span className="font-bold mr-2 text-white">{settings.channelName || 'MultiverseMashupAI'}</span>
                      <textarea 
                        value={selectedImage.postCaption || ''}
                        onChange={(e) => setSelectedImage({ ...selectedImage, postCaption: e.target.value })}
                        className="w-full bg-transparent border-none text-xs text-zinc-300 p-0 focus:ring-0 resize-none min-h-[60px]"
                        placeholder="Write a caption..."
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-1 mt-2">
                      {selectedImage.postHashtags?.map(tag => (
                        <span key={tag} className="text-xs text-blue-400 hover:underline cursor-pointer">#{tag.replace('#', '')}</span>
                      ))}
                    </div>
                    <div className="pt-2 flex justify-between items-center">
                      <button 
                        onClick={async () => {
                          const updated = await generatePostContent(selectedImage);
                          if (updated) setSelectedImage(updated);
                        }}
                        className="text-[10px] text-zinc-400 hover:text-white font-bold transition-colors flex items-center gap-1 uppercase tracking-widest"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                      <button 
                        onClick={handleSaveContent}
                        disabled={isSaving || showSuccess}
                        className={`text-[10px] font-bold transition-colors flex items-center gap-1 uppercase tracking-widest ${
                          showSuccess ? 'text-green-400' : 'text-indigo-400 hover:text-indigo-300'
                        }`}
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                         showSuccess ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        {showSuccess ? 'Moved to Post Ready!' : 'Save & Move to Post Ready'}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 uppercase mt-2">2 HOURS AGO</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-zinc-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-zinc-500" />
                    </div>
                    <span className="text-xs text-zinc-500">Add a comment...</span>
                  </div>
                  <button className="text-blue-500 text-xs font-bold opacity-50">Post</button>
                </div>
              </div>
            ) : (
              <div className="h-[500px] flex items-center justify-center text-zinc-600 italic text-sm">
                Select an image to caption
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PostReadyView() {
  const { savedImages, settings, updateSettings, saveImage, saveImages } = useMashup();
  const postReadyImages = savedImages.filter(img => img.isPostReady);
  
  // Group postReadyImages by groupId
  const groupedPostReadyItems = React.useMemo(() => {
    const groups: Record<string, GeneratedImage[]> = {};
    const ungrouped: GeneratedImage[] = [];
    
    postReadyImages.forEach(img => {
      if (img.groupId) {
        if (!groups[img.groupId]) groups[img.groupId] = [];
        groups[img.groupId].push(img);
      } else {
        ungrouped.push(img);
      }
    });
    
    const items: { id: string, images: GeneratedImage[], isGroup: boolean }[] = [];
    Object.entries(groups).forEach(([groupId, imgs]) => {
      items.push({ id: groupId, images: imgs, isGroup: true });
    });
    ungrouped.forEach(img => {
      items.push({ id: img.id, images: [img], isGroup: false });
    });
    
    return items.sort((a, b) => {
      const timeA = Math.max(...a.images.map(i => i.savedAt || 0));
      const timeB = Math.max(...b.images.map(i => i.savedAt || 0));
      return timeB - timeA;
    });
  }, [postReadyImages]);

  const [selectedImageForSchedule, setSelectedImageForSchedule] = useState<GeneratedImage | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [editedCaption, setEditedCaption] = useState('');
  const [isSelectingPostForDate, setIsSelectingPostForDate] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendationReason, setRecommendationReason] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const handleRecommendTime = async () => {
    setIsRecommending(true);
    try {
      const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Analyze this social media post:
      Caption: "${editedCaption}"
      Platforms: ${selectedPlatforms.join(', ')}
      
      Suggest the optimal date and time to post this for maximum engagement.
      Current date/time: ${new Date().toISOString()}
      
      Return ONLY a JSON object with:
      - date: "YYYY-MM-DD" (must be today or in the future)
      - time: "HH:MM" (24-hour format)
      - reason: "A short 1-sentence explanation"`;

      const res = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const data = JSON.parse(res.text || '{}');
      if (data.date) setScheduleDate(data.date);
      if (data.time) setScheduleTime(data.time);
      if (data.reason) setRecommendationReason(data.reason);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecommending(false);
    }
  };

  const handleSchedule = async (isImmediate = false) => {
    if (!selectedImageForSchedule || selectedPlatforms.length === 0) {
      alert('Please select at least one platform.');
      return;
    }
    if (!isImmediate && (!scheduleDate || !scheduleTime)) {
      alert('Please select a date and time for scheduling.');
      return;
    }

    const hasInstagram = selectedPlatforms.includes('instagram');
    const hasTwitter = selectedPlatforms.includes('twitter');
    const hasDiscord = selectedPlatforms.includes('discord');

    const instagramCreds = settings.apiKeys.instagram;
    const twitterCreds = settings.apiKeys.twitter;
    const discordWebhook = settings.apiKeys.discordWebhook;

    if (hasInstagram && (!instagramCreds?.accessToken || !instagramCreds?.igAccountId)) {
      alert('Please configure your Instagram Graph API credentials in Settings.');
      return;
    }

    if (hasTwitter && (!twitterCreds?.appKey || !twitterCreds?.appSecret || !twitterCreds?.accessToken || !twitterCreds?.accessSecret)) {
      alert('Please configure all 4 Twitter API credentials in Settings.');
      return;
    }

    if (hasDiscord && !discordWebhook) {
      alert('Please configure your Discord Webhook URL in Settings.');
      return;
    }

    setIsPosting(true);
    try {
      let scheduleIsoDate;
      if (!isImmediate) {
        const dateObj = new Date(`${scheduleDate}T${scheduleTime}:00`);
        scheduleIsoDate = dateObj.toISOString();
      }

      const imageIds = selectedImageForSchedule.groupId 
        ? savedImages.filter(img => img.groupId === selectedImageForSchedule.groupId).map(img => img.id)
        : [selectedImageForSchedule.id];

      // If it's scheduled for the future, we just save it locally.
      // Free APIs don't hold scheduled posts for us.
      if (!isImmediate) {
        if (editingScheduleId) {
          const updatedPosts: ScheduledPost[] = settings.scheduledPosts?.map(p => 
            p.id === editingScheduleId 
              ? { ...p, date: scheduleDate, time: scheduleTime, platforms: selectedPlatforms, caption: editedCaption, status: 'scheduled', imageIds }
              : p
          ) || [];
          updateSettings({ scheduledPosts: updatedPosts });
          alert('Post schedule updated!');
        } else {
          const newSchedule: ScheduledPost = {
            id: `sched-${Date.now()}`,
            imageIds,
            date: scheduleDate,
            time: scheduleTime,
            platforms: selectedPlatforms,
            caption: editedCaption,
            status: 'scheduled'
          };

          updateSettings({
            scheduledPosts: [...(settings.scheduledPosts || []), newSchedule]
          });
          alert('Post scheduled locally! (Note: The app must be open to post it automatically, or you can click Post Now later).');
        }

        setSelectedImageForSchedule(null);
        setEditingScheduleId(null);
        setScheduleDate('');
        setScheduleTime('');
        setSelectedPlatforms([]);
        setEditedCaption('');
        setRecommendationReason('');
        return;
      }

      // Immediate posting
      const mediaUrls = selectedImageForSchedule.groupId
        ? savedImages.filter(img => img.groupId === selectedImageForSchedule.groupId).map(img => img.url)
        : [selectedImageForSchedule.url];

      const res = await fetch('/api/social/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: editedCaption,
          platforms: selectedPlatforms.map(p => p.toLowerCase()),
          mediaUrl: mediaUrls[0], // For now, most APIs handle one URL easily. Multi-image posting might need API updates.
          mediaUrls: mediaUrls.length > 1 ? mediaUrls : undefined,
          mediaBase64: selectedImageForSchedule.base64,
          credentials: {
            instagram: instagramCreds,
            twitter: twitterCreds,
            discord: { webhookUrl: discordWebhook }
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post');

      const newSchedule: ScheduledPost = {
        id: editingScheduleId || `sched-${Date.now()}`,
        imageIds,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().substring(0,5),
        platforms: selectedPlatforms,
        caption: editedCaption,
        status: 'posted'
      };

      if (editingScheduleId) {
        const updatedPosts = settings.scheduledPosts?.map(p => 
          p.id === editingScheduleId ? newSchedule : p
        ) || [];
        updateSettings({ scheduledPosts: updatedPosts });
      } else {
        updateSettings({
          scheduledPosts: [...(settings.scheduledPosts || []), newSchedule]
        });
      }

      setSelectedImageForSchedule(null);
      setEditingScheduleId(null);
      setScheduleDate('');
      setScheduleTime('');
      setSelectedPlatforms([]);
      setEditedCaption('');
      setRecommendationReason('');
      alert('Posted successfully!');
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteSchedule = () => {
    if (!editingScheduleId) return;
    if (confirm('Are you sure you want to delete this scheduled post?')) {
      const updatedPosts = settings.scheduledPosts?.filter(p => p.id !== editingScheduleId) || [];
      updateSettings({ scheduledPosts: updatedPosts });
      setSelectedImageForSchedule(null);
      setEditingScheduleId(null);
    }
  };

  const getScheduledInfo = (itemId: string, isGroup: boolean) => {
    return settings.scheduledPosts?.filter(p => 
      isGroup ? p.imageIds?.includes(savedImages.find(img => img.groupId === itemId)?.id || '') : (p.imageId === itemId || p.imageIds?.includes(itemId))
    ) || [];
  };

  // Helper to get dates for the current week
  const getWeekDates = () => {
    const dates = [];
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDay);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white tracking-tight">Post Ready Content</h2>
          <p className="text-zinc-400 text-sm">Your finalized content, ready to be scheduled and shared.</p>
        </div>
        <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
            Grid
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              viewMode === 'calendar' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </button>
        </div>
      </div>

      {postReadyImages.length === 0 ? (
        <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto">
            <Save className="w-8 h-8 text-zinc-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white">No content ready for posting</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              Images will appear here after you save them in the Captioning tab.
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedPostReadyItems.map(item => {
            const mainImg = item.images[0];
            const schedules = getScheduledInfo(item.id, item.isGroup);
            return (
            <div key={item.id} className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-xl flex flex-col">
              <div className="relative aspect-square bg-zinc-800 cursor-pointer group" onClick={() => {
                setSelectedImageForSchedule(mainImg);
                setEditedCaption(`${mainImg.postCaption}\n\n${mainImg.postHashtags?.map(t => '#' + t.replace('#', '')).join(' ')}`);
              }}>
                {item.isGroup ? (
                  <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar">
                    {item.images.map((img, idx) => (
                      <div key={img.id} className="w-full h-full flex-shrink-0 snap-center relative">
                        <Image 
                          src={img.url || `data:image/jpeg;base64,${img.base64}`} 
                          alt="" 
                          fill 
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white font-bold">
                          {idx + 1} / {item.images.length}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : mainImg.isVideo ? (
                  <div className="relative w-full h-full">
                    <video
                      src={mainImg.url}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <Image 
                    src={mainImg.url || `data:image/jpeg;base64,${mainImg.base64}`} 
                    alt="" 
                    fill 
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                )}
                {item.isGroup && (
                  <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg flex items-center gap-1.5">
                    <Layers className="w-3 h-3" />
                    Multi-Image Post
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl text-white text-sm font-medium">
                    Schedule Post
                  </div>
                </div>
              </div>
              
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex-1">
                  <p className="text-sm text-zinc-300 line-clamp-2 mb-3 italic">
                    &quot;{mainImg.postCaption}&quot;
                  </p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {mainImg.postHashtags?.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">#{tag.replace('#', '')}</span>
                    ))}
                    {(mainImg.postHashtags?.length || 0) > 3 && (
                      <span className="text-[10px] text-zinc-500">+{mainImg.postHashtags!.length - 3} more</span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  {schedules.length > 0 ? (
                    <div className="space-y-2">
                      {schedules.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${s.status === 'posted' ? 'bg-green-500' : 'bg-indigo-500 animate-pulse'}`} />
                            <span className="text-[10px] text-zinc-300 font-medium">
                              {s.status === 'posted' ? 'Posted' : 'Scheduled'}: {s.date} @ {s.time}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              setEditingScheduleId(s.id);
                              setSelectedImageForSchedule(mainImg);
                              setScheduleDate(s.date);
                              setScheduleTime(s.time);
                              setSelectedPlatforms(s.platforms);
                              setEditedCaption(s.caption);
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold"
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-500 text-center italic">No posts scheduled yet</p>
                  )}
                </div>

                <div className="pt-4 mt-auto flex gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${mainImg.postCaption}\n\n${mainImg.postHashtags?.map(t => '#' + t.replace('#', '')).join(' ')}`);
                    }}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium text-xs text-center transition-colors"
                  >
                    Copy Text
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (item.isGroup) {
                        const updated = item.images.map(img => ({ ...img, isPostReady: false, postCaption: undefined, postHashtags: undefined, groupId: undefined }));
                        saveImages(updated);
                      } else {
                        await saveImage({ ...mainImg, isPostReady: false, postCaption: undefined, postHashtags: undefined });
                      }
                    }}
                    className="px-3 py-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                    title="Remove from Post Ready"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );})}
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-x-auto hide-scrollbar">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/50">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div key={day} className="p-3 text-center border-r border-zinc-800 last:border-0">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{day}</span>
                  <div className="text-lg font-bold text-white mt-1">{weekDates[i].getDate()}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 min-h-[500px]">
              {weekDates.map((date, i) => {
                const dateStr = date.toISOString().split('T')[0];
                const daySchedules = settings.scheduledPosts?.filter(s => s.date === dateStr) || [];
                
                return (
                  <div key={dateStr} className="border-r border-zinc-800 last:border-0 p-2 space-y-2">
                    {daySchedules.sort((a, b) => a.time.localeCompare(b.time)).map(sched => {
                      const imgId = sched.imageIds?.[0] || sched.imageId;
                      const img = postReadyImages.find(img => img.id === imgId);
                      if (!img) return null;
                      
                      return (
                        <div key={sched.id} className="bg-zinc-950 rounded-xl border border-zinc-800 p-2 hover:border-indigo-500/50 transition-colors group cursor-pointer" onClick={() => {
                          setEditingScheduleId(sched.id);
                          setSelectedImageForSchedule(img);
                          setScheduleDate(sched.date);
                          setScheduleTime(sched.time);
                          setSelectedPlatforms(sched.platforms);
                          setEditedCaption(sched.caption);
                        }}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded bg-zinc-800 overflow-hidden relative shrink-0">
                              {img.isVideo ? (
                                <video src={img.url} className="w-full h-full object-cover" />
                              ) : (
                                <Image src={img.url || `data:image/jpeg;base64,${img.base64}`} alt="" fill className="object-cover" />
                              )}
                              {sched.imageIds && sched.imageIds.length > 1 && (
                                <div className="absolute bottom-0 right-0 bg-indigo-600 text-white text-[6px] font-bold px-0.5 rounded-tl">
                                  {sched.imageIds.length}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] font-bold text-indigo-400">{sched.time}</div>
                                {sched.status === 'posted' && <span className="text-[8px] bg-green-500/20 text-green-400 px-1 rounded uppercase font-bold">Posted</span>}
                                {sched.status === 'failed' && <span className="text-[8px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold">Failed</span>}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate">{img.postCaption}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sched.platforms.map(p => (
                              <span key={p} className="text-[8px] bg-zinc-800 text-zinc-300 px-1 rounded capitalize">{p}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {daySchedules.length === 0 && (
                      <div 
                        className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => {
                          setEditingScheduleId(null);
                          setIsSelectingPostForDate(dateStr);
                        }}
                      >
                        <span className="text-xs text-zinc-600 font-medium">+ Add Post</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Scheduling Modal */}
      <AnimatePresence>
        {selectedImageForSchedule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  Schedule Post
                </h3>
                <button
                  onClick={() => setSelectedImageForSchedule(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6">
                {/* Left Col: Image Preview */}
                <div className="w-full md:w-1/3 space-y-4">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
                    {selectedImageForSchedule.isVideo ? (
                      <video src={selectedImageForSchedule.url} autoPlay loop muted className="w-full h-full object-cover" />
                    ) : (
                      <Image src={selectedImageForSchedule.url || `data:image/jpeg;base64,${selectedImageForSchedule.base64}`} alt="" fill className="object-cover" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Platforms</label>
                    <div className="flex flex-wrap gap-2">
                      {['instagram', 'twitter', 'discord'].map(platform => (
                        <button
                          key={platform}
                          onClick={() => {
                            setSelectedPlatforms(prev => 
                              prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
                            )
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                            selectedPlatforms.includes(platform) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Col: Details */}
                <div className="w-full md:w-2/3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Date</label>
                      <input 
                        type="date" 
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Time</label>
                      <input 
                        type="time" 
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleRecommendTime}
                      disabled={isRecommending || selectedPlatforms.length === 0}
                      className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isRecommending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isRecommending ? 'Analyzing...' : 'Recommend Best Time'}
                    </button>
                    {recommendationReason && (
                      <p className="text-[10px] text-zinc-400 italic bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                        <span className="text-indigo-400 font-bold">AI Suggestion:</span> {recommendationReason}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 flex-1 flex flex-col">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Caption & Hashtags</label>
                    <textarea 
                      value={editedCaption}
                      onChange={(e) => setEditedCaption(e.target.value)}
                      className="w-full flex-1 min-h-[150px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                <div>
                  {editingScheduleId && (
                    <button
                      onClick={handleDeleteSchedule}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      Delete Schedule
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedImageForSchedule(null);
                      setEditingScheduleId(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSchedule(true)}
                    disabled={isPosting || selectedPlatforms.length === 0}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Post Now
                  </button>
                  <button
                    onClick={() => handleSchedule(false)}
                    disabled={isPosting || selectedPlatforms.length === 0 || !scheduleDate || !scheduleTime}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    {editingScheduleId ? 'Update Schedule' : 'Schedule Post'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isSelectingPostForDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                <h3 className="text-lg font-bold text-white">
                  Select Post for {isSelectingPostForDate}
                </h3>
                <button
                  onClick={() => setIsSelectingPostForDate(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {postReadyImages.length === 0 ? (
                  <div className="text-center text-zinc-500 py-12">No posts available to schedule.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {postReadyImages.map(img => (
                      <div 
                        key={img.id} 
                        className="bg-zinc-800 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all group"
                        onClick={() => {
                          setEditingScheduleId(null);
                          setIsSelectingPostForDate(null);
                          setSelectedImageForSchedule(img);
                          setScheduleDate(isSelectingPostForDate);
                          setEditedCaption(`${img.postCaption}\n\n${img.postHashtags?.map(t => '#' + t.replace('#', '')).join(' ')}`);
                        }}
                      >
                        <div className="relative aspect-square">
                          {img.isVideo ? (
                            <video src={img.url} className="w-full h-full object-cover" />
                          ) : (
                            <Image src={img.url || `data:image/jpeg;base64,${img.base64}`} alt="" fill className="object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white font-bold text-sm">Select</span>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="text-xs text-zinc-300 truncate">{img.postCaption}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
