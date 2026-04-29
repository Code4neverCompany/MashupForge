'use client';

// MMX-TERMINAL (Story 3 of MMX-INTEGRATION-V2): xterm.js-based modal
// that streams an interactive shell to the active AI agent CLI (mmx
// chat or `pi chat --no-browser`) over the /api/ai-terminal WebSocket
// bridge defined in MMX-WEBSOCKET (Story 4). Dynamic-imported by the
// SettingsModal so xterm.js never lands in the SSR bundle.

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface AiTerminalModalProps {
  /** 'mmx' | 'pi' — which provider to spawn on the server side. */
  provider: 'mmx' | 'pi';
  /** pi.dev API key, threaded into the spawn args by the route. Ignored
   *  by the route when provider === 'mmx'. */
  piApiKey?: string;
  onClose: () => void;
}

export default function AiTerminalModal({ provider, piApiKey, onClose }: AiTerminalModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#c5a062',
        selectionBackground: 'rgba(197,160,98,0.35)',
        black: '#1a1a1a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#00e6ff',
        magenta: '#c5a062',
        cyan: '#00e6ff',
        white: '#fafafa',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const onResize = () => {
      try { fit.fit(); } catch { /* terminal disposed mid-resize */ }
    };
    window.addEventListener('resize', onResize);

    // Build the WS URL relative to the current origin so dev (http) and
    // desktop (tauri://) both resolve. searchParams carry the provider
    // selection plus any credentials the route needs to spawn the CLI.
    const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${wsScheme}//${window.location.host}/api/ai-terminal`);
    url.searchParams.set('provider', provider);
    if (provider === 'pi' && piApiKey) url.searchParams.set('apiKey', piApiKey);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch (e) {
      term.writeln(`\x1b[31mFailed to open WebSocket: ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
      return () => {
        window.removeEventListener('resize', onResize);
        term.dispose();
      };
    }
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      term.writeln(`\x1b[2mConnected to ${provider} CLI…\x1b[0m`);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term.write(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      }
    };
    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[WebSocket error — see browser console]\x1b[0m');
    };
    ws.onclose = (ev) => {
      term.writeln(`\r\n\x1b[2m[connection closed${ev.code ? ` — code ${ev.code}` : ''}]\x1b[0m`);
    };

    const inputDisp = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    return () => {
      window.removeEventListener('resize', onResize);
      inputDisp.dispose();
      try { ws.close(); } catch { /* already closed */ }
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [provider, piApiKey]);

  // Escape closes the modal. Listen on document so focus inside the
  // terminal still triggers — xterm captures keystrokes for the shell,
  // but Escape isn't a control char it forwards by default.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${provider} CLI terminal`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-[#0a0a0a] border border-[#c5a062]/30 rounded-none sm:rounded-2xl w-full sm:max-w-4xl h-full sm:h-[70vh] flex flex-col overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#c5a062]/20 bg-[#050505]">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-[#c5a062]" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              AI Agent CLI · {provider}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
            aria-label="Close terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div ref={containerRef} className="flex-1 min-h-0 p-2 bg-[#0a0a0a]" />
      </motion.div>
    </div>
  );
}
