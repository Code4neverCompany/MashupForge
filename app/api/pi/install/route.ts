import { NextResponse } from 'next/server';
import { getPiPath, installPi, BUILD_MARKER } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';
import { homedir, tmpdir } from 'node:os';

// Force Node runtime (not edge) — installPi uses spawnSync which edge lacks.
export const runtime = 'nodejs';
// Never statically optimize or cache this route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/pi/install
 * Cheap deploy-verification probe. Returns the current BUILD_MARKER plus a
 * small amount of sandbox info. If this endpoint doesn't reflect a recent
 * marker bump after a deploy, Vercel is serving stale code.
 */
export function GET() {
  return NextResponse.json({
    route: 'pi/install',
    buildMarker: BUILD_MARKER,
    cwd: process.cwd(),
    vercel: process.env.VERCEL ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    nodeVersion: process.version,
    processEnvHome: process.env.HOME ?? null,
    osHomedir: (() => { try { return homedir(); } catch (e) { return `error:${(e as Error).message}`; } })(),
    tmpdir: tmpdir(),
  });
}

export async function POST() {
  try {
    const existing = getPiPath();
    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyInstalled: true,
        piPath: existing,
        buildMarker: BUILD_MARKER,
      });
    }
    const result = installPi();
    return NextResponse.json(
      { ...result, buildMarker: BUILD_MARKER },
      { status: result.success ? 200 : 500 },
    );
  } catch (e: unknown) {
    // Uncaught throw in installPi — attach what we know so we never return
    // a blind 500 that masks the root cause.
    return NextResponse.json(
      {
        success: false,
        stdout: '',
        stderr: '',
        error: `installPi threw: ${getErrorMessage(e)}`,
        buildMarker: BUILD_MARKER,
        uncaught: true,
      },
      { status: 500 },
    );
  }
}
