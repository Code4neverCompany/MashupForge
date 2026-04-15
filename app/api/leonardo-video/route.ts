import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const { prompt, imageId, duration, model, apiKey: customApiKey } = await req.json();
    const apiKey = customApiKey || process.env.LEONARDO_API_KEY;

    if (!apiKey || apiKey === 'MY_LEONARDO_API_KEY') {
      return NextResponse.json({ error: 'Leonardo API key is missing. Open Settings (gear icon, top-right) → paste your key from https://app.leonardo.ai/api-access → Save.' }, { status: 400 });
    }

    const isKling = model === 'kling-3.0' || model === 'kling-video-o-3';
    const endpoint = isKling 
      ? 'https://cloud.leonardo.ai/api/rest/v2/generations' 
      : 'https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd';

    let body: Record<string, unknown>;
    if (isKling) {
      const parameters: Record<string, unknown> = {
        prompt: String(prompt || 'Animate this image'),
        duration: Number(duration) || 3,
        mode: "RESOLUTION_1080",
        motion_has_audio: true,
      };

      if (imageId) {
        parameters.guidances = {
          start_frame: [
            {
              image: {
                id: imageId,
                type: "GENERATED"
              }
            }
          ]
        };
      } else {
        parameters.width = 1920;
        parameters.height = 1080;
      }

      body = {
        model: model === 'kling-video-o-3' ? 'kling-video-o-3' : "kling-3.0",
        public: false,
        parameters,
      };
    } else {
      body = {
        imageId: imageId,
        motionStrength: 5,
        isPublic: false
      };
    }

    const createRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Leonardo video create error:', err);
      return NextResponse.json({ error: `Failed to start Leonardo video generation: ${err}` }, { status: 500 });
    }

    const createData = await createRes.json() as Record<string, unknown>;

    if (Array.isArray(createData)) {
      const errs = createData as Array<Record<string, unknown>>;
      if (errs.length > 0 && errs[0].extensions) {
        console.error('Leonardo GraphQL error:', JSON.stringify(errs));
        return NextResponse.json({ error: `Leonardo API Error: ${String(errs[0].message ?? 'Validation failed')}` }, { status: 400 });
      }
    }

    const gen = createData.generation as Record<string, unknown> | undefined;
    const generate = createData.generate as Record<string, unknown> | undefined;
    let generationId = createData.generationId || createData.id || gen?.id || generate?.generationId;

    if (!generationId) {
      for (const key in createData) {
        const val = createData[key];
        if (val && typeof val === 'object') {
          const obj = val as Record<string, unknown>;
          if (obj.generationId) {
            generationId = obj.generationId;
            break;
          } else if (obj.id) {
            generationId = obj.id;
            break;
          }
        }
      }
    }

    if (!generationId) {
      return NextResponse.json({ error: `No generation ID returned from Leonardo. Response: ${JSON.stringify(createData)}` }, { status: 500 });
    }

    return NextResponse.json({ generationId });

  } catch (e: unknown) {
    console.error('Leonardo Video API error:', e);
    return NextResponse.json({ error: getErrorMessage(e) || 'Internal Server Error' }, { status: 500 });
  }
}
