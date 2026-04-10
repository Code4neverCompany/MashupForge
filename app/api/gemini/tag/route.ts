import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this image prompt: "${prompt}".
        Generate a set of 5-8 fitting tags for a gallery.
        Include:
        - Universe/Franchise (e.g., "Warhammer 40k" - NEVER use "Warhammer 40,000", "Star Wars", "Marvel")
        - Character names
        - Style (e.g., "Cinematic", "Cyberpunk", "Grimdark")
        - Themes (e.g., "Battle", "Portrait", "Landscape")
        Return ONLY a JSON array of strings.`,
      config: { responseMimeType: 'application/json' },
    });

    let tags = JSON.parse(response.text || '[]');
    if (Array.isArray(tags)) {
      tags = tags.map((t: string) => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t);
    }

    return NextResponse.json({ tags });
  } catch (error: any) {
    console.error('Gemini tag error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
