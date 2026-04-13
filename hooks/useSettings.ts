'use client';

import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { type UserSettings, defaultSettings } from '../types/mashup';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

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
          if (idbSettings) setSettings(prev => ({ ...prev, ...idbSettings }));
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      } finally {
        setIsSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>)) => {
    let latest: UserSettings;
    setSettings((prev) => {
      const patch = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      latest = { ...prev, ...patch };
      return latest;
    });
    try {
      await set('mashup_settings', latest!);
    } catch (e) {
      console.error('Failed to save settings to IndexedDB', e);
    }
  };

  return { settings, updateSettings, isSettingsLoaded };
}
