import { NextResponse } from 'next/server';
import { getPiPath, isPiInstalled } from '@/lib/pi-setup';
import { execSync } from 'node:child_process';

/**
 * POST /api/pi/setup
 * Opens pi's interactive setup in a tmux session so the user can
 * authenticate and configure their provider through pi's native flow.
 */
export async function POST() {
  if (!isPiInstalled()) {
    return NextResponse.json(
      { success: false, error: 'Pi is not installed. Install it first.' },
      { status: 400 },
    );
  }

  const piPath = getPiPath();
  if (!piPath) {
    return NextResponse.json(
      { success: false, error: 'Pi binary not found.' },
      { status: 500 },
    );
  }

  try {
    // Kill any existing pi-setup session
    try { execSync('tmux kill-session -t pi-setup 2>/dev/null'); } catch {}

    // Create a new tmux session running pi's interactive setup
    // pi /login opens an interactive OAuth flow or API-key prompt
    execSync(
      `tmux new-session -d -s pi-setup -x 120 -y 30 ` +
      `'${piPath} /login'`,
      { encoding: 'utf8' },
    );

    return NextResponse.json({
      success: true,
      message: 'Pi setup opened in tmux session "pi-setup". Attach with: tmux attach -t pi-setup',
      tmuxSession: 'pi-setup',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
