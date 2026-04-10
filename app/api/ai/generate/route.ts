import { NextResponse } from 'next/server';
import { callAI, parseJSONResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, contents, config } = await req.json();
    
    const systemPrompt = typeof config?.systemInstruction === 'string' 
      ? config.systemInstruction 
      : undefined;
    
    const userPrompt = typeof prompt === 'string' 
      ? prompt 
      : typeof contents === 'string' 
        ? contents 
        : JSON.stringify(contents);

    const text = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
    });

    return NextResponse.json({ text, candidates: [] });
  } catch (error: any) {
    return errorResponse(error);
  }
}