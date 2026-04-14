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

// Hard-pin loopback binding.
//
// Windows Defender Firewall prompts "Allow this app through the firewall"
// the first time an unsigned .exe binds to a non-loopback interface
// (0.0.0.0 or a real NIC). Binding only to 127.0.0.1 / ::1 is exempt from
// the prompt. We therefore force HOSTNAME to loopback AFTER config
// hydration so a stray `"HOSTNAME": "0.0.0.0"` entry in the user's
// config.json cannot accidentally escape the loopback cage and trigger
// the Defender dialog on first launch. Same for HOST, which some Node
// web frameworks prefer.
const LOOPBACK = '127.0.0.1';
for (const key of ['HOSTNAME', 'HOST']) {
  if (process.env[key] && process.env[key] !== LOOPBACK) {
    console.warn(
      `[tauri-wrapper] overriding ${key}=${process.env[key]} -> ${LOOPBACK} ` +
      '(desktop mode pins loopback to avoid Windows Firewall prompts)'
    );
  }
  process.env[key] = LOOPBACK;
}
if (!process.env.PORT) process.env.PORT = '0';

console.log(`[tauri-wrapper] booting Next on ${process.env.HOSTNAME}:${process.env.PORT}`);

require('./server.js');
