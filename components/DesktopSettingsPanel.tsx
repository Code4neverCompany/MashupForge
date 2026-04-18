'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Monitor, CheckCircle2, AlertCircle, Loader2, Power, Download, RefreshCw } from 'lucide-react';
import { DESKTOP_CONFIG_KEYS, UPDATER_KEYS, type DesktopConfigFieldMeta } from '@/lib/desktop-config-keys';
import { LAST_CHECKED_AT_KEY } from './UpdateChecker';
import { PortConflictBanner } from './PortConflictBanner';

// Provider/model changes need pi to respawn so the new env reaches the
// child process. The next prompt will auto-restart pi after stop().
const PI_RESTART_KEYS = new Set(['PI_PROVIDER', 'PI_DEFAULT_MODEL']);

// ── PROP-005: Tauri auto-launch toggle ────────────────────────────────────────
// Dynamically imported so the web build (no Tauri) never bundles the plugin.
async function getAutostartPlugin() {
  try {
    return await import('@tauri-apps/plugin-autostart');
  } catch {
    return null;
  }
}

function useAutolaunch(isDesktop: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    getAutostartPlugin().then(async (plugin) => {
      if (!plugin || cancelled) return;
      try {
        const on = await plugin.isEnabled();
        if (!cancelled) setEnabled(on);
      } catch { /* not available */ }
    });
    return () => { cancelled = true; };
  }, [isDesktop]);

  const toggle = useCallback(async () => {
    const plugin = await getAutostartPlugin();
    if (!plugin) return;
    setLoading(true);
    try {
      if (enabled) {
        await plugin.disable();
        setEnabled(false);
      } else {
        await plugin.enable();
        setEnabled(true);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [enabled]);

  return { enabled, loading, toggle };
}

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

// ── Field rows ───────────────────────────────────────────────────────────────

function SecretField({
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

function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#050505] border border-zinc-800/60 hover:border-[#c5a062]/30 focus:border-[#c5a062]/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#c5a062]/25 transition-colors font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <p className="text-[10px] text-zinc-600">{hint}</p>
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt)}
              className={[
                'flex items-center justify-center rounded-lg border px-2.5 py-2 text-xs font-medium capitalize transition-colors',
                selected
                  ? 'border-[#c5a062] bg-[#c5a062]/10 text-[#c5a062]'
                  : 'border-zinc-800/60 bg-[#050505] text-zinc-400 hover:border-[#c5a062]/30 hover:text-zinc-200',
              ].join(' ')}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-600">{hint}</p>
    </div>
  );
}

function FieldRouter({
  meta,
  value,
  onChange,
}: {
  meta: DesktopConfigFieldMeta;
  value: string;
  onChange: (v: string) => void;
}) {
  if (meta.kind === 'select') {
    return <SelectField label={meta.label} hint={meta.hint} value={value} options={meta.options} onChange={onChange} />;
  }
  if (meta.kind === 'text') {
    return <TextField label={meta.label} hint={meta.hint} value={value} onChange={onChange} />;
  }
  return <SecretField label={meta.label} hint={meta.hint} value={value} onChange={onChange} />;
}

// ── FEAT-002: Updates subsection ─────────────────────────────────────────────

interface UpdatesSectionProps {
  autoOnLaunch: boolean;
  onAutoOnLaunchChange: (on: boolean) => void;
}

type CheckResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; version: string; body: string }
  | { kind: 'installing'; version: string; pct: number | null }
  | { kind: 'error'; message: string };

interface UpdaterModule {
  check: () => Promise<{
    available: boolean;
    version: string;
    body?: string | null;
    downloadAndInstall: (
      onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
    ) => Promise<void>;
  } | null>;
}

