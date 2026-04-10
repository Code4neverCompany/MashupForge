import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, models, config, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const results = [];

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts: [{ text: prompt }] },
          config: config || {},
        });

        let base64 = '';
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64 = part.inlineData.data || '';
            break;
          }
        }

        results.push({ model, base64, error: base64 ? null : 'No image data' });
      } catch (error: any) {
        results.push({ model, base64: '', error: error.message || 'Generation failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Gemini compare error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
