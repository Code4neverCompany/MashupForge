import { NextRequest, NextResponse } from 'next/server';

/**
 * Trending research endpoint for content pipeline.
 * Takes tags/niches/genres, searches Google News RSS + Reddit JSON
 * for current trending topics, returns a structured summary.
 */

interface TrendingRequest {
  tags?: string[];
  niches?: string[];
  genres?: string[];
  ideaConcept?: string;
}

interface TrendResult {
  topic: string;
  headline: string;
  source: string;
  url: string;
}

async function fetchGoogleNews(query: string): Promise<TrendResult[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: TrendResult[] = [];
    // Simple RSS parsing — extract <title> and <link> from <item> blocks
    const itemRegex = /<item[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<item[\s\S]*?<title>([\s\S]*?)<\/title>/gi;
    const linkRegex = /<link>([\s\S]*?)<\/link>/gi;
    const items_raw = xml.split('<item>');
    for (let i = 1; i < Math.min(items_raw.length, 6); i++) {
      const block = items_raw[i];
      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                         block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      if (titleMatch) {
        items.push({
          topic: query,
          headline: titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim(),
          source: 'Google News',
          url: linkMatch?.[1]?.trim() || '',
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchReddit(query: string): Promise<TrendResult[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&t=week&limit=5`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MashupForge/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items: TrendResult[] = [];
    for (const child of data?.data?.children || []) {
      const post = child.data;
      if (post.title && post.score > 10) {
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

export async function POST(req: NextRequest) {
  try {
    const body: TrendingRequest = await req.json();
    const { tags = [], niches = [], genres = [], ideaConcept = '' } = body;

    // Build search queries from available context
    const searchTerms: string[] = [];

    // Combine tags and niches into focused search queries
    const allTopics = [...new Set([...tags, ...niches])];
    for (const topic of allTopics.slice(0, 5)) {
      searchTerms.push(`${topic} trending 2026`);
    }

    // Add idea-specific searches
    if (ideaConcept) {
      // Extract key entities from the idea concept
      const keywords = ideaConcept
        .split(/[\s,;.]+/)
        .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'what', 'where', 'when'].includes(w.toLowerCase()))
        .slice(0, 3);
      if (keywords.length > 0) {
        searchTerms.push(keywords.join(' ') + ' news');
      }
    }

    // Deduplicate and limit
    const uniqueTerms = [...new Set(searchTerms)].slice(0, 6);

    // Fetch trending data in parallel
    const allResults: TrendResult[] = [];
    const fetches = uniqueTerms.flatMap(term => [
      fetchGoogleNews(term),
      fetchReddit(term),
    ]);

    const results = await Promise.allSettled(fetches);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    // Deduplicate by headline similarity
    const seen = new Set<string>();
    const unique: TrendResult[] = [];
    for (const item of allResults) {
      const key = item.headline.toLowerCase().slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    // Build trending context summary
    const summary = unique.slice(0, 15).map(item =>
      `- [${item.source}] ${item.headline}`
    ).join('\n');

    return NextResponse.json({
      success: true,
      results: unique.slice(0, 15),
      summary,
      queriesUsed: uniqueTerms,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message, results: [], summary: '' },
      { status: 500 }
    );
  }
}
