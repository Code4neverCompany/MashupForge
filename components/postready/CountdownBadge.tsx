'use client';

/**
 * V080-DES-002 — Compact countdown pill shown on scheduled Post Ready
 * cards. Updates every 60s so the label tracks time without re-render
 * storms. Overdue posts flip red; near-term (<1h) flip amber.
 */

import { useEffect, useState } from 'react';
import type { ScheduledPost } from '@/types/mashup';

export interface CountdownBadgeProps {
  scheduledPost: ScheduledPost | undefined;
}

type Tone = 'active' | 'soon' | 'overdue';

function toTimestamp(date: string, time: string): number | null {
  // YYYY-MM-DD · HH:MM (24h) — treat as local time.
  const [hh, mm] = time.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return dt.getTime();
}

function formatCountdown(deltaMs: number): { label: string; tone: Tone } {
  const future = deltaMs >= 0;
  const abs = Math.abs(deltaMs);
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let body: string;
  if (days >= 2) body = `${days}d ${hours % 24}h`;
  else if (days === 1) body = `1d ${hours % 24}h`;
  else if (hours >= 1) body = `${hours}h ${mins % 60}m`;
  else if (mins >= 1) body = `${mins}m`;
  else body = 'now';

  if (!future) return { label: `overdue by ${body}`, tone: 'overdue' };
  if (hours < 1) return { label: `in ${body}`, tone: 'soon' };
  return { label: `in ${body}`, tone: 'active' };
}

export function CountdownBadge({ scheduledPost }: CountdownBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!scheduledPost) return null;
  if (scheduledPost.status === 'posted' || scheduledPost.status === 'rejected') return null;

  const ts = toTimestamp(scheduledPost.date, scheduledPost.time);
  if (ts === null) return null;

  const { label, tone } = formatCountdown(ts - now);

  const toneClass =
    tone === 'overdue'
      ? 'bg-red-500/20 border-red-400/50 text-red-200'
      : tone === 'soon'
        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
        : 'bg-[#c5a062]/20 border-[#c5a062]/40 text-[#c5a062]';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${toneClass}`}
      title={`Scheduled ${scheduledPost.date} ${scheduledPost.time}`}
    >
      {label}
    </span>
  );
}
