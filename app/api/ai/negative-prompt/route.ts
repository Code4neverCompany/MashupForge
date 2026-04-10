import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { idea } = await req.json();

    const negativePrompt = await callAI({
      userPrompt: `Given this image generation idea: "${idea}"
Generate a concise negative prompt that would help avoid common issues in AI image generation.
Focus on: blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text overlay.
Keep it under 100 words. Return ONLY the negative prompt text, nothing else.`,
      maxTokens: 4000,
    });

    return NextResponse.json({ negativePrompt });
  } catch (error: any) {
    return errorResponse(error);
  }
}