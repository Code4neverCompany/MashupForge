import { NextResponse } from 'next/server';
import { getPiPath, isPiInstalled } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';
import { execSync, spawn } from 'node:child_process';
import { platform } from 'node:os';

export const runtime = 'nodejs';

/**
 * POST /api/pi/setup
 * Opens pi's interactive setup in a tmux session so the user can
 * authenticate and configure their provider through pi's native flow.
 *
 * Desktop-only: this route spawns tmux via execSync and is incompatible
 * with serverless runtimes (Vercel, edge functions, etc.). If we detect
 * a serverless environment we short-circuit with 503 so the caller sees
 * a clear error instead of a raw shell failure.
 */
function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES
  );
}

export async function POST() {
  if (isServerless()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Pi setup is desktop-only. This feature requires tmux and local subprocess execution — it cannot run on serverless platforms. Use the Tauri desktop build instead.',
      },
      { status: 503 },
    );
  }

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
    if (platform() === 'win32') {
      // Windows: pop a native console window running `pi /login`.
      // `start "Title" cmd /k ...` opens a new cmd window; detached + shell
      // because `start` is a cmd builtin, not an executable.
      spawn(
        `start "MashupForge — pi.dev Sign In" cmd /k "\"${piPath}\" /login"`,
        { shell: true, detached: true, stdio: 'ignore' },
      ).unref();

      return NextResponse.json({
        success: true,
        message: 'A new terminal window opened running `pi /login`. Follow the prompts to sign in.',
        platform: 'win32',
      });
    }

    // POSIX desktop: use tmux as before so Linux dev boxes keep working.
    try { execSync('tmux kill-session -t pi-setup 2>/dev/null'); } catch {}
    execSync(
      `tmux new-session -d -s pi-setup -x 120 -y 30 ` +
      `'${piPath} /login'`,
      { encoding: 'utf8' },
    );

    return NextResponse.json({
      success: true,
      message: 'Pi setup opened in tmux session "pi-setup". Attach with: tmux attach -t pi-setup',
      tmuxSession: 'pi-setup',
      platform: 'posix',
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(e) },
      { status: 500 },
    );
  }
}
