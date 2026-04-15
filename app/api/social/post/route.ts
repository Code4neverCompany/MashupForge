import { NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import sharp from 'sharp';
import { getErrorMessage } from '@/lib/errors';

/**
 * Parse a response body as JSON, or throw a readable error that includes
 * HTTP status + a snippet of the raw body. Graph API and uguu both return
 * HTML error pages on some failure modes (rate limits, 502s, maintenance
 * windows); calling plain `res.json()` on those bodies throws the generic
 * "Unexpected token < in JSON at position 0" that users can't action.
 *
 * STORY-133: Instagram posting surfaced that raw parse error with no hint
 * of which endpoint failed or what the server actually said.
 */
async function parseJsonOrThrow(res: Response, context: string): Promise<Record<string, unknown>> {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(
      `${context}: server returned non-JSON (HTTP ${res.status}). First 200 chars: ${snippet || '<empty>'}`,
    );
  }
}

/** Extract .error.message from a parsed Graph API / uguu response. */
function apiErrMsg(data: Record<string, unknown>): string {
  const e = data.error;
  if (typeof e === 'object' && e !== null) {
    return ((e as Record<string, unknown>).message as string | undefined) ?? JSON.stringify(e);
  }
  return String(e ?? '');
}

/**
 * Poll IG container status until FINISHED (or ERROR/EXPIRED). Replaces a
 * blind 5-second sleep that flaked on slow uploads and wasted 5s on fast ones.
 *
 * FIX-101: Graph API exposes `GET /{container-id}?fields=status_code` which
 * returns IN_PROGRESS, FINISHED, ERROR, EXPIRED, or PUBLISHED. Poll every
 * 1.5s up to 60s. Throws on terminal failure states.
 */
