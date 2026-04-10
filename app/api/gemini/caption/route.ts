import { NextResponse } from 'next/server';
import { callAI, parseJSONResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, channelName } = await req.json();

    const text = await callAI({
      userPrompt: `You are a Social Media Manager for the channel "${channelName || 'MultiverseMashupAI'}".
Generate a high-engagement Instagram caption for this image prompt: "${prompt}".
The caption should be professional yet edgy, fitting the "Master Content Creator" persona.
Include fitting emojis.
Include a set of relevant hashtags, and MUST include #${channelName || 'MultiverseMashupAI'}.
Return a JSON object with exactly two keys: "caption" (string) and "hashtags" (array of strings).`,
      maxTokens: 4000,
      expectJSON: true,
    });

    const data = parseJSONResponse(text);
    return NextResponse.json({ 
      caption: data.caption || '', 
      hashtags: data.hashtags || [] 
    });
  } catch (error: any) {
    return errorResponse(error);
  }
}