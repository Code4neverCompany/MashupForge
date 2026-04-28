/**
 * MMX CLI client — typed wrapper around MiniMax's `mmx` binary.
 *
 * Runs each command as a one-shot child process with `--output json`, parses
 * the result, and surfaces structured errors. We always use spawn() with an
 * argument array (never a shell string) so user-supplied prompts and queries
 * cannot be interpreted as shell metacharacters — important because every
 * caller of these helpers eventually feeds in user-controlled text.
 *
 * Configuration:
 *   - MMX_BIN  (env)  override the binary path. Default: "mmx" (PATH lookup).
 *   - MMX_API_KEY / MINIMAX_API_KEY (env) consumed by mmx itself; we just pass
 *     environment through. We never accept an api-key argument from callers.
 *
 * NOT done in this module:
 *   - Caching, retries, rate limiting — caller's responsibility.
 *   - Image-provider fallback to Leonardo — see lib/image-generator.ts.
 *   - Public-asset wiring of file outputs (music, speech, video) — caller
 *     decides where to write and how to expose.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import type { spawn as SpawnFn } from 'node:child_process';

const MMX_BIN = process.env.MMX_BIN ?? 'mmx';

// Test-injection seam. The default is the real node:child_process.spawn;
// tests replace it via {@link __setSpawnForTests} to avoid invoking the
// real mmx binary. Keeping the seam in the module is more robust than
// vi.mock('node:child_process') across vitest's varying behavior with
// built-in modules under jsdom.
let _spawn: typeof SpawnFn = nodeSpawn;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MmxError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'MmxError';
  }
}

/**
 * Thrown when the user's MiniMax Token Plan does not include the requested
 * model (e.g. image-01 on a non-Plus plan). Callers — especially image gen —
 * should treat this as "MMX unavailable, try the fallback provider", not as
 * a generic failure.
 */
export class MmxQuotaError extends MmxError {
  constructor(message: string, hint?: string) {
    super(4, message, hint);
    this.name = 'MmxQuotaError';
  }
}

/** Thrown when the binary itself cannot be spawned (not installed, ENOENT). */
export class MmxSpawnError extends MmxError {
  constructor(message: string) {
    super('SPAWN', message);
    this.name = 'MmxSpawnError';
  }
}

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

export interface MmxRunOptions {
  /** Hard timeout. Process is SIGTERM'd if exceeded. Default: 5 minutes. */
  timeoutMs?: number;
  /** Abort signal. Aborting kills the in-flight subprocess. */
  signal?: AbortSignal;
}

interface MmxRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runMmx(args: string[], opts: MmxRunOptions = {}): Promise<MmxRunResult> {
  return new Promise((resolve, reject) => {
    const child = _spawn(MMX_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.once('error', (err) => {
      clearTimeout(timer);
      reject(new MmxSpawnError(`failed to spawn ${MMX_BIN}: ${err.message}`));
    });

    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? -1,
      });
    });
  });
}

interface MmxJsonError {
  code?: number | string;
  message?: string;
  hint?: string;
}

/**
 * Run mmx with --output json prepended; parse stdout and surface structured
 * errors. Throws {@link MmxQuotaError} for plan-restriction errors so callers
 * can choose to fall back to a different provider rather than re-throw.
 */
async function runMmxJson<T>(args: string[], opts: MmxRunOptions = {}): Promise<T> {
  const fullArgs = ['--output', 'json', ...args];
  const result = await runMmx(fullArgs, opts);

  let parsed: unknown;
  if (result.stdout.trim()) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new MmxError(
        'PARSE',
        `mmx returned non-JSON output (exit ${result.exitCode}): ${result.stdout.slice(0, 200)}`,
      );
    }
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const err = (parsed as { error: MmxJsonError }).error;
    const code = err.code ?? 'UNKNOWN';
    const msg = err.message ?? 'mmx error';
    const hint = err.hint;
    if (code === 4 || /token plan|not support|requires the Plus plan/i.test(msg)) {
      throw new MmxQuotaError(msg, hint);
    }
    throw new MmxError(code, msg, hint);
  }

  if (result.exitCode !== 0) {
    throw new MmxError(
      result.exitCode,
      `mmx exited ${result.exitCode}: ${result.stderr.trim() || 'no stderr'}`,
    );
  }

  return parsed as T;
}

