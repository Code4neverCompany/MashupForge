'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, CheckCircle2, Copy, Check, Loader2, AlertCircle } from 'lucide-react';

/**
 * STORY-122 — lightweight auto-update detection.
 *
 * Polls `/api/app/version-check` on mount, compares the running app
 * version against the latest GitHub release of Code4neverCompany/
 * MashupForge, and renders one of four states:
 *
 *   - checking     → spinner
 *   - up-to-date   → muted green checkmark
 *   - available    → prominent callout with release URL + copy button
 *   - error        → amber warning, shows the underlying error
 *
 * No Tauri plugin dependencies: the update URL is displayed as
 * copyable text rather than opened automatically, because Tauri v2's
 * default webview doesn't reliably route `window.open` to the system
 * browser without the opener plugin. Adding that plugin is a followup
 * (STORY-123) — this story is scoped to detection only per Maurice's
 * brief ("need update button or detection ... or simple version
 * check via API").
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

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [copied, setCopied] = useState(false);

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

  const handleCopy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard blocked — user can still manually select the text
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
        MashupForge v{state.current} — up to date
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex items-start gap-2 text-[11px] text-amber-500/80 py-2">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Update check failed
          {state.current ? ` (running v${state.current})` : ''}: {state.message}
        </span>
      </div>
    );
  }

  const { info } = state;
  const target = info.downloadUrl || info.releaseUrl || '';

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
        A newer build of MashupForge is available on GitHub. Copy the link below
        and open it in your browser to download the installer.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={target}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 bg-[#050505] border border-zinc-800/60 rounded-md px-2 py-1.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-[#c5a062]/40"
        />
        <button
          type="button"
          onClick={() => handleCopy(target)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold bg-[#c5a062] hover:bg-[#d4b278] text-[#050505] transition-colors"
          aria-label="Copy release URL"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>

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
