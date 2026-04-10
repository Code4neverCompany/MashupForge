import { NextResponse } from 'next/server';
import { stop, getStatus } from '@/lib/pi-client';

export async function POST() {
  stop();
  return NextResponse.json({ success: true, status: getStatus() });
}
