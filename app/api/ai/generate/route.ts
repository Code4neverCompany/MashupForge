import { callAIStream, toSSEResponse, errorResponse, type AIMode } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt, contents, config, mode, provider, model } = await req.json();

    const systemPrompt = typeof config?.systemInstruction === 'string'
      ? config.systemInstruction
      : undefined;

    const userPrompt = typeof prompt === 'string'
      ? prompt
      : typeof contents === 'string'
        ? contents
        : JSON.stringify(contents);

    const resolvedMode: AIMode =
      mode === 'chat' || mode === 'enhance' || mode === 'idea' || mode === 'generate'
        ? mode
        : 'generate';

    const textStream = callAIStream({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      mode: resolvedMode,
      provider,
      model,
    });

    return toSSEResponse(textStream);
  } catch (error: any) {
    return errorResponse(error);
  }
}
