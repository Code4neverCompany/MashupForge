# Content Tab UX + Trending API Improvements

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Content tab (Sidebar.tsx), Trending API (/api/trending/route.ts)

## Overview

Two improvements to the content generation pipeline:
1. Replace raw JSON stream with formatted idea cards after stream completes
2. Improve trending API with smarter queries, targeted subreddits, and caching

---

## Feature 1: Content Tab Idea Cards

### Current Behavior
- Pi streams raw JSON `[{context, concept}, ...]` into the chat
- After stream ends, text is replaced with "Generated N ideas"
- Ideas are added to the Ideas Board but not visible in the chat

### New Behavior
1. User sends message → chat shows "⏳ Researching trending topics..." → "📈 Found trending topics! ⏳ Generating trend-aware ideas..."
2. Pi streams live → raw text shown in chat (unchanged)
3. Stream ends → JSON parsed → **raw stream message is replaced** with formatted idea cards
4. Each card: context as title, concept as 3-line preview, "Added to Ideas Board" badge
5. Trending sources remain as clickable links below the cards
6. If JSON unparseable → fallback: raw text stays, badge shows "Could not parse ideas"

### Data Structure Changes

**Sidebar.tsx — Message interface:**
```ts
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  trendingSources?: TrendSource[];
  ideas?: Array<{ context: string; concept: string }>;
}
```

New field: `ideas`. When set, the rendering logic switches from raw text to idea cards.

### Rendering

New inline section in Sidebar.tsx (no separate component file needed — the block is small):

- Container: `div.mt-2.space-y-2` with `border-l-2 border-emerald-500/30 pl-3`
- Each card: title (context) in `text-sm text-white font-medium`, preview (concept) in `text-xs text-zinc-400 line-clamp-3`, badge `text-[10px] text-emerald-400`
- Cards are clickable → `setComparisonPrompt(concept)` loads the prompt into the Studio tab

### Edge Cases
- Stream produces valid JSON with 0 ideas → show "No ideas found, try again"
- Stream produces invalid JSON → keep raw text, no ideas field
- Stream is empty → show error message

---

## Feature 2: Trending API Improvements

### Current Behavior
- Queries: `"${niche} trending 2026"` — too generic
- Sources: Google News RSS + generic Reddit search
- No caching, every content generation hits external APIs

### New Behavior

#### 2a. Smarter Queries

Build franchise-aware search terms from niches and idea concept:

- If ideaConcept contains franchise names (Star Wars, Marvel, DC, Warhammer, etc.), extract character/pairing combos for targeted searches
- Pair niches into combos: "Star Wars Marvel crossover art" instead of "Multiverse Mashup trending 2026"
- Priority: ideaConcept-specific > niche combos > single niches
- Max 6 queries total (unchanged)

#### 2b. Targeted Subreddits + New Sources

**Reddit:** Search specific subreddits instead of site-wide:
- `r/MarvelStudios`, `r/StarWars`, `r/Warhammer40k`, `r/DCcomics`
- `r/ImaginaryCharacterArt`, `r/DigitalArt`
- Use `restrict_sr=true` when querying subreddit collections
- Fallback: generic reddit search if targeted subs return < 2 results

**New sources (if RSS available):**
- ArtStation trending (check for public RSS)
- DeviantArt popular (check for public RSS)

Each new source follows the same pattern: async fetch with 8s timeout, try/catch, returns `TrendResult[]`.

#### 2c. In-Memory Cache

```ts
const cache = new Map<string, { results: TrendResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

- Cache key: sorted, joined search terms
- On request: check cache first, return if fresh
- After fetch: store results with timestamp
- No external cache dependency — module-level Map survives within the Next.js server process

### Error Handling
- Each source API: 8s timeout, try/catch, returns [] on failure
- Minimum 1 result needed for trending summary injection into prompt
- If all sources fail: trending block omitted from prompt (existing behavior)

---

## Files Changed

| File | Change |
|------|--------|
| `components/Sidebar.tsx` | Add `ideas` field to Message, add idea cards rendering block, replace stream message on parse success |
| `app/api/trending/route.ts` | Smarter queries, targeted subreddits, optional new sources, in-memory cache |

## Out of Scope
- Google Search Grounding via Gemini SDK (future consideration)
- modelOptimizer changes (already addressed separately)
- Studio tab changes (already addressed separately)
- External search API dependencies (SerpAPI, SearXNG)