async function waitForIgContainerReady(
  hostUrl: string,
  containerId: string,
  accessToken: string,
  context: string,
): Promise<void> {
  const intervalMs = 1500;
  const timeoutMs = 60_000;
  const started = Date.now();

  while (true) {
    const statusRes = await fetch(
      `https://${hostUrl}/v19.0/${containerId}?fields=status_code`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const statusData = await parseJsonOrThrow(statusRes, `${context} status poll`);
    if (statusData.error) {
      throw new Error(`${context} status poll error: ${apiErrMsg(statusData)}`);
    }
    const code = statusData.status_code as string | undefined;
    if (code === 'FINISHED' || code === 'PUBLISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`${context} container ${code.toLowerCase()} before publish`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`${context} container not ready after ${timeoutMs / 1000}s (last status=${code ?? 'unknown'})`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Pad an image to fit Instagram's accepted aspect ratio range (4:5 → 1.91:1).
 *
 * Instagram center-crops any image outside this range on upload, which was
 * cutting off watermarks placed near the edges. We instead letterbox the
 * source image on a black canvas sized to the nearest safe ratio, so the
 * entire original frame survives.
 *
 * - Too tall (ratio < 4/5): add horizontal black bars (pillarbox) until
 *   the canvas reaches 4:5 portrait.
 * - Too wide (ratio > 1.91): add vertical black bars (letterbox) until
 *   the canvas reaches 1.91:1 landscape.
 * - Already in range: returned unchanged.
 */
async function prepareForInstagram(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const { width = 1080, height = 1080 } = meta;
  const ratio = width / height;

  const MIN_RATIO = 4 / 5; // 0.8 — tallest portrait IG accepts
  const MAX_RATIO = 1.91;  // widest landscape IG accepts

  if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
    return buffer;
  }

  let newWidth: number;
  let newHeight: number;

  if (ratio < MIN_RATIO) {
    // Too tall → widen the canvas
    newHeight = height;
    newWidth = Math.ceil(height * MIN_RATIO);
  } else {
    // Too wide → grow the canvas vertically
    newWidth = width;
    newHeight = Math.ceil(width / MAX_RATIO);
  }

  return sharp(buffer)
    .resize({
      width: newWidth,
      height: newHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      position: 'center',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function POST(req: Request) {
  try {
    const { caption, platforms, mediaUrl, mediaUrls, mediaBase64, credentials } = await req.json();

    const results: Record<string, unknown> = {};

    // Helper to get image buffers
    const imageItems: { buffer: Buffer, mimeType: string, url?: string }[] = [];
    
    const urlsToProcess = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : []);

    for (const url of urlsToProcess) {
      let buffer: Buffer | null = null;
      let mimeType = 'image/jpeg';
      
      if (url.startsWith('data:')) {
        const base64Data = url.split(',')[1];
        if (base64Data) {
          buffer = Buffer.from(base64Data, 'base64');
          mimeType = url.split(';')[0].split(':')[1] || 'image/jpeg';
        }
      } else {
        const imgRes = await fetch(url);
        const arrayBuffer = await imgRes.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
      }
      
      if (buffer) {
        imageItems.push({ buffer, mimeType, url: url.startsWith('http') ? url : undefined });
      }
    }

    // Fallback for mediaBase64 (single image)
    if (imageItems.length === 0 && mediaBase64) {
      imageItems.push({ buffer: Buffer.from(mediaBase64, 'base64'), mimeType: 'image/jpeg' });
    }

    if (platforms.includes('instagram')) {
      if (!credentials?.instagram?.accessToken || !credentials?.instagram?.igAccountId) {
        throw new Error('Instagram credentials incomplete');
      }
      const igAccountId = credentials.instagram.igAccountId.trim().replace(/[^0-9]/g, '');
      const igAccessToken = credentials.instagram.accessToken.trim();

      if (igAccessToken.startsWith('IGQ')) {
        throw new Error('You are using an Instagram Basic Display token (starts with IGQ). To publish posts, you MUST use the Instagram Graph API with a Facebook Page Access Token (starts with EAA). The Basic Display API does not support posting.');
      }

      const hostUrl = igAccessToken.startsWith('IGAA') ? 'graph.instagram.com' : 'graph.facebook.com';

      // Preprocess every image through prepareForInstagram so IG doesn't
      // center-crop anything. We build a SEPARATE igItems array instead
      // of mutating imageItems — Twitter / Pinterest / Discord run after
      // this block and each has its own sizing rules that shouldn't get
      // the IG letterboxing applied.
      //
      // Note: we intentionally DO NOT reuse pre-existing Leonardo URLs
      // (item.url) for IG even when they're available. Passing the raw
      // Leonardo URL directly would bypass our padding entirely and IG
      // would crop the original. Every image is re-hosted via uguu with
      // the padded buffer.
      const igItems: { buffer: Buffer; mimeType: string }[] = [];
      for (const item of imageItems) {
        const padded = await prepareForInstagram(item.buffer);
        igItems.push({ buffer: padded, mimeType: 'image/jpeg' });
      }

      const igMediaUrls: string[] = [];
      for (const item of igItems) {
        try {
          const formData = new FormData();
          const blob = new Blob([new Uint8Array(item.buffer)], { type: item.mimeType });
          formData.append('files[]', blob, 'image.jpg');

          const uploadRes = await fetch('https://uguu.se/upload.php', {
            method: 'POST',
            body: formData,
          });

          const uploadData = await parseJsonOrThrow(uploadRes, 'uguu image upload');
          if (!uploadRes.ok) {
            throw new Error(`uguu upload failed (HTTP ${uploadRes.status}): ${uploadData?.description || uploadData?.error || 'no message'}`);
          }
          const uploadFiles = uploadData.files as Array<Record<string, unknown>> | undefined;
          if (!uploadData.success || !uploadFiles || !uploadFiles[0]) {
            throw new Error('uguu returned invalid response (missing files[0].url)');
          }
          igMediaUrls.push(uploadFiles[0].url as string);
        } catch (e: unknown) {
          throw new Error(`Failed to host image for Instagram: ${getErrorMessage(e)}`);
        }
      }

      if (igMediaUrls.length === 1) {
        // Single image post
        const containerRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ image_url: igMediaUrls[0], caption: caption })
        });
        const containerData = await parseJsonOrThrow(containerRes, 'IG Container');
        if (containerData.error) throw new Error(`IG Container Error: ${apiErrMsg(containerData)}`);

        await waitForIgContainerReady(hostUrl, containerData.id as string, igAccessToken, 'IG Container');

        const publishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ creation_id: containerData.id })
        });
        const publishData = await parseJsonOrThrow(publishRes, 'IG Publish');
        if (publishData.error) throw new Error(`IG Publish Error: ${apiErrMsg(publishData)}`);
        results.instagram = publishData;
      } else if (igMediaUrls.length > 1) {
        // Carousel post
        const childrenIds: string[] = [];
        for (const url of igMediaUrls) {
          const childRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
            body: JSON.stringify({ image_url: url, is_carousel_item: true })
          });
          const childData = await parseJsonOrThrow(childRes, 'IG Carousel Item');
          if (childData.error) throw new Error(`IG Carousel Item Error: ${apiErrMsg(childData)}`);
          childrenIds.push(childData.id as string);
        }

        // Create Carousel Container
        const carouselRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ media_type: 'CAROUSEL', children: childrenIds, caption: caption })
        });
        const carouselData = await parseJsonOrThrow(carouselRes, 'IG Carousel Container');
        if (carouselData.error) throw new Error(`IG Carousel Container Error: ${apiErrMsg(carouselData)}`);

        await waitForIgContainerReady(hostUrl, carouselData.id as string, igAccessToken, 'IG Carousel Container');

        const publishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ creation_id: carouselData.id })
        });
        const publishData = await parseJsonOrThrow(publishRes, 'IG Carousel Publish');
        if (publishData.error) throw new Error(`IG Carousel Publish Error: ${apiErrMsg(publishData)}`);
        results.instagram = publishData;
      }
    }

    if (platforms.includes('twitter')) {
      if (!credentials?.twitter?.appKey || !credentials?.twitter?.appSecret || !credentials?.twitter?.accessToken || !credentials?.twitter?.accessSecret) {
        throw new Error('Twitter credentials incomplete');
      }
      const client = new TwitterApi({
        appKey: credentials.twitter.appKey,
        appSecret: credentials.twitter.appSecret,
        accessToken: credentials.twitter.accessToken,
        accessSecret: credentials.twitter.accessSecret,
      });

      const mediaIds: string[] = [];
      for (const item of imageItems.slice(0, 4)) { // Twitter allows up to 4 images
        const mediaId = await client.v1.uploadMedia(item.buffer, { mimeType: item.mimeType });
        mediaIds.push(mediaId);
      }

      const tweet = await client.v2.tweet({
        text: caption,
        // twitter-api-v2 requires an exact-length tuple ([string] | [string,string] | …)
        // but our array length is dynamic (0-4). Double-cast via unknown avoids `as any`.
        ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds as unknown as [string, string, string, string] } } : {})
      });
      results.twitter = tweet;
    }

    if (platforms.includes('pinterest')) {
      if (!credentials?.pinterest?.accessToken) {
        throw new Error('Pinterest access token missing');
      }

      // Pinterest needs a public image URL. Reuse the first image item
      // (Pinterest v5 pins are single-image); upload to uguu if we only
      // have a buffer.
      if (imageItems.length === 0) {
        throw new Error('Pinterest: no image to pin');
      }

      const first = imageItems[0];
      let publicUrl = first.url || null;
      if (!publicUrl) {
        try {
          const formData = new FormData();
          const blob = new Blob([new Uint8Array(first.buffer)], { type: first.mimeType });
          formData.append('files[]', blob, 'pin.jpg');
          const uploadRes = await fetch('https://uguu.se/upload.php', {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) throw new Error('uguu upload failed');
          const uploadData = await uploadRes.json() as Record<string, unknown>;
          const uploadFiles2 = uploadData.files as Array<Record<string, unknown>> | undefined;
          if (!uploadData?.success || !uploadFiles2?.[0]?.url) {
            throw new Error('uguu returned invalid response');
          }
          publicUrl = uploadFiles2[0].url as string;
        } catch (e: unknown) {
          throw new Error(`Failed to host image for Pinterest: ${getErrorMessage(e)}`);
        }
      }

      const firstLine = (caption || '').split('\n')[0] || 'Mashup';
      const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '…' : firstLine;

      const pinBody: Record<string, unknown> = {
        title,
        description: caption || '',
        media_source: { source_type: 'image_url', url: publicUrl },
      };
      if (credentials.pinterest.boardId) {
        pinBody.board_id = credentials.pinterest.boardId;
      }

      const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.pinterest.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pinBody),
      });
      const pinData = await (pinRes.json() as Promise<Record<string, unknown>>).catch((): Record<string, unknown> => ({}));
      if (!pinRes.ok) {
        const msg = (pinData?.message as string | undefined) || (pinData?.error as string | undefined) || `Pinterest API returned ${pinRes.status}`;
        throw new Error(`Pinterest: ${msg}`);
      }
      results.pinterest = pinData;
    }

    if (platforms.includes('discord')) {
      if (!credentials?.discord?.webhookUrl) {
        throw new Error('Discord webhook URL missing');
      }

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify({ content: caption }));
      
      imageItems.forEach((item, idx) => {
        const blob = new Blob([new Uint8Array(item.buffer)], { type: item.mimeType });
        formData.append(`files[${idx}]`, blob, `image-${idx}.jpg`);
      });

      const discordRes = await fetch(credentials.discord.webhookUrl, {
        method: 'POST',
        body: formData
      });

      if (!discordRes.ok) throw new Error('Discord post failed');
      results.discord = { success: true };
    }

    return NextResponse.json({ success: true, results });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
