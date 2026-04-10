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

  const body: any = {
    model: AI_MODEL,
    messages,
    max_tokens: options.maxTokens || 2000,
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
  // If content is empty, the reasoning phase consumed all tokens — retry with more.
  if (!content && reasoning) {
    // Try once more with doubled max_tokens
    body.max_tokens = (options.maxTokens || 1000) * 2;
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
