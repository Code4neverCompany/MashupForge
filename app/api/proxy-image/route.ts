import { NextResponse } from 'next/server';

// SSRF guard: only proxy images from hosts we actually use.
// cdn.leonardo.ai           — Leonardo image CDN
// *.storage.googleapis.com  — Leonardo's underlying GCS bucket
// i.uguu.se                 — uguu image host (used by Pinterest upload path)
const ALLOWED_HOSTS = new Set<string>(['cdn.leonardo.ai', 'i.uguu.se']);
const ALLOWED_HOST_SUFFIXES = ['.storage.googleapis.com'];

export function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return new NextResponse('URL host not allowed', { status: 403 });
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    
    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }
    
    const blob = await response.blob();

    const SAFE_IMAGE_TYPES = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    ]);
    const upstreamType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
    const contentType = SAFE_IMAGE_TYPES.has(upstreamType) ? upstreamType : 'application/octet-stream';

    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e: unknown) {
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
