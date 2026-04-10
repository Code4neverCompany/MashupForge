import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { model, prompt, config, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Set GEMINI_API_KEY environment variable or provide a key in settings.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config,
    });

    let base64 = '';
    let mimeType = 'image/jpeg';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        base64 = part.inlineData.data || '';
        mimeType = part.inlineData.mimeType || 'image/jpeg';
        break;
      }
    }

    if (!base64) {
      return NextResponse.json(
        { error: 'No image data in response' },
        { status: 500 }
      );
    }

    return NextResponse.json({ base64, mimeType });
  } catch (error: any) {
    console.error('Gemini image generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
