'use client';

import { motion } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function APIErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-6 max-w-sm w-full text-center"
      >
        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">API Error</h3>
        <p className="text-xs text-zinc-400 mb-5">{error.message}</p>
        <button
          onClick={resetErrorBoundary}
          className="btn-primary text-xs px-3 py-1.5 mx-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Request
        </button>
      </motion.div>
    </div>
  );
}
