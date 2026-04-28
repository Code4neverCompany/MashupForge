/**
 * Provider-agnostic image-prompt builder.
 *
 * Both MMX and Leonardo benefit from the same enhancement step: read the
 * model spec at lib/model-specs/*.json for the user-selected style/preset,
 * append style + quality + mode keywords as natural-language hints to the
 * prompt, and emit provider-specific structured options (mmx flags or
 * Leonardo style UUIDs + dimensions) alongside.
 *
 * One function, one set of inputs, two output shapes — guarantees that
 * MMX and Leonardo are receiving the same intent and produce comparable
 * output for the same user setting.
 *
 * Pure module: no I/O, no spawn — string assembly + structured-flag
 * extraction.
 */

import { getModelSpec, type ModelSpec } from './model-specs';
import type { MmxImageOptions } from './mmx-client';

export interface PromptInjectionInputs {
  /** Model spec key (e.g. "nano-banana-2"). When set, params/styles are
   * pulled from the JSON spec. Unknown keys are ignored gracefully. */
  modelId?: string;
  /** Pick one style by name from spec.styles. Case-insensitive. The UUID
   * value goes into Leonardo's style_ids; the canonical NAME is appended
   * to the prompt as a keyword for both providers. */
  styleName?: string;
  /** Override the aspect ratio. If unset and the spec has aspectRatios,
   * the first ratio is used as the default — matching how the Leonardo
   * flow already treats the spec's first entry as canonical. */
  aspectRatio?: string;
  /** Tier of the dimension table to pick (e.g. "1K", "2K", "4K"). When
   * unset, the first sub-entry of the chosen aspect ratio is used. */
  dimensionTier?: string;
  /** Image count, propagated to mmxOptions.n and leonardoOptions.quantity. */
  count?: number;
  /** Optional free-text quality hint appended to the prompt last
   * (e.g. "ultra-detailed, cinematic lighting"). */
  qualityHint?: string;
}

export interface LeonardoBuilderOptions {
  /** Style UUIDs resolved from spec.styles[styleName]. Empty if no
   * style was requested or the style name is not in the spec. */
  styleIds?: string[];
  /** Maps to Leonardo's `quantity` parameter. */
  quantity?: number;
  /** Width/height paired from spec.aspectRatios[ratio][tier]. */
  width?: number;
  height?: number;
  /** Default quality from spec.parameters.quality. Forwarded as-is so the
   * route can use the spec's documented enum value (e.g. "HIGH"). */
  quality?: string;
  /** Default mode from spec.parameters.mode (e.g. "ULTRA"). */
  mode?: string;
  /** Maps to Leonardo's `prompt_enhance` enum: 'ON' | 'OFF'. */
  promptEnhance?: 'ON' | 'OFF';
}

export interface EnhancedPrompt {
  /** Prompt with spec/style/quality hints appended. Use as-is for either
   * provider — keywords are natural language and not provider-specific. */
  prompt: string;
  /** Diagnostic: hints actually appended, in the order they appear. */
  appliedHints: string[];
  /** Structured options for the MMX CLI (`mmx image generate` flags). */
  mmx: MmxImageOptions;
  /** Structured options for the Leonardo /api/leonardo route body. */
  leonardo: LeonardoBuilderOptions;
}

// ---------------------------------------------------------------------------
// Spec readers (small, defensive)
// ---------------------------------------------------------------------------

function paramValue(spec: ModelSpec, key: string): string | undefined {
  const params = spec.parameters as Record<string, unknown> | undefined;
  const entry = params?.[key];
  if (!entry || typeof entry !== 'object') return undefined;
  const e = entry as { value?: unknown; default?: unknown };
  if (typeof e.value === 'string' || typeof e.value === 'number') return String(e.value);
  if (typeof e.default === 'string' || typeof e.default === 'number') return String(e.default);
  return undefined;
}

function firstAspectRatio(spec: ModelSpec): string | undefined {
  const ratios = spec.aspectRatios;
  if (!ratios || typeof ratios !== 'object') return undefined;
  const keys = Object.keys(ratios as Record<string, unknown>);
  return keys[0];
}

function findStyleEntry(spec: ModelSpec, requested: string):
  | { name: string; id?: string }
  | undefined {
  const styles = spec.styles;
  if (!styles || typeof styles !== 'object') return undefined;
  const lookup = requested.trim().toLowerCase();
  for (const [name, id] of Object.entries(styles)) {
    if (name.toLowerCase() === lookup) {
      return { name, id: typeof id === 'string' ? id : undefined };
    }
  }
  return undefined;
}

