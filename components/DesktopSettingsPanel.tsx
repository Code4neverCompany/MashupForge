'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Save, Monitor, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { DESKTOP_CONFIG_KEYS } from '@/lib/desktop-config-keys';
import { UpdateBanner } from './UpdateBanner';

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
      })
      .catch(() => {
        // Not desktop — silently show nothing
        setConfig({ isDesktop: false, configPath: '', keys: {} });
      });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/desktop/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: draft }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setSaveState('error');
        setSaveError(data.error ?? 'Save failed.');
        return;
      }
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2500);
      // Refresh config so configPath / savedKeys are up to date
      const refreshed = await fetch('/api/desktop/config').then((r) => r.json());
      setConfig(refreshed);
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message ?? 'Network error.');
    }
  }, [draft]);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
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

  const isDirty = DESKTOP_CONFIG_KEYS.some(
    ({ key }) => (draft[key] ?? '') !== (config.keys[key] ?? '')
  );

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

      {/* Save row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving' || !isDirty}
          className={`
            inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
            transition-all duration-200
            ${saveState === 'saving' || !isDirty
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : 'bg-[#c5a062] hover:bg-[#d4b278] text-[#050505] shadow-[0_0_12px_rgba(197,160,98,0.25)] hover:shadow-[0_0_18px_rgba(197,160,98,0.4)]'
            }
          `}
        >
          {saveState === 'saving'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            : <><Save className="w-3.5 h-3.5" /> Save to disk</>
          }
        </button>

        {saveState === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-[#00e6ff]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Saved — restart not required
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}
