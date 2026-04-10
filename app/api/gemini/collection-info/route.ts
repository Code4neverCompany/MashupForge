import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { context, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these image details that belong to a new collection:
        ${context}

        Generate a fitting, catchy name (max 5 words) and a brief, engaging description (max 20 words) for this collection.
        Incorporate the model or artist style if relevant to make it specific and informative.
        Return ONLY a JSON object with "name" and "description" keys.`,
      config: { responseMimeType: 'application/json' },
    });

    const data = JSON.parse(response.text || '{}');
    return NextResponse.json({
      name: data.name || 'New Collection',
      description: data.description || 'A collection of amazing mashups.',
    });
  } catch (error: any) {
    console.error('Gemini collection info error:', error);
    return NextResponse.json({
      name: 'New Collection',
      description: 'A collection of amazing mashups.',
    });
  }
}
