// V040-DES-003: transient notice shown when a carousel falls below the
// 2-image threshold. Presentational only — parent owns the timer and the
// actual carousel → single-post transition (which requires PROP).

import { AlertTriangle } from 'lucide-react';

export function DegradeNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 motion-safe:animate-[fadeIn_200ms_ease-out]"
    >
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Degrading to single-image post…</span>
    </div>
  );
}
