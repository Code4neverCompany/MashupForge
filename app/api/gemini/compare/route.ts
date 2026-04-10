import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, models, config } = await req.json();
    
    // For comparison, we generate multiple responses with the same prompt
    // Since we use one model, we generate variations instead
    const results = [];

    for (let i = 0; i < (models?.length || 2); i++) {
      const variation = await callAI({
        systemPrompt: config?.systemInstruction,
        userPrompt: `Create a detailed image generation prompt based on this concept: "${prompt}".
Variation ${i + 1}. Be creative and unique. Describe scene, style, lighting, composition.`,
        maxTokens: 4000,
        temperature: 0.5 + (i * 0.2), // Increase creativity for each variation
      });
      results.push({ text: variation, model: models?.[i] || `variation-${i + 1}` });
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return errorResponse(error);
  }
}