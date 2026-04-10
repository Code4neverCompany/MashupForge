import { NextResponse } from 'next/server';
import { callAI, errorResponse } from '@/lib/ai';

const ZAI_TIMEOUT_MS = 25_000;

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

    // The sidebar content generator's actual output is typically a few
    // hundred tokens; 800 is plenty and keeps us safely under the 25s ZAI
    // timeout even when GLM-5.1's reasoning phase is chatty.
    const maxTokens = 800;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ZAI_TIMEOUT_MS);

    try {
      const text = await callAI({
        systemPrompt,
        userPrompt,
        maxTokens,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return NextResponse.json({ text, candidates: [] });
    } catch (innerError: any) {
      clearTimeout(timeoutId);
      const aborted =
        innerError?.name === 'AbortError' ||
        innerError?.cause?.name === 'AbortError' ||
        controller.signal.aborted;
      if (aborted) {
        console.warn(`[ai/generate] ZAI call exceeded ${ZAI_TIMEOUT_MS}ms — returning fallback`);
        return NextResponse.json({
          text: 'The AI model is taking longer than expected. Please try again with a shorter prompt or fewer items.',
          candidates: [],
          fallback: true,
        });
      }
      throw innerError;
    }
  } catch (error: any) {
    return errorResponse(error);
  }
}
