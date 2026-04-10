import { NextResponse } from 'next/server';
import { getPiModels, isPiInstalled } from '@/lib/pi-setup';

export async function GET() {
  if (!isPiInstalled()) {
    return NextResponse.json({ error: 'pi not installed', models: [] }, { status: 503 });
  }
  const models = getPiModels();
  return NextResponse.json({ models });
}
