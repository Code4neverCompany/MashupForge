'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Monitor, CheckCircle2, AlertCircle, Loader2, Power, Download, RefreshCw, Camera, MessageCircle, Pin, Hash } from 'lucide-react';
import {
  DESKTOP_CONFIG_KEYS,
  PLATFORM_GROUPS,
  PLATFORM_OWNED_KEYS,
  UPDATER_KEYS,
  UPDATE_BEHAVIOR_DEFAULT,
  isPlatformEnabled,
  type DesktopConfigFieldMeta,
  type PlatformGroupMeta,
  type UpdateBehavior,
} from '@/lib/desktop-config-keys';
import { LAST_CHECKED_AT_KEY } from './UpdateChecker';
import { PortConflictBanner } from './PortConflictBanner';
import {
  traceUpdater,
  getUpdaterTrace,
  clearUpdaterTrace,
  formatTraceEntry,
} from '@/lib/updater-trace';

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

// ── V060-002: Platform group ─────────────────────────────────────────────────

const PLATFORM_ICONS: Record<PlatformGroupMeta['id'], typeof Camera> = {
  instagram: Camera,
  twitter: MessageCircle,
  pinterest: Pin,
  discord: Hash,
};

interface PlatformGroupSectionProps {
  group: PlatformGroupMeta;
  enabled: boolean;
  fieldMetas: ReadonlyArray<DesktopConfigFieldMeta>;
  draft: Record<string, string>;
  onToggle: (next: boolean) => void;
  onFieldChange: (key: string, value: string) => void;
}

