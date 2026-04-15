import { NextResponse } from 'next/server';
import { getPiPath, installPi } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';
import { homedir, tmpdir } from 'node:os';

// Force Node runtime (not edge) — installPi uses spawnSync which edge lacks.
export const runtime = 'nodejs';
// Never statically optimize or cache this route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// PROP-013 (Option A) — in-process mutex. If two POST requests arrive
// concurrently (e.g. auto-installer + user button click) the second caller
// awaits the first promise instead of spawning a second installPi() run.
// Safe for single-process environments (Next dev + Tauri sidecar).
let installInFlight: Promise<ReturnType<typeof installPi>> | null = null;

/**
 * GET /api/pi/install
 * Sandbox probe. Reports the resolved paths installPi will use — handy
 * when triaging install failures in the desktop shell.
 */
export function GET() {
  return NextResponse.json({
    route: 'pi/install',
    cwd: process.cwd(),
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
      });
    }
    if (!installInFlight) {
      installInFlight = Promise.resolve().then(() => installPi()).finally(() => {
        installInFlight = null;
      });
    }
    const result = await installInFlight;
    return NextResponse.json(
      result,
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
        uncaught: true,
      },
      { status: 500 },
    );
  }
}
