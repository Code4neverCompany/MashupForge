import { callAIStream, toSSEResponse, errorResponse } from '@/lib/ai';

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

    const textStream = callAIStream({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
    });

    return toSSEResponse(textStream);
  } catch (error: any) {
    return errorResponse(error);
  }
}
