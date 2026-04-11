import { NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import sharp from 'sharp';

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

    const results: any = {};

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

          if (!uploadRes.ok) throw new Error('Failed to upload image to temporary host');
          const uploadData = await uploadRes.json();
          if (!uploadData.success || !uploadData.files || !uploadData.files[0]) throw new Error('Temporary host returned invalid response');
          igMediaUrls.push(uploadData.files[0].url);
        } catch (err: any) {
          throw new Error(`Failed to host image for Instagram: ${err.message}`);
        }
      }

      if (igMediaUrls.length === 1) {
        // Single image post
        const containerRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ image_url: igMediaUrls[0], caption: caption })
        });
        const containerData = await containerRes.json();
        if (containerData.error) throw new Error(`IG Container Error: ${containerData.error.message}`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const publishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ creation_id: containerData.id })
        });
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(`IG Publish Error: ${publishData.error.message}`);
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
          const childData = await childRes.json();
          if (childData.error) throw new Error(`IG Carousel Item Error: ${childData.error.message}`);
          childrenIds.push(childData.id);
        }

        // Create Carousel Container
        const carouselRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ media_type: 'CAROUSEL', children: childrenIds, caption: caption })
        });
        const carouselData = await carouselRes.json();
        if (carouselData.error) throw new Error(`IG Carousel Container Error: ${carouselData.error.message}`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const publishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
          body: JSON.stringify({ creation_id: carouselData.id })
        });
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(`IG Carousel Publish Error: ${publishData.error.message}`);
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
        ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds as any } } : {})
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
          const uploadData = await uploadRes.json();
          if (!uploadData?.success || !uploadData?.files?.[0]?.url) {
            throw new Error('uguu returned invalid response');
          }
          publicUrl = uploadData.files[0].url;
        } catch (err: any) {
          throw new Error(`Failed to host image for Pinterest: ${err.message}`);
        }
      }

      const firstLine = (caption || '').split('\n')[0] || 'Mashup';
      const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '…' : firstLine;

      const pinBody: Record<string, any> = {
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
      const pinData = await pinRes.json().catch(() => ({}));
      if (!pinRes.ok) {
        const msg = pinData?.message || pinData?.error || `Pinterest API returned ${pinRes.status}`;
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
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
