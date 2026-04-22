'use client';

import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { type Collection, type GeneratedImage, type UserSettings } from '../types/mashup';
import { streamAIToString } from '@/lib/aiClient';

export function useCollections(settings: UserSettings) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCollectionsLoaded, setIsCollectionsLoaded] = useState(false);

  useEffect(() => {
    const loadCollections = async () => {
      try {
        const storedCollections = localStorage.getItem('mashup_collections');
        if (storedCollections) {
          const parsed = JSON.parse(storedCollections);
          await set('mashup_collections', parsed);
          localStorage.removeItem('mashup_collections');
          setCollections(parsed);
        } else {
          const idbCollections = await get('mashup_collections');
          if (idbCollections) setCollections(idbCollections);
        }
      } catch {
        // silent — collections remain empty, loaded flag still set
      } finally {
        setIsCollectionsLoaded(true);
      }
    };
    loadCollections();
  }, []);

  const autoGenerateCollectionInfo = async (
    sampleImages: GeneratedImage[] | string[],
  ): Promise<{ name: string; description: string } | null> => {
    try {
      let context = '';
      if (sampleImages.length > 0 && typeof sampleImages[0] === 'string') {
        context = (sampleImages as string[]).map((p, i) => `${i+1}. ${p}`).join('\n');
      } else {
        context = (sampleImages as GeneratedImage[]).map((img, i) => {
          const tags = img.postHashtags?.length ? ` | Tags: ${img.postHashtags.join(', ')}` : '';
          return `${i+1}. Prompt: ${img.prompt}, Model: ${img.modelInfo?.modelName || 'Unknown'}, Provider: ${img.modelInfo?.provider || 'Unknown'}${tags}`;
        }).join('\n');
      }

      const text = await streamAIToString(
        `Based on these sample images/prompt: "${context}"
Generate a creative collection name (short, catchy) and a brief description (1-2 sentences).
Return a JSON object with "name" and "description" keys.`,
        {
          mode: 'collection-info',
          systemPrompt: settings.agentPrompt,
          niches: settings.agentNiches,
          genres: settings.agentGenres,
        }
      );
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(cleaned || '{}');
      if (!data.name && !data.description) return null;
      return {
        name: data.name || '',
        description: data.description || '',
      };
    } catch {
      // V080-DES-004 — return null so the Suggest button leaves fields
      // empty on failure (no silent default). createCollection fallback
      // still handles an empty name by assigning "Collection N".
      return null;
    }
  };

  const createCollection = async (
    name?: string,
    description?: string,
    imageIds?: string[],
    savedImages?: GeneratedImage[]
  ) => {
    let finalName = name;
    let finalDesc = description;

    if ((!finalName || !finalDesc) && imageIds && imageIds.length > 0 && savedImages) {
      const sampleImgs = savedImages
        .filter(img => imageIds.includes(img.id))
        .slice(0, 5);

      if (sampleImgs.length > 0) {
        const aiInfo = await autoGenerateCollectionInfo(sampleImgs);
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

  const deleteCollection = (id: string) => {
    setCollections(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('mashup_collections', JSON.stringify(next));
      return next;
    });
  };

  return {
    collections,
    createCollection,
    deleteCollection,
    autoGenerateCollectionInfo,
    isCollectionsLoaded,
  };
}
