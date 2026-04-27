// SCHED-POST-ROBUST: auth surface tests for /api/social/cron-fire.
// We don't exercise the post-firing path (that requires fetch + Redis
// mocks for the whole request lifecycle); just the gate that any
// caller without the right bearer token gets bounced.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/social/cron-fire/route';

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG_ENV };
});

afterEach(() => {
  process.env = ORIG_ENV;
});

function req(authHeader?: string): Request {
  return new Request('http://localhost/api/social/cron-fire', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('cron-fire — auth gate', () => {
  it('returns 503 when CRON_SHARED_SECRET is not configured', async () => {
    delete process.env.CRON_SHARED_SECRET;
    const res = await POST(req('Bearer anything'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/CRON_SHARED_SECRET/);
  });

  it('returns 401 when no Authorization header is sent', async () => {
    process.env.CRON_SHARED_SECRET = 'expected-secret';
    const res = await POST(req(undefined));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token does not match', async () => {
    process.env.CRON_SHARED_SECRET = 'expected-secret';
    const res = await POST(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the header is malformed (missing Bearer prefix)', async () => {
    process.env.CRON_SHARED_SECRET = 'expected-secret';
    const res = await POST(req('expected-secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when token differs by length only', async () => {
    process.env.CRON_SHARED_SECRET = 'expected-secret';
    const res = await POST(req('Bearer expected-secret-extra'));
    expect(res.status).toBe(401);
  });
});
