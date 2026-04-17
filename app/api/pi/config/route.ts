import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/pi/config — deprecated
 *
 * Previously spawned `pi config` in a terminal for provider switching.
 * That command actually opens a TUI for extension management, not
 * provider selection; the real switch is done via the PI_PROVIDER /
 * PI_DEFAULT_MODEL dropdown in Desktop Settings which persists to
 * config.json and is read by lib/pi-client.ts on sidecar start.
 *
 * Kept as a 410 so any stale client (older installer, cached JS) gets a
 * clear message instead of silently hanging on a broken cmd spawn.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Switching providers via `pi config` is deprecated. Use the Pi.dev Provider dropdown in Desktop Settings instead.',
    },
    { status: 410 },
  );
}
