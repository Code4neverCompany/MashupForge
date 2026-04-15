import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';

/**
 * Pinterest v5 "create pin" proxy.
 *
 * POST body: { caption, mediaUrl?, mediaBase64?, credentials: { accessToken, boardId? } }
 *
 * Pinterest requires a public image URL (it won't accept base64). If the
 * caller provides mediaBase64 we upload it to uguu.se first — same
 * temporary-host dance we do for Instagram.
 *
 * Pinterest auth: a Developer App token with `pins:write` and
 * `boards:read` scopes. See docs at developers.pinterest.com.
 */
export async function POST(req: Request) {
  try {
    const { caption, mediaUrl, mediaBase64, credentials } = await req.json();

    if (!credentials?.accessToken) {
      return NextResponse.json({ error: 'Pinterest access token missing' }, { status: 400 });
    }
    if (!caption && !mediaUrl && !mediaBase64) {
      return NextResponse.json({ error: 'Nothing to pin' }, { status: 400 });
    }

    // Resolve a public image URL. Pinterest will fetch it server-side.
    let publicUrl: string | null = null;

    if (typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
      publicUrl = mediaUrl;
    } else {
      // Either mediaBase64 or a data: URL — upload to uguu.se first.
      let buffer: Buffer | null = null;
      let mimeType = 'image/jpeg';

      if (typeof mediaUrl === 'string' && mediaUrl.startsWith('data:')) {
        const base64Data = mediaUrl.split(',')[1];
        if (base64Data) {
          buffer = Buffer.from(base64Data, 'base64');
          mimeType = mediaUrl.split(';')[0].split(':')[1] || 'image/jpeg';
        }
      } else if (typeof mediaBase64 === 'string' && mediaBase64.length > 0) {
        buffer = Buffer.from(mediaBase64, 'base64');
      }

      if (!buffer) {
        return NextResponse.json(
          { error: 'No usable image payload (expected mediaUrl http(s) or base64)' },
          { status: 400 }
        );
      }

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      formData.append('files[]', blob, 'pin.jpg');
      const uploadRes = await fetch('https://uguu.se/upload.php', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        return NextResponse.json(
          { error: `Failed to upload image to temporary host (HTTP ${uploadRes.status})` },
          { status: 502 }
        );
      }
      const uploadData = await uploadRes.json() as Record<string, unknown>;
      const uploadFiles = uploadData.files as Array<Record<string, unknown>> | undefined;
      if (!uploadData?.success || !uploadFiles?.[0]?.url) {
        return NextResponse.json(
          { error: 'Temporary host returned an invalid response' },
          { status: 502 }
        );
      }
      publicUrl = uploadFiles[0].url as string;
    }

    if (!publicUrl) {
      return NextResponse.json({ error: 'Could not resolve a public image URL' }, { status: 400 });
    }

    // Pinterest's "title" is capped (~100 chars). Use the first newline-
    // delimited line, falling back to a truncated slice of the caption.
    const firstLine = typeof caption === 'string' ? caption.split('\n')[0] : '';
    const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '…' : firstLine || 'Mashup';

    const pinBody: Record<string, unknown> = {
      title,
      description: typeof caption === 'string' ? caption : '',
      media_source: {
        source_type: 'image_url',
        url: publicUrl,
      },
    };
    if (credentials.boardId) {
      pinBody.board_id = credentials.boardId;
    }

    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinBody),
    });

    const pinData = await (pinRes.json() as Promise<Record<string, unknown>>).catch((): Record<string, unknown> => ({}));
    if (!pinRes.ok) {
      const msg =
        (pinData?.message as string | undefined) ||
        (pinData?.error as string | undefined) ||
        `Pinterest API returned ${pinRes.status}`;
      return NextResponse.json({ error: `Pinterest: ${msg}` }, { status: pinRes.status });
    }

    return NextResponse.json({ success: true, data: pinData });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
