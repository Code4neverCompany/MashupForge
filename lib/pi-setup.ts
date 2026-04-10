/**
 * Pi installation and status helpers. Server-side only — uses node:fs and
 * node:child_process which aren't available in the browser.
 */

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Candidate locations for the pi binary, searched in order. */
const PI_CANDIDATES = [
  process.env.PI_BIN,
  join(homedir(), '.hermes', 'node', 'bin', 'pi'),
  '/usr/local/bin/pi',
].filter(Boolean) as string[];

/** Resolve the pi binary path, preferring PATH, then known install dirs. */
export function getPiPath(): string | null {
  // PATH lookup first
  const which = spawnSync('which', ['pi'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  for (const candidate of PI_CANDIDATES) {
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
  if (
    process.env.ZAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY
  ) {
    return true;
  }

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

/**
 * Install pi globally via npm. Returns success/failure info. Long-running —
 * call this from a POST handler and let the client block on the response.
 */
export function installPi(): { success: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    'npm',
    ['install', '-g', '@mariozechner/pi-coding-agent'],
    { encoding: 'utf8', timeout: 5 * 60 * 1000 }
  );
  return {
    success: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
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

  if (result.status !== 0 || !result.stdout) return [];

  const lines = result.stdout.trim().split('\n');
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
