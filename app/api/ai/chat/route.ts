import { callAIStream, toSSEResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, systemPrompt } = await req.json();

    // mode:'chat' → Hermes bridge routes to Ollama fast-path (~3s).
    const textStream = callAIStream({
      systemPrompt,
      userPrompt: prompt,
      maxTokens: 500,
      mode: 'chat',
    });

    return toSSEResponse(textStream);
  } catch (error: any) {
    return errorResponse(error);
  }
}
