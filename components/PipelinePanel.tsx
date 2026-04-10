'use client';

import { useState } from 'react';
import {
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  Lightbulb,
} from 'lucide-react';
import { useMashup } from './MashupContext';

export function PipelinePanel() {
  const {
    pipelineEnabled,
    pipelineRunning,
    pipelineQueue,
    pipelineProgress,
    pipelineLog,
    pipelineDelay,
    setPipelineDelay,
    togglePipeline,
    startPipeline,
    stopPipeline,
    ideas,
  } = useMashup();

  const [logExpanded, setLogExpanded] = useState(true);
  const [queueExpanded, setQueueExpanded] = useState(true);

  const pendingIdeas = ideas.filter(i => i.status === 'idea');
  const reversedLog = [...pipelineLog].reverse();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Zap className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Ideas-to-Content Pipeline</h2>
          <p className="text-sm text-zinc-400">Automatically process ideas into images, captions, and scheduled posts</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Pipeline</span>
            <button
              onClick={togglePipeline}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                pipelineEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  pipelineEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              pipelineEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {pipelineEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!pipelineRunning ? (
              <button
                onClick={startPipeline}
                disabled={!pipelineEnabled || pendingIdeas.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Start Pipeline
              </button>
            ) : (
              <button
                onClick={stopPipeline}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Delay config */}
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
          <Clock className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Delay between ideas:</span>
          <input
            type="number"
            min={5}
            max={300}
            value={pipelineDelay}
            onChange={e => setPipelineDelay(Math.max(5, Math.min(300, Number(e.target.value))))}
            className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white text-center"
          />
          <span className="text-sm text-zinc-500">seconds</span>
        </div>

        {/* Stats */}
        <div className="flex gap-4 pt-2 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-400">Pending ideas: <span className="text-white font-medium">{pendingIdeas.length}</span></span>
          </div>
          {pipelineRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-sm text-indigo-400 font-medium">Running</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      {pipelineProgress && (
        <div className="bg-zinc-900 rounded-xl border border-indigo-500/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Processing idea {pipelineProgress.current} of {pipelineProgress.total}</span>
            <span className="text-xs text-zinc-400">{Math.round((pipelineProgress.current / pipelineProgress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(pipelineProgress.current / pipelineProgress.total) * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
            <span className="text-xs text-zinc-400">{pipelineProgress.currentStep}</span>
          </div>
          <p className="text-sm text-zinc-300 truncate">{pipelineProgress.currentIdea}</p>
        </div>
      )}

      {/* Queue */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setQueueExpanded(!queueExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-sm font-medium text-zinc-300">Queue ({pipelineRunning ? pipelineQueue.length : pendingIdeas.length})</span>
          {queueExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>
        {queueExpanded && (
          <div className="border-t border-zinc-800 max-h-60 overflow-y-auto">
            {(pipelineRunning ? pipelineQueue : pendingIdeas).length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 text-center">No ideas in queue</p>
            ) : (
              (pipelineRunning ? pipelineQueue : pendingIdeas).map((idea, idx) => (
                <div key={idea.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/50 last:border-0">
                  <span className="text-xs text-zinc-600 font-mono w-6">{idx + 1}</span>
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                  <span className="text-sm text-zinc-300 truncate">{idea.concept}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Log */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setLogExpanded(!logExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-sm font-medium text-zinc-300">Pipeline Log ({pipelineLog.length})</span>
          {logExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>
        {logExpanded && (
          <div className="border-t border-zinc-800 max-h-80 overflow-y-auto">
            {reversedLog.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 text-center">No log entries yet</p>
            ) : (
              reversedLog.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/50 last:border-0">
                  {entry.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">{entry.step}</span>
                      <span className="text-xs text-zinc-600">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 truncate">{entry.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
