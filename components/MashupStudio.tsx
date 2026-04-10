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
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest animate-pulse">Initializing Studio...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500" />
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-zinc-500 text-sm">Please log in to access the Multiverse Mashup Studio.</p>
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
