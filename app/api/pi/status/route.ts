import { NextResponse } from 'next/server';
import { piStatusSnapshot } from '@/lib/pi-setup';
import { getStatus } from '@/lib/pi-client';
import { getErrorMessage } from '@/lib/errors';

export async function GET() {
  try {
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
  } catch (e: unknown) {
    console.error('pi/status error:', e);
    return NextResponse.json({
      installed: false,
      authenticated: false,
      piPath: null,
      modelsAvailable: 0,
      running: false,
      provider: null,
      model: null,
      lastError: getErrorMessage(e),
    }, { status: 200 });
  }
}
