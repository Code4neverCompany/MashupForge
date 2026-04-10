import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { idea, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this image generation idea: "${idea}".
        Generate a concise negative prompt (comma-separated list of things to avoid) to ensure high quality, avoiding common AI artifacts, blurry textures, or elements that would clash with this specific theme.
        Return ONLY the negative prompt string.`,
    });

    return NextResponse.json({ negativePrompt: response.text || '' });
  } catch (error: any) {
    console.error('Gemini negative prompt error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