/**
 * Resolve [width, height] from spec.aspectRatios[ratio][tier]. The
 * dimension tables in the model specs look like:
 *   "1:1": { "1K": [1024,1024], "2K": [2048,2048], "4K": [4096,4096] }
 * Return undefined when the spec has no dimension table or the requested
 * ratio/tier doesn't exist; callers fall through silently.
 */
function dimsFromSpec(
  spec: ModelSpec,
  ratio: string | undefined,
  tier: string | undefined,
): { width: number; height: number } | undefined {
  if (!ratio) return undefined;
  const ratios = spec.aspectRatios as Record<string, unknown> | undefined;
  const ratioEntry = ratios?.[ratio];
  if (!ratioEntry || typeof ratioEntry !== 'object') return undefined;
  const entries = ratioEntry as Record<string, unknown>;
  const tierKey = tier && tier in entries ? tier : Object.keys(entries)[0];
  if (!tierKey) return undefined;
  const dims = entries[tierKey];
  if (!Array.isArray(dims) || dims.length < 2) return undefined;
  const [w, h] = dims;
  if (typeof w !== 'number' || typeof h !== 'number') return undefined;
  return { width: w, height: h };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose an enhanced prompt + per-provider structured options from a base
 * prompt and a model-spec selector. Pure function — safe to call from
 * tests, route handlers, or cron without side effects.
 *
 * Both `result.mmx` and `result.leonardo` are always populated. Callers
 * pluck the slice they need based on the user-selected provider; the
 * shared `result.prompt` ensures both providers see the same intent.
 *
 * QA-W3 — wiring follow-up: production callers (e.g. `useImageGeneration.ts`,
 * `/api/leonardo`, `/api/mmx/image`) still hand-build the Leonardo body
 * and bypass this helper. The library is tested and ready; the wiring
 * is tracked in `docs/bmad/stories/STORY-MMX-PROMPT-WIRE.md` so a
 * future commit can replace the ad-hoc path in one go.
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  inputs: PromptInjectionInputs = {},
): EnhancedPrompt {
  const spec = inputs.modelId ? getModelSpec(inputs.modelId) : undefined;
  const hintParts: string[] = [];
  const mmx: MmxImageOptions = {};
  const leonardo: LeonardoBuilderOptions = {};

  // Style: spec-validated → keyword in prompt + UUID for Leonardo.
  // Bare strings (no spec) still go in as keywords for both providers.
  if (inputs.styleName) {
    if (spec) {
      const found = findStyleEntry(spec, inputs.styleName);
      if (found) {
        hintParts.push(`style: ${found.name}`);
        if (found.id) leonardo.styleIds = [found.id];
      }
    } else {
      hintParts.push(`style: ${inputs.styleName.trim()}`);
    }
  }

  // Aspect ratio — explicit override > first spec entry > nothing.
  const aspect = inputs.aspectRatio ?? (spec ? firstAspectRatio(spec) : undefined);
  if (aspect) {
    mmx.aspectRatio = aspect;
    hintParts.push(`aspect ratio: ${aspect}`);
    if (spec) {
      const dims = dimsFromSpec(spec, aspect, inputs.dimensionTier);
      if (dims) {
        leonardo.width = dims.width;
        leonardo.height = dims.height;
      }
    }
  }

  // Quality / mode pulled from the spec when present. Forwarded as prompt
  // keywords for both providers; Leonardo also gets them as structured
  // params it can pass to its REST API.
  if (spec) {
    const quality = paramValue(spec, 'quality');
    if (quality) {
      hintParts.push(`quality: ${quality}`);
      leonardo.quality = quality;
    }
    const mode = paramValue(spec, 'mode');
    if (mode) {
      hintParts.push(`mode: ${mode}`);
      leonardo.mode = mode;
    }
    const promptEnhance = paramValue(spec, 'prompt_enhance');
    if (promptEnhance) {
      const upper = promptEnhance.toUpperCase();
      if (upper === 'ON') {
        mmx.promptOptimizer = true;
        leonardo.promptEnhance = 'ON';
      } else if (upper === 'OFF') {
        leonardo.promptEnhance = 'OFF';
      }
    }
  }

  // Free-text quality hint from caller (after spec hints).
  if (inputs.qualityHint && inputs.qualityHint.trim()) {
    hintParts.push(inputs.qualityHint.trim());
  }

  // Image count — both providers.
  if (inputs.count && inputs.count > 0) {
    mmx.n = inputs.count;
    leonardo.quantity = inputs.count;
  }

  const prompt = hintParts.length > 0
    ? `${basePrompt.trim()}. ${hintParts.join(', ')}`
    : basePrompt.trim();

  return { prompt, appliedHints: hintParts, mmx, leonardo };
}
