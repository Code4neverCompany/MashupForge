#!/usr/bin/env node
/*
 * Tauri desktop server wrapper.
 *
 * This file is the entrypoint the Tauri Rust launcher spawns as the
 * Node sidecar process. It runs BEFORE Next boots, so it can only use
 * plain Node (no TypeScript, no Next imports, no workspace paths).
 *
 * Responsibilities:
 *   1. Load the per-user JSON config from the platform app-data dir and
 *      copy every string entry into `process.env` so that API routes
 *      can read API keys the same way they do on Vercel.
 *   2. Log what we loaded (to stdout — Tauri captures this).
 *   3. `require('./server.js')` — the Next.js standalone server.
 *
 * This file is copied to `resources/app/start.js` by
 * `scripts/copy-standalone-to-resources.ps1` during the Windows build.
 * The Next standalone `server.js` sits in the same directory at runtime,
 * so the `./server.js` require resolves correctly.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function getDesktopConfigPath() {
  const override = process.env.MASHUPFORGE_CONFIG_DIR;
  if (override) return path.join(override, 'config.json');

  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'MashupForge', 'config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'MashupForge', 'config.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'MashupForge', 'config.json');
}

function hydrateDesktopEnv() {
  const cfgPath = getDesktopConfigPath();
  if (!fs.existsSync(cfgPath)) {
    return { loaded: false, path: cfgPath, keys: [] };
  }
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { loaded: false, path: cfgPath, keys: [], error: 'config.json must be a JSON object' };
    }
    const keys = [];
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) {
        process.env[k] = v;
        keys.push(k);
      }
    }
    return { loaded: true, path: cfgPath, keys };
  } catch (e) {
    return { loaded: false, path: cfgPath, keys: [], error: e && e.message };
  }
}

const result = hydrateDesktopEnv();
if (result.loaded) {
  console.log(`[tauri-wrapper] hydrated ${result.keys.length} env vars from ${result.path}`);
  console.log(`[tauri-wrapper] keys: ${result.keys.join(', ')}`);
} else if (result.error) {
  console.warn(`[tauri-wrapper] config load error at ${result.path}: ${result.error}`);
} else {
  console.log(`[tauri-wrapper] no config at ${result.path} — starting with inherited env only`);
}

// Default bind: 127.0.0.1 on whatever PORT the Rust launcher passed in.
// Next standalone reads HOSTNAME + PORT from env.
if (!process.env.HOSTNAME) process.env.HOSTNAME = '127.0.0.1';
if (!process.env.PORT) process.env.PORT = '0';

console.log(`[tauri-wrapper] booting Next on ${process.env.HOSTNAME}:${process.env.PORT}`);

require('./server.js');
