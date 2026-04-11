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

      // Leonardo's Hasura layer transiently returns 500s ("Invalid response
      // from authorization hook", "unexpected", etc.) while a generation is
      // still being committed to the datastore — a subsequent poll usually
      // succeeds. 404/425 also mean "not ready yet" for v2 generations. Treat
      // all of these as PENDING so the client keeps polling instead of
      // bailing out of the loop.
      if (
        getRes.status === 500 ||
        getRes.status === 502 ||
        getRes.status === 503 ||
        getRes.status === 504 ||
        getRes.status === 404 ||
        getRes.status === 425
      ) {
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
      // COMPLETE with 0 images typically means content-filter rejection
      // (especially on gpt-image-1.5). Log the full payload + generation
      // object keys so we can spot shape mismatches where the images
      // field lives under an unexpected name.
      console.error(
        '[Leonardo] COMPLETE but 0 images. Full response:',
        JSON.stringify(getData).slice(0, 1000)
      );
      console.error(
        '[Leonardo] Generation object keys:',
        Object.keys(generation)
      );
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
