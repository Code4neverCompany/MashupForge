/**
 * GET /api/mmx/availability
 *
 * Cheap probe used by the studio UI to gate the music / speech / video
 * affordances. Wraps `isAvailable()` from lib/mmx-client which shells
 * out to `mmx --version` with a 5s timeout. Same auth model as the
 * other /api/mmx routes — unauthenticated, intended for the single-user
 * desktop deployment.
 */

import { NextResponse } from 'next/server';
import { isAvailable } from '@/lib/mmx-client';

export async function GET(): Promise<Response> {
  const available = await isAvailable();
  return NextResponse.json(
    { available },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
