import { NextResponse } from 'next/server';

// SSRF guard: only proxy images from hosts we actually use.
// cdn.leonardo.ai           — Leonardo image CDN
// *.storage.googleapis.com  — Leonardo's underlying GCS bucket
// i.uguu.se                 — uguu image host (used by Pinterest upload path)
const ALLOWED_HOSTS = new Set<string>(['cdn.leonardo.ai', 'i.uguu.se']);
const ALLOWED_HOST_SUFFIXES = ['.storage.googleapis.com'];

// In-memory LRU image cache — avoids re-fetching the same Leonardo CDN URLs
// during parallel pipeline runs. No external deps, lives in the Next.js server
// process. Entries expire after TTL_MS and the Map is capped at MAX_ENTRIES
// (oldest-inserted entry evicted first, via insertion-order iteration).
const MAX_ENTRIES = 100;
const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRY_BYTES = 10 * 1024 * 1024; // 10 MB — skip caching huge images

interface CacheEntry {
  buffer: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const imageCache = new Map<string, CacheEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of imageCache) {
    if (entry.expiresAt <= now) imageCache.delete(key);
  }
}

function evictOldest(): void {
  const firstKey = imageCache.keys().next().value;
  if (firstKey !== undefined) imageCache.delete(firstKey);
}

export function getCacheEntry(url: string): CacheEntry | undefined {
  const entry = imageCache.get(url);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    imageCache.delete(url);
    return undefined;
  }
  return entry;
}

export function setCacheEntry(url: string, buffer: ArrayBuffer, contentType: string): void {
  if (buffer.byteLength > MAX_ENTRY_BYTES) return;
  evictExpired();
  if (imageCache.size >= MAX_ENTRIES) evictOldest();
  imageCache.set(url, { buffer, contentType, expiresAt: Date.now() + TTL_MS });
}

export function clearCache(): void {
  imageCache.clear();
}

export function getCacheSize(): number {
  return imageCache.size;
}

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

const SAFE_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return new NextResponse('URL host not allowed', { status: 403 });
  }

  const cached = getCacheEntry(url);
  if (cached) {
    return new NextResponse(cached.buffer, {
      headers: {
        'Content-Type': cached.contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    const upstreamType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
    const contentType = SAFE_IMAGE_TYPES.has(upstreamType) ? upstreamType : 'application/octet-stream';

    setCacheEntry(url, buffer, contentType);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    });
  } catch (e: unknown) {
    return new NextResponse('Error fetching image', { status: 500 });
  }
}
