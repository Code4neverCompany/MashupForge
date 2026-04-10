'use client';

import { GoogleGenAI, Type } from '@google/genai';
import { type GeneratedImage, type UserSettings } from '../types/mashup';

interface UseSocialDeps {
  settings: UserSettings;
  saveImage: (img: GeneratedImage) => void;
  setImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
}

export function useSocial({ settings, saveImage, setImages }: UseSocialDeps) {
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

  return { generatePostContent };
}
