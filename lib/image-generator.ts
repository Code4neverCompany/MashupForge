/**
 * Provider-aware image generation entry point.
 *
 * Two named providers, no automatic fallback (the user picks):
 *   - 'leonardo': existing Leonardo flow via /api/leonardo (server-side route
 *     that talks to the Leonardo v2 REST API). The pipeline already calls
 *     this directly; we expose it here so callers can pick at runtime.
 *   - 'mmx':      MiniMax CLI via lib/mmx-client.ts. Returns URL or base64
 *     depending on opts. Surfaces MmxQuotaError so callers know the user's
 *     Token Plan does not include the requested model — the caller is
 *     responsible for telling the user, not for silently swapping providers.
 *
 * Per Maurice's brief update: NO automatic fallback between providers.
 * Letting one provider silently take over for another hides cost shifts
 * (Leonardo credits ↔ MiniMax tokens) and obscures actual quality
 * differences in user feedback. The user opts in per generation.
 */

import { generateImage as mmxGenerateImage, type MmxImageOptions } from './mmx-client';

export type ImageProvider = 'leonardo' | 'mmx';

export interface ImageProviderResult {
  /** The provider that produced the result. Echoes the request. */
  provider: ImageProvider;
  /** Public-fetchable URLs for each generated image. May be empty if the
   * provider returned only file paths or base64 — callers should consult
   * the other fields too. */
  urls: string[];
  /** Local file paths. Set when MMX was asked to write to disk. */
  files: string[];
  /** Base64-encoded payloads. Set when responseFormat='base64'. */
  base64: string[];
}

export interface LeonardoBackendOptions {
  /**
   * Hostname (with protocol) of the running app. Server-side routes
   * sometimes need to call /api/leonardo on themselves; pass the base
   * URL when the caller is not the browser. Defaults to a relative
   * fetch from the browser side.
   */
  baseUrl?: string;
  /** Forwarded as the JSON body to /api/leonardo. */
  body: Record<string, unknown>;
  /** Optional abort signal forwarded to the underlying fetch. */
  signal?: AbortSignal;
}

export interface MmxBackendOptions extends MmxImageOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type GenerateRequest =
  | { provider: 'leonardo'; prompt: string; leonardo: LeonardoBackendOptions }
  | { provider: 'mmx'; prompt: string; mmx?: MmxBackendOptions };

/**
 * Generate one or more images via the requested provider.
 *
 * Throws whatever the underlying backend throws (Leonardo HTTP errors,
 * MmxError / MmxQuotaError from mmx-client). No fallback — the caller
 * decides what to do on failure.
 */
export async function generateImage(req: GenerateRequest): Promise<ImageProviderResult> {
  if (req.provider === 'leonardo') {
    return generateViaLeonardo(req.prompt, req.leonardo);
  }
  return generateViaMmx(req.prompt, req.mmx ?? {});
}

async function generateViaLeonardo(
  prompt: string,
  opts: LeonardoBackendOptions,
): Promise<ImageProviderResult> {
  const url = `${opts.baseUrl ?? ''}/api/leonardo`;
  const body = { ...opts.body, prompt };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Leonardo provider failed (${res.status}): ${text || res.statusText}`);
  }
  const parsed = (await res.json()) as { urls?: string[]; images?: Array<{ url?: string }>; sdGenerationJob?: unknown };
  // Leonardo v2 returns several shapes; tolerate them: top-level `urls`,
  // an `images: [{url}]` list, or a `sdGenerationJob` wrapper that
  // requires polling. We just collect any URLs we can see.
  const urls: string[] = [];
  if (Array.isArray(parsed.urls)) {
    for (const u of parsed.urls) if (typeof u === 'string') urls.push(u);
  }
  if (Array.isArray(parsed.images)) {
    for (const img of parsed.images) {
      if (img && typeof img.url === 'string') urls.push(img.url);
    }
  }
  return { provider: 'leonardo', urls, files: [], base64: [] };
}

async function generateViaMmx(
  prompt: string,
  opts: MmxBackendOptions,
): Promise<ImageProviderResult> {
  const result = await mmxGenerateImage(prompt, opts, {
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  });
  return {
    provider: 'mmx',
    urls: result.urls,
    files: result.files,
    base64: result.base64,
  };
}

/**
 * List the providers callers may pass. Static for now; later this can
 * read enabled-provider state from settings or capability probes.
 */
export const IMAGE_PROVIDERS: readonly ImageProvider[] = ['leonardo', 'mmx'] as const;

/** Type guard for narrowing a string from settings/UI to ImageProvider. */
export function isImageProvider(value: unknown): value is ImageProvider {
  return value === 'leonardo' || value === 'mmx';
}
