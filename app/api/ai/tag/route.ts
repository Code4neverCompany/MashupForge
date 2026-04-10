import { NextResponse } from 'next/server';
import { callAI, parseJSONResponse, errorResponse } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const text = await callAI({
      userPrompt: `Analyze this image prompt: "${prompt}".
Generate a set of 5-8 fitting tags for a gallery.
Include:
- Universe/Franchise (e.g., "Warhammer 40k", "Star Wars", "Marvel")
- Character names
- Style (e.g., "Cinematic", "Cyberpunk", "Grimdark")
- Themes (e.g., "Battle", "Portrait", "Landscape")
Return ONLY a JSON array of strings, nothing else.`,
      maxTokens: 4000,
      expectJSON: true,
    });

    let tags = parseJSONResponse(text);
    if (!Array.isArray(tags) && typeof tags === 'object') {
      // Model might return { tags: [...] }
      tags = tags.tags || Object.values(tags).flat();
    }
    if (Array.isArray(tags)) {
      tags = tags.map((t: string) => t === 'Warhammer 40,000' ? 'Warhammer 40k' : t);
    } else {
      tags = ['Mashup'];
    }

    return NextResponse.json({ tags });
  } catch (error: any) {
    return errorResponse(error);
  }
}
