import { NextResponse } from 'next/server';
import { getPiPath, isPiInstalled } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';
import { isServerless } from '@/lib/runtime-env';
import { spawn, spawnSync } from 'node:child_process';
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
    // SEC-003: pass the pi binary path as a separate spawn argument
    // instead of interpolating it into a single-quoted shell fence.
    // A piPath containing a single quote (or spaces, semicolons, etc.)
    // would otherwise break out of the fence and execute as shell code.
    spawnSync('tmux', ['kill-session', '-t', 'pi-setup'], { stdio: 'ignore' });
    const tmuxResult = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', 'pi-setup', '-x', '120', '-y', '30', piPath, '/login'],
      { encoding: 'utf8' },
    );
    if (tmuxResult.status !== 0) {
      throw new Error(`tmux new-session failed (exit ${tmuxResult.status}): ${tmuxResult.stderr?.trim() || 'unknown error'}`);
    }

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
