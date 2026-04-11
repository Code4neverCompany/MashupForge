'use client';

import { useState } from 'react';
import { AlertCircle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';

interface APIErrorFallbackProps {
  operation: string;
  error: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function APIErrorFallback({ operation, error, onRetry, onDismiss }: APIErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 my-2">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300">
            {operation} failed
          </p>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 mt-1 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDetails ? 'Hide' : 'Show'} details
          </button>
          {showDetails && (
            <pre className="mt-2 text-xs text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {error}
            </pre>
          )}
          <div className="flex gap-2 mt-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
