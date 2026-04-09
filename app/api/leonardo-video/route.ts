import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, imageId, duration, model, apiKey: customApiKey } = await req.json();
    const apiKey = customApiKey || process.env.LEONARDO_API_KEY;

    if (!apiKey || apiKey === 'MY_LEONARDO_API_KEY') {
      return NextResponse.json({ error: 'Leonardo API key not configured. Please add a valid LEONARDO_API_KEY to your environment variables or settings.' }, { status: 500 });
    }

    const isKling = model === 'kling-3.0' || model === 'kling-video-o-3';
    const endpoint = isKling 
      ? 'https://cloud.leonardo.ai/api/rest/v2/generations' 
      : 'https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd';

    let body: any;
    if (isKling) {
      body = {
        model: model === 'kling-video-o-3' ? 'kling-video-o-3' : "kling-3.0",
        public: false,
        parameters: {
          prompt: String(prompt || 'Animate this image'),
          duration: Number(duration) || 3,
          mode: "RESOLUTION_1080",
          motion_has_audio: true,
        }
      };

      if (imageId) {
        body.parameters.guidances = {
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
        body.parameters.width = 1920;
        body.parameters.height = 1080;
      }
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

    const createData = await createRes.json();
    
    if (Array.isArray(createData) && createData.length > 0 && createData[0].extensions) {
      console.error('Leonardo GraphQL error:', JSON.stringify(createData));
      return NextResponse.json({ error: `Leonardo API Error: ${createData[0].message || 'Validation failed'}` }, { status: 400 });
    }

    let generationId = createData.generationId || createData.id || createData.generation?.id || createData.generate?.generationId;
    
    if (!generationId) {
      for (const key in createData) {
        if (createData[key] && typeof createData[key] === 'object') {
          if (createData[key].generationId) {
            generationId = createData[key].generationId;
            break;
          } else if (createData[key].id) {
            generationId = createData[key].id;
            break;
          }
        }
      }
    }

    if (!generationId) {
      return NextResponse.json({ error: `No generation ID returned from Leonardo. Response: ${JSON.stringify(createData)}` }, { status: 500 });
    }

    return NextResponse.json({ generationId });

  } catch (error: any) {
    console.error('Leonardo Video API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
