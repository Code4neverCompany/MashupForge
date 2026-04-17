/**
 * Pi installation and status helpers. Server-side only — uses node:fs and
 * node:child_process which aren't available in the browser. Meant to run
 * under the Tauri desktop sidecar; the `tmpdir()` fallbacks exist solely
 * to keep `next dev` runnable on a dev box where MASHUPFORGE_PI_DIR isn't
 * set.
 */

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir, platform } from 'node:os';
import { dirname, join } from 'node:path';

const isWindows = platform() === 'win32';

// Pinned version for runtime install reproducibility. Bump here when
// upgrading — keep in sync with the devDependency in package.json.
const PI_CLI_VERSION = '0.67.6';

/**
 * Translate common Node errno codes into Windows-specific user-facing guidance.
 * Desktop users see these in the Settings / install flow and have no way to
 * interpret raw EACCES / ENOENT / EINVAL strings. Each branch explains the
 * likely cause AND the concrete action to take.
 *
 * Non-Windows callers fall through to the raw message unchanged so Linux/macOS
 * dev output isn't cluttered.
 */
function humanizeWindowsError(e: unknown, context: 'mkdir' | 'write' | 'spawn' | 'install', path?: string): string {
  const err = e as NodeJS.ErrnoException | undefined;
  const raw = (err && err.message) || String(e);
  if (!isWindows) return raw;

  const code = err?.code;
  const where = path ? ` at ${path}` : '';

  if (code === 'ENOENT' && context === 'spawn') {
    return (
      'Node.js not found. MashupForge needs Node.js 22 LTS on PATH to install pi. ' +
      'Download the installer from https://nodejs.org/ and relaunch MashupForge. ' +
      `(underlying error: ${raw})`
    );
  }
  if (code === 'ENOENT') {
    return (
      `Path not found${where}. ` +
      'If your %APPDATA% folder is redirected to OneDrive, the redirect may be broken. ' +
      `(underlying error: ${raw})`
    );
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return (
      `Permission denied${where}. Likely causes on Windows: ` +
      '(1) antivirus is quarantining the MashupForge install folder — add an exclusion for %APPDATA%\\MashupForge; ' +
      '(2) OneDrive "Files On-Demand" has the folder locked — right-click → Always keep on this device; ' +
      '(3) Controlled folder access is blocking writes — allow MashupForge in Windows Security → Virus & threat protection → Ransomware protection. ' +
      `(underlying error: ${raw})`
    );
  }
  if (code === 'EINVAL' && context === 'spawn') {
    return (
      'Node.js is too old to safely spawn .cmd files. Upgrade to Node 18.20.2+, 20.12.2+, or 22.x and relaunch. ' +
      `(underlying error: ${raw})`
    );
  }
  if (code === 'ENOSPC') {
    return (
      `Disk full${where}. Free up space on the %APPDATA% drive and try again. ` +
      `(underlying error: ${raw})`
    );
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENETUNREACH') {
    return (
      'Network error reaching the npm registry. Check your internet connection and any corporate proxy. ' +
      'If you are on a corporate network, set HTTPS_PROXY before launching MashupForge. ' +
      `(underlying error: ${raw})`
    );
  }
  return raw;
}

/**
 * Writable install prefix.
 *
 * Tauri desktop: Rust launcher sets `MASHUPFORGE_PI_DIR` to a user-writable
 * APPDATA subdirectory (e.g. `%APPDATA%\MashupForge\pi`). That's where pi
 * gets installed on first launch and where it's found on subsequent launches.
 *
 * Dev (`next dev`, no launcher): no env var, fall back to `tmpdir()` so
 * the install still lands somewhere writable.
 */
function getLocalPrefix(): string {
  const override = process.env.MASHUPFORGE_PI_DIR;
  if (override) return override;
  return join(tmpdir(), 'mashupforge-pi-install');
}

/**
 * Resolve the pi shim path inside an install prefix. Windows npm writes
 * shims as `<prefix>/pi.cmd` at the prefix root; POSIX npm writes them as
 * `<prefix>/bin/pi`.
 */
function getLocalBin(): string {
  const prefix = getLocalPrefix();
  return isWindows ? join(prefix, 'pi.cmd') : join(prefix, 'bin', 'pi');
}

