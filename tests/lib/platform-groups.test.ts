import { describe, it, expect } from 'vitest';
import {
  PLATFORM_GROUPS,
  PLATFORM_OWNED_KEYS,
  DESKTOP_CONFIG_KEYS,
  isPlatformEnabled,
  platformEnabledDefault,
} from '@/lib/desktop-config-keys';

// V060-002: pins the platform-toggle contract used by the Desktop tab.
//   - Instagram is `alwaysOn` (core platform — toggle hidden, fields shown).
//   - Twitter / Pinterest / Discord each have an explicit enable flag
//     persisted to config.json. Empty / absent flag falls back to
//     "on if any creds exist" so existing setups don't get hidden on
//     first load after the redesign.
//   - PLATFORM_OWNED_KEYS contains every field key + every enable key,
//     so DesktopSettingsPanel knows to skip them in the generic flat
//     loop and only render them inside the platform group.
describe('PLATFORM_GROUPS', () => {
  it('declares the four supported platforms in the expected order', () => {
    expect(PLATFORM_GROUPS.map((g) => g.id)).toEqual([
      'instagram',
      'twitter',
      'pinterest',
      'discord',
    ]);
  });

  it('marks Instagram as alwaysOn with no enable flag', () => {
    const ig = PLATFORM_GROUPS.find((g) => g.id === 'instagram')!;
    expect(ig.alwaysOn).toBe(true);
    expect(ig.enabledKey).toBeNull();
  });

  it('every non-core platform has a non-null enabledKey', () => {
    for (const g of PLATFORM_GROUPS) {
      if (!g.alwaysOn) {
        expect(g.enabledKey).not.toBeNull();
        expect(typeof g.enabledKey).toBe('string');
      }
    }
  });

  it('every fieldKey and enabledKey is registered in DESKTOP_CONFIG_KEYS', () => {
    const declared = new Set(DESKTOP_CONFIG_KEYS.map((m) => m.key));
    for (const g of PLATFORM_GROUPS) {
      for (const k of g.fieldKeys) expect(declared.has(k)).toBe(true);
      if (g.enabledKey) expect(declared.has(g.enabledKey)).toBe(true);
    }
  });

  it('PLATFORM_OWNED_KEYS covers every platform field + enable flag', () => {
    for (const g of PLATFORM_GROUPS) {
      for (const k of g.fieldKeys) expect(PLATFORM_OWNED_KEYS.has(k)).toBe(true);
      if (g.enabledKey) expect(PLATFORM_OWNED_KEYS.has(g.enabledKey)).toBe(true);
    }
  });
});

describe('isPlatformEnabled / platformEnabledDefault', () => {
  const twitter = PLATFORM_GROUPS.find((g) => g.id === 'twitter')!;
  const instagram = PLATFORM_GROUPS.find((g) => g.id === 'instagram')!;

  it('Instagram is always enabled regardless of values', () => {
    expect(isPlatformEnabled(instagram, {})).toBe(true);
    expect(isPlatformEnabled(instagram, { INSTAGRAM_ACCESS_TOKEN: '' })).toBe(true);
  });

  it('Twitter defaults to OFF when no creds exist and no flag is set', () => {
    expect(platformEnabledDefault(twitter, {})).toBe(false);
    expect(isPlatformEnabled(twitter, {})).toBe(false);
  });

  it('Twitter defaults to ON when any field already has a value (graceful migration)', () => {
    const values = { TWITTER_APP_KEY: 'k' };
    expect(platformEnabledDefault(twitter, values)).toBe(true);
    expect(isPlatformEnabled(twitter, values)).toBe(true);
  });

  it("explicit '1' enables Twitter even when no creds exist yet", () => {
    expect(isPlatformEnabled(twitter, { TWITTER_ENABLED: '1' })).toBe(true);
  });

  it("explicit '0' disables Twitter even when creds are stored on disk", () => {
    const values = { TWITTER_APP_KEY: 'k', TWITTER_ENABLED: '0' };
    expect(isPlatformEnabled(twitter, values)).toBe(false);
  });

  it('whitespace-only field value does not trigger the default-on migration', () => {
    expect(platformEnabledDefault(twitter, { TWITTER_APP_KEY: '   ' })).toBe(false);
  });
});
