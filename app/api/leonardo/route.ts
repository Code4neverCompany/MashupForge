import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const bodyData = await req.json();
    const { prompt, negative_prompt, modelId, width, height, seed, leonardoStyle, guidance_scale, apiKey: customApiKey } = bodyData;
    const apiKey = customApiKey || process.env.LEONARDO_API_KEY;

    if (!apiKey || apiKey === 'MY_LEONARDO_API_KEY') {
      return NextResponse.json({ error: 'Leonardo API key not configured. Please add a valid LEONARDO_API_KEY to your environment variables or settings.' }, { status: 500 });
    }

    // Style ID mapping for V2 models
    const STYLE_MAP: Record<string, string> = {
      'DYNAMIC': '111dc692-d470-4eec-b791-3475abac4c46',
      'CINEMATIC': '21605d8b-54a0-4965-985e-1393603c4671',
      'RAYTRACED': '658458a0-5833-4770-993b-9147070c4c46',
      'SKETCH_BW': '50005d8b-54a0-4965-985e-1393603c4671',
      'ANIME': '71605d8b-54a0-4965-985e-1393603c4671',
      'CREATIVE': '61605d8b-54a0-4965-985e-1393603c4671',
      'VIBRANT': '41605d8b-54a0-4965-985e-1393603c4671',
      'PORTRAIT': '31605d8b-54a0-4965-985e-1393603c4671',
      'PHOTOREALISTIC': 'e316348f-7773-490e-adcd-46757c738eb7', // This is a model ID but often used as a style hint in some contexts, for V2 we'll use a neutral or cinematic one if not sure
    };

    // 1. Create generation
    const V2_MODEL_IDS = ['gemini-image-2', 'nano-banana-2', 'phoenix', 'gpt-image-1.5'];
    const isV2Model = V2_MODEL_IDS.includes(modelId);
    const actualModelId = isV2Model ? 'phoenix' : (modelId || 'b24e16ff-06e3-43eb-8d33-4416c2d75876');

    const endpoint = isV2Model 
      ? 'https://cloud.leonardo.ai/api/rest/v2/generations' 
      : 'https://cloud.leonardo.ai/api/rest/v1/generations';

    let body;
    if (isV2Model) {
      const parameters: any = {
        prompt: String(prompt),
        width: Number(width) || 1024,
        height: Number(height) || 1024,
        quantity: 1,
        prompt_enhance: "OFF",
      };

      if (seed !== undefined && seed !== null && !isNaN(Number(seed))) {
        parameters.seed = Number(seed);
      }

      if (guidance_scale !== undefined && guidance_scale !== null && !isNaN(Number(guidance_scale))) {
        parameters.guidance_scale = Number(guidance_scale);
      }

      if (modelId === 'gpt-image-1.5') {
        parameters.quality = "MEDIUM";
        // GPT Image-1.5 supports mode: FAST, QUALITY, ULTRA
        parameters.mode = "QUALITY";
      } 
      
      // Handle Styles
      if (leonardoStyle && STYLE_MAP[leonardoStyle]) {
        parameters.style_ids = [STYLE_MAP[leonardoStyle]];
      } else {
        // Default style for all V2 models if none specified
        parameters.style_ids = ["111dc692-d470-4eec-b791-3475abac4c46"]; // Dynamic style
      }

      body = JSON.stringify({
        modelId: actualModelId,
        parameters,
        public: false
      });
    } else {
      body = JSON.stringify({
        prompt: String(prompt),
        negative_prompt: negative_prompt || '',
        modelId: actualModelId,
        width: Number(width) || 1024,
        height: Number(height) || 1024,
        num_images: 1,
        guidance_scale: guidance_scale ? Number(guidance_scale) : undefined,
      });
    }

    const createRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body
    });

    if (!createRes.ok && createRes.status !== 200) {
      const err = await createRes.text();
      console.error('Leonardo create error:', err);
      try {
        const parsedErr = JSON.parse(err);
        if (parsedErr.error) {
          return NextResponse.json({ error: `Leonardo API Error: ${parsedErr.error}` }, { status: 500 });
        }
      } catch (e) {
        // Ignore parse error
      }
      return NextResponse.json({ error: 'Failed to start Leonardo generation' }, { status: 500 });
    }

    const createData = await createRes.json();
    
    // Handle GraphQL style errors which sometimes come back with 200 OK or 400
    const graphqlErrors = Array.isArray(createData) ? createData : (createData.errors || []);
    if (graphqlErrors.length > 0 && graphqlErrors[0].extensions) {
      console.error('Leonardo GraphQL error:', JSON.stringify(createData));
      const firstError = graphqlErrors[0];
      const details = firstError.extensions?.details;
      let errorMessage = firstError.message || 'Validation failed';
      
      if (details?.errors && Array.isArray(details.errors) && details.errors.length > 0) {
        errorMessage = details.errors[0].message || errorMessage;
      } else if (details?.message) {
        errorMessage = details.message;
      }

      return NextResponse.json({ error: `Leonardo API Error: ${errorMessage}` }, { status: 400 });
    }

    const generationId = createData.sdGenerationJob?.generationId || createData.generationId || createData.id || createData.generation?.id || createData.generate?.generationId;

    if (!generationId) {
      console.error('Leonardo unexpected response:', createData);
      return NextResponse.json({ error: `No generation ID returned from Leonardo. Response: ${JSON.stringify(createData)}` }, { status: 500 });
    }

    return NextResponse.json({ generationId });

  } catch (error: any) {
    console.error('Leonardo API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
