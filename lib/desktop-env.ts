/**
 * Desktop-mode environment hydration.
 *
 * When MashupForge runs inside the Tauri desktop bundle, the Next.js server
 * is spawned as a sidecar and has no Vercel dashboard to read API keys from.
 * Instead, we load a per-user JSON config file from the platform-standard
 * app-data dir and copy every string entry into `process.env` BEFORE the
 * Next server boots. API routes then read keys via `process.env.X` exactly
 * as they would on Vercel.
 *
 * Platform paths:
 *   Windows: %APPDATA%\MashupForge\config.json
 *   macOS:   ~/Library/Application Support/MashupForge/config.json
 *   Linux:   $XDG_CONFIG_HOME/MashupForge/config.json  (or ~/.config/...)
 *
 * The env var MASHUPFORGE_CONFIG_DIR overrides the resolved dir — useful
 * for tests and for the Tauri launcher to force a specific location.
 *
 * This module is imported from the Tauri server wrapper (`scripts/tauri-
 * server-wrapper.js`), not from Next itself. The wrapper calls
 * `hydrateDesktopEnv()` at process start, then requires `server.js`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface HydrateResult {
  loaded: boolean;
  path: string;
  keys: string[];
  error?: string;
}

export function getDesktopConfigPath(): string {
  const override = process.env.MASHUPFORGE_CONFIG_DIR;
  if (override) return join(override, 'config.json');

  const platform = process.platform;
  if (platform === 'win32') {
    const appdata = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(appdata, 'MashupForge', 'config.json');
  }
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'MashupForge', 'config.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, 'MashupForge', 'config.json');
}

export function hydrateDesktopEnv(): HydrateResult {
  const path = getDesktopConfigPath();

  if (!existsSync(path)) {
    return { loaded: false, path, keys: [] };
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { loaded: false, path, keys: [], error: 'config.json must be a JSON object' };
    }

    const keys: string[] = [];
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Only copy primitive string values — nested objects / arrays would
      // not round-trip through process.env cleanly anyway.
      if (typeof v === 'string' && v.length > 0) {
        process.env[k] = v;
        keys.push(k);
      }
    }
    return { loaded: true, path, keys };
  } catch (e) {
    return { loaded: false, path, keys: [], error: (e as Error).message };
  }
}
