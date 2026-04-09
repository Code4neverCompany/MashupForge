'use client';

import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MashupProvider, useMashup } from './MashupContext';
import { Loader2 } from 'lucide-react';

function MashupApp() {
  const { isLoaded } = useMashup();

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <MainContent />
    </div>
  );
}

export function MashupStudio() {
  return (
    <MashupProvider>
      <MashupApp />
    </MashupProvider>
  );
}
