import { NextResponse } from 'next/server';
import { installPi, isPiInstalled } from '@/lib/pi-setup';

export async function POST() {
  if (isPiInstalled()) {
    return NextResponse.json({ success: true, alreadyInstalled: true });
  }
  const result = installPi();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