// Push --flag / --flag <value> pairs onto an args array, skipping undefined.
function pushFlag(args: string[], flag: string, value: string | number | undefined): void {
  if (value === undefined) return;
  args.push(flag, String(value));
}
function pushBool(args: string[], flag: string, value: boolean | undefined): void {
  if (value) args.push(flag);
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export interface MmxImageOptions {
  aspectRatio?: string;
  n?: number;
  seed?: number;
  width?: number;
  height?: number;
  promptOptimizer?: boolean;
  aigcWatermark?: boolean;
  responseFormat?: 'url' | 'base64';
  outDir?: string;
  outPrefix?: string;
}

export interface MmxImageResult {
  /** Image URLs when responseFormat is "url" (default) or unspecified. */
  urls: string[];
  /** Local file paths when --out / --out-dir was requested. */
  files: string[];
  /** Base64-encoded payloads when responseFormat is "base64". */
  base64: string[];
}

interface MmxImageJsonResponse {
  data?: { image_urls?: string[]; image_base64?: string[] };
  // Some mmx versions surface saved file paths under output_files; we tolerate either shape.
  output_files?: string[];
  files?: string[];
  // Fallback shapes — accept whatever the CLI emits and pick what we can.
  urls?: string[];
}

export async function generateImage(
  prompt: string,
  opts: MmxImageOptions = {},
  runOpts?: MmxRunOptions,
): Promise<MmxImageResult> {
  const args = ['image', 'generate', '--prompt', prompt];
  pushFlag(args, '--aspect-ratio', opts.aspectRatio);
  pushFlag(args, '--n', opts.n);
  pushFlag(args, '--seed', opts.seed);
  pushFlag(args, '--width', opts.width);
  pushFlag(args, '--height', opts.height);
  pushBool(args, '--prompt-optimizer', opts.promptOptimizer);
  pushBool(args, '--aigc-watermark', opts.aigcWatermark);
  pushFlag(args, '--response-format', opts.responseFormat);
  pushFlag(args, '--out-dir', opts.outDir);
  pushFlag(args, '--out-prefix', opts.outPrefix);

  const json = await runMmxJson<MmxImageJsonResponse>(args, runOpts);
  return {
    urls: json.data?.image_urls ?? json.urls ?? [],
    files: json.output_files ?? json.files ?? [],
    base64: json.data?.image_base64 ?? [],
  };
}

// ---------------------------------------------------------------------------
// Music generation
// ---------------------------------------------------------------------------

export interface MmxMusicOptions {
  lyrics?: string;
  instrumental?: boolean;
  lyricsOptimizer?: boolean;
  vocals?: string;
  genre?: string;
  mood?: string;
  instruments?: string;
  tempo?: string;
  bpm?: number;
  key?: string;
  avoid?: string;
  useCase?: string;
  structure?: string;
  out?: string;
}

export interface MmxMusicResult {
  /** Saved file path if --out was supplied. */
  path?: string;
  /** Raw response payload for callers that want the URL or audio bytes ref. */
  raw: unknown;
}

export async function generateMusic(
  prompt: string,
  opts: MmxMusicOptions = {},
  runOpts?: MmxRunOptions,
): Promise<MmxMusicResult> {
  if (opts.lyricsOptimizer && (opts.lyrics || opts.instrumental)) {
    throw new MmxError(
      'INVALID',
      'lyricsOptimizer cannot be combined with lyrics or instrumental',
    );
  }
  if (opts.instrumental && opts.lyrics) {
    throw new MmxError('INVALID', 'instrumental cannot be combined with lyrics');
  }

  const args = ['music', 'generate', '--prompt', prompt];
  pushFlag(args, '--lyrics', opts.lyrics);
  pushBool(args, '--instrumental', opts.instrumental);
  pushBool(args, '--lyrics-optimizer', opts.lyricsOptimizer);
  pushFlag(args, '--vocals', opts.vocals);
  pushFlag(args, '--genre', opts.genre);
  pushFlag(args, '--mood', opts.mood);
  pushFlag(args, '--instruments', opts.instruments);
  pushFlag(args, '--tempo', opts.tempo);
  pushFlag(args, '--bpm', opts.bpm);
  pushFlag(args, '--key', opts.key);
  pushFlag(args, '--avoid', opts.avoid);
  pushFlag(args, '--use-case', opts.useCase);
  pushFlag(args, '--structure', opts.structure);
  pushFlag(args, '--out', opts.out);

  const json = await runMmxJson<{ output_file?: string; path?: string }>(args, runOpts);
  return { path: json.output_file ?? json.path ?? opts.out, raw: json };
}

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export interface MmxVideoOptions {
  model?: string;
  firstFrame?: string;
  lastFrame?: string;
  subjectImage?: string;
  callbackUrl?: string;
  download?: string;
  /** Don't wait for completion — return the task id immediately. */
  noWait?: boolean;
  pollIntervalSeconds?: number;
}

export interface MmxVideoResult {
  /** Set when --no-wait is used (or when mmx returns one before completion). */
  taskId?: string;
  /** Local file path if --download was supplied AND the task completed. */
  path?: string;
  raw: unknown;
}

interface MmxVideoJsonResponse {
  task_id?: string;
  taskId?: string;
  output_file?: string;
  path?: string;
}

export async function generateVideo(
  prompt: string,
  opts: MmxVideoOptions = {},
  runOpts?: MmxRunOptions,
): Promise<MmxVideoResult> {
  const args = ['video', 'generate', '--prompt', prompt];
  pushFlag(args, '--model', opts.model);
  pushFlag(args, '--first-frame', opts.firstFrame);
  pushFlag(args, '--last-frame', opts.lastFrame);
  pushFlag(args, '--subject-image', opts.subjectImage);
  pushFlag(args, '--callback-url', opts.callbackUrl);
  pushFlag(args, '--download', opts.download);
  pushBool(args, '--no-wait', opts.noWait);
  pushFlag(args, '--poll-interval', opts.pollIntervalSeconds);

  const json = await runMmxJson<MmxVideoJsonResponse>(args, runOpts);
  return {
    taskId: json.task_id ?? json.taskId,
    path: json.output_file ?? json.path ?? opts.download,
    raw: json,
  };
}

// ---------------------------------------------------------------------------
// Speech synthesis
// ---------------------------------------------------------------------------

export interface MmxSpeechOptions {
  model?: string;
  voice?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  format?: string;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
  language?: string;
  subtitles?: boolean;
  out?: string;
}

export interface MmxSpeechResult {
  path?: string;
  raw: unknown;
}

export async function synthesizeSpeech(
  text: string,
  opts: MmxSpeechOptions = {},
  runOpts?: MmxRunOptions,
): Promise<MmxSpeechResult> {
  const args = ['speech', 'synthesize', '--text', text];
  pushFlag(args, '--model', opts.model);
  pushFlag(args, '--voice', opts.voice);
  pushFlag(args, '--speed', opts.speed);
  pushFlag(args, '--volume', opts.volume);
  pushFlag(args, '--pitch', opts.pitch);
  pushFlag(args, '--format', opts.format);
  pushFlag(args, '--sample-rate', opts.sampleRate);
  pushFlag(args, '--bitrate', opts.bitrate);
  pushFlag(args, '--channels', opts.channels);
  pushFlag(args, '--language', opts.language);
  pushBool(args, '--subtitles', opts.subtitles);
  pushFlag(args, '--out', opts.out);

  const json = await runMmxJson<{ output_file?: string; path?: string }>(args, runOpts);
  return { path: json.output_file ?? json.path ?? opts.out, raw: json };
}

// ---------------------------------------------------------------------------
// Vision (image describe)
// ---------------------------------------------------------------------------

export interface MmxVisionOptions {
  /** Question about the image. Default: "Describe the image." */
  prompt?: string;
}

export interface MmxVisionResult {
  description: string;
  raw: unknown;
}

interface MmxVisionJsonResponse {
  description?: string;
  text?: string;
  data?: { description?: string; text?: string };
}

/**
 * Describe an image. Pass either a local file path / URL via `imageOrFileId`
 * (mmx auto base64-encodes local files) OR pass `{fileId: "..."}` to use a
 * pre-uploaded MiniMax file ID.
 */
export async function describeImage(
  source: { image: string } | { fileId: string },
  opts: MmxVisionOptions = {},
  runOpts?: MmxRunOptions,
): Promise<MmxVisionResult> {
  const args = ['vision', 'describe'];
  if ('image' in source) {
    args.push('--image', source.image);
  } else {
    args.push('--file-id', source.fileId);
  }
  pushFlag(args, '--prompt', opts.prompt);

  const json = await runMmxJson<MmxVisionJsonResponse>(args, runOpts);
  const description = json.description ?? json.text ?? json.data?.description ?? json.data?.text ?? '';
  return { description, raw: json };
}

// ---------------------------------------------------------------------------
// Web search
// ---------------------------------------------------------------------------

export interface MmxSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface MmxSearchJsonResponse {
  organic?: MmxSearchResult[];
}

export async function webSearch(
  query: string,
  runOpts?: MmxRunOptions,
): Promise<MmxSearchResult[]> {
  const args = ['search', 'query', '--q', query];
  const json = await runMmxJson<MmxSearchJsonResponse>(args, runOpts);
  return json.organic ?? [];
}

// ---------------------------------------------------------------------------
// Health / availability
// ---------------------------------------------------------------------------

/**
 * Probe whether mmx is callable in the current environment. Cheap: shells out
 * to `mmx --version` with a 5s timeout and reports back. Use this to gate UI
 * affordances (the music button, etc.) instead of catching exceptions inside
 * a hot path.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const result = await runMmx(['--version'], { timeoutMs: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// Test-only: replace the spawn implementation. Pass `null` to restore the
// default `node:child_process.spawn`. Not part of the public API.
export function __setSpawnForTests(fn: typeof SpawnFn | null): void {
  _spawn = fn ?? nodeSpawn;
}

// Test-only export so unit tests can construct args without re-implementing
// pushFlag / pushBool. Not part of the public API.
export const __test = { runMmx, runMmxJson };
