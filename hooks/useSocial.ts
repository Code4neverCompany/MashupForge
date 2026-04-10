'use client';

import { type GeneratedImage, type UserSettings } from '../types/mashup';

interface UseSocialDeps {
  settings: UserSettings;
  saveImage: (img: GeneratedImage) => void;
  setImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
}

export function useSocial({ settings, saveImage, setImages }: UseSocialDeps) {
  const generatePostContent = async (image: GeneratedImage): Promise<GeneratedImage | undefined> => {
    if (!image.prompt) return;

    const res = await fetch('/api/ai/caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: image.prompt,
        channelName: settings.channelName || 'MultiverseMashupAI',
      }),
    });

    try {
      if (!res.ok) throw new Error('Failed to generate caption');
      const data = await res.json();
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

  return { generatePostContent };
}
