import { NextResponse } from 'next/server';

/**
 * Proxy the Hermes bridge's GET /models endpoint so the browser-side
 * Settings UI can enumerate available providers + models without needing
 * direct access to 127.0.0.1:8090.
 */
const BRIDGE_URL = process.env.HERMES_BRIDGE_URL || 'http://127.0.0.1:8090';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerFilter = url.searchParams.get('provider');
    const target = providerFilter
      ? `${BRIDGE_URL}/models?provider=${encodeURIComponent(providerFilter)}`
      : `${BRIDGE_URL}/models`;

    const res = await fetch(target, { method: 'GET' });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Bridge /models error (${res.status}): ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Hermes bridge unreachable: ${err?.message || err}` },
      { status: 502 }
    );
  }
}
