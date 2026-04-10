import { NextResponse } from 'next/server';
import { start, getStatus, setUserSystemPrompt } from '@/lib/pi-client';

export async function POST(req: Request) {
  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }
    if (body && typeof body.systemPrompt === 'string') {
      setUserSystemPrompt(body.systemPrompt);
    }
    await start();
    return NextResponse.json({ success: true, status: getStatus() });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'failed to start pi' },
      { status: 500 }
    );
  }
}
