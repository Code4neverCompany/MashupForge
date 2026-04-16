import { describe, it, expect } from 'vitest';
import { resolveInstagramCredentials } from '@/lib/instagram-credentials';

// INSTAGRAM-CRED-FIX regression gate for the env-first resolver. Both
// /api/social/post and /api/social/best-times call this helper. If
// anyone changes the fallback order or accidentally coerces undefined
// to '', the desktop origin-drift bug Maurice hit returns.
describe('resolveInstagramCredentials', () => {
  it('prefers env vars over body (desktop path)', () => {
    const result = resolveInstagramCredentials(
      { INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_ACCESS_TOKEN: 'EAAenv' },
      { igAccountId: '999', accessToken: 'EAAbody' },
    );
    expect(result.igAccountId).toBe('123');
    expect(result.igAccessToken).toBe('EAAenv');
  });

  it('falls through to body when env is undefined (web path)', () => {
    const result = resolveInstagramCredentials(
      {},
      { igAccountId: '999', accessToken: 'EAAbody' },
    );
    expect(result.igAccountId).toBe('999');
    expect(result.igAccessToken).toBe('EAAbody');
  });

  it('returns empty strings when neither source provides a value', () => {
    const result = resolveInstagramCredentials({}, undefined);
    expect(result.igAccountId).toBe('');
    expect(result.igAccessToken).toBe('');
  });

  it('handles partial env (account id only) with body token fallback', () => {
    const result = resolveInstagramCredentials(
      { INSTAGRAM_ACCOUNT_ID: '123' },
      { igAccountId: '999', accessToken: 'EAAbody' },
    );
    expect(result.igAccountId).toBe('123');
    expect(result.igAccessToken).toBe('EAAbody');
  });

  it('handles partial env (token only) with body account-id fallback', () => {
    const result = resolveInstagramCredentials(
      { INSTAGRAM_ACCESS_TOKEN: 'EAAenv' },
      { igAccountId: '999', accessToken: 'EAAbody' },
    );
    expect(result.igAccountId).toBe('999');
    expect(result.igAccessToken).toBe('EAAenv');
  });

  it('treats undefined body as missing without throwing', () => {
    const result = resolveInstagramCredentials(
      { INSTAGRAM_ACCOUNT_ID: '123', INSTAGRAM_ACCESS_TOKEN: 'EAAenv' },
      undefined,
    );
    expect(result.igAccountId).toBe('123');
    expect(result.igAccessToken).toBe('EAAenv');
  });

  it('uses body values when env keys are present but undefined', () => {
    // Vercel / `npm run dev` ship a process.env object that simply
    // doesn't have these keys — make sure the `??` chain treats that
    // the same as `{}`.
    const env: { INSTAGRAM_ACCOUNT_ID?: string; INSTAGRAM_ACCESS_TOKEN?: string } = {
      INSTAGRAM_ACCOUNT_ID: undefined,
      INSTAGRAM_ACCESS_TOKEN: undefined,
    };
    const result = resolveInstagramCredentials(env, {
      igAccountId: '999',
      accessToken: 'EAAbody',
    });
    expect(result.igAccountId).toBe('999');
    expect(result.igAccessToken).toBe('EAAbody');
  });
});
