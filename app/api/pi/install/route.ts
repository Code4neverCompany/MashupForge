import { NextResponse } from 'next/server';
import { getPiPath, installPi } from '@/lib/pi-setup';

export async function POST() {
  const existing = getPiPath();
  if (existing) {
    return NextResponse.json({
      success: true,
      alreadyInstalled: true,
      piPath: existing,
    });
  }
  const result = installPi();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
