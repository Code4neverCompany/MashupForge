/**
 * Concept Art Negative Prompt Library
 *
 * Leonardo v2 API (nano-banana-2, nano-banana-pro, gpt-image-1.5) does NOT
 * support a separate negative_prompt parameter — sending it triggers a 400.
 * Instead, we inject these as explicit "AVOID" / "DO NOT INCLUDE" instructions
 * directly into the prompt text.
 *
 * Categories:
 *  - text artifacts (watermarks, labels, captions, logos)
 *  - concept art specific (grid layouts, multiple poses, reference sheets)
 *  - quality issues (blur, noise, compression artifacts)
 *  - anatomical (extra fingers, mutated hands, fused limbs)
 *  - composition (cropped, out of frame, asymmetry errors)
 */

/** Master negative prompt — appended to ALL concept art prompts. */
export const CONCEPT_ART_NEGATIVES = [
  // Text artifacts
  'no text', 'no words', 'no letters', 'no watermarks', 'no signatures',
  'no logos', 'no stamps', 'no captions', 'no subtitles', 'no UI elements',
  'no HUD overlay', 'no price tags', 'no filenames',

  // Concept art sheet artifacts
  'no character sheet', 'no reference sheet', 'no turnarounds',
  'no multiple views', 'no grid layout', 'no comparison panels',
  'no concept art layout', 'no front/side/back views', 'no expression sheet',
  'no pose sheet', 'no sprite sheet', 'no thumbnail grid',

  // Quality issues
  'no blurry regions', 'no noise', 'no compression artifacts',
  'no jpeg artifacts', 'no pixelation', 'no banding', 'no chromatic aberration',
  'no lens flare artifacts', 'no chromatic noise',

  // Anatomical
  'no extra fingers', 'no mutated hands', 'no fused fingers',
  'no extra limbs', 'no missing limbs', 'no disproportionate anatomy',
  'no floating limbs', 'no backward hands', 'no crossed eyes',

  // Composition
  'no cropped subjects', 'no out of frame elements', 'no duplicate subjects',
  'no floating heads', 'no disembodied parts', 'no empty space with floating objects',
].join(', ');

/** Shorter version for prompts already near token limits. */
export const CONCEPT_ART_NEGATIVES_SHORT = [
  'no text', 'no watermarks', 'no signatures', 'no logos',
  'no character sheet', 'no reference sheet', 'no grid layout', 'no multiple views',
  'no blurry regions', 'no compression artifacts', 'no extra fingers',
  'no mutated hands', 'no extra limbs', 'no cropped subjects',
].join(', ');

/**
 * Build the negative injection string to append to a prompt.
 * Tries to keep the full prompt under ~900 chars to avoid truncation.
 */
export function buildConceptArtPrompt(prompt: string): string {
  const negBlock = prompt.length > 600
    ? CONCEPT_ART_NEGATIVES_SHORT
    : CONCEPT_ART_NEGATIVES;

  return `${prompt}. Avoid: ${negBlock}`;
}

/**
 * Detect if a prompt looks like concept art (vs photorealistic, abstract, etc.)
 * so we only inject negatives when relevant.
 */
export function isConceptArtPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const conceptKeywords = [
    'concept art', 'concept design', 'character design', 'creature design',
    'environment design', 'weapon design', 'vehicle design', 'armor design',
    'fantasy character', 'sci-fi character', 'superhero', 'villain design',
    'monster design', 'robot design', 'mech design', 'alien design',
    'digital illustration', 'digital art', 'illustration style',
    'game art', 'game character', 'fan art', 'crossover',
    'mashup', 'reimagined', 'redesign', 'reinterpretation',
  ];
  return conceptKeywords.some(kw => lower.includes(kw));
}
