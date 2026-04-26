/**
 * V080-DES-003 — single source of truth for the default agent system
 * prompt, parameterised by the user's selected niches and genres.
 *
 * Why this lives in lib/: SettingsModal's "Reset to Default" button
 * used to write a hardcoded paragraph that named "Marvel, DC, Star
 * Wars, Warhammer 40k" regardless of what the user had picked. Pulling
 * the prompt builder out of the component lets us interpolate the
 * actual selections (or fall back to the curated defaults if the user
 * has cleared everything) and keeps the same template usable from
 * anywhere else that needs to seed a fresh agent (onboarding, tests).
 *
 * The runtime call sites (useImageGeneration, usePipelineDaemon,
 * useIdeaProcessor) already append the LIVE niches/genres to whatever
 * `agentPrompt` contains at request time, so this template is the
 * "personality" baseline — the focus tags it lists set the agent's
 * default frame, and the live tag list overrides on every call.
 */

export const DEFAULT_NICHES: readonly string[] = [
  'Multiverse Mashup',
  'Fan Fiction & Lore',
  'Merchandise & Collectibles',
  'Cosplay & Fan Art',
  'Pop Culture Crossovers',
  'Alternate Realities',
  'Sci-Fi & Fantasy',
  'Retro & Nostalgia',
  'Cyberpunk & Futurism',
  'Grimdark & Gothic',
  'Street-Level Heroes',
  'Galactic Empires',
  'Eldritch Horrors',
  'Mythic Legends',
];

export const DEFAULT_GENRES: readonly string[] = [
  'Visual Storytelling',
  'High Contrast',
  'Emotional Resonance',
  'Cinematic Crossovers',
  'What If Scenarios',
  'Alternative Timelines',
  'Epic Battles',
  'Character Dialogues',
  'Behind-the-Scenes Concepts',
  'Meme-worthy Mashups',
  'Deep Lore Explorations',
  'Hyper-Realistic',
  'Dramatic Lighting',
  'Epic Action',
  'Concept Art',
  'Digital Illustration',
  'Noir & Gritty',
  'Vibrant & Neon',
  'Surreal & Abstract',
  'Minimalist Design',
];

export interface BuildAgentPromptInput {
  niches?: readonly string[] | null;
  genres?: readonly string[] | null;
}

const FALLBACK_NICHE_PHRASE = 'whichever niche the user is exploring';
const FALLBACK_GENRE_PHRASE = 'across a flexible range of styles';

/**
 * Build the default agent system prompt. Both inputs are optional: if
 * the caller passes empty/missing arrays the prompt falls back to a
 * neutral phrase so the user reads something coherent instead of
 * "specialise in ()".
 */
export function buildDefaultAgentPrompt({ niches, genres }: BuildAgentPromptInput = {}): string {
  const nicheList = (niches && niches.length > 0) ? niches : null;
  const genreList = (genres && genres.length > 0) ? genres : null;

  const nichePhrase = nicheList
    ? `the ${nicheList.join(' / ')} space`
    : FALLBACK_NICHE_PHRASE;
  const genrePhrase = genreList
    ? `with a strong emphasis on ${genreList.slice(0, 6).join(', ')}${genreList.length > 6 ? `, and ${genreList.length - 6} more` : ''}`
    : FALLBACK_GENRE_PHRASE;

  return [
    `You are a Master Content Creator and Social Media Growth Strategist. Your mission is to generate high-impact, viral-potential image prompts that drive massive traffic and engagement.`,
    `You specialise in ${nichePhrase}, leaning into "what if" scenarios, alternative timelines, and epic cinematic crossovers — ${genrePhrase}.`,
    `Every prompt you generate must be optimized for visual storytelling, high contrast, and emotional resonance to capture attention on platforms like Instagram, TikTok, and Twitter.`,
    `Research current social media trends, popular crossover memes, and viral "what if" scenarios that fit the active focus tags to ensure your output stays timely.`,
    `Use the Active Niches and Active Genres appended at runtime to strictly influence the style, theme, and technical execution of your output — those override anything in this baseline.`,
  ].join(' ');
}
