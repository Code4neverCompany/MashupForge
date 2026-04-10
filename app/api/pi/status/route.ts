import { NextResponse } from 'next/server';
import { piStatusSnapshot } from '@/lib/pi-setup';
import { getStatus } from '@/lib/pi-client';

export async function GET() {
  const setup = piStatusSnapshot();
  const runtime = getStatus();
  return NextResponse.json({
    installed: setup.installed,
    authenticated: setup.authenticated,
    piPath: setup.piPath,
    modelsAvailable: setup.modelsAvailable,
    running: runtime.running,
    provider: runtime.provider,
    model: runtime.model,
    lastError: runtime.lastError,
  });
}
