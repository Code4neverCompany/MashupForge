'use client';

import { useEffect, useState } from 'react';

export interface DesktopConfig {
  isDesktop: boolean | null;
  configKeys: Record<string, string>;
}

/**
 * Fetches desktop config (isDesktop flag + config.json keys) once on mount.
 * Superset of useIsDesktop — also exposes config keys so client-side code
 * can check credentials stored in config.json (e.g. INSTAGRAM_ACCESS_TOKEN).
 */
export function useDesktopConfig(): DesktopConfig {
  const [config, setConfig] = useState<DesktopConfig>({
    isDesktop: null,
    configKeys: {},
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/desktop/config')
      .then((r) => r.json() as Promise<{ isDesktop?: boolean; keys?: Record<string, string> }>)
      .then((data) => {
        if (!cancelled) {
          setConfig({
            isDesktop: Boolean(data?.isDesktop),
            configKeys: data?.keys && typeof data.keys === 'object' ? data.keys : {},
          });
        }
      })
      .catch(() => {
        if (!cancelled) setConfig({ isDesktop: false, configKeys: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
