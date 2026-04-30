import { NextResponse } from 'next/server';
import { isAvailable } from '@/lib/mmx-client';
import { getErrorMessage } from '@/lib/errors';
import { isServerless } from '@/lib/runtime-env';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export const runtime = 'nodejs';

interface InstallResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  globalBin?: string;
}

/**
 * Run `npm install -g mmx-cli` synchronously and return the npm global bin
 * directory so the caller can prepend it to PATH for the live process.
 *
 * We resolve npm via PATH first (`npm`); on non-Windows, if that fails with
 * ENOENT we fall back to the homebrew/linuxbrew path. On Windows, npm is
 * `npm.cmd`, which `spawnSync` only resolves correctly when `shell: true`.
 *
 * Bounded at 5 minutes — npm fetching mmx-cli + transitive deps over a slow
 * link can be slow, but should never legitimately exceed that. The caller
 * is the Next.js route handler, which the user is staring at, so we'd
 * rather time out cleanly than hang.
 */
function installMmxCli(): InstallResult {
  const isWin = platform() === 'win32';
  // npm-on-PATH first; then common managed-install locations users hit when
  // PATH is not set up (Tauri/Electron sometimes inherit a sparse env on
  // macOS GUI launches, and Linuxbrew dot-files only kick in for login shells).
  // Order: Apple-silicon Homebrew → Intel-mac Homebrew + most Linux distros →
  // Linuxbrew. First match wins via the ENOENT-fallback loop below.
  const candidates: string[] = ['npm'];
  if (!isWin) {
    candidates.push(
      '/opt/homebrew/bin/npm',
      '/usr/local/bin/npm',
      '/home/linuxbrew/.linuxbrew/bin/npm',
    );
  }

  const installArgs = ['install', '-g', '--no-fund', '--no-audit', 'mmx-cli'];
  let lastResult: ReturnType<typeof spawnSync> | undefined;
  let usedNpm: string | undefined;

  for (const npmBin of candidates) {
    const result = spawnSync(npmBin, installArgs, {
      encoding: 'utf8',
      timeout: 5 * 60 * 1000,
      shell: isWin, // npm is npm.cmd on Windows
    });
    lastResult = result;
    // ENOENT (no such binary) surfaces as `error.code === 'ENOENT'` — try next.
    const err = result.error as NodeJS.ErrnoException | undefined;
    if (err && err.code === 'ENOENT') continue;
    usedNpm = npmBin;
    break;
  }

  if (!lastResult || (lastResult.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return {
      ok: false,
      stderr:
        'Could not find `npm`. Install Node.js (which ships with npm), make sure it is on PATH, then click "Set up MMX" again.',
    };
  }
  if (lastResult.status !== 0) {
    return {
      ok: false,
      stdout: lastResult.stdout?.toString() ?? '',
      stderr: lastResult.stderr?.toString() ?? `npm exited with status ${lastResult.status}.`,
    };
  }

  // Resolve npm global prefix → bin dir, so we can prepend to PATH and verify.
  // `npm prefix -g` is stable across npm 6+ (unlike `npm bin -g`, which was
  // removed in npm 9). bin dir = prefix on Windows, prefix/bin elsewhere.
  let globalBin: string | undefined;
  const prefixResult = spawnSync(usedNpm ?? 'npm', ['prefix', '-g'], {
    encoding: 'utf8',
    timeout: 10_000,
    shell: isWin,
  });
  if (prefixResult.status === 0) {
    const prefix = prefixResult.stdout?.toString().trim();
    if (prefix) globalBin = isWin ? prefix : `${prefix}/bin`;
  }

  return {
    ok: true,
    stdout: lastResult.stdout?.toString() ?? '',
    stderr: lastResult.stderr?.toString() ?? '',
    globalBin,
  };
}

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

  let available = await isAvailable();
  if (!available) {
    // Auto-install: the user clicked "Set up MMX" without mmx-cli on PATH,
    // so install it for them via npm and re-check.
    //
    // Why prepend npm's global bin to PATH after install: lib/mmx-client
    // captures `MMX_BIN = process.env.MMX_BIN ?? 'mmx'` at module-load time,
    // so mutating MMX_BIN here is a no-op. spawn('mmx', …) instead does a
    // live PATH lookup at call time, so updating process.env.PATH lets the
    // existing isAvailable() find the just-installed binary without any
    // changes to mmx-client.ts.
    const install = installMmxCli();
    if (!install.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Failed to install mmx-cli automatically. Run `npm install -g mmx-cli` in a terminal and try again.\n\n' +
            (install.stderr || install.stdout || 'No output from npm.'),
        },
        { status: 500 },
      );
    }
    if (install.globalBin && !process.env.PATH?.split(':').includes(install.globalBin)) {
      process.env.PATH = `${install.globalBin}:${process.env.PATH ?? ''}`;
    }
    available = await isAvailable();
    if (!available) {
      return NextResponse.json(
        {
          success: false,
          error:
            `npm install -g mmx-cli reported success but mmx is still not runnable. Tried PATH and ${install.globalBin || '(unknown global bin)'}.\n\n` +
            (install.stdout || install.stderr || 'No output from npm.'),
        },
        { status: 500 },
      );
    }
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
