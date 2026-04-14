import { NextResponse } from 'next/server';
import { getPiModels, isPiInstalled } from '@/lib/pi-setup';
import { getErrorMessage } from '@/lib/errors';

export async function GET() {
  try {
    if (!isPiInstalled()) {
      return NextResponse.json({ error: 'pi not installed', models: [] }, { status: 503 });
    }
    const models = getPiModels();
    return NextResponse.json({ models });
  } catch (e: unknown) {
    console.error('pi/models error:', e);
    return NextResponse.json(
      { error: getErrorMessage(e), models: [] },
      { status: 500 }
    );
  }
}
