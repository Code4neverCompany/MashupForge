import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const customApiKey = url.searchParams.get('apiKey');
    const apiKey = customApiKey || process.env.LEONARDO_API_KEY;

    if (!apiKey || apiKey === 'MY_LEONARDO_API_KEY') {
      return NextResponse.json({ error: 'Leonardo API key not configured.' }, { status: 500 });
    }

    const getRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!getRes.ok) {
      const err = await getRes.text();
      console.error('Leonardo status error:', err);
      return NextResponse.json({ error: 'Failed to check Leonardo generation status' }, { status: getRes.status });
    }

    const getData = await getRes.json();
    const generation = getData.generations_by_pk;
    
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    if (generation.status === 'COMPLETE') {
      const images = generation.generated_images;
      if (images && images.length > 0) {
        const url = images[0].motionMP4URL || images[0].url;
        return NextResponse.json({ status: 'COMPLETE', url: url, imageId: images[0].id });
      }
      return NextResponse.json({ status: 'FAILED', error: 'Generation complete but no images found' });
    } else if (generation.status === 'FAILED') {
      const failureReason = generation.failure_reason || 'Unknown reason';
      console.error('Leonardo generation failed:', failureReason, JSON.stringify(generation));
      return NextResponse.json({ 
        status: 'FAILED', 
        error: `Leonardo generation failed: ${failureReason}. This can happen due to prompt filters or technical issues on Leonardo's side.` 
      });
    }

    return NextResponse.json({ status: generation.status }); // PENDING

  } catch (error: any) {
    console.error('Leonardo API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
