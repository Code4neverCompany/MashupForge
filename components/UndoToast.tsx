'use client';

/**
 * V040-006 — bottom-right toast shown after a bulk approve/reject in
 * the approval queue, with a 10-second window to revert the action.
 * The toast handles its own countdown tick and auto-dismiss; the
 * caller owns the undo handler (i.e. knows how to restore the
 * pre-action state from a snapshot it captured beforehand).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Undo2, X } from 'lucide-react';

interface Props {
  message: string;
  durationMs: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<Props> = ({ message, durationMs, onUndo, onDismiss }) => {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const deadlineRef = useRef<number>(Date.now() + durationMs);

  useEffect(() => {
    deadlineRef.current = Date.now() + durationMs;
    setRemainingMs(durationMs);
    const id = setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        clearInterval(id);
        onDismiss();
        return;
      }
      setRemainingMs(left);
    }, 100);
    return () => clearInterval(id);
  }, [durationMs, onDismiss]);

  const pct = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-zinc-900/95 border border-[#c5a062]/30 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 text-sm text-zinc-200">{message}</div>
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1 text-xs font-semibold text-[#00e6ff] hover:text-[#00e6ff]/80 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
          <span className="text-zinc-500 font-normal tabular-nums ml-1">{secondsLeft}s</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-[#c5a062] transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
