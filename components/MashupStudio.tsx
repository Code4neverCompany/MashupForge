'use client';

import dynamic from 'next/dynamic';
import { MashupProvider, useMashup } from './MashupContext';
import { ErrorBoundary } from './ErrorBoundary';
import { DesktopLoadingScreen } from './DesktopLoadingScreen';
import { PipelineResumePrompt } from './PipelineResumePrompt';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const Sidebar = dynamic(
  () => import('./Sidebar').then((m) => m.Sidebar),
  { ssr: false },
);

const MainContent = dynamic(
  () => import('./MainContent').then((m) => m.MainContent),
  { ssr: false },
);

function MashupApp() {
  const { isLoaded } = useMashup();
  const { isAuthenticated } = useAuth();

  if (isAuthenticated === null || !isLoaded) {
    return <DesktopLoadingScreen />;
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
      <PipelineResumePrompt />
    </div>
  );
}

export function MashupStudio() {
  return (
    <ErrorBoundary section="App" fullScreen>
      <MashupProvider>
        <MashupApp />
      </MashupProvider>
    </ErrorBoundary>
  );
}
