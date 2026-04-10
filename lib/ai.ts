/**
 * Shared AI client for the Mashup Studio.
 * Uses the configured AI provider (ZAI GLM-5.1 by default, Gemini as fallback).
 * 
 * Env vars:
 * - ZAI_API_KEY: Required for GLM-5.1 (default)
 * - ZAI_BASE_URL: Optional, defaults to https://api.z.ai/api/coding/paas/v4
 * - AI_MODEL: Optional, defaults to glm-5.1
 * - GEMINI_API_KEY: Optional fallback
 */

import { NextResponse } from 'next/server';

const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';
const AI_MODEL = process.env.AI_MODEL || 'glm-5.1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallAIOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Call the AI provider with a simple prompt.
 * Returns the text content of the response.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error('ZAI_API_KEY not configured in .env.local');
  }

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.userPrompt });

  // Default to 1000 tokens when the caller doesn't specify — 2000 was too
  // generous and gave GLM-5.1's reasoning phase room to blow past the 25s
  // route timeout on simple content generation. Routes that need more should
  // pass maxTokens explicitly.
  const body: any = {
    model: AI_MODEL,
    messages,
    max_tokens: options.maxTokens ?? 1000,
    temperature: options.temperature ?? 0.3,
  };

  const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  let content = message?.content || '';
  const reasoning = message?.reasoning_content || '';
  
  // GLM-5.1 is a reasoning model: it reasons first, then produces final content.
  // If content is empty, the reasoning phase consumed all tokens — retry with
  // more. Only double when the caller explicitly requested a budget; otherwise
  // bump the default to a modest 1500 so we don't blow past the route timeout.
  if (!content && reasoning) {
    body.max_tokens = options.maxTokens ? options.maxTokens * 2 : 1500;
    const retryRes = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (retryRes.ok) {
      const retryData = await retryRes.json();
      content = retryData.choices?.[0]?.message?.content || '';
    }
  }

  if (!content) {
    throw new Error('AI returned empty content after retry.');
  }

  return content;
}

/**
 * Streaming variant of callAI. Sends stream:true to ZAI, parses the
 * OpenAI-compatible SSE response, and returns a ReadableStream of raw
 * content-delta strings. Route handlers wrap this in their own SSE encoding
 * (data: {text:"..."}\n\n) so the browser can render tokens as they arrive.
 *
 * Does NOT implement the "reasoning consumed all tokens" retry from callAI —
 * once we've started emitting the stream, we can't re-request. Callers should
 * pick reasonable maxTokens budgets (the per-route defaults already do this).
 */
export function callAIStream(options: CallAIOptions): ReadableStream<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error('ZAI_API_KEY not configured in .env.local');
  }

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.userPrompt });

  const body = {
    model: AI_MODEL,
    messages,
    max_tokens: options.maxTokens ?? 1000,
    temperature: options.temperature ?? 0.3,
    stream: true,
  };

  return new ReadableStream<string>({
    async start(controller) {
      let upstream: Response;
      try {
        upstream = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (err) {
        controller.error(err);
        return;
      }

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        controller.error(new Error(`AI API error (${upstream.status}): ${errText}`));
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split on SSE record separator. Keep the trailing partial line in
          // the buffer so we don't drop half a JSON payload on chunk
          // boundaries.
          let sepIndex: number;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            for (const line of rawEvent.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              if (data === '[DONE]') {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  controller.enqueue(delta);
                }
              } catch (_) {
                // Ignore malformed lines — some providers emit keepalive
                // comments or partial JSON during warm-up.
              }
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Wrap a ReadableStream<string> (content deltas from callAIStream) as an
 * SSE-encoded ReadableStream<Uint8Array> suitable for returning from a
 * Next.js route handler. Emits `data: {"text":"<delta>"}\n\n` per token and
 * a final `data: [DONE]\n\n` sentinel. Errors are surfaced as
 * `data: {"error":"..."}\n\n` before [DONE] so clients don't hang.
 */
export function toSSEResponse(textStream: ReadableStream<string>): Response {
  const encoder = new TextEncoder();
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = textStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`));
        }
      } catch (err: any) {
        const msg = err?.message || 'stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Parse JSON from AI response, handling markdown code blocks.
 */
export function parseJSONResponse(text: string): any {
  // Strip markdown code blocks if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Standard error response helper
 */
export function errorResponse(error: any) {
  console.error('AI API error:', error);
  return NextResponse.json(
    { error: error.message || 'Internal Server Error' },
    { status: 500 }
  );
}