function PlatformGroupSection({
  group,
  enabled,
  fieldMetas,
  draft,
  onToggle,
  onFieldChange,
}: PlatformGroupSectionProps) {
  const Icon = PLATFORM_ICONS[group.id];
  const showToggle = !group.alwaysOn;

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-[#050505]/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-[#c5a062] shrink-0" />
          <span className="text-xs font-semibold text-white truncate">{group.label}</span>
          {group.alwaysOn && (
            <span className="text-[9px] uppercase tracking-wider text-zinc-600">core</span>
          )}
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={() => onToggle(!enabled)}
            aria-pressed={enabled}
            aria-label={enabled ? `Disable ${group.label}` : `Enable ${group.label}`}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors focus:outline-none focus:ring-2 focus:ring-[#c5a062]/40
              ${enabled ? 'bg-[#c5a062]' : 'bg-zinc-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
              ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        )}
      </div>
      {enabled && fieldMetas.length > 0 && (
        <div className="space-y-3 px-3 pb-3 pt-1 border-t border-zinc-800/60">
          {fieldMetas.map((meta) => (
            <FieldRouter
              key={meta.key}
              meta={meta}
              value={draft[meta.key] ?? ''}
              onChange={(v) => onFieldChange(meta.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── FEAT-002: Updates subsection ─────────────────────────────────────────────

interface UpdatesSectionProps {
  behavior: UpdateBehavior;
  onBehaviorChange: (next: UpdateBehavior) => void;
}

const UPDATE_BEHAVIOR_OPTIONS: readonly UpdateBehavior[] = ['auto', 'notify', 'off'] as const;
const UPDATE_BEHAVIOR_LABELS: Record<UpdateBehavior, string> = {
  auto: 'Auto-update',
  notify: 'Notify',
  off: 'Off',
};
const UPDATE_BEHAVIOR_DESCRIPTIONS: Record<UpdateBehavior, string> = {
  auto: 'Download and install silently when an update is available.',
  notify: 'Show a banner so you can review and click Update Now.',
  off: 'Don\u2019t check on launch \u2014 use the button below to check manually.',
};

type CheckResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; version: string; body: string }
  | { kind: 'installing'; version: string; pct: number | null }
  // V060-003: ACL-denied / plugin unavailable. Distinct from 'error' so
  // we can render a calm informational note + manual download link
  // instead of a red warning. The user has nothing to action other
  // than visiting GitHub Releases, so framing this as an error was
  // misleading.
  | { kind: 'unavailable'; releasesUrl: string }
  | { kind: 'error'; message: string };

// V060-003: surfaced in the unavailable + idle states. Derived from
// tauri.conf.json bundle.homepage rather than hard-coded again.
const RELEASES_URL = 'https://github.com/Code4neverCompany/MashupForge/releases';

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

function UpdatesSection({ behavior, onBehaviorChange }: UpdatesSectionProps) {
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
    traceUpdater('manual:check-clicked');
    setResult({ kind: 'checking' });
    // V060-003: stamp "last checked" the moment we begin. Previously
    // this only fired after a successful check — when the ACL bug
    // (BUG-ACL-005) tripped, the panel stayed at "Last checked: never"
    // even though we'd tried multiple times. Recording the attempt
    // timestamp here makes the panel honest.
    const startedAt = Date.now();
    try { localStorage.setItem(LAST_CHECKED_AT_KEY, String(startedAt)); } catch { /* ignore */ }
    setLastCheckedAt(startedAt);
    try {
      traceUpdater('manual:importing-updater-plugin');
      const updaterMod = (await import('@tauri-apps/plugin-updater')) as unknown as UpdaterModule;
      traceUpdater('manual:calling-check');
      const update = await updaterMod.check();
      traceUpdater('manual:check-returned', {
        available: update?.available ?? null,
        remoteVersion: update?.version ?? null,
      });
      if (!update?.available) {
        traceUpdater('manual:no-update-available');
        setResult({ kind: 'none' });
        return;
      }
      setResult({ kind: 'available', version: update.version, body: (update.body ?? '').trim() });
      // Stash the update for the install button via closure.
      installRef.current = () => {
        traceUpdater('manual:install-clicked', { version: update.version });
        return update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            traceUpdater('manual:download-started', { contentLength: event.data?.contentLength ?? null });
            setResult({ kind: 'installing', version: update.version, pct: null });
          } else if (event.event === 'Progress') {
            setResult((prev) => {
              if (prev.kind !== 'installing') return prev;
              const total = event.data?.contentLength;
              const chunk = event.data?.chunkLength ?? 0;
              const next = (prev.pct ?? 0) + (total ? (chunk / total) * 100 : 0);
              return { ...prev, pct: total ? Math.min(99, Math.round(next)) : null };
            });
          } else {
            traceUpdater('manual:install-event', { event: event.event });
          }
        });
      };
    } catch (e: unknown) {
      // BUG-ACL-005: tauri-plugin-updater v2.10.1 sometimes raises
      // "plugin:updater|check not allowed by ACL" on Windows even
      // though updater:allow-check is in capabilities/default.json.
      // V060-003: route this to the calm 'unavailable' state rather
      // than a red 'error' — the user has nothing to action beyond
      // visiting GitHub Releases, and the warning was being read as
      // a system fault.
      const detail = e instanceof Error ? e.message : String(e);
      traceUpdater('manual:check-threw', { error: detail });
      if (/not allowed by ACL/i.test(detail)) {
        console.warn(
          '[UpdatesSection] updater ACL denied check() — likely plugin bug; visit GitHub Releases to download manually.',
          detail,
        );
        setResult({ kind: 'unavailable', releasesUrl: RELEASES_URL });
      } else {
        setResult({ kind: 'error', message: detail });
      }
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

      {/* FEAT-006: tri-state launch-time behavior. */}
      <div className="space-y-1.5">
        <p className="text-xs text-zinc-300">On launch</p>
        <div role="radiogroup" aria-label="Update behavior on launch" className="grid grid-cols-3 gap-1.5">
          {UPDATE_BEHAVIOR_OPTIONS.map((opt) => {
            const selected = behavior === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onBehaviorChange(opt)}
                className={[
                  'flex items-center justify-center rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors',
                  selected
                    ? 'border-[#c5a062] bg-[#c5a062]/10 text-[#c5a062]'
                    : 'border-zinc-800/60 bg-[#050505] text-zinc-400 hover:border-[#c5a062]/30 hover:text-zinc-200',
                ].join(' ')}
              >
                {UPDATE_BEHAVIOR_LABELS[opt]}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-600">{UPDATE_BEHAVIOR_DESCRIPTIONS[behavior]}</p>
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
      {result.kind === 'unavailable' && (
        <div
          role="status"
          aria-label="Auto-update unavailable on this system"
          className="rounded-lg border border-zinc-800/60 bg-[#050505]/40 p-3 space-y-1"
        >
          <p className="text-[11px] text-zinc-300">
            Auto-update isn&apos;t available on this system. The latest installer
            is always on GitHub.
          </p>
          <a
            href={result.releasesUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#00e6ff] hover:text-[#33eaff]"
          >
            <Download className="w-3 h-3" />
            Visit GitHub Releases
          </a>
        </div>
      )}
      {result.kind === 'error' && (
        <p className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {result.message}
        </p>
      )}

      <UpdaterDiagnosticLog />
    </div>
  );
}

function UpdaterDiagnosticLog() {
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState<ReturnType<typeof getUpdaterTrace>>([]);

  const refresh = useCallback(() => {
    setTrace(getUpdaterTrace());
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleCopy = useCallback(() => {
    const text = trace.map(formatTraceEntry).join('\n');
    try {
      void navigator.clipboard.writeText(text);
    } catch { /* ignore — best-effort */ }
  }, [trace]);

  const handleClear = useCallback(() => {
    clearUpdaterTrace();
    refresh();
  }, [refresh]);

  return (
    <details className="text-[10px]" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300 select-none">
        Diagnostic log {trace.length > 0 ? `(${trace.length})` : ''}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="px-2 py-1 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={trace.length === 0}
            className="px-2 py-1 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={trace.length === 0}
            className="px-2 py-1 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200"
          >
            Clear
          </button>
        </div>
        {trace.length === 0 ? (
          <p className="text-zinc-600">No trace entries yet. The auto-check on launch and "Check for updates" both write here.</p>
        ) : (
          <pre className="max-h-40 overflow-auto rounded bg-[#050505] border border-zinc-800/60 p-2 font-mono text-zinc-400 whitespace-pre-wrap">
            {trace.map(formatTraceEntry).join('\n')}
          </pre>
        )}
      </div>
    </details>
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
          UPDATER_KEYS render in the dedicated Updates subsection below.
          PLATFORM_OWNED_KEYS render in the Platforms section so the
          per-platform toggle controls visibility (V060-002). */}
      <div className="space-y-4">
        {DESKTOP_CONFIG_KEYS
          .filter((meta) => !UPDATER_KEYS.has(meta.key) && !PLATFORM_OWNED_KEYS.has(meta.key))
          .map((meta) => (
            <FieldRouter
              key={meta.key}
              meta={meta}
              value={draft[meta.key] ?? ''}
              onChange={(v) => setDraft((prev) => ({ ...prev, [meta.key]: v }))}
            />
          ))}
      </div>

      {/* V060-002: Platforms section — each non-core platform has a toggle
          that hides its API fields when off. Instagram is core and always
          renders its fields. Disabled platforms keep their stored creds
          on disk; the toggle is a visibility control, not a wipe. */}
      <div className="space-y-2">
        <h5 className="text-xs font-semibold text-white">Platforms</h5>
        {PLATFORM_GROUPS.map((group) => {
          const fieldMetas = DESKTOP_CONFIG_KEYS.filter((m) => group.fieldKeys.includes(m.key));
          const enabled = isPlatformEnabled(group, draft);
          return (
            <PlatformGroupSection
              key={group.id}
              group={group}
              enabled={enabled}
              fieldMetas={fieldMetas}
              draft={draft}
              onToggle={(next) =>
                setDraft((prev) =>
                  group.enabledKey ? { ...prev, [group.enabledKey]: next ? '1' : '0' } : prev,
                )
              }
              onFieldChange={(key, value) =>
                setDraft((prev) => ({ ...prev, [key]: value }))
              }
            />
          );
        })}
      </div>

      {/* FEAT-006: Updates subsection — version readout, manual check,
          and the UPDATE_BEHAVIOR tri-state. The dropdown drives
          UpdateChecker's launch-time behavior; manual checks here run
          regardless. */}
      <UpdatesSection
        behavior={
          (UPDATE_BEHAVIOR_OPTIONS as readonly string[]).includes(draft.UPDATE_BEHAVIOR ?? '')
            ? (draft.UPDATE_BEHAVIOR as UpdateBehavior)
            : UPDATE_BEHAVIOR_DEFAULT
        }
        onBehaviorChange={(next) =>
          setDraft((prev) => ({ ...prev, UPDATE_BEHAVIOR: next }))
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
