/**
 * Structured model specs. One JSON file per model describing its full
 * API surface: allowed parameters, capabilities (what it can / cannot
 * do), style palette with UUIDs, aspect-ratio → dimension table, and
 * hard rules. pi.dev reads these to pick per-model parameters rather
 * than the legacy free-text API-doc blobs.
 */

import gptImage15 from './gpt-image-1.5.json';
import gptImage2 from './gpt-image-2.json';
import nanoBanana2 from './nano-banana-2.json';
import nanoBananaPro from './nano-banana-pro.json';
import kling30 from './kling-3.0.json';
import klingO3 from './kling-o3.json';
import veo31 from './veo-3.1.json';
import seedance20 from './seedance-2.0.json';

export interface ModelSpecCapabilities {
  styles?: boolean;
  negativePrompt?: boolean;
  imageSize?: boolean;
  alchemy?: boolean;
  presetStyles?: boolean;
  tiling?: boolean;
  audio?: boolean;
  promptEnhance?: boolean;
  startFrame?: boolean;
  endFrame?: boolean;
  imageReference?: boolean;
  videoReference?: boolean;
  seed?: boolean;
}

export interface ModelSpec {
  modelId: string;
  apiName: string;
  type: 'image' | 'video';
  endpoint: string;
  parameters: Record<string, unknown>;
  aspectRatios?: Record<string, unknown>;
  capabilities: ModelSpecCapabilities;
  styles?: Record<string, string>;
  rules: string[];
}

const MODEL_SPECS: Record<string, ModelSpec> = {
  'gpt-image-1.5': gptImage15 as unknown as ModelSpec,
  'gpt-image-2': gptImage2 as unknown as ModelSpec,
  'nano-banana-2': nanoBanana2 as unknown as ModelSpec,
  'nano-banana-pro': nanoBananaPro as unknown as ModelSpec,
  'kling-3.0': kling30 as unknown as ModelSpec,
  'kling-o3': klingO3 as unknown as ModelSpec,
  'veo-3.1': veo31 as unknown as ModelSpec,
  'seedance-2.0': seedance20 as unknown as ModelSpec,
};

export function getModelSpec(modelId: string): ModelSpec | undefined {
  return MODEL_SPECS[modelId];
}

export function getAllModelSpecs(): Record<string, ModelSpec> {
  return MODEL_SPECS;
}
