import { NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

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

      // For Instagram, we need public URLs for all images
      const igMediaUrls: string[] = [];
      for (const item of imageItems) {
        if (item.url) {
          igMediaUrls.push(item.url);
        } else {
          try {
            const formData = new FormData();
            const blob = new Blob([new Uint8Array(item.buffer)], { type: item.mimeType });
            formData.append('files[]', blob, 'image.jpg');
            
            const uploadRes = await fetch('https://uguu.se/upload.php', {
              method: 'POST',
              body: formData
            });
            
            if (!uploadRes.ok) throw new Error('Failed to upload image to temporary host');
            const uploadData = await uploadRes.json();
            if (!uploadData.success || !uploadData.files || !uploadData.files[0]) throw new Error('Temporary host returned invalid response');
            igMediaUrls.push(uploadData.files[0].url);
          } catch (err: any) {
            throw new Error(`Failed to host image for Instagram: ${err.message}`);
          }
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
