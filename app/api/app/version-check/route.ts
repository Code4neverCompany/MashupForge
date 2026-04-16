import { NextResponse } from 'next/server';
import pkg from '@/package.json';
import { getErrorMessage } from '@/lib/errors';

/**
 * GET /api/app/version-check
 *
 * Compares the running app version against the latest GitHub release of
 * Code4neverCompany/MashupForge and returns whether an update is
 * available. The client uses this to render an "Update available" badge
 * in Settings (STORY-122).
 *
 * Response:
 *   {
 *     current: "0.1.0",
 *     latest: "0.2.0" | null,   // null when no releases exist yet
 *     updateAvailable: boolean,
 *     releaseUrl: string | null,
 *     downloadUrl: string | null, // first .msi asset if present
 *     publishedAt: string | null,
 *     notes: string | null,
 *     error?: string
 *   }
 *
 * Caches the GitHub response for 10 minutes per server process so we
 * don't hammer the anonymous rate limit (60 req/hour/IP) if the client
 * polls on every Settings mount.
 */

const GH_REPO = 'Code4neverCompany/MashupForge';
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedResult {
  body: Record<string, unknown>;
  fetchedAt: number;
}

let cached: CachedResult | null = null;

/**
 * Compare two semver-ish strings ("a.b.c" with optional pre-release
 * suffix). Returns positive if `a > b`, zero if equal, negative if
 * `a < b`. Pre-release tags (e.g. "0.2.0-rc.1") are treated as lower
 * than their release counterpart. Keeps the dep surface at zero — if
 * we ever hit a non-trivial case we can reach for `semver` proper.
 */
function compareVersions(a: string, b: string): number {
  const parseOne = (v: string) => {
    const [main, pre] = v.replace(/^v/, '').split('-', 2);
    const parts = main.split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return { parts, pre: pre || null };
  };
  const pa = parseOne(a);
  const pb = parseOne(b);
  for (let i = 0; i < 3; i++) {
    if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] - pb.parts[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre.localeCompare(pb.pre);
}

interface GhRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  body: string | null;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export async function GET() {
  const current = pkg.version;

  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MashupForge-UpdateCheck',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    // No releases yet — not an error, just "nothing to update to."
    if (res.status === 404) {
      const body = {
        current,
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        downloadUrl: null,
        publishedAt: null,
        notes: null,
      };
      cached = { body, fetchedAt: now };
      return NextResponse.json(body);
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          current,
          latest: null,
          updateAvailable: false,
          releaseUrl: null,
          downloadUrl: null,
          publishedAt: null,
          notes: null,
          error: `GitHub API returned ${res.status}`,
        },
        { status: 200 }
      );
    }

    const release = (await res.json()) as GhRelease;
    const latest = release.tag_name.replace(/^v/, '');
    const msiAsset = release.assets.find((a) => a.name.toLowerCase().endsWith('.msi'));

    const body = {
      current,
      latest,
      updateAvailable: compareVersions(latest, current) > 0,
      releaseUrl: release.html_url,
      downloadUrl: msiAsset?.browser_download_url ?? null,
      publishedAt: release.published_at,
      notes: release.body,
    };
    cached = { body, fetchedAt: now };
    return NextResponse.json(body);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        current,
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        downloadUrl: null,
        publishedAt: null,
        notes: null,
        error: getErrorMessage(e),
      },
      { status: 200 }
    );
  }
}