/**
 * Writable HOME for spawned npm. If the process HOME doesn't exist or
 * isn't writable, npm fails to create its cache before it can even fetch
 * a package. Point HOME at a tmpdir we know exists.
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
    getLocalBin(),
    join(homedir(), '.hermes', 'node', 'bin', 'pi'),
    '/usr/local/bin/pi',
    '/usr/bin/pi',
  ].filter(Boolean) as string[];
}

/**
 * Resolve pi's underlying JavaScript entry point, given the path to the
 * `pi.cmd` shim on Windows. Needed because Node 18.20.2+ refuses to spawn
 * `.cmd` / `.bat` files without `shell: true` (CVE-2024-27980), but
 * `shell: true` breaks the stdin/stdout RPC pipe we need for long-lived
 * pi. Bypassing the shim lets us spawn `node.exe <entry>` directly with
 * a clean argv array.
 *
 * Layout (npm --prefix install on Windows):
 *   <prefix>/pi.cmd                                             ← shim
 *   <prefix>/node_modules/@mariozechner/pi-coding-agent/<bin>   ← real entry
 *
 * Reads `bin.pi` (or the scalar `bin` field) from the package's own
 * `package.json` so we don't hardcode a path that may shift between
 * package versions.
 */
export function resolvePiJsEntry(piCmdPath: string): string | null {
  const prefix = dirname(piCmdPath);
  const pkgDir = join(prefix, 'node_modules', '@mariozechner', 'pi-coding-agent');
  const pkgJson = join(pkgDir, 'package.json');
  try {
    if (!existsSync(pkgJson)) return null;
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    let relEntry: string | undefined;
    if (typeof pkg.bin === 'string') {
      relEntry = pkg.bin;
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      relEntry = pkg.bin.pi ?? Object.values(pkg.bin)[0];
    }
    if (!relEntry) return null;
    const full = join(pkgDir, relEntry);
    return existsSync(full) ? full : null;
  } catch {
    return null;
  }
}

