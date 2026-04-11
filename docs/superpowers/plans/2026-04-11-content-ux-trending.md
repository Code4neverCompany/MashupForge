# Content Tab UX + Trending API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw JSON stream with formatted idea cards and improve trending API with smarter queries, targeted subreddits, and caching.

**Architecture:** Post-stream transformation — pi streams raw text as before, then on completion the message is replaced with parsed idea cards. Trending API gets better query building, targeted Reddit subreddits, and a 5-minute in-memory cache.

**Tech Stack:** Next.js (App Router), React, TypeScript, pi RPC client, Google News RSS, Reddit JSON API

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/Sidebar.tsx` | Modify | Add `ideas` field to Message interface, replace stream text with idea cards after parse |
| `app/api/trending/route.ts` | Modify | Smarter queries, targeted subreddits, in-memory cache |

---

### Task 1: Add `ideas` field to Message interface

**Files:**
- Modify: `components/Sidebar.tsx:19-26`

- [ ] **Step 1: Add the ideas field to the Message interface**

In `components/Sidebar.tsx`, update the Message interface (lines 19-26) to include an optional `ideas` field:

```ts
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  recommendations?: string[];
  trendingSources?: TrendSource[];
  ideas?: Array<{ context: string; concept: string }>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(sidebar): add ideas field to Message interface"
```

---

### Task 2: Replace stream message with parsed ideas after completion

**Files:**
- Modify: `components/Sidebar.tsx:163-187`

- [ ] **Step 1: Update the post-stream parsing block**

Replace the parsing block (lines 163-187) in the content generator `handleSend` function. This is the section after the `for await` stream loop ends. The new code parses the JSON, stores parsed ideas on the message, and keeps the summary text:

```ts
        let ideaCount = 0;
        let parsedIdeas: Array<{ context: string; concept: string }> = [];
        try {
          const cleaned = acc.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const ideasArray = JSON.parse(cleaned);
          for (const item of ideasArray) {
            if (item.concept) {
              addIdea(item.concept, item.context);
              parsedIdeas.push({ context: item.context || '', concept: item.concept });
              ideaCount++;
            }
          }
        } catch (e) {
          console.error('Failed to parse ideas JSON', e);
        }

        setContentMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? {
                  ...m,
                  text: parsedIdeas.length > 0
                    ? `✨ Generated ${ideaCount} ideas and saved them to your Ideas Board!`
                    : acc,
                  trendingSources: trendingResults,
                  ideas: parsedIdeas.length > 0 ? parsedIdeas : undefined,
                }
              : m
          )
        );
```

Key changes:
- `parsedIdeas` array collects the parsed items separately from `addIdea`
- If parsing succeeds: `text` gets the summary, `ideas` gets the array
- If parsing fails: `text` keeps the raw `acc` stream, `ideas` stays undefined (fallback)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(sidebar): store parsed ideas on message, fallback to raw stream on parse failure"
```

---

### Task 3: Add idea cards rendering in Sidebar

**Files:**
- Modify: `components/Sidebar.tsx` (rendering section, after the existing `trendingSources` block around line 378)

- [ ] **Step 1: Add idea cards rendering block**

In `components/Sidebar.tsx`, after the `trendingSources` rendering block (which ends around line 378), add the idea cards rendering. This goes inside the message rendering loop, after `{msg.trendingSources && ...}`:

```tsx
            {msg.ideas && msg.ideas.length > 0 && (
              <div className="mt-2 space-y-2 w-full pl-3 border-l-2 border-emerald-500/30">
                {msg.ideas.map((idea, j) => (
                  <div
                    key={j}
                    className="group cursor-pointer rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-emerald-500/40 p-2.5 transition-colors"
                    onClick={() => {
                      setComparisonPrompt(idea.concept);
                      setView('compare');
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-white leading-tight">{idea.context || `Idea ${j + 1}`}</p>
                      <span className="shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">On Board</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-3 leading-relaxed">{idea.concept}</p>
                  </div>
                ))}
              </div>
            )}
```

