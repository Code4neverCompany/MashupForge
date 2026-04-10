import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, config } = await req.json();

    const text = await callAI({
      systemPrompt: config?.systemInstruction,
      userPrompt: `Create a detailed, cinematic image generation prompt based on this concept: "${prompt}".
Include: scene description, art style, lighting, camera angle, color palette, mood.
Make it vivid and specific for AI image generation.`,
      maxTokens: 4000,
    });

    return NextResponse.json({ text, prompt });
  } catch (error: any) {
    return errorResponse(error);
  }
}