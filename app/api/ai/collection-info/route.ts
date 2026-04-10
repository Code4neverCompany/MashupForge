import { NextResponse } from 'next/server';
import { callAI, parseJSONResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { context } = await req.json();

    const text = await callAI({
      userPrompt: `Based on these sample images/prompt: "${context}"
Generate a creative collection name (short, catchy) and a brief description (1-2 sentences).
Return a JSON object with "name" and "description" keys.`,
      maxTokens: 4000,
    });

    const data = parseJSONResponse(text);
    return NextResponse.json({
      name: data.name || 'New Collection',
      description: data.description || 'A collection of amazing mashups.',
    });
  } catch (error: any) {
    return errorResponse(error);
  }
}