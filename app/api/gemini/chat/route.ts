import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { message, history, systemInstruction } = await req.json();

    // Build conversation from history
    const conversation = (history || []).map((m: any) => m).join('\n');
    const fullPrompt = conversation 
      ? `${conversation}\nUser: ${message}\nAssistant:`
      : message;

    const text = await callAI({
      systemPrompt: systemInstruction,
      userPrompt: fullPrompt,
      maxTokens: 4000,
    });

    return NextResponse.json({ text });
  } catch (error: any) {
    return errorResponse(error);
  }
}