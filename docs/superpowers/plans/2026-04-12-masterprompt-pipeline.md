# Plan: Masterprompt Pipeline Overhaul

## Problem
Current prompt pipeline produces generic "X meets Y on Z" prompts. The enhance step rewrites prompts through a second LLM pass, adding generic quality boosters (8K, volumetric lighting, ray tracing) as noise. This degrades specificity instead of improving it.

## Solution
Based on analysis of 26 high-quality masterprompts, restructure the pipeline into two clean roles:

### Role 1: Content Creator (useImageGeneration.ts — idea generation)
Generates the SHORT IDEA (1-2 sentences) — the raw concept. This stays mostly as-is.

### Role 2: Master Prompt Creator (modelOptimizer.ts → rename/refactor)
Takes the short idea and EXPANDS it into a full masterprompt using the proven patterns. This replaces the current enhance step.

## Changes Required

### 1. Create Masterprompt Template (`lib/masterpromptTemplate.ts` — NEW FILE)

This file contains the template instructions that get injected into the prompt generation. It should NOT be a separate API call — it should be part of the idea generation prompt itself, so we get ONE high-quality prompt in a single pass.

The template teaches the AI to write prompts following these patterns:

#### Pattern A: Character Reimagined (default)
Structure: "[Character] reimagined as [Specific Role from Universe B]"
- Must include EQUIPMENT FUSION (compound inventions from both universes)
- Must include SPECIFIC PROPER NOUNS (not generic "a space marine" — "Inquisitor of the Ordo Malleus")
- Must include MATERIAL/AESTHETIC DETAILS (ornate, battle-scarred, gold-leafed, ceramite, etc.)
- Must include SETTING with atmosphere (not just "dark city" — "rain-slicked gothic gargoyle above neon-dystopian Gotham-Terra")

#### Pattern B: Cinematic What-If Event (for multi-franchise epics)
Structure: "In a cinematic 'what-if' event titled '[TITLE]: [SUBTITLE]'"
- Must have CAUSAL CHAIN (trigger → consequence → escalation → stakes)
- Must have ALLIANCE FORMATION (who teams up and WHY)
- Must have EQUIPMENT FUSION for each character
- Must have a NAMED THREAT with specific mechanics

#### Pattern C: Epic Crossover Scene (for dramatic confrontations)
Structure: "An [adjective] [shot type] of [Characters] [action]"
- Must describe ONE SPECIFIC MOMENT, not a collage
- Must have VISUAL CLASH between the aesthetics of each universe
- Must have DYNAMIC ACTION (clashing weapons, energy, movement)

#### Vocabulary Bank (bake into template):
- Armor: ornate, battle-scarred, battle-worn, matte-black, obsidian, ceramite, auramite, artificer, baroque
- Metal: gold-leafed, brass, filigree, scrollwork, gothic arches, etched, engraved
- Lighting: chiaroscuro, volumetric, rim lighting, god-rays, dramatic, cinematic, moody
- Atmosphere: embers, smoke, incense, fog, debris, toxic ash, sparks, rain-slicked
- Scale: massive, colossal, gargantuan, monolithic, towering
- Quality (INLINE, not as separate fields): 8k resolution, hyper-realistic, Unreal Engine 5 render, cinematic masterpiece, photorealistic textures

#### Visual Directive Format (append to EVERY prompt):
"[prompt body].. Art style: [style]. Lighting: [lighting]. Camera angle: [angle]. Highly detailed, cinematic composition."

### 2. Modify `hooks/useImageGeneration.ts`

**The idea generation prompt (lines 217-232) needs the masterprompt template baked in.**

Change from:
```
Generate 4 completely distinct, highly detailed image generation prompts.
Ensure maximum variety in characters, franchises, and settings.
```

To something like:
```
You are a MASTER PROMPT CREATOR for a multiverse crossover image generator.

Your job: take the user's concept and expand it into a CINEMATIC MASTERPROMPT — a single, vivid, hyper-detailed image prompt that produces stunning AI art.

[... full template with Pattern A/B/C instructions, vocabulary bank, equipment fusion rules ...]

Generate 4 prompts. Each must follow one of the three patterns (vary them). Each prompt must:
1. Pick a SPECIFIC CHARACTER with a SPECIFIC ROLE from another universe
2. Include at least 2 EQUIPMENT FUSIONS (compound inventions blending both universes)
3. Use PROPER NOUNS — never generic descriptors
4. Describe MATERIAL TEXTURES (metal, armor, cloth) with specific adjectives
5. Set the ATMOSPHERE (lighting, weather, particles, smoke)
6. End with: ".. Art style: [style]. Lighting: [type]. Camera angle: [angle]. Highly detailed, cinematic composition."

Return JSON array of 4 objects with: prompt, aspectRatio, tags, negativePrompt
```

Also update the "enhance custom prompts" path (lines 252-264) with the same template.

### 3. Simplify `lib/modelOptimizer.ts`

The `enhancePromptForModel` function currently:
- Sends the prompt through a SECOND LLM call to rewrite it
- Adds generic quality boosters
- Returns a rewritten prompt

Change it to:
- ONLY select style, aspect ratio, and negative prompt as METADATA
- DO NOT rewrite the prompt text — return it unchanged
- The prompt already has quality signals baked in from the masterprompt template
- Remove the "QUALITY BOOSTERS" section entirely
- Remove the prompt rewriting instruction

The function signature stays the same (ModelEnhancement) but `prompt` is always returned as `basePrompt` unchanged. Only style/aspectRatio/negativePrompt are selected.

### 4. Remove `lib/negativePrompts.ts` dependency from the enhance step

Negative prompts should come from the masterprompt creator (Role 2), not bolted on after. The template already instructs the AI to write smart, specific negative prompts per image.

## File Changes Summary

| File | Action |
|------|--------|
| `lib/masterpromptTemplate.ts` | NEW — template string + vocabulary bank |
| `hooks/useImageGeneration.ts` | MODIFY — inject template into idea generation prompt |
| `lib/modelOptimizer.ts` | MODIFY — stop rewriting prompt text, only select metadata |
| `types/mashup.ts` | No changes needed (MODEL_PROMPT_GUIDES still useful for style/ratio hints) |

## Verification
1. Generate 4 auto-prompts and check they follow Pattern A/B/C structure
2. Check that equipment fusions are present in every prompt
3. Check that quality signals (8k, Unreal Engine 5, etc.) are inline in prompt text
4. Check that the enhance step does NOT rewrite the prompt
5. Run `npx tsc --noEmit` to verify no type errors
6. Test full generation flow end-to-end
