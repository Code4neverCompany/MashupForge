'use client';

import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MashupProvider, useMashup } from './MashupContext';
import { ErrorBoundary } from './ErrorBoundary';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function MashupApp() {
  const { isLoaded } = useMashup();
  const { isAuthenticated } = useAuth();

  if (isAuthenticated === null || !isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-5">
          {/* Animated ring */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#00e6ff]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00e6ff] animate-spin" />
            <div className="absolute inset-[5px] rounded-full border border-[#c5a062]/20" />
          </div>
          <p className="text-zinc-600 text-[11px] font-semibold uppercase tracking-[0.2em]">Initializing Studio</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#c5a062]/10 border border-[#c5a062]/30 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-[#c5a062]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Access Restricted</h2>
            <p className="text-zinc-500 text-sm">Please log in to access the Multiverse Mashup Studio.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <ErrorBoundary section="Sidebar">
        <Sidebar />
      </ErrorBoundary>
      <ErrorBoundary section="MainContent">
        <MainContent />
      </ErrorBoundary>
    </div>
  );
}

export function MashupStudio() {
  return (
    <ErrorBoundary section="App">
      <MashupProvider>
        <MashupApp />
      </MashupProvider>
    </ErrorBoundary>
  );
}
