'use client';

import { motion } from 'motion/react';
import { X } from 'lucide-react';

// FIX-100 slice B: extracted from MainContent.tsx (~58 LOC).
// Pure presentational — name/description state stays with the parent
// since other parts of MainContent already track newCollectionName /
// newCollectionDesc. Parent owns the create-then-reset logic via
// onCreate so this component doesn't need to import the mashup context.

interface CollectionModalProps {
  onClose: () => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onCreate: () => void | Promise<void>;
}

export function CollectionModal({
  onClose,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  onCreate,
}: CollectionModalProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full sm:max-w-md bg-zinc-900/90 backdrop-blur-xl border-0 sm:border border-zinc-800/60 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden h-full sm:h-auto max-h-[100dvh] sm:max-h-none"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Create New Collection</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition-colors" aria-label="Close collection dialog">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Collection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Epic Battles, Cyberpunk DC..."
              className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="What is this collection about?"
              className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 min-h-[100px] resize-none"
            />
          </div>
        </div>
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => void onCreate()}
            className="btn-blue-sm px-6 py-2 text-sm rounded-lg"
          >
            Create Collection
          </button>
        </div>
      </motion.div>
    </div>
  );
}
