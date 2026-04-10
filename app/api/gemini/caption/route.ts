import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, channelName, apiKey: clientKey } = await req.json();
    const apiKey = clientKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a Social Media Manager for the channel "${channelName || 'MultiverseMashupAI'}".
      Generate a high-engagement Instagram caption for this image prompt: "${prompt}".
      The caption should be professional yet edgy, fitting the "Master Content Creator" persona.
      Include fitting emojis.
      Include a set of relevant hashtags, and MUST include #${channelName || 'MultiverseMashupAI'}.
      Format the output as a JSON object with "caption" (string) and "hashtags" (array of strings) properties.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caption: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });

    const data = JSON.parse(response.text || '{}');
    return NextResponse.json({ caption: data.caption, hashtags: data.hashtags });
  } catch (error: any) {
    console.error('Gemini caption error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
