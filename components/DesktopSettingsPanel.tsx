'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Monitor, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { DESKTOP_CONFIG_KEYS } from '@/lib/desktop-config-keys';
import { UpdateBanner } from './UpdateBanner';

// STORY-131: debounce window between the last keystroke and the auto-PATCH.
// 800 ms is long enough that rapid typing doesn't thrash the file system but
// short enough that closing the modal after a single edit almost always
// finishes the write before the panel unmounts.
const AUTOSAVE_DEBOUNCE_MS = 800;

// ── Types ────────────────────────────────────────────────────────────────────

interface DesktopConfigResponse {
  isDesktop: boolean;
  configPath: string;
  keys: Record<string, string>;
  error?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ── Field row ────────────────────────────────────────────────────────────────

function KeyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={visible ? 'Paste key here…' : '••••••••••••••••'}
          className="w-full bg-[#050505] border border-zinc-800/60 hover:border-[#c5a062]/30 focus:border-[#c5a062]/60 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#c5a062]/25 transition-colors font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
          aria-label={visible ? 'Hide key' : 'Show key'}
          tabIndex={-1}
        >
          {visible
            ? <EyeOff className="w-3.5 h-3.5" />
            : <Eye     className="w-3.5 h-3.5" />
          }
        </button>
      </div>
      <p className="text-[10px] text-zinc-600">{hint}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Desktop-specific settings panel for the Tauri build.
 * Renders nothing when running in web/serverless mode (isDesktop: false).
 * Reads and writes config.json via /api/desktop/config.
 */
export function DesktopSettingsPanel() {
  const [config, setConfig] = useState<DesktopConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the initial save trigger when `draft` is first seeded from the GET
  // response — otherwise we'd PATCH on mount and race with the initial read.
  const seededRef = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/desktop/config')
      .then((r) => r.json())
      .then((data: DesktopConfigResponse) => {
        setConfig(data);
        // Seed draft with existing values
        const seed: Record<string, string> = {};
        for (const { key } of DESKTOP_CONFIG_KEYS) {
          seed[key] = data.keys[key] ?? '';
        }
        setDraft(seed);
        seededRef.current = true;
      })
      .catch(() => {
        // Not desktop — silently show nothing
        setConfig({ isDesktop: false, configPath: '', keys: {} });
      });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const persist = useCallback(async (snapshot: Record<string, string>) => {
    setSaveState('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/desktop/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: snapshot }),
      });
      const data = await res.json() as DesktopConfigResponse & { success?: boolean };
      if (!res.ok || data.success === false) {
        setSaveState('error');
        setSaveError(data.error ?? 'Save failed.');
        return;
      }
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2500);
      // Refresh config so configPath / savedKeys reflect the write.
      const refreshed = await fetch('/api/desktop/config').then((r) => r.json() as Promise<DesktopConfigResponse>);
      setConfig(refreshed);
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message ?? 'Network error.');
    }
  }, []);

  // STORY-131 — auto-save. Debounce keystroke-level edits and PATCH when
  // the draft differs from the last-known config. No manual button needed.
  useEffect(() => {
    if (!seededRef.current || !config?.isDesktop) return;
    const dirty = DESKTOP_CONFIG_KEYS.some(
      ({ key }) => (draft[key] ?? '') !== (config.keys[key] ?? '')
    );
    if (!dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persist(draft);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [draft, config, persist]);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  // Still loading
  if (config === null) {
    return (
      <div className="flex items-center gap-2 py-4 text-zinc-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Checking desktop mode…</span>
      </div>
    );
  }

  // Web / serverless — render nothing
  if (!config.isDesktop) return null;

  return (
    <div className="space-y-5 pt-4 border-t border-[#c5a062]/20">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Monitor className="w-4 h-4 text-[#c5a062] shrink-0" />
        <h4 className="text-sm font-semibold text-white">Desktop Configuration</h4>
        <span className="ml-auto text-[10px] text-zinc-600 font-mono truncate max-w-[120px] sm:max-w-[220px]" title={config.configPath}>
          {config.configPath}
        </span>
      </div>

      <p className="text-[11px] text-zinc-500 -mt-1">
        API keys stored in <code className="text-zinc-400">config.json</code> on your machine — never sent to any server.
        Injected into the sidecar process at launch.
      </p>

      {/* Update check (STORY-122) */}
      <UpdateBanner />

      {/* Key fields */}
      <div className="space-y-4">
        {DESKTOP_CONFIG_KEYS.map(({ key, label, hint }) => (
          <KeyField
            key={key}
            label={label}
            hint={hint}
            value={draft[key] ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, [key]: v }))}
          />
        ))}
      </div>

      {/* Auto-save status row (STORY-131) */}
      <div className="flex items-center gap-2 min-h-[1.25rem]" aria-live="polite">
        {saveState === 'saving' && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        )}
        {saveState === 'saved' && (
          <span className="flex items-center gap-1 text-[11px] text-[#00e6ff]">
            <CheckCircle2 className="w-3 h-3" />
            Saved to config.json
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1 text-[11px] text-red-400">
            <AlertCircle className="w-3 h-3" />
            {saveError || 'Save failed.'}
          </span>
        )}
        {saveState === 'idle' && (
          <span className="text-[11px] text-zinc-600">
            Changes are saved automatically.
          </span>
        )}
      </div>
    </div>
  );
}
