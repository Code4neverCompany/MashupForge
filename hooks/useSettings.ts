'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { type UserSettings, defaultSettings } from '../types/mashup';

// Deep-merge a loaded payload into the current settings, preserving defaults
// for any fields that are missing or explicitly undefined in the payload.
// Nested objects (watermark, apiKeys) are merged one level deep so a partial
// save doesn't clobber defaults for fields that were never written.
export function mergeSettings(prev: UserSettings, patch: Partial<UserSettings>): UserSettings {
  // Strip top-level undefined values so they don't override existing defaults.
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<UserSettings>;
  const merged = { ...prev, ...clean };
  if (clean.watermark && typeof clean.watermark === 'object') {
    merged.watermark = { ...prev.watermark, ...clean.watermark };
  }
  if (clean.apiKeys && typeof clean.apiKeys === 'object') {
    merged.apiKeys = { ...prev.apiKeys, ...clean.apiKeys };
  }
  // TODO: if UserSettings gains additional nested-object fields beyond
  // watermark and apiKeys, add explicit deep-merge cases above — otherwise
  // they will silently shallow-merge and partial saves will clobber defaults.
  return merged;
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Always-current ref used by the beforeunload flush below. Updated
  // synchronously on every render so the handler never closes over a
  // stale value without needing to re-subscribe the listener.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
          setSettings(prev => mergeSettings(prev, parsed as Partial<UserSettings>));
        } else {
          const idbSettings = await get('mashup_settings');
          if (idbSettings && typeof idbSettings === 'object') {
            setSettings(prev => mergeSettings(prev, idbSettings as Partial<UserSettings>));
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

  // PROP-010: persist after every committed state change, debounced 300ms.
  // Debounce prevents an IDB write on every keystroke in text fields while
  // still guaranteeing the final value is persisted. The cleanup cancels any
  // pending timer so rapid updates coalesce into a single write.
  useEffect(() => {
    if (!isSettingsLoaded) return;
    const timer = setTimeout(() => {
      void set('mashup_settings', settings).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [settings, isSettingsLoaded]);

  // Flush-on-unload safety net for the 300ms debounce window. Writes
  // synchronously to localStorage on beforeunload; the load path already
  // migrates localStorage → IDB on next session start, so no settings
  // change is lost even if the tab closes before the debounce fires.
  // Registered once (when isSettingsLoaded flips true) via empty-ish dep
  // array — settingsRef.current always holds the latest value so the
  // listener never needs to be re-registered.
  useEffect(() => {
    if (!isSettingsLoaded) return;
    const flush = () => {
      try {
        localStorage.setItem('mashup_settings', JSON.stringify(settingsRef.current));
      } catch { /* storage quota — silent */ }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [isSettingsLoaded]);

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
      return mergeSettings(prev, patch);
    });
  }, []);

  return { settings, updateSettings, isSettingsLoaded };
}
