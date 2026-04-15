import { NextResponse } from 'next/server';
import { start, getStatus, setUserSystemPrompt } from '@/lib/pi-client';
import { getErrorMessage } from '@/lib/errors';
import { isServerless } from '@/lib/runtime-env';

export async function POST(req: Request) {
  if (isServerless()) {
    return NextResponse.json(
      { success: false, error: 'pi start is desktop-only — sidecar process is unavailable on serverless runtimes.' },
      { status: 503 },
    );
  }
  try {
    let body: Record<string, unknown> | null = null;
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
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(e) || 'failed to start pi' },
      { status: 500 }
    );
  }
}
