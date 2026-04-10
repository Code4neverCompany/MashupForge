import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, systemPrompt } = await req.json();

    const text = await callAI({
      systemPrompt,
      userPrompt: prompt,
      maxTokens: 4000,
    });

    return NextResponse.json({ text });
  } catch (error: any) {
    return errorResponse(error);
  }
}
