import { NextResponse } from 'next/server';
import { isAvailable } from '@/lib/mmx-client';
import { getErrorMessage } from '@/lib/errors';
import { isServerless } from '@/lib/runtime-env';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export const runtime = 'nodejs';

/**
 * POST /api/mmx/setup
 * Opens mmx's interactive OAuth login + config flow in a new terminal
 * (tmux on POSIX, spawn cmd window on Windows) so the user can authenticate
 * and pick model/provider through mmx's native CLI.
 *
 * Desktop-only: this route spawns tmux via execSync and is incompatible
 * with serverless runtimes. If we detect a serverless environment we
 * short-circuit with 503 so the caller sees a clear error instead of
 * a raw shell failure.
 */

export async function POST() {
  if (isServerless()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'MMX setup is desktop-only. This feature requires tmux and local subprocess execution — it cannot run on serverless platforms. Use the Tauri desktop build instead.',
      },
      { status: 503 },
    );
  }

  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      { success: false, error: 'mmx binary not found on PATH. Install the MiniMax mmx CLI first.' },
      { status: 400 },
    );
  }

  try {
    if (platform() === 'win32') {
      // Windows: pop a native console window running `mmx auth login`.
      // `start "Title" cmd /k ...` opens a new cmd window; detached + shell
      // because `start` is a cmd builtin, not an executable.
      spawn(
        `start "MashupForge — MiniMax mmx Sign In" cmd /k "mmx auth login"`,
        { shell: true, detached: true, stdio: 'ignore' },
      ).unref();

      return NextResponse.json({
        success: true,
        message: 'A new terminal window opened running `mmx auth login`. Follow the OAuth prompts to sign in.',
        platform: 'win32',
      });
    }

    // POSIX desktop: use tmux so the setup session is persistent and visible.
    // Run `mmx auth login --no-browser` in a detached tmux session named
    // "mmx-setup". Only kill the existing session if one is already running —
    // belt-and-suspenders guard alongside the mmxBusyRef double-click guard
    // in the UI, because the API is also callable via curl/scripts.
    const hasSession = spawnSync('tmux', ['has-session', '-t', 'mmx-setup'], {
      stdio: 'ignore',
    });
    if (hasSession.status === 0) {
      return NextResponse.json({
        success: true,
        message:
          'An MMX setup session is already running.\n\nAttach to it with:\n  tmux attach -t mmx-setup\n\nIf you need to start fresh, close that tmux session first:\n  tmux kill-session -t mmx-setup',
        tmuxSession: 'mmx-setup',
        platform: 'posix',
        alreadyRunning: true,
      });
    }
    spawnSync('tmux', ['kill-session', '-t', 'mmx-setup'], { stdio: 'ignore' });
    const tmuxResult = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', 'mmx-setup', '-x', '120', '-y', '30', 'mmx', 'auth', 'login', '--no-browser'],
      { encoding: 'utf8' },
    );
    if (tmuxResult.status !== 0) {
      throw new Error(
        `tmux new-session failed (exit ${tmuxResult.status}): ${tmuxResult.stderr?.trim() || 'unknown error'}`,
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'MMX setup opened in tmux session "mmx-setup". Attach with:\n  tmux attach -t mmx-setup\n\nThen follow the OAuth/device-code prompts to authenticate.',
      tmuxSession: 'mmx-setup',
      platform: 'posix',
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
  }
}
