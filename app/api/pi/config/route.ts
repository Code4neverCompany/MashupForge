import { NextResponse } from 'next/server';
import { getPiPath, isPiInstalled } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';
import { isServerless } from '@/lib/runtime-env';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export const runtime = 'nodejs';

/**
 * POST /api/pi/config
 * Opens pi's interactive config in a terminal so the user can switch
 * provider/model when quota is reached or they want a different backend.
 */
export async function POST() {
  if (isServerless()) {
    return NextResponse.json(
      { success: false, error: 'Pi config is desktop-only.' },
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
      spawn(
        `start "MashupForge — Switch Provider" cmd /k "\"${piPath}\" config"`,
        { shell: true, detached: true, stdio: 'ignore' },
      ).unref();

      return NextResponse.json({
        success: true,
        message: 'A terminal window opened running `pi config`. Select your new provider and close the window when done.',
        platform: 'win32',
      });
    }

    spawnSync('tmux', ['kill-session', '-t', 'pi-config'], { stdio: 'ignore' });
    const tmuxResult = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', 'pi-config', '-x', '120', '-y', '30', piPath, 'config'],
      { encoding: 'utf8' },
    );
    if (tmuxResult.status !== 0) {
      throw new Error(`tmux new-session failed (exit ${tmuxResult.status}): ${tmuxResult.stderr?.trim() || 'unknown error'}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Pi config opened in tmux session "pi-config". Attach with: tmux attach -t pi-config',
      tmuxSession: 'pi-config',
      platform: 'posix',
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(e) },
      { status: 500 },
    );
  }
}