function UpdatesSection({ autoOnLaunch, onAutoOnLaunchChange }: UpdatesSectionProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult>({ kind: 'idle' });

  // Read current app version + last-check timestamp on mount.
  useEffect(() => {
    void (async () => {
      try {
        const appMod = await import('@tauri-apps/api/app');
        setVersion(await appMod.getVersion());
      } catch { /* not desktop */ }
      try {
        const raw = localStorage.getItem(LAST_CHECKED_AT_KEY);
        if (raw) setLastCheckedAt(Number(raw));
      } catch { /* ignore */ }
    })();
  }, []);

  const handleCheckNow = useCallback(async () => {
    setResult({ kind: 'checking' });
    try {
      const updaterMod = (await import('@tauri-apps/plugin-updater')) as unknown as UpdaterModule;
      const update = await updaterMod.check();
      const now = Date.now();
      try { localStorage.setItem(LAST_CHECKED_AT_KEY, String(now)); } catch { /* ignore */ }
      setLastCheckedAt(now);
      if (!update?.available) {
        setResult({ kind: 'none' });
        return;
      }
      setResult({ kind: 'available', version: update.version, body: (update.body ?? '').trim() });
      // Stash the update for the install button via closure.
      installRef.current = () => update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setResult({ kind: 'installing', version: update.version, pct: null });
        } else if (event.event === 'Progress') {
          setResult((prev) => {
            if (prev.kind !== 'installing') return prev;
            const total = event.data?.contentLength;
            const chunk = event.data?.chunkLength ?? 0;
            const next = (prev.pct ?? 0) + (total ? (chunk / total) * 100 : 0);
            return { ...prev, pct: total ? Math.min(99, Math.round(next)) : null };
          });
        }
      });
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      setResult({ kind: 'error', message: detail });
    }
  }, []);

  const installRef = useRef<(() => Promise<void>) | null>(null);

  const handleInstall = useCallback(async () => {
    if (!installRef.current) return;
    try {
      await installRef.current();
      // On Windows the installer relaunches; if we're alive past this,
      // surface a fallback so the user knows something happened.
      setResult({ kind: 'none' });
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      setResult({ kind: 'error', message: detail });
    }
  }, []);

  const lastCheckedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleString()
    : 'never';

  return (
    <div className="space-y-3 pt-4 border-t border-zinc-800/60">
      <div className="flex items-center gap-2">
        <Download className="w-3.5 h-3.5 text-[#c5a062] shrink-0" />
        <h5 className="text-xs font-semibold text-white">Updates</h5>
        {version && (
          <span className="ml-auto text-[10px] text-zinc-500 font-mono">v{version}</span>
        )}
      </div>

      {/* Auto-on-launch toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-300">Check on launch</p>
          <p className="text-[10px] text-zinc-600">
            When on, MashupForge checks for updates each time it starts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAutoOnLaunchChange(!autoOnLaunch)}
          aria-pressed={autoOnLaunch}
          aria-label={autoOnLaunch ? 'Disable auto-update on launch' : 'Enable auto-update on launch'}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors focus:outline-none focus:ring-2 focus:ring-[#c5a062]/40
            ${autoOnLaunch ? 'bg-[#c5a062]' : 'bg-zinc-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
            ${autoOnLaunch ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Manual check + status */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCheckNow()}
          disabled={result.kind === 'checking' || result.kind === 'installing'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-wait text-white transition-colors"
        >
          {result.kind === 'checking' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Check for updates
        </button>
        <span className="text-[10px] text-zinc-600">Last checked: {lastCheckedLabel}</span>
      </div>

      {/* Result row */}
      {result.kind === 'none' && (
        <p className="text-[11px] text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          You&apos;re on the latest version.
        </p>
      )}
      {result.kind === 'available' && (
        <div className="rounded-lg border border-[#c5a062]/30 bg-[#c5a062]/5 p-3 space-y-2">
          <p className="text-[11px] text-zinc-200">
            Update available — <span className="font-mono text-[#c5a062]">v{result.version}</span>
          </p>
          {result.body && (
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-wrap font-mono">
              {result.body}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#00e6ff] hover:bg-[#33eaff] text-[#050505] transition-colors"
          >
            <Download className="w-3 h-3" />
            Download and install
          </button>
        </div>
      )}
      {result.kind === 'installing' && (
        <p className="text-[11px] text-zinc-300 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Installing v{result.version}{result.pct !== null ? ` — ${result.pct}%` : '…'}
        </p>
      )}
      {result.kind === 'error' && (
        <p className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {result.message}
        </p>
      )}
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
  const autolaunch = useAutolaunch(config?.isDesktop ?? false);
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

  const persist = useCallback(async (snapshot: Record<string, string>, restartPi: boolean) => {
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
      // Provider/model changes need a pi respawn so the new env reaches
      // the child process. Fire-and-forget: next prompt auto-starts pi.
      if (restartPi) {
        void fetch('/api/pi/stop', { method: 'POST' }).catch(() => {});
      }
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message ?? 'Network error.');
    }
  }, []);

  // STORY-131 — auto-save. Debounce keystroke-level edits and PATCH when
  // the draft differs from the last-known config. No manual button needed.
  useEffect(() => {
    if (!seededRef.current || !config?.isDesktop) return;
    const changedKeys = DESKTOP_CONFIG_KEYS.filter(
      ({ key }) => (draft[key] ?? '') !== (config.keys[key] ?? '')
    );
    if (changedKeys.length === 0) return;
    const restartPi = changedKeys.some(({ key }) => PI_RESTART_KEYS.has(key));
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persist(draft, restartPi);
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

      {/* PORT-001: Warn when ephemeral-port fallback fired */}
      <PortConflictBanner />

      {/* PROP-005: Auto-launch at startup toggle */}
      {autolaunch.enabled !== null && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <div>
              <p className="text-xs text-zinc-300">Launch at startup</p>
              <p className="text-[10px] text-zinc-600">Start MashupForge when Windows boots</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void autolaunch.toggle()}
            disabled={autolaunch.loading}
            aria-pressed={autolaunch.enabled}
            aria-label={autolaunch.enabled ? 'Disable launch at startup' : 'Enable launch at startup'}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors focus:outline-none focus:ring-2 focus:ring-[#c5a062]/40
              ${autolaunch.enabled ? 'bg-[#c5a062]' : 'bg-zinc-700'}
              ${autolaunch.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
              ${autolaunch.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      )}

      {/* Config fields — kind-discriminated dispatch.
          UPDATER_KEYS are owned by the dedicated Updates subsection below
          so the user sees them grouped with version + Check Now controls
          rather than buried in the API-key list. */}
      <div className="space-y-4">
        {DESKTOP_CONFIG_KEYS.filter((meta) => !UPDATER_KEYS.has(meta.key)).map((meta) => (
          <FieldRouter
            key={meta.key}
            meta={meta}
            value={draft[meta.key] ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, [meta.key]: v }))}
          />
        ))}
      </div>

      {/* FEAT-002: Updates subsection — version readout, manual check,
          and the AUTO_UPDATE_ON_LAUNCH toggle. The toggle drives
          UpdateChecker's launch-time behavior; manual checks here run
          regardless. */}
      <UpdatesSection
        autoOnLaunch={(draft.AUTO_UPDATE_ON_LAUNCH ?? 'on') !== 'off'}
        onAutoOnLaunchChange={(on) =>
          setDraft((prev) => ({ ...prev, AUTO_UPDATE_ON_LAUNCH: on ? 'on' : 'off' }))
        }
      />

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
