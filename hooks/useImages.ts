'use client';

import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { type GeneratedImage } from '../types/mashup';

export function useImages() {
  const [savedImages, setSavedImages] = useState<GeneratedImage[]>([]);
  const [isImagesLoaded, setIsImagesLoaded] = useState(false);

  useEffect(() => {
    const loadImages = async () => {
      try {
        // Migrate from localStorage if needed
        const storedImages = localStorage.getItem('mashup_saved_images');
        if (storedImages) {
          try {
            const images = JSON.parse(storedImages).map((img: GeneratedImage) => ({
              ...img,
              tags: img.tags?.map(t => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t)
            }));
            await set('mashup_saved_images', images);
            localStorage.removeItem('mashup_saved_images');
            setSavedImages(images);
          } catch {
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
      } catch {
        // silent — savedImages remains empty, isImagesLoaded still fires
      } finally {
        setIsImagesLoaded(true);
      }
    };
    loadImages();
  }, []);

  const saveImage = (img: GeneratedImage) => {
    setSavedImages(prev => {
      const exists = prev.some(i => i.id === img.id);
      let next;
      if (exists) {
        next = prev.map(i => i.id === img.id ? { ...i, ...img } : i);
      } else {
        next = [{ ...img, savedAt: Date.now() }, ...prev];
      }
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  const deleteImage = (id: string, fromSaved: boolean) => {
    if (fromSaved) {
      setSavedImages(prev => {
        const next = prev.filter(i => i.id !== id);
        set('mashup_saved_images', next).catch(() => {});
        return next;
      });
    }
    // Returns whether to also delete from working images
    return !fromSaved;
  };

  const updateImageTags = (id: string, tags: string[]) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === id ? { ...img, tags } : img);
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  const bulkUpdateImageTags = (ids: string[], tags: string[], mode: 'append' | 'replace') => {
    setSavedImages(prev => {
      const next = prev.map(img => {
        if (ids.includes(img.id)) {
          let newTags = tags;
          if (mode === 'append') {
            const existingTags = img.tags || [];
            newTags = Array.from(new Set([...existingTags, ...tags]));
          }
          return { ...img, tags: newTags };
        }
        return img;
      });
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  const toggleApproveImage = (id: string) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === id ? { ...img, approved: !img.approved } : img);
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  const setImageStatus = (id: string, status: 'generating' | 'animating' | 'ready') => {
    setSavedImages(prev => prev.map(img => img.id === id ? { ...img, status } : img));
  };

  const updateSavedImageCollectionId = (imageId: string, collectionId: string | undefined) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.id === imageId ? { ...img, collectionId } : img);
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  const clearCollectionFromImages = (collectionId: string) => {
    setSavedImages(prev => {
      const next = prev.map(img => img.collectionId === collectionId ? { ...img, collectionId: undefined } : img);
      set('mashup_saved_images', next).catch(() => {});
      return next;
    });
  };

  return {
    savedImages,
    saveImage,
    deleteImage,
    updateImageTags,
    bulkUpdateImageTags,
    toggleApproveImage,
    setImageStatus,
    updateSavedImageCollectionId,
    clearCollectionFromImages,
    isImagesLoaded,
  };
}
