'use client';

import { useEffect, useState } from 'react';

export interface DesktopCredentialFlags {
  hasInstagramToken: boolean;
  hasInstagramAccountId: boolean;
  hasLeonardoKey: boolean;
  hasZaiKey: boolean;
  hasTwitterCreds: boolean;
  hasPinterestCreds: boolean;
  hasDiscordCreds: boolean;
}

export interface DesktopConfig {
  isDesktop: boolean | null;
  credentials: DesktopCredentialFlags;
}

const EMPTY_FLAGS: DesktopCredentialFlags = {
  hasInstagramToken: false,
  hasInstagramAccountId: false,
  hasLeonardoKey: false,
  hasZaiKey: false,
  hasTwitterCreds: false,
  hasPinterestCreds: false,
  hasDiscordCreds: false,
};

function toFlags(keys: Record<string, string>): DesktopCredentialFlags {
  return {
    hasInstagramToken: Boolean(keys.INSTAGRAM_ACCESS_TOKEN),
    hasInstagramAccountId: Boolean(keys.INSTAGRAM_ACCOUNT_ID),
    hasLeonardoKey: Boolean(keys.LEONARDO_API_KEY),
    hasZaiKey: Boolean(keys.ZAI_API_KEY),
    hasTwitterCreds: Boolean(
      keys.TWITTER_APP_KEY && keys.TWITTER_APP_SECRET &&
      keys.TWITTER_ACCESS_TOKEN && keys.TWITTER_ACCESS_SECRET,
    ),
    hasPinterestCreds: Boolean(keys.PINTEREST_ACCESS_TOKEN),
    hasDiscordCreds: Boolean(keys.DISCORD_WEBHOOK_URL),
  };
}

/**
 * Fetches desktop config once on mount and exposes boolean credential-presence
 * flags — raw token values never enter React state.  DesktopSettingsPanel
 * reads the full GET response directly; this hook is for UI gating only.
 */
export function useDesktopConfig(): DesktopConfig {
  const [config, setConfig] = useState<DesktopConfig>({
    isDesktop: null,
    credentials: EMPTY_FLAGS,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/desktop/config')
      .then((r) => r.json() as Promise<{ isDesktop?: boolean; keys?: Record<string, string> }>)
      .then((data) => {
        if (!cancelled) {
          setConfig({
            isDesktop: Boolean(data?.isDesktop),
            credentials: data?.keys && typeof data.keys === 'object'
              ? toFlags(data.keys)
              : EMPTY_FLAGS,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setConfig({ isDesktop: false, credentials: EMPTY_FLAGS });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
