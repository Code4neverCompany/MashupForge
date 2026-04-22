'use client';

import { type GeneratedImage, type UserSettings } from '../types/mashup';
import { streamAIToString } from '@/lib/aiClient';

interface UseSocialDeps {
  settings: UserSettings;
  saveImage: (img: GeneratedImage) => void;
  setImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
}

export function useSocial({ settings, saveImage, setImages }: UseSocialDeps) {
  const generatePostContent = async (image: GeneratedImage): Promise<GeneratedImage | undefined> => {
    if (!image.prompt) return;

    const channel = settings.channelName || 'MultiverseMashupAI';
    try {
      const text = await streamAIToString(
        `You are a Social Media Manager for the channel "${channel}".
Generate a high-engagement Instagram caption for this image prompt: "${image.prompt}".
The caption should be professional yet edgy, fitting a "Master Content Creator" persona.
Include fitting emojis.
Include a set of relevant hashtags, and MUST include #${channel}.
Return ONLY a JSON object with exactly two keys: "caption" (string) and "hashtags" (array of strings).`,
        {
          mode: 'caption',
          systemPrompt: settings.agentPrompt,
          niches: settings.agentNiches,
          genres: settings.agentGenres,
        }
      );

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(cleaned || '{}');
      if (data.caption) {
        const updatedImg = {
          ...image,
          postCaption: data.caption,
          postHashtags: data.hashtags || [],
        };
        saveImage(updatedImg);
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? { ...img, postCaption: data.caption, postHashtags: data.hashtags || [] }
              : img
          )
        );
        return updatedImg;
      }
    } catch {
      // caller receives undefined; UI handles missing caption gracefully
    }
    return undefined;
  };

  return { generatePostContent };
}
