import { NextResponse } from 'next/server';
import { stop, getStatus } from '@/lib/pi-client';
import { isServerless } from '@/lib/runtime-env';

export async function POST() {
  if (isServerless()) {
    return NextResponse.json(
      { success: false, error: 'pi stop is desktop-only — sidecar process is unavailable on serverless runtimes.' },
      { status: 503 },
    );
  }
  stop();
  return NextResponse.json({ success: true, status: getStatus() });
}
