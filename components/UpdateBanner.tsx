'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, CheckCircle2, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

/**
 * STORY-122 — auto-update detection with system-browser open.
 *
 * Polls `/api/app/version-check` on mount, compares the running app
 * version against the latest GitHub release of Code4neverCompany/
 * MashupForge, and renders one of four states:
 *
 *   - checking     → spinner
 *   - up-to-date   → muted green checkmark
 *   - available    → prominent callout with "Open in browser" button
 *   - error        → amber warning, shows the underlying error
 *
 * The "Open in browser" button uses `@tauri-apps/plugin-opener` to
 * hand the release URL to the user's default browser. The plugin
 * import is dynamic so the web/Vercel build doesn't fail at bundle
 * time — it falls back to `navigator.clipboard` there (the web deploy
 * doesn't reach this component anyway because DesktopSettingsPanel
 * short-circuits on `!isDesktop`, but the dynamic import keeps this
 * file portable).
 */

interface VersionCheckResponse {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  downloadUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
  error?: string;
}

type State =
  | { kind: 'checking' }
  | { kind: 'up-to-date'; current: string }
  | { kind: 'available'; info: VersionCheckResponse }
  | { kind: 'error'; current: string | null; message: string };

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev';

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/app/version-check')
      .then((r) => r.json() as Promise<VersionCheckResponse>)
      .then((info) => {
        if (cancelled) return;
        if (info.error) {
          setState({ kind: 'error', current: info.current, message: info.error });
          return;
        }
        if (info.updateAvailable) {
          setState({ kind: 'available', info });
        } else {
          setState({ kind: 'up-to-date', current: info.current });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          current: null,
          message: e instanceof Error ? e.message : 'network error',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpen = useCallback(async (url: string) => {
    setOpenError(null);
    // Prefer the Tauri opener plugin — hands the URL to the user's
    // default browser. Dynamic import so web builds don't fail to
    // bundle when @tauri-apps/plugin-opener isn't Tauri-runtime-backed.
    try {
      const mod = await import('@tauri-apps/plugin-opener');
      await mod.openUrl(url);
      return;
    } catch (e: unknown) {
      // Tauri plugin unavailable or user denied capability — fall
      // back to clipboard copy so the user can still reach the URL.
      const detail = e instanceof Error ? e.message : String(e);
      try {
        await navigator.clipboard.writeText(url);
        setOpenError(`Opener unavailable (${detail}). URL copied to clipboard.`);
      } catch {
        setOpenError(`Opener unavailable (${detail}). Copy the URL manually.`);
      }
    }
  }, []);

  if (state.kind === 'checking') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-zinc-600 py-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking for updates…
      </div>
    );
  }

  if (state.kind === 'up-to-date') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-emerald-500/80 py-2">
        <CheckCircle2 className="w-3 h-3" />
        MashupForge v{state.current}
        <span className="text-zinc-600 font-mono">({BUILD_SHA})</span>
        — up to date
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex items-start gap-2 text-[11px] text-amber-500/80 py-2">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Update check failed
          {state.current ? ` (running v${state.current}` : ''}
          {state.current ? <span className="text-zinc-600 font-mono ml-1">({BUILD_SHA})</span> : null}
          {state.current ? ')' : ''}: {state.message}
        </span>
      </div>
    );
  }

  const { info } = state;
  // STORY-134: "Update Now" targets the .msi asset directly so the browser
  // starts downloading the installer immediately instead of landing on the
  // release page. If the release has no .msi (edge case before CI finishes
  // uploading assets), fall back to the release page.
  const installerUrl = info.downloadUrl;
  const releasePage = info.releaseUrl;
  const primaryTarget = installerUrl || releasePage || '';

  return (
    <div className="rounded-lg border border-[#c5a062]/40 bg-[#c5a062]/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Download className="w-3.5 h-3.5 text-[#c5a062] shrink-0" />
        <span className="text-xs font-semibold text-white">
          Update available — v{info.latest}
        </span>
        <span className="text-[10px] text-zinc-500 ml-auto">
          (currently v{info.current})
        </span>
      </div>

      <p className="text-[10px] text-zinc-500 leading-relaxed">
        {installerUrl
          ? 'Click Update Now to download the installer in your browser, then run it to apply the update.'
          : 'A newer build of MashupForge is available on GitHub — the installer asset is not yet attached to this release.'}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleOpen(primaryTarget)}
          disabled={!primaryTarget}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#c5a062] hover:bg-[#d4b278] disabled:opacity-40 disabled:cursor-not-allowed text-[#050505] transition-colors"
          aria-label={installerUrl ? 'Download installer now' : 'Open release page in browser'}
        >
          <Download className="w-3 h-3" />
          {installerUrl ? 'Update Now' : 'Open release page'}
        </button>
        {installerUrl && releasePage && (
          <button
            type="button"
            onClick={() => handleOpen(releasePage)}
            className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
            aria-label="View release notes in browser"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            View release page
          </button>
        )}
      </div>

      {openError && (
        <p className="text-[10px] text-amber-500/80 leading-relaxed">
          {openError}
        </p>
      )}

      {info.notes && (
        <details className="text-[10px] text-zinc-500 pt-1">
          <summary className="cursor-pointer hover:text-zinc-300">
            Release notes
          </summary>
          <pre className="whitespace-pre-wrap mt-1.5 max-h-40 overflow-y-auto font-mono text-zinc-600 leading-snug">
            {info.notes}
          </pre>
        </details>
      )}
    </div>
  );
}
