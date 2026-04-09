import { NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

export async function POST(req: Request) {
  try {
    const { caption, platforms, mediaUrl, mediaBase64, credentials } = await req.json();

    const results: any = {};

    // Helper to get image buffer
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';
    
    if (mediaBase64) {
      imageBuffer = Buffer.from(mediaBase64, 'base64');
    } else if (mediaUrl && mediaUrl.startsWith('data:')) {
      const base64Data = mediaUrl.split(',')[1];
      if (base64Data) {
        imageBuffer = Buffer.from(base64Data, 'base64');
        mimeType = mediaUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      }
    } else if (mediaUrl) {
      const imgRes = await fetch(mediaUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
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

      let igMediaUrl = mediaUrl;
      if (!igMediaUrl || igMediaUrl.startsWith('data:')) {
        if (!imageBuffer) {
          throw new Error('No image data available for Instagram');
        }
        try {
          const formData = new FormData();
          const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
          formData.append('files[]', blob, 'image.jpg');
          
          const uploadRes = await fetch('https://uguu.se/upload.php', {
            method: 'POST',
            body: formData
          });
          
          if (!uploadRes.ok) {
            throw new Error('Failed to upload image to temporary host');
          }
          const uploadData = await uploadRes.json();
          if (!uploadData.success || !uploadData.files || !uploadData.files[0]) {
            throw new Error('Temporary host returned invalid response');
          }
          igMediaUrl = uploadData.files[0].url;
        } catch (err: any) {
          throw new Error(`Failed to host image for Instagram: ${err.message}`);
        }
      }

      // 1. Create Media Container
      const containerRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${igAccessToken}`
        },
        body: JSON.stringify({
          image_url: igMediaUrl,
          caption: caption
        })
      });
      const containerData = await containerRes.json();
      if (containerData.error) {
        if (containerData.error.message.includes('Cannot parse access token') || containerData.error.message.includes('Invalid OAuth access token')) {
          throw new Error(`Your Instagram Access Token is invalid. Please ensure you are using a valid ${igAccessToken.startsWith('IGAA') ? 'Instagram' : 'Page'} Access Token from the Meta Developer Portal.`);
        }
        throw new Error(`IG Container Error: ${containerData.error.message}`);
      }

      // Wait a few seconds for Instagram to process the image container
      // Sometimes publishing immediately fails with "Media ID is not available"
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 2. Publish Media
      const publishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${igAccessToken}`
        },
        body: JSON.stringify({
          creation_id: containerData.id
        })
      });
      const publishData = await publishRes.json();
      if (publishData.error) {
        // If it still fails, try one more time after another delay
        if (publishData.error.message.includes('Media ID is not available')) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const retryPublishRes = await fetch(`https://${hostUrl}/v19.0/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${igAccessToken}`
            },
            body: JSON.stringify({
              creation_id: containerData.id
            })
          });
          const retryPublishData = await retryPublishRes.json();
          if (retryPublishData.error) {
            throw new Error(`IG Publish Error (Retry): ${retryPublishData.error.message}`);
          }
        } else {
          throw new Error(`IG Publish Error: ${publishData.error.message}`);
        }
      }

      results.instagram = publishData;
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

      let mediaId = undefined;
      if (imageBuffer) {
        mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
      }

      const tweet = await client.v2.tweet({
        text: caption,
        ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
      });
      results.twitter = tweet;
    }

    if (platforms.includes('discord')) {
      if (!credentials?.discord?.webhookUrl) {
        throw new Error('Discord webhook URL missing');
      }

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify({ content: caption }));
      
      if (imageBuffer) {
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
        formData.append('files[0]', blob, 'image.jpg');
      }

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
