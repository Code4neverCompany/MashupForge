/**
 * Pi installation and status helpers. Server-side only — uses node:fs and
 * node:child_process which aren't available in the browser.
 */

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Project-local install prefix used when global install isn't possible (sandboxed envs). */
const LOCAL_PREFIX = join(process.cwd(), '.pi-install');
const LOCAL_BIN = join(LOCAL_PREFIX, 'bin', 'pi');

/**
 * Writable HOME for spawned npm. If the process HOME doesn't exist (e.g. Vercel
 * sandbox user `sbx_user1051` with no homedir), npm fails to create its cache
 * before it can even fetch a package. Point HOME at a tmpdir we know exists.
 */
function ensureWritableHome(): string {
  const currentHome = process.env.HOME || homedir();
  try {
    if (currentHome && existsSync(currentHome)) return currentHome;
  } catch {
    // fall through
  }
  const fallback = join(tmpdir(), 'mashupforge-npm-home');
  try {
    mkdirSync(fallback, { recursive: true });
  } catch {
    // ignore — tmpdir should always be writable
  }
  return fallback;
}

/** Candidate locations for the pi binary, searched in order. */
function piCandidates(): string[] {
  return [
    process.env.PI_BIN,
    LOCAL_BIN,
    join(homedir(), '.hermes', 'node', 'bin', 'pi'),
    '/usr/local/bin/pi',
    '/usr/bin/pi',
  ].filter(Boolean) as string[];
}

/** Resolve the pi binary path, preferring PATH, then known install dirs. */
export function getPiPath(): string | null {
  // PATH lookup first
  const which = spawnSync('which', ['pi'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  for (const candidate of piCandidates()) {
    try {
      if (existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function isPiInstalled(): boolean {
  return getPiPath() !== null;
}

/**
 * Check whether pi has usable auth. We consider pi authenticated if
 * ~/.pi/agent/auth.json exists, has non-empty JSON content, and contains
 * at least one credential entry.
 *
 * Pi also reads API keys from env vars (ZAI_API_KEY, GOOGLE_API_KEY, ...)
 * so if either of those is set, we treat that as "authenticated" too.
 */
export function isPiAuthenticated(): boolean {
  // Only check pi's own auth file. Do NOT check env vars —
  // pi must be set up through its own setup flow (pi /login or pi config).
  const authFile = join(homedir(), '.pi', 'agent', 'auth.json');
  try {
    if (!existsSync(authFile)) return false;
    const stat = statSync(authFile);
    if (stat.size <= 2) return false; // "{}" or empty
    const parsed = JSON.parse(readFileSync(authFile, 'utf8'));
    return (
      parsed &&
      typeof parsed === 'object' &&
      Object.keys(parsed).length > 0
    );
  } catch {
    return false;
  }
}

export interface InstallPiResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  piPath?: string;
}

/**
 * Install pi via npm into a project-local prefix. We avoid `-g` because in
 * sandboxed environments (Vercel, Docker, CI) the default global prefix isn't
 * writable and HOME may not exist, which makes npm fail before it can even
 * fetch the package. Installing to `<cwd>/.pi-install` with an explicit HOME
 * sidesteps both problems and leaves the binary at a known candidate path.
 */
export function installPi(): InstallPiResult {
  try {
    mkdirSync(LOCAL_PREFIX, { recursive: true });
  } catch (e) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: `Failed to create install prefix ${LOCAL_PREFIX}: ${(e as Error).message}`,
    };
  }

  const home = ensureWritableHome();
  const env = {
    ...process.env,
    HOME: home,
    npm_config_cache: join(home, '.npm-cache'),
    npm_config_prefix: LOCAL_PREFIX,
    // Silence update-notifier writes into HOME.
    NO_UPDATE_NOTIFIER: '1',
  };

  const result = spawnSync(
    'npm',
    ['install', '--prefix', LOCAL_PREFIX, '--global', '@mariozechner/pi-coding-agent'],
    { encoding: 'utf8', timeout: 5 * 60 * 1000, env }
  );

  if (result.error) {
    return {
      success: false,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error.message,
    };
  }

  const success = result.status === 0;
  const piPath = getPiPath() || undefined;

  // On success, make the freshly-installed binary visible to later spawns in
  // this same Node process (pi-client etc.) without requiring a server restart.
  if (success && piPath) {
    const binDir = join(LOCAL_PREFIX, 'bin');
    if (!process.env.PATH?.split(':').includes(binDir)) {
      process.env.PATH = `${binDir}:${process.env.PATH || ''}`;
    }
  }

  return {
    success: success && !!piPath,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: success && !piPath ? 'npm reported success but pi binary not found' : undefined,
    piPath,
  };
}

export interface PiModelInfo {
  provider: string;
  model: string;
  contextWindow?: string;
  maxOutput?: string;
  thinking?: boolean;
  images?: boolean;
}

/**
 * Run `pi --list-models` and parse the tabular output into structured rows.
 * Returns an empty array if pi isn't installed or produced no models.
 */
export function getPiModels(): PiModelInfo[] {
  const piPath = getPiPath();
  if (!piPath) return [];

  const result = spawnSync(piPath, ['--list-models'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: process.env,
  });

  // pi --list-models writes to stderr, not stdout
  const output = result.stderr || result.stdout || '';
  if (result.status !== 0 || !output) return [];

  const lines = output.trim().split('\n');
  // First line is the header. Sample:
  // provider  model           context  max-out  thinking  images
  if (lines.length < 2) return [];

  const models: PiModelInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Whitespace-separated columns — pi pads them.
    const cols = line.split(/\s+/);
    if (cols.length < 2) continue;
    models.push({
      provider: cols[0],
      model: cols[1],
      contextWindow: cols[2],
      maxOutput: cols[3],
      thinking: cols[4] === 'yes',
      images: cols[5] === 'yes',
    });
  }
  return models;
}

export interface PiStatusSnapshot {
  installed: boolean;
  authenticated: boolean;
  piPath: string | null;
  modelsAvailable: number;
}

/** Cheap point-in-time snapshot for the status route. */
export function piStatusSnapshot(): PiStatusSnapshot {
  const piPath = getPiPath();
  const authed = isPiAuthenticated();
  return {
    installed: piPath !== null,
    authenticated: authed,
    piPath,
    modelsAvailable: piPath && authed ? getPiModels().length : 0,
  };
}
