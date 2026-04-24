'use client';

/**
 * V040-004 — compact header pill showing pipeline state on every tab.
 * Running dot (pulsing when active), queue count, and a live countdown
 * to the next idea when the daemon is mid-sleep in continuous mode.
 *
 * Countdown source: the daemon's only signal about "next cycle at" is
 * its own progress string "Next cycle in N min" (set right before the
 * sleep-slice loop in usePipelineDaemon). Rather than add a separate
 * `pipelineNextRunAt` through the hook/context/types stack, we parse
 * that string when it first appears, lock in a local deadline, and
 * tick 1s until progress flips to something else or the pipeline stops.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useMashup, type ViewType } from './MashupContext';

interface Props {
  setView: (v: ViewType) => void;
}

const SLEEP_MSG_RE = /Next cycle in (\d+) min/;

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

export const PipelineStatusStrip: React.FC<Props> = ({ setView }) => {
  const {
    pipelineEnabled,
    pipelineRunning,
    pipelineQueue,
    pipelineProgress,
    pipelineContinuous,
  } = useMashup();

  const [now, setNow] = useState(() => Date.now());
  const deadlineRef = useRef<number | null>(null);
  const lastSleepMsgRef = useRef<string | null>(null);

  const sleepMsg = pipelineProgress?.currentStep ?? '';
  const sleepMatch = sleepMsg.match(SLEEP_MSG_RE);

  if (sleepMatch) {
    if (lastSleepMsgRef.current !== sleepMsg) {
      const minutes = Number(sleepMatch[1]);
      deadlineRef.current = Date.now() + minutes * 60 * 1000;
      lastSleepMsgRef.current = sleepMsg;
    }
  } else {
    deadlineRef.current = null;
    lastSleepMsgRef.current = null;
  }

  useEffect(() => {
    if (!deadlineRef.current) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepMsg]);

  const queueCount = pipelineQueue.length;
  const dotClass = pipelineRunning
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse'
    : pipelineEnabled
      ? 'bg-amber-400/80'
      : 'bg-zinc-600';
  const label = pipelineRunning ? 'Running' : pipelineEnabled ? 'Armed' : 'Idle';

  let timerText: string | null = null;
  if (deadlineRef.current && pipelineRunning && pipelineContinuous) {
    timerText = `Next in ${formatCountdown(deadlineRef.current - now)}`;
  } else if (pipelineRunning && pipelineProgress?.currentIdea) {
    timerText = pipelineProgress.currentIdea.length > 24
      ? `${pipelineProgress.currentIdea.slice(0, 24)}…`
      : pipelineProgress.currentIdea;
  } else if (pipelineEnabled && pipelineContinuous && !pipelineRunning) {
    timerText = 'Ready';
  }

  return (
    <button
      type="button"
      onClick={() => setView('pipeline')}
      title="Open Pipeline"
      aria-label={`Pipeline ${label}, queue ${queueCount}${timerText ? `, ${timerText}` : ''}. Open pipeline tab.`}
      className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl border border-[#c5a062]/20 bg-zinc-900/50 hover:bg-zinc-800/70 hover:border-[#00e6ff]/40 transition-colors shrink-0 text-xs text-zinc-300"
    >
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <Zap className="w-3.5 h-3.5 text-[#c5a062]" aria-hidden="true" />
        <span className="font-medium text-zinc-200">{label}</span>
      </span>
      <span className="h-3 w-px bg-zinc-700" aria-hidden="true" />
      <span className="flex items-center gap-1.5 tabular-nums">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Queue</span>
        <span className={queueCount > 0 ? 'text-[#00e6ff] font-medium' : 'text-zinc-400'}>{queueCount}</span>
      </span>
      {timerText && (
        <>
          <span className="h-3 w-px bg-zinc-700" aria-hidden="true" />
          <span className="text-zinc-400 tabular-nums max-w-[140px] truncate">{timerText}</span>
        </>
      )}
    </button>
  );
};
