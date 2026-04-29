// MMX-WEBSOCKET (Story 4 of MMX-INTEGRATION-V2): WebSocket bridge for
// the in-app xterm.js terminal modal (MMX-TERMINAL). Spawns the
// active AI agent CLI — `mmx chat` or `pi chat --api-key … --no-browser`
// — and pipes its stdin/stdout to the WebSocket so the client terminal
// behaves as if attached to a local PTY.
//
// IMPORTANT runtime note: Next.js App Router route handlers cannot
// upgrade an incoming HTTP request to WebSocket on their own — the
// underlying socket is not exposed to the handler. In production the
// upgrade is intercepted at the host level (Tauri sidecar / custom
// Node server) which dispatches /api/ai-terminal before the App
// Router runs and uses {@link spawnTerminal} below to start the CLI.
// When a request slips through to this handler (i.e. plain `next dev`
// without the upgrade hook installed) we return 426/501 with a clear
// message instead of pretending the connection succeeded.

import { NextResponse } from 'next/server';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type TerminalProvider = 'mmx' | 'pi';

export interface TerminalSpawnOptions {
  provider: TerminalProvider;
  /** Threaded into `pi chat --api-key …` when provider === 'pi'. */
  apiKey?: string;
  /** TERM env override; defaults to xterm-256color so colour escapes
   *  the CLIs emit render correctly in xterm.js. */
  term?: string;
}

/** mmx + pi binaries follow the same convention as the rest of the
 *  codebase: env override → ~/.local/bin/<bin> → PATH lookup. */
export function resolveCliPath(provider: TerminalProvider): string {
  if (provider === 'mmx') {
    return process.env.MMX_BIN ?? join(homedir(), '.local', 'bin', 'mmx');
  }
  return process.env.PI_BIN ?? join(homedir(), '.local', 'bin', 'pi');
}

export function buildArgs(provider: TerminalProvider, apiKey?: string): string[] {
  if (provider === 'mmx') {
    // `mmx chat` enters the interactive in-process LLM agent. No API
    // key flag is needed — mmx reads MMX_API_KEY / MINIMAX_API_KEY
    // from env, which the host inherits.
    return ['chat'];
  }
  const args = ['chat', '--no-browser'];
  if (apiKey) args.push('--api-key', apiKey);
  return args;
}

/** Kick off the child process. Caller wires the streams to whatever
 *  transport (WebSocket / pty bridge) the host integration provides. */
export function spawnTerminal(opts: TerminalSpawnOptions): ChildProcessWithoutNullStreams {
  const bin = resolveCliPath(opts.provider);
  const args = buildArgs(opts.provider, opts.apiKey);
  return spawn(bin, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: opts.term ?? 'xterm-256color' },
  });
}

export async function GET(req: Request): Promise<Response> {
  const upgrade = req.headers.get('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    // Plain GET — guide the caller toward the correct contract.
    return NextResponse.json(
      {
        error: 'WebSocket upgrade required',
        hint:
          'Connect with new WebSocket("/api/ai-terminal?provider=mmx") — fetch() is not supported.',
      },
      { status: 426, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Upgrade header was present but the host-level listener didn't
  // intercept. Fail loudly so the client surfaces a real error
  // instead of hanging. The xterm modal's onerror/onclose paths
  // render this back to the user.
  return NextResponse.json(
    {
      error: 'AI terminal WebSocket bridge not mounted on this host',
      hint:
        'Run under the Tauri desktop sidecar or a Node server that hooks the HTTP upgrade ' +
        'event for /api/ai-terminal and dispatches to spawnTerminal() exported from this module.',
    },
    { status: 501 },
  );
}
