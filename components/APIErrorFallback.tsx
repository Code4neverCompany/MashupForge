'use client';

import { motion } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function APIErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-6 max-w-sm w-full text-center border-emerald-500/20"
      >
        <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-emerald-500" />
        </div>
        <h3 className="text-sm font-semibold text-white">API Error</h3>
        <p className="text-xs text-zinc-400 mt-1 mb-4">{error.message}</p>
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 mx-auto transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Request
        </button>
      </motion.div>
    </div>
  );
}
