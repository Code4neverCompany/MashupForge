import { callAIStream, toSSEResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, systemPrompt, provider, model } = await req.json();

    const textStream = callAIStream({
      systemPrompt,
      userPrompt: prompt,
      maxTokens: 500,
      mode: 'chat',
      provider,
      model,
    });

    return toSSEResponse(textStream);
  } catch (error: any) {
    return errorResponse(error);
  }
}
