import { describe, it, expect } from 'vitest';
import { mergeSettings } from '@/hooks/useSettings';
import { defaultSettings } from '@/types/mashup';

// POLISH-018 regression gate. mergeSettings deep-merges loaded IDB
// payloads into the running settings. If it regresses to a shallow
// spread, partial saves clobber watermark/apiKeys defaults — the
// exact bug Maurice reported (watermark settings wiped on restart).
describe('mergeSettings', () => {
  it('preserves defaults when patch is empty', () => {
    const result = mergeSettings(defaultSettings, {});
    expect(result).toEqual(defaultSettings);
  });

  it('strips top-level undefined values from the patch', () => {
    const result = mergeSettings(defaultSettings, {
      defaultLeonardoModel: undefined as unknown as string,
    });
    expect(result.defaultLeonardoModel).toBe(defaultSettings.defaultLeonardoModel);
  });

  it('overrides top-level scalar fields', () => {
    const result = mergeSettings(defaultSettings, {
      defaultLeonardoModel: 'phoenix-1.0',
    });
    expect(result.defaultLeonardoModel).toBe('phoenix-1.0');
  });

  it('deep-merges watermark — partial patch keeps existing fields', () => {
    const prev = {
      ...defaultSettings,
      watermark: { enabled: true, image: 'data:abc', position: 'top-left' as const, opacity: 0.5, scale: 0.2 },
    };
    const result = mergeSettings(prev, { watermark: { enabled: false, image: null, position: 'bottom-right', opacity: 0.8, scale: 0.15 } });
    expect(result.watermark?.enabled).toBe(false);
    expect(result.watermark?.position).toBe('bottom-right');
  });

  it('deep-merges watermark — missing fields fall back to prev', () => {
    const prev = {
      ...defaultSettings,
      watermark: { enabled: true, image: 'data:abc', position: 'top-left' as const, opacity: 0.5, scale: 0.2 },
    };
    // Patch only has `enabled` — the rest should come from prev
    const result = mergeSettings(prev, { watermark: { enabled: false } } as Parameters<typeof mergeSettings>[1]);
    expect(result.watermark?.enabled).toBe(false);
    expect(result.watermark?.image).toBe('data:abc');
    expect(result.watermark?.position).toBe('top-left');
    expect(result.watermark?.opacity).toBe(0.5);
    expect(result.watermark?.scale).toBe(0.2);
  });

  it('deep-merges apiKeys — existing keys preserved alongside new ones', () => {
    const prev = {
      ...defaultSettings,
      apiKeys: { leonardo: 'key123' },
    };
    const result = mergeSettings(prev, {
      apiKeys: { instagram: { accessToken: 'EAA', igAccountId: '999' } },
    });
    expect(result.apiKeys.leonardo).toBe('key123');
    expect(result.apiKeys.instagram?.accessToken).toBe('EAA');
  });

  it('does not clobber apiKeys when patch has undefined apiKeys', () => {
    const prev = {
      ...defaultSettings,
      apiKeys: { leonardo: 'key123' },
    };
    const result = mergeSettings(prev, { apiKeys: undefined });
    expect(result.apiKeys.leonardo).toBe('key123');
  });

  it('leaves non-nested fields untouched when only nested fields change', () => {
    const result = mergeSettings(defaultSettings, {
      watermark: { enabled: true, image: null, position: 'bottom-right', opacity: 1, scale: 0.5 },
    });
    expect(result.enabledProviders).toEqual(defaultSettings.enabledProviders);
    expect(result.defaultLeonardoModel).toBe(defaultSettings.defaultLeonardoModel);
  });
});