Each card is clickable — clicking loads the concept into the Studio tab via `setComparisonPrompt` and switches to compare view. The "On Board" badge indicates it was added to the Ideas Board.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(sidebar): render parsed ideas as clickable cards with On Board badge"
```

---

### Task 4: Add in-memory cache to trending API

**Files:**
- Modify: `app/api/trending/route.ts` (top of file, before `fetchGoogleNews`)

- [ ] **Step 1: Add cache at module level**

At the top of `app/api/trending/route.ts`, after the interface definitions (after line ~28, before `async function fetchGoogleNews`), add:

```ts
// In-memory cache — prevents API flooding on rapid successive requests.
const trendCache = new Map<string, { results: TrendResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

- [ ] **Step 2: Add cache lookup at start of POST handler**

Inside the `POST` function, after the body destructuring (`const { tags = [], niches = [], genres = [], ideaConcept = '' } = body;`), add cache lookup:

```ts
    // Build a stable cache key from sorted search terms.
    const cacheKeyParts = [...(tags || []), ...(niches || []), ...(genres || [])].sort();
    if (ideaConcept) cacheKeyParts.push(ideaConcept);
    const cacheKey = cacheKeyParts.join('|');

    const cached = trendCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        results: cached.results,
        summary: cached.results.slice(0, 15).map(item => `- [${item.source}] ${item.headline}`).join('\n'),
        queriesUsed: ['(cached)'],
      });
    }
```

- [ ] **Step 3: Store results in cache before returning**

Before the final `return NextResponse.json({ success: true, ...})` at the end of the POST handler, add:

```ts
    // Cache the results for subsequent requests.
    trendCache.set(cacheKey, { results: unique.slice(0, 15), timestamp: Date.now() });

    // Evict stale entries (keep cache bounded).
    if (trendCache.size > 50) {
      const now = Date.now();
      for (const [key, entry] of trendCache) {
        if (now - entry.timestamp > CACHE_TTL) trendCache.delete(key);
      }
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/api/trending/route.ts
git commit -m "feat(trending): add 5-minute in-memory cache with eviction"
```

---

### Task 5: Improve trending API queries and add targeted subreddits

**Files:**
- Modify: `app/api/trending/route.ts`

- [ ] **Step 1: Replace search term building with franchise-aware queries**

Replace the query-building section in the POST handler (the block that builds `searchTerms` from niches/tags). Find the section starting with `// Build search queries from available context` and replace everything through `const uniqueTerms = [...new Set(searchTerms)].slice(0, 6);` with:

```ts
    // Build franchise-aware search queries.
    const FRANCHISE_SUBREDDITS: Record<string, string[]> = {
      'star wars': ['StarWars', 'StarWarsCantina', 'MawInstallation'],
      'marvel': ['MarvelStudios', 'marvelstudiosspoilers', 'comicbooks'],
      'dc': ['DCcomics', 'DC_Cinematic', 'comicbooks'],
      'warhammer': ['Warhammer40k', 'Warhammer', 'ageofsigmar'],
      'anime': ['Anime', 'AnimeArt', 'ImaginaryAnime'],
      'cyberpunk': ['cyberpunkgame', 'cyberpunk'],
      'lord of the rings': ['lotr', 'MiddleEarth'],
    };

    const ART_SUBREDDITS = ['ImaginaryCharacterArt', 'DigitalArt', 'ImaginaryMonsters', 'conceptart'];

    const allTopics = [...new Set([...tags, ...niches])];
    const searchTerms: string[] = [];

    // Idea-specific search — extract keywords for targeted queries.
    if (ideaConcept) {
      const keywords = ideaConcept
        .split(/[\s,;.]+/)
        .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'what', 'where', 'when', 'wielding', 'wearing', 'standing', 'fighting'].includes(w.toLowerCase()))
        .slice(0, 4);
      if (keywords.length > 0) {
        searchTerms.push(keywords.join(' '));
      }
    }

    // Niche-pair combos for crossover-specific results.
    const lowerNiches = allTopics.map(n => n.toLowerCase());
    const franchisePairs: string[][] = [];
    for (let i = 0; i < lowerNiches.length && franchisePairs.length < 3; i++) {
      for (let j = i + 1; j < lowerNiches.length && franchisePairs.length < 3; j++) {
        franchisePairs.push([lowerNiches[i], lowerNiches[j]]);
      }
    }
    for (const [a, b] of franchisePairs) {
      searchTerms.push(`${a} ${b} crossover art`);
    }

    // Single niche fallback.
    for (const topic of allTopics.slice(0, 2)) {
      searchTerms.push(`${topic} art trending`);
    }

    const uniqueTerms = [...new Set(searchTerms)].slice(0, 6);

    // Build targeted subreddit list from matched franchises + art subs.
    const targetedSubs: string[] = [...ART_SUBREDDITS];
    for (const niche of lowerNiches) {
      for (const [franchise, subs] of Object.entries(FRANCHISE_SUBREDDITS)) {
        if (niche.includes(franchise)) {
          targetedSubs.push(...subs);
        }
      }
    }
    const uniqueSubs = [...new Set(targetedSubs)].slice(0, 10);
```

- [ ] **Step 2: Update fetchReddit to accept targeted subreddits**

Replace the existing `fetchReddit` function with a version that accepts optional subreddits:

```ts
async function fetchReddit(query: string, subreddits?: string[]): Promise<TrendResult[]> {
  try {
    let url: string;
    if (subreddits && subreddits.length > 0) {
      // Search across targeted subreddits.
      const subQuery = subreddits.join('+');
      url = `https://www.reddit.com/r/${subQuery}/search.json?q=${encodeURIComponent(query)}&sort=hot&t=week&limit=5&restrict_sr=on`;
    } else {
      url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&t=week&limit=5`;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MashupForge/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items: TrendResult[] = [];
    for (const child of data?.data?.children || []) {
      const post = child.data;
      if (post.title && post.score > 5) {
        items.push({
          topic: query,
          headline: `[${post.score}↑] ${post.title}`,
          source: `r/${post.subreddit}`,
          url: `https://reddit.com${post.permalink}`,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}
```

Key changes: accepts `subreddits` param, uses `restrict_sr=on`, lowered score threshold from 10 to 5 for smaller subreddits.

- [ ] **Step 3: Update the fetch loop to use targeted subreddits**

Replace the fetch execution block (the part that builds `fetches` and runs `Promise.allSettled`). Find the section starting with `const fetches = uniqueTerms.flatMap(...)` and replace:

```ts
    const allResults: TrendResult[] = [];
    const fetches = uniqueTerms.flatMap(term => [
      fetchGoogleNews(term),
      fetchReddit(term, uniqueSubs),
    ]);

    const results = await Promise.allSettled(fetches);
```

This is a small change — `fetchReddit` now receives `uniqueSubs` as second argument.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/api/trending/route.ts
git commit -m "feat(trending): franchise-aware queries, targeted subreddits, lower score threshold"
```

---

### Task 6: Manual verification

**Files:** None — testing only

- [ ] **Step 1: Verify dev server is running**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: 200

If down, start with:
```bash
wt.exe -w 0 new-tab --title "MashupForge" -- bash -ic 'cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14 && npx next dev; exec bash'
```

- [ ] **Step 2: Test content generation in browser**

Open http://localhost:3000, go to Content tab, send a message like "Generate crossover ideas".

Expected behavior:
1. Stream shows raw JSON text during generation
2. After completion, raw text is replaced with formatted idea cards
3. Each card shows context title, concept preview (3 lines), "On Board" badge
4. Trending sources appear as clickable links below cards
5. Clicking a card loads the concept into Studio tab

- [ ] **Step 3: Verify trending cache works**

Send the same content generation message again within 5 minutes. Check browser network tab — the `/api/trending` response should return fast with `"queriesUsed": ["(cached)"]`.

- [ ] **Step 4: Final commit if any hotfixes needed**

```bash
git add -A
git commit -m "fix: post-verification hotfixes for content UX + trending"
```
