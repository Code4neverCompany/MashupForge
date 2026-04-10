import { NextResponse } from 'next/server';

/**
 * Leonardo AI Image Generation API Route
 * 
 * Supports 3 API-documented models:
 * - Nano Banana 2 (nano-banana-2): 20 styles, 10 aspect ratios, max 8 images
 * - Nano Banana Pro (gemini-image-2): 20 styles, 3 aspect ratios, max 8 images  
 * - GPT Image-1.5 (gpt-image-1.5): no styles, quality param, 3 aspect ratios, max 4 images
 * 
 * All use v2 endpoint: https://cloud.leonardo.ai/api/rest/v2/generations
 * 
 * Client sends internal model id (e.g. 'nano-banana-pro').
 * Route maps to apiModelId (e.g. 'gemini-image-2') for Leonardo API.
 */

// Map internal id → Leonardo API model id
const MODEL_ID_MAP: Record<string, string> = {
  'nano-banana-2': 'nano-banana-2',
  'nano-banana-pro': 'gemini-image-2',
  'gpt-image-1.5': 'gpt-image-1.5',
};

export async function POST(req: Request) {
  try {
    const {
      prompt,
      modelId,
      width,
      height,
      apiKey: customApiKey,
      styleIds,     // UUID array for Nano Banana models
      quality,      // LOW | MEDIUM | HIGH for GPT Image-1.5
      quantity,
    } = await req.json();
    // Note: negative_prompt is intentionally not destructured. None of the v2
    // models supported by this route (nano-banana-2, gemini-image-2, gpt-image-1.5)
    // accept negative_prompt — sending it triggers a v2 VALIDATION_ERROR (400).

    const apiKey = customApiKey || process.env.LEONARDO_API_KEY;

    if (!apiKey || apiKey === 'MY_LEONARDO_API_KEY') {
      return NextResponse.json({
        error: 'Leonardo API key not configured.'
      }, { status: 500 });
    }

    // Map internal model id to Leonardo API model id
    const apiModelId = MODEL_ID_MAP[modelId] || modelId;

    // ── Build v2 request body ────────────────────────────────────────────
    const parameters: Record<string, any> = {
      prompt: String(prompt),
      width: Number(width) || 1024,
      height: Number(height) || 1024,
      quantity: Math.min(Number(quantity) || 1, 8),
      prompt_enhance: "OFF",
    };

    // Model-specific parameters
    if (modelId === 'gpt-image-1.5') {
      // GPT Image-1.5: uses quality instead of style_ids
      parameters.quality = quality || 'MEDIUM';
      parameters.quantity = Math.min(parameters.quantity, 4);
    } else {
      // Nano Banana 2 / Pro: uses style_ids (UUID array)
      if (Array.isArray(styleIds) && styleIds.length > 0) {
        parameters.style_ids = styleIds;
      }
    }

    const body = JSON.stringify({
      model: apiModelId,
      parameters,
      public: false,
    });

    // ── Call Leonardo v2 API ─────────────────────────────────────────────
    const createRes = await fetch('https://cloud.leonardo.ai/api/rest/v2/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body,
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Leonardo create error:', err);
      try {
        const parsedErr = JSON.parse(err);
        if (parsedErr.error) {
          return NextResponse.json({ 
            error: `Leonardo API Error: ${parsedErr.error}` 
          }, { status: createRes.status });
        }
      } catch (_) {}
      return NextResponse.json({ 
        error: `Leonardo API Error (${createRes.status}): ${err.slice(0, 200)}` 
      }, { status: createRes.status });
    }

    const createData = await createRes.json();

    // Check for GraphQL-style errors
    if (Array.isArray(createData) && createData.length > 0 && createData[0].extensions) {
      console.error('Leonardo GraphQL error:', JSON.stringify(createData));
      return NextResponse.json({ 
        error: `Leonardo API Error: ${createData[0].message || 'Validation failed'}` 
      }, { status: 400 });
    }

    const generationId = createData.sdGenerationJob?.generationId 
      || createData.generationId 
      || createData.id 
      || createData.generation?.id 
      || createData.generate?.generationId;

    if (!generationId) {
      console.error('Leonardo unexpected response:', createData);
      return NextResponse.json({ 
        error: `No generation ID returned. Response: ${JSON.stringify(createData).slice(0, 300)}` 
      }, { status: 500 });
    }

    return NextResponse.json({ generationId });

  } catch (error: any) {
    console.error('Leonardo API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal Server Error' 
    }, { status: 500 });
  }
}