/** Resolve the pi binary path, preferring known install dirs, then PATH. */
export function getPiPath(): string | null {
  // Check known install locations FIRST — on Tauri desktop, PATH lookup
  // ("which" / "where") might hit a stale global install from a previous
  // user session, while MASHUPFORGE_PI_DIR is the canonical per-app path.
  for (const candidate of piCandidates()) {
    try {
      if (existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  // PATH fallback — only meaningful on POSIX dev boxes where pi is globally
  // installed. `where` is the Windows equivalent of `which`.
  const lookup = isWindows ? 'where' : 'which';
  const res = spawnSync(lookup, ['pi'], { encoding: 'utf8' });
  if (res.status === 0 && res.stdout.trim()) {
    return res.stdout.trim().split(/\r?\n/)[0];
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
  diagnostics?: Record<string, unknown>;
}

/**
 * Install pi via npm into an app-owned prefix. We avoid `-g` because the
 * default global prefix isn't writable under the Tauri sidecar (APPDATA
 * instead of Program Files). Installing into `MASHUPFORGE_PI_DIR` with an
 * explicit HOME keeps the binary at a known candidate path and makes it
 * visible across launches without touching machine-wide state.
 */
export function installPi(): InstallPiResult {
  const localPrefix = getLocalPrefix();
  const diagnostics: Record<string, unknown> = {
    cwd: process.cwd(),
    localPrefix,
    processEnvHome: process.env.HOME ?? null,
    osHomedir: (() => { try { return homedir(); } catch (e) { return `error:${(e as Error).message}`; } })(),
    tmpdir: tmpdir(),
    nodeVersion: process.version,
  };
  try {
    mkdirSync(localPrefix, { recursive: true });
    diagnostics.localPrefixMkdir = 'ok';
  } catch (e) {
    diagnostics.localPrefixMkdir = `error:${(e as Error).message}`;
    console.error('[pi-install] localPrefix mkdir failed', diagnostics);
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: `Failed to create install prefix ${localPrefix}: ${humanizeWindowsError(e, 'mkdir', localPrefix)}`,
      diagnostics,
    };
  }

  // Probe actual write access to localPrefix — mkdir can succeed on a
  // read-only overlay while writeFileSync still fails later.
  const writeProbe = join(localPrefix, '.write-probe');
  try {
    writeFileSync(writeProbe, 'ok');
    unlinkSync(writeProbe);
    diagnostics.localPrefixWritable = true;
  } catch (e) {
    diagnostics.localPrefixWritable = `error:${(e as Error).message}`;
  }

  const home = ensureWritableHome();
  diagnostics.resolvedHome = home;
  diagnostics.resolvedHomeExists = existsSync(home);

  // Probe write access to resolved HOME too.
  try {
    const homeProbe = join(home, '.write-probe');
    writeFileSync(homeProbe, 'ok');
    unlinkSync(homeProbe);
    diagnostics.homeWritable = true;
  } catch (e) {
    diagnostics.homeWritable = `error:${(e as Error).message}`;
  }

  const env = {
    ...process.env,
    HOME: home,
    npm_config_cache: join(home, '.npm-cache'),
    npm_config_logs_dir: join(home, '.npm-logs'),
    npm_config_prefix: localPrefix,
    // Silence update-notifier writes into HOME.
    NO_UPDATE_NOTIFIER: '1',
  };
  diagnostics.spawnEnv = {
    HOME: env.HOME,
    npm_config_cache: env.npm_config_cache,
    npm_config_logs_dir: env.npm_config_logs_dir,
    npm_config_prefix: env.npm_config_prefix,
    PATH: process.env.PATH ?? null,
  };

  // On Windows, `npm` is a `.cmd` shim. Since Node's CVE-2024-27980 fix,
  // spawning .cmd/.bat files requires `shell: true`; without it Node throws
  // EINVAL. With `shell: true`, Node joins argv with spaces and hands it
  // to cmd.exe without quoting — so any arg containing a space (like
  // `C:\Users\Firstname Lastname\AppData\Roaming\MashupForge\pi`) gets
  // re-split by cmd.exe and npm sees a mangled `--prefix`. Pre-quote every
  // arg that can contain a Windows path or spaces.
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const quoteWinArg = (a: string) =>
    isWindows && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
  const spawnOpts = {
    encoding: 'utf8' as const,
    timeout: 5 * 60 * 1000,
    env,
    shell: isWindows,
  };

  // Log npm version to confirm which npm we're even calling.
  try {
    const nv = spawnSync(npmCmd, ['--version'], spawnOpts);
    diagnostics.npmVersion = nv.stdout?.trim() || `status=${nv.status} err=${nv.stderr?.trim()}`;
  } catch (e) {
    diagnostics.npmVersion = `error:${(e as Error).message}`;
  }

  const result = spawnSync(
    npmCmd,
    [
      'install',
      '--prefix',
      quoteWinArg(localPrefix),
      '--global',
      `@mariozechner/pi-coding-agent@${PI_CLI_VERSION}`,
    ],
    spawnOpts,
  );

  diagnostics.npmStatus = result.status;
  diagnostics.npmSignal = result.signal;
  if (result.error) {
    diagnostics.spawnError = result.error.message;
    return {
      success: false,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: humanizeWindowsError(result.error, 'spawn'),
      diagnostics,
    };
  }

  const success = result.status === 0;
  const piPath = getPiPath() || undefined;
  diagnostics.resolvedPiPath = piPath ?? null;

  // npm ran but exited non-zero. Surface the tail of stderr with a Windows
  // hint so users get something actionable instead of raw npm verbiage.
  if (!success) {
    const stderrTail = (result.stderr || '').slice(-400).trim();
    const hint = isWindows
      ? ' — on Windows, the most common causes are antivirus quarantining ' +
        '%APPDATA%\\MashupForge\\pi or a corporate proxy blocking registry.npmjs.org. ' +
        'Try adding a Defender exclusion for %APPDATA%\\MashupForge and set HTTPS_PROXY if you are on a VPN.'
      : '';
    diagnostics.humanizedError = `npm install exited with status ${result.status}${hint}`;
  }

  // On success, make the freshly-installed binary visible to later spawns in
  // this same Node process (pi-client etc.) without requiring a server restart.
  if (success && piPath) {
    const binDir = isWindows ? localPrefix : join(localPrefix, 'bin');
    const sep = isWindows ? ';' : ':';
    if (!process.env.PATH?.split(sep).includes(binDir)) {
      process.env.PATH = `${binDir}${sep}${process.env.PATH || ''}`;
    }
  }

  const finalError = !success
    ? `npm install failed (exit ${result.status}). ${(result.stderr || '').slice(-300).trim()}${
        isWindows
          ? ' — common Windows fixes: add a Windows Defender exclusion for %APPDATA%\\MashupForge, ' +
            'ensure you are not behind a blocking corporate proxy, and verify Node 22 LTS is installed.'
          : ''
      }`
    : !piPath
      ? isWindows
        ? `npm reported success but pi.cmd was not found at ${localPrefix}\\pi.cmd. ` +
          'Antivirus (especially Windows Defender and third-party suites) sometimes quarantines ' +
          'freshly-installed .cmd shims. Check your quarantine list and add an exclusion for ' +
          '%APPDATA%\\MashupForge\\pi, then retry installation.'
        : 'npm reported success but pi binary not found'
      : undefined;

  return {
    success: success && !!piPath,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: finalError,
    piPath,
    diagnostics,
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

  // On Windows, pi.cmd can't be spawned without `shell: true` (CVE-2024-27980),
  // and shell mode mangles stdout capture. Resolve the underlying .js entry
  // and call it via `node.exe` directly. `process.execPath` in the Tauri
  // sidecar is the bundled node.exe.
  let cmd = piPath;
  let args = ['--list-models'];
  if (isWindows && piPath.toLowerCase().endsWith('.cmd')) {
    const jsEntry = resolvePiJsEntry(piPath);
    if (jsEntry) {
      cmd = process.execPath;
      args = [jsEntry, '--list-models'];
    }
  }

  const result = spawnSync(cmd, args, {
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
