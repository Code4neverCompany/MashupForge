/**
 * Inject style / aspect-ratio / quality hints from a model spec into an MMX
 * image-generation request, so that switching the user's selected Leonardo
 * "preset" effectively re-styles the MMX output the same way.
 *
 * The model specs at lib/model-specs/*.json are written for Leonardo's REST
 * API. They list the structured params Leonardo accepts (style UUIDs, mode,
 * quality, aspect-ratio dimension tables). MMX has its own flag set; only a
 * subset overlaps. For the rest we encode the intent as natural-language
 * hints appended to the prompt — `, style: Cyberpunk, quality: HIGH, mode:
 * ULTRA` — which the MiniMax image model handles via `--prompt-optimizer`.
 *
 * Pure module: no I/O, no spawn — just string assembly + structured-flag
 * extraction. Tests are correspondingly cheap.
 */

import { getModelSpec, type ModelSpec } from './model-specs';
import type { MmxImageOptions } from './mmx-client';

export interface PromptInjectionInputs {
  /** Model spec key (e.g. "nano-banana-2"). When set, params/styles are
   * pulled from the JSON spec. Unknown keys are ignored gracefully so the
   * caller can pass a UI-side string without first validating it. */
  modelId?: string;
  /** Pick one style by name from spec.styles. Case-insensitive. The UUID
   * value is Leonardo-only; we inject the style NAME as a prompt keyword. */
  styleName?: string;
  /** Override the aspect ratio used by mmx's `--aspect-ratio` flag. If
   * unset and the spec has aspectRatios, the first ratio is picked as the
   * default — same way Leonardo flows treat the spec's first entry as
   * canonical. */
  aspectRatio?: string;
  /** Number of images, propagated to mmx's `--n` flag. */
  count?: number;
  /** Optional free-text quality hint appended to the prompt
   * (e.g. "ultra-detailed, cinematic lighting"). Appended after spec hints. */
  qualityHint?: string;
}

export interface BuiltPrompt {
  /** Prompt with spec/style hints appended. Ready to pass to mmx-client. */
  prompt: string;
  /** Structured mmx options (aspect ratio, count, prompt-optimizer flag). */
  mmxOptions: MmxImageOptions;
  /** Diagnostic — which hints were actually appended, for logging/UI. */
  appliedHints: string[];
}

/** Pick a parameter value from the spec, falling back to its `default`. */
function paramValue(spec: ModelSpec, key: string): string | undefined {
  const params = spec.parameters as Record<string, unknown> | undefined;
  const entry = params?.[key];
  if (!entry || typeof entry !== 'object') return undefined;
  const e = entry as { value?: unknown; default?: unknown };
  if (typeof e.value === 'string' || typeof e.value === 'number') return String(e.value);
  if (typeof e.default === 'string' || typeof e.default === 'number') return String(e.default);
  return undefined;
}

/** Find the first aspect ratio in spec.aspectRatios, or undefined. */
function firstAspectRatio(spec: ModelSpec): string | undefined {
  const ratios = spec.aspectRatios;
  if (!ratios || typeof ratios !== 'object') return undefined;
  const keys = Object.keys(ratios as Record<string, unknown>);
  return keys[0];
}

/** Look up a style name in the spec, case-insensitive. Returns the
 * canonical-cased name from the spec, or undefined if not found. */
function findStyleName(spec: ModelSpec, requested: string): string | undefined {
  const styles = spec.styles;
  if (!styles || typeof styles !== 'object') return undefined;
  const lookup = requested.trim().toLowerCase();
  for (const name of Object.keys(styles)) {
    if (name.toLowerCase() === lookup) return name;
  }
  return undefined;
}

/**
 * Compose an enhanced prompt + structured mmx options from a base prompt and
 * a model-spec selector. Pure function — safe to call from tests / cron /
 * route handlers without side effects.
 */
export function buildMmxImagePrompt(
  basePrompt: string,
  inputs: PromptInjectionInputs = {},
): BuiltPrompt {
  const spec = inputs.modelId ? getModelSpec(inputs.modelId) : undefined;
  const hintParts: string[] = [];
  const mmxOptions: MmxImageOptions = {};

  // Style: spec-validated name takes precedence; bare strings still go in
  // as keywords if no spec is available.
  if (inputs.styleName) {
    const canonical = spec ? findStyleName(spec, inputs.styleName) : inputs.styleName;
    if (canonical) hintParts.push(`style: ${canonical}`);
  }

  // Aspect ratio — explicit override > first spec entry > nothing.
  const aspect = inputs.aspectRatio ?? (spec ? firstAspectRatio(spec) : undefined);
  if (aspect) {
    mmxOptions.aspectRatio = aspect;
    hintParts.push(`aspect ratio: ${aspect}`);
  }

  // Quality / mode pulled from the spec when present. We forward these as
  // prompt keywords; mmx doesn't have direct `--quality` / `--mode` flags.
  if (spec) {
    const quality = paramValue(spec, 'quality');
    if (quality) hintParts.push(`quality: ${quality}`);
    const mode = paramValue(spec, 'mode');
    if (mode) hintParts.push(`mode: ${mode}`);
    // prompt_enhance ON in the spec → enable mmx's --prompt-optimizer.
    const promptEnhance = paramValue(spec, 'prompt_enhance');
    if (promptEnhance && promptEnhance.toUpperCase() === 'ON') {
      mmxOptions.promptOptimizer = true;
    }
  }

  // Free-text quality hint from caller (e.g. brief snippet "warm dramatic").
  if (inputs.qualityHint && inputs.qualityHint.trim()) {
    hintParts.push(inputs.qualityHint.trim());
  }

  // Image count if specified.
  if (inputs.count && inputs.count > 0) mmxOptions.n = inputs.count;

  const prompt = hintParts.length > 0
    ? `${basePrompt.trim()}. ${hintParts.join(', ')}`
    : basePrompt.trim();

  return { prompt, mmxOptions, appliedHints: hintParts };
}
