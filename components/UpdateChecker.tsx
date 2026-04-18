'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X, CheckCircle2, AlertTriangle, RotateCw } from 'lucide-react';
import { useDesktopConfig } from '../hooks/useDesktopConfig';

// Local minimal shape for the Tauri updater Update object — typed loosely
// because we import the real type dynamically and only touch a few fields.
interface UpdateLike {
  available: boolean;
  version: string;
  body?: string | null;
  downloadAndInstall: (
    onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ) => Promise<void>;
}

type State =
  | { kind: 'idle' }
  | { kind: 'available'; update: UpdateLike }
  | { kind: 'downloading'; update: UpdateLike; downloaded: number; total: number | null }
  | { kind: 'download-error'; update: UpdateLike; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'post-update'; version: string };

const DISMISS_KEY = (version: string) => `mashup_update_dismissed_${version}`;
const LAST_SEEN_KEY = 'mashup_update_last_seen_version';

export function UpdateChecker() {
  const { isDesktop } = useDesktopConfig();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const ranRef = useRef(false);

  // Run the check + post-update toast detection once per mount in desktop mode.
  useEffect(() => {
    if (isDesktop !== true) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    const run = async () => {
      // Tauri's getVersion is the authoritative source for the running app's
      // version — the npm package is version-agnostic.
      let currentVersion: string | null = null;
      try {
        const appMod = await import('@tauri-apps/api/app');
        currentVersion = await appMod.getVersion();
      } catch {
        // Non-desktop or plugin missing — silently skip.
      }

      // Post-restart "Updated to vX.Y.Z" toast: compare the running version
      // against the last-seen version from before the previous downloadAndInstall.
      if (currentVersion) {
        try {
          const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
          if (lastSeen && lastSeen !== currentVersion) {
            if (!cancelled) setState({ kind: 'post-update', version: currentVersion });
            // Only reset to idle if the post-update toast is still showing —
            // the updater check below can set 'available' within this 5s
            // window and we must not clobber it.
            window.setTimeout(() => {
              if (cancelled) return;
              setState((prev) => (prev.kind === 'post-update' ? { kind: 'idle' } : prev));
            }, 5000);
          }
          localStorage.setItem(LAST_SEEN_KEY, currentVersion);
        } catch { /* storage quota / private mode — silent */ }
      }

      try {
        const updaterMod = await import('@tauri-apps/plugin-updater');
        const update = (await updaterMod.check()) as unknown as UpdateLike | null;
        if (!update?.available || cancelled) return;

        // Skip if the user already dismissed this exact version.
        try {
          if (localStorage.getItem(DISMISS_KEY(update.version)) === '1') return;
        } catch { /* ignore */ }

        setState({ kind: 'available', update });
      } catch (e: unknown) {
        // Plugin unavailable, network failure, manifest missing — log to a
        // background error state. We don't surface this to the user because
        // an update-check failure is not actionable from here.
        const detail = e instanceof Error ? e.message : String(e);
        if (!cancelled) setState({ kind: 'error', message: detail });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  const handleUpdate = useCallback(async () => {
    if (state.kind !== 'available') return;
    const update = state.update;
    setState({ kind: 'downloading', update, downloaded: 0, total: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setState((prev) =>
            prev.kind === 'downloading'
              ? { ...prev, total: event.data?.contentLength ?? null }
              : prev,
          );
        } else if (event.event === 'Progress') {
          setState((prev) =>
            prev.kind === 'downloading'
              ? { ...prev, downloaded: prev.downloaded + (event.data?.chunkLength ?? 0) }
              : prev,
          );
        }
      });
      // On Windows / NSIS the installer closes the app and relaunches itself.
      // If we're still alive past this point, fall back to "post-update" hint.
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      setState({ kind: 'download-error', update, message: detail });
    }
  }, [state]);

  const handleRetry = useCallback(() => {
    if (state.kind !== 'download-error') return;
    setState({ kind: 'available', update: state.update });
  }, [state]);

  const handleDismissError = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  const handleDismiss = useCallback(() => {
    if (state.kind !== 'available') return;
    try {
      localStorage.setItem(DISMISS_KEY(state.update.version), '1');
    } catch { /* ignore */ }
    setState({ kind: 'idle' });
  }, [state]);

  if (state.kind === 'idle' || state.kind === 'error') return null;

  if (state.kind === 'download-error') {
    return (
      <div className="fixed bottom-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-96">
        <div className="rounded-xl border border-red-500/40 bg-[#050505]/95 backdrop-blur-md shadow-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">
                Update failed — <span className="text-red-300 font-mono">v{state.update.version}</span>
              </p>
              <p className="text-[10px] text-zinc-400 mt-1 font-mono line-clamp-3 break-words">
                {state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissError}
              aria-label="Dismiss update error"
              className="text-zinc-500 hover:text-zinc-300 transition-colors -mt-0.5 -mr-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#c5a062] hover:bg-[#d4b478] active:bg-[#a68748] text-[#050505] transition-colors"
              aria-label="Retry update"
            >
              <RotateCw className="w-3 h-3" />
              Retry
            </button>
            <button
              type="button"
              onClick={handleDismissError}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'post-update') {
    return (
      <div className="fixed bottom-4 right-4 z-[100] max-w-sm">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#050505]/95 backdrop-blur-md px-4 py-3 shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs text-zinc-200">
            Updated to <span className="font-mono text-emerald-300">v{state.version}</span>
          </span>
        </div>
      </div>
    );
  }

  const update = state.update;
  const body = (update.body ?? '').trim();
  const isDownloading = state.kind === 'downloading';
  const progress =
    isDownloading && state.total ? Math.min(100, Math.round((state.downloaded / state.total) * 100)) : null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-96">
      <div className="rounded-xl border border-[#c5a062]/40 bg-[#050505]/95 backdrop-blur-md shadow-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Download className="w-4 h-4 text-[#c5a062] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white">
              Update available — <span className="text-[#c5a062] font-mono">v{update.version}</span>
            </p>
          </div>
          {!isDownloading && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss update notification"
              className="text-zinc-500 hover:text-zinc-300 transition-colors -mt-0.5 -mr-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {body && (
          <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-wrap font-mono">
            {body}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#00e6ff] hover:bg-[#33eaff] active:bg-[#00b8cc] disabled:opacity-60 disabled:cursor-wait text-[#050505] transition-colors"
            aria-label="Download and install update now"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress !== null ? `Downloading ${progress}%` : 'Downloading…'}
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                Update Now
              </>
            )}
          </button>
          {!isDownloading && (
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
