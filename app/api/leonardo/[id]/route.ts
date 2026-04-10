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

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };

    // Generations created via /api/rest/v2/generations are not queryable via the
    // v1 GET (the Hasura auth hook for v1 returns "Invalid response from authorization
    // hook"). Try v2 first; fall back to v1 for legacy generations.
    let getRes = await fetch(`https://cloud.leonardo.ai/api/rest/v2/generations/${id}`, { headers });
    let usedV2 = true;
    if (!getRes.ok && (getRes.status === 404 || getRes.status === 405)) {
      getRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, { headers });
      usedV2 = false;
    }

    if (!getRes.ok) {
      const err = await getRes.text();
      console.error(`Leonardo status error (v${usedV2 ? '2' : '1'}, ${getRes.status}):`, err);

      // Leonardo's Hasura layer transiently returns 500 "Invalid response from
      // authorization hook" while a generation is still being committed to the
      // datastore. The generation is not actually broken — a subsequent poll
      // usually succeeds. Treat this as PENDING (200) so the client keeps polling
      // instead of bailing out of the loop.
      if (getRes.status === 500 && err.includes('authorization hook')) {
        return NextResponse.json({ status: 'PENDING' });
      }

      return NextResponse.json(
        { error: `Failed to check Leonardo generation status (${getRes.status}): ${err.slice(0, 200)}` },
        { status: getRes.status }
      );
    }

    const getData = await getRes.json();
    // v1 wraps in `generations_by_pk`; v2 may return the generation flat or under
    // `generation` / `generations_by_pk`. Handle all known shapes.
    const generation =
      getData.generations_by_pk ||
      getData.generation ||
      (getData.id ? getData : null);

    if (!generation) {
      console.error('Leonardo unexpected status response shape:', JSON.stringify(getData).slice(0, 400));
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    if (generation.status === 'COMPLETE') {
      const images = generation.generated_images || generation.images || [];
      if (images.length > 0) {
        const imageUrl = images[0].motionMP4URL || images[0].url;
        return NextResponse.json({ status: 'COMPLETE', url: imageUrl, imageId: images[0].id });
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
