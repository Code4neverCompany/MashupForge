'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting: boolean;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Trigger a branded toast from anywhere — React or non-React.
 *
 * Usage:
 *   import { showToast } from '@/components/Toast';
 *   showToast('Image saved!', 'success');
 */
export function showToast(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<{ message: string; type: ToastType }>('mashup:toast', {
      detail: { message, type },
    })
  );
}

// ── Config ───────────────────────────────────────────────────────────────────

const DISMISS_MS = 3500;
const EXIT_MS    = 280;
const MAX_STACK  = 4;

const TYPE_CFG: Record<ToastType, {
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  borderClass: string;
  barClass: string;
}> = {
  success: {
    Icon: CheckCircle2,
    iconClass:   'text-[#00e6ff]',
    borderClass: 'border-[#00e6ff]/30',
    barClass:    'bg-[#00e6ff]',
  },
  error: {
    Icon: XCircle,
    iconClass:   'text-red-400',
    borderClass: 'border-red-500/30',
    barClass:    'bg-red-500',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass:   'text-[#c5a062]',
    borderClass: 'border-[#c5a062]/40',
    barClass:    'bg-[#c5a062]',
  },
  info: {
    Icon: Info,
    iconClass:   'text-zinc-400',
    borderClass: 'border-zinc-700/60',
    barClass:    'bg-zinc-600',
  },
};

// ── Component ─────────────────────────────────────────────────────────────

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = (id: string) => {
    // Mark as exiting so CSS exit animation plays
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, EXIT_MS);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type: ToastType }>).detail;
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const item: ToastItem = { id, message, type, exiting: false };

      setToasts((prev) => {
        const next = [...prev, item];
        return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
      });

      timers.current[id] = setTimeout(() => dismiss(id), DISMISS_MS);
    };

    window.addEventListener('mashup:toast', handler);
    return () => {
      window.removeEventListener('mashup:toast', handler);
      Object.values(timers.current).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => {
        const { Icon, iconClass, borderClass, barClass } = TYPE_CFG[toast.type];
        return (
          <div
            key={toast.id}
            role="alert"
            className={`
              pointer-events-auto relative flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]
              rounded-xl border bg-[#050505] px-4 py-3
              shadow-[0_8px_32px_rgba(0,0,0,0.6)]
              overflow-hidden
              ${borderClass}
              ${toast.exiting
                ? 'animate-[toast-exit_280ms_ease-in_forwards]'
                : 'animate-[toast-enter_240ms_cubic-bezier(0.34,1.56,0.64,1)_forwards]'
              }
            `}
          >
            {/* Accent bar — left edge */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${barClass} opacity-80`} />

            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />

            <p className="flex-1 text-sm text-zinc-200 leading-snug pr-1">
              {toast.message}
            </p>

            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Auto-dismiss progress bar */}
            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] ${barClass} opacity-30`}
              style={{
                animation: toast.exiting
                  ? 'none'
                  : `toast-bar ${DISMISS_MS}ms linear forwards`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
