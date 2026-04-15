'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { type UserSettings, defaultSettings } from '../types/mashup';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // PROP-010: load path. Defensive `typeof === 'object'` guard rejects any
  // corrupted/non-object value left over from the pre-fix race that could
  // have written `undefined` into the store.
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = localStorage.getItem('mashup_settings');
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          await set('mashup_settings', parsed);
          localStorage.removeItem('mashup_settings');
          setSettings(prev => ({ ...prev, ...parsed }));
        } else {
          const idbSettings = await get('mashup_settings');
          if (idbSettings && typeof idbSettings === 'object') {
            setSettings(prev => ({ ...prev, ...idbSettings }));
          }
        }
      } catch {
        // silent — settings fall back to defaults
      } finally {
        setIsSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // PROP-010: persist after every committed state change. Replaces the
  // previous `setSettings(updater) → await set(latest!)` pattern, which
  // raced because React 18 doesn't run the updater synchronously at
  // `setSettings` call time — `latest` was often still `undefined` when
  // the IDB write fired, persisting `undefined` and causing a full reset
  // on next load. The effect form sees the committed state directly, so
  // there is no closure to capture from.
  useEffect(() => {
    if (!isSettingsLoaded) return;
    void set('mashup_settings', settings).catch(() => {});
  }, [settings, isSettingsLoaded]);

  // Stable identity across renders — useState's setSettings is itself
  // stable, so this useCallback can have an empty dep array. Stable
  // updateSettings lets downstream consumers safely include it in
  // useEffect/useCallback dep arrays without triggering re-runs every
  // render. PROP-014 needed this for persistCarouselGroup.
  const updateSettings = useCallback((
    newSettings: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>),
  ) => {
    setSettings((prev) => {
      const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      return { ...prev, ...patch };
    });
  }, []);

  return { settings, updateSettings, isSettingsLoaded };
}
