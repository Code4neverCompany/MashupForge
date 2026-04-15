'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the app is running inside the Tauri desktop shell.
 * Probes `/api/desktop/config` once on mount — the same endpoint that
 * DesktopSettingsPanel uses — so both sources of truth stay in lockstep.
 *
 * Returns `null` while the probe is in flight so callers can distinguish
 * "still loading" from "definitely web" and avoid flashing desktop-only
 * UI on first paint.
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/desktop/config')
      .then((r) => r.json() as Promise<{ isDesktop?: boolean }>)
      .then((data) => {
        if (!cancelled) setIsDesktop(Boolean(data?.isDesktop));
      })
      .catch(() => {
        if (!cancelled) setIsDesktop(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return isDesktop;
}
