'use client';

import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import {
  Settings as SettingsIcon,
  X,
  Check,
  Image as ImageIcon,
  Trash2,
  Folder,
  Plus,
  Tag,
  Minus,
  Save,
  FolderOpen,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import {
  LEONARDO_MODELS,
  type Collection,
  type GeneratedImage,
} from './MashupContext';
import type { UserSettings, WatermarkSettings } from '@/types/mashup';
import { DesktopSettingsPanel } from './DesktopSettingsPanel';

// FIX-100 slice A: extracted from MainContent.tsx (~714 LOC).
// PiStatus shape lifted from the inline declaration that lived inside
// MainContent — moved to module scope so the prop interface can refer to it.
export interface PiStatus {
  installed: boolean;
  authenticated: boolean;
  running: boolean;
  provider: string | null;
  model: string | null;
  modelsAvailable: number;
  lastError: string | null;
}

export type PiBusy = null | 'install' | 'start' | 'stop' | 'setup';

const RECOMMENDED_NICHES = [
  'Multiverse Mashup',
  'Fan Fiction & Lore',
  'Merchandise & Collectibles',
  'Cosplay & Fan Art',
  'Pop Culture Crossovers',
  'Alternate Realities',
  'Sci-Fi & Fantasy',
  'Retro & Nostalgia',
  'Cyberpunk & Futurism',
  'Grimdark & Gothic',
  'Street-Level Heroes',
  'Galactic Empires',
  'Eldritch Horrors',
  'Mythic Legends',
];

const RECOMMENDED_GENRES = [
  'Visual Storytelling',
  'High Contrast',
  'Emotional Resonance',
  'Cinematic Crossovers',
  'What If Scenarios',
  'Alternative Timelines',
  'Epic Battles',
  'Character Dialogues',
  'Behind-the-Scenes Concepts',
  'Meme-worthy Mashups',
  'Deep Lore Explorations',
  'Hyper-Realistic',
  'Dramatic Lighting',
  'Epic Action',
  'Concept Art',
  'Digital Illustration',
  'Noir & Gritty',
  'Vibrant & Neon',
  'Surreal & Abstract',
  'Minimalist Design',
];

interface SettingsModalProps {
  onClose: () => void;
  settings: UserSettings;
  updateSettings: (
    patch: Partial<UserSettings> | ((prev: UserSettings) => Partial<UserSettings>),
  ) => void;
  isDesktop: boolean | null;
  piStatus: PiStatus | null;
  piBusy: PiBusy;
  piError: string | null;
  piSetupMsg: string | null;
  handlePiSetup: () => void;
  refreshPiStatus: () => void;
  collections: Collection[];
  savedImages: GeneratedImage[];
  deleteCollection: (id: string) => void;
  openCollectionModal: () => void;
}

export function SettingsModal({
  onClose,
  settings,
  updateSettings: updateSettingsProp,
  isDesktop,
  piStatus,
  piBusy,
  piError,
  piSetupMsg,
  handlePiSetup,
  refreshPiStatus,
  collections,
  savedImages,
  deleteCollection,
  openCollectionModal,
}: SettingsModalProps) {
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Inline personality-save input — replaces the blocking prompt() dialog.
  const [personalityName, setPersonalityName] = useState<string | null>(null);
  // Which password fields are currently revealed.
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const toggleReveal = (field: string) =>
    setRevealedFields((prev) => {
      const next = new Set(prev);
      next.has(field) ? next.delete(field) : next.add(field);
      return next;
    });
  const copyField = (value: string) =>
    navigator.clipboard.writeText(value).then(
      () => showToast('Copied to clipboard', 'success'),
      () => showToast('Failed to copy', 'error'),
    );

  // Wrapper that triggers the "Saved" indicator on every settings write.
  const updateSettings: typeof updateSettingsProp = (patch) => {
    updateSettingsProp(patch);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setShowSaved(true);
    savedTimer.current = setTimeout(() => setShowSaved(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-[#0d0d0d]/99 backdrop-blur-xl border-0 sm:border border-[#c5a062]/30 rounded-none sm:rounded-2xl w-full sm:max-w-2xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.8),0_0_60px_rgba(197,160,98,0.08),0_0_0_1px_rgba(197,160,98,0.06)] flex flex-col h-full sm:h-auto max-h-[100dvh] sm:max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-[#c5a062]/20 bg-[#050505]/60 shrink-0">
          <h3 className="type-title flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-[#c5a062]" />
            Settings
          </h3>
          <div className="flex items-center gap-3">
            <motion.span
              animate={{ opacity: showSaved ? 1 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-emerald-400 flex items-center gap-1 pointer-events-none select-none"
            >
              <Check className="w-3 h-3" />
              Saved
            </motion.span>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* API Keys Section */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <label className="text-sm font-medium text-zinc-300">API Keys</label>
            {/*
              STORY-130: In desktop mode the Leonardo API key is owned by
              DesktopSettingsPanel (writes to config.json + injects env var
              into the sidecar). Rendering a second input here persisted to
              origin-scoped IndexedDB and silently shadowed the real value
              — top appeared broken while bottom worked. Hide in desktop.
            */}
            {isDesktop === false && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Leonardo API Key</label>
                <div className="relative">
                  <input
                    type={revealedFields.has('leonardo') ? 'text' : 'password'}
                    value={settings.apiKeys.leonardo || ''}
                    onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, leonardo: e.target.value } })}
                    placeholder="••••••••••••••••"
                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 pr-16 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {settings.apiKeys.leonardo && (
                      <button type="button" onClick={() => copyField(settings.apiKeys.leonardo!)} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Copy API key">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => toggleReveal('leonardo')} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label={revealedFields.has('leonardo') ? 'Hide API key' : 'Show API key'}>
                      {revealedFields.has('leonardo') ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h4 className="text-sm font-bold text-white">Free Social Posting Setup</h4>

              {/*
                INSTAGRAM-CRED-FIX: In desktop mode IG creds are owned by
                DesktopSettingsPanel (writes to config.json, stable on-disk
                location). Rendering a second input here persisted to
                origin-scoped IndexedDB silently lost data on webview origin
                drift (STORY-121 fallback path). Hide in desktop.
              */}
              {isDesktop === false && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Instagram Graph API (Free)</label>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      type="text"
                      value={settings.apiKeys.instagram?.igAccountId || ''}
                      onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, instagram: { accessToken: settings.apiKeys.instagram?.accessToken ?? '', igAccountId: e.target.value } } })}
                      placeholder="Instagram Business Account ID"
                      className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                    />
                    <div className="relative">
                      <input
                        type={revealedFields.has('ig-token') ? 'text' : 'password'}
                        value={settings.apiKeys.instagram?.accessToken || ''}
                        onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, instagram: { accessToken: e.target.value, igAccountId: settings.apiKeys.instagram?.igAccountId ?? '' } } })}
                        placeholder="Long-lived Page Access Token"
                        className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 pr-16 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {settings.apiKeys.instagram?.accessToken && (
                          <button type="button" onClick={() => copyField(settings.apiKeys.instagram!.accessToken)} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Copy access token">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button type="button" onClick={() => toggleReveal('ig-token')} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label={revealedFields.has('ig-token') ? 'Hide token' : 'Show token'}>
                          {revealedFields.has('ig-token') ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Requires a Facebook Developer App linked to an Instagram Business account.</p>
                </div>
              )}

              {/* Pinterest — hidden on desktop; config.json owns these keys */}
              {isDesktop === false && (
              <div className="space-y-2 pt-3 border-t border-zinc-800/60">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pinterest API</label>
                <div className="grid grid-cols-1 gap-2">
                  <div className="relative">
                    <input
                      type={revealedFields.has('pinterest-token') ? 'text' : 'password'}
                      value={settings.apiKeys.pinterest?.accessToken || ''}
                      onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, pinterest: { accessToken: e.target.value, boardId: settings.apiKeys.pinterest?.boardId } } })}
                      placeholder="Pinterest Access Token"
                      className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 pr-16 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {settings.apiKeys.pinterest?.accessToken && (
                        <button type="button" onClick={() => copyField(settings.apiKeys.pinterest!.accessToken)} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Copy access token">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={() => toggleReveal('pinterest-token')} className="text-zinc-500 hover:text-zinc-300 transition-colors" aria-label={revealedFields.has('pinterest-token') ? 'Hide token' : 'Show token'}>
                        {revealedFields.has('pinterest-token') ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={settings.apiKeys.pinterest?.boardId || ''}
                    onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, pinterest: { accessToken: settings.apiKeys.pinterest?.accessToken ?? '', boardId: e.target.value } } })}
                    placeholder="Board ID (optional — defaults to account's first board)"
                    className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Create an app at developers.pinterest.com with <code>pins:write</code> and <code>boards:read</code> scopes.
                </p>
              </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <h4 className="text-lg font-medium text-white mb-2">Image Generation Settings</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Leonardo Model</label>
                <select
                  value={settings.defaultLeonardoModel}
                  onChange={(e) => updateSettings({ defaultLeonardoModel: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                >
                  {LEONARDO_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pi.dev — the AI engine for chat, ideas, captions, tags */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <h4 className="text-lg font-medium text-white mb-2">Pi.dev AI Engine</h4>
            <p className="text-[11px] text-zinc-500 -mt-2">
              All text AI runs through <code>pi</code> as a subprocess.
              Configure provider/model + API keys in your terminal:{' '}
              <code className="text-zinc-300">pi config</code>.
            </p>

            {/* Status row */}
            <div className="flex items-center gap-3">
              {(() => {
                const s = piStatus;
                let label = 'Checking…';
                let bgColor = 'bg-zinc-700';
                let textColor = 'text-white';
                let dotColor = 'bg-white/70';
                if (s) {
                  if (!s.installed) { label = 'Not Installed'; bgColor = 'bg-red-600'; }
                  else if (!s.authenticated) { label = 'Not Authenticated'; bgColor = 'bg-[#c5a062]'; textColor = 'text-[#050505]'; dotColor = 'bg-[#050505]/40'; }
                  else if (s.running) { label = 'Running'; bgColor = 'bg-[#00e6ff]'; textColor = 'text-[#050505]'; dotColor = 'bg-[#050505]/40'; }
                  else { label = 'Ready'; bgColor = 'bg-[#00e6ff]/20 border border-[#00e6ff]/30'; textColor = 'text-[#00e6ff]'; dotColor = 'bg-[#00e6ff]'; }
                }
                return (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${bgColor} ${textColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {label}
                  </span>
                );
              })()}
              {piStatus?.provider && piStatus?.model && (
                <span className="text-[11px] text-zinc-400">
                  {piStatus.provider}/{piStatus.model}
                </span>
              )}
              {piStatus && piStatus.modelsAvailable > 0 && (
                <span className="text-[11px] text-zinc-500">
                  {piStatus.modelsAvailable} models available
                </span>
              )}
            </div>

            {/* Autonomous boot status — no manual install/start buttons.
                Install + start are triggered automatically on app mount
                (see piAutoBootRef effect in MainContent). The only user
                action that remains is the Sign-in button below for pi's
                auth flow, which requires interactive OAuth. */}
            <div className="flex flex-wrap gap-2 items-center">
              {piBusy === 'install' && (
                <span className="text-[11px] text-[#00e6ff]">Installing pi.dev (first launch only, ~30–60s)…</span>
              )}
              {piBusy === 'start' && (
                <span className="text-[11px] text-[#00e6ff]">Starting pi.dev…</span>
              )}
              {!piBusy && piStatus && !piStatus.installed && (
                <span className="text-[11px] text-amber-400">pi.dev not installed — retry pending</span>
              )}
              {!piBusy && piStatus?.running && (
                <span className="text-[11px] text-emerald-400">pi.dev running</span>
              )}
              <button
                onClick={() => refreshPiStatus()}
                disabled={piBusy !== null}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {piStatus && !piStatus.authenticated && piStatus.installed && (
              <button
                onClick={handlePiSetup}
                disabled={piBusy !== null}
                className="btn-gold-sm rounded-lg"
              >
                {piBusy === 'setup' ? 'Opening…' : 'Setup Pi.dev'}
              </button>
            )}

            {piSetupMsg && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-1">
                <p className="text-[11px] text-amber-300 font-medium">Pi Setup gestartet</p>
                <p className="text-[11px] text-zinc-300">
                  Terminal öffnen und verbinden:
                </p>
                <code className="block text-[11px] text-emerald-400 bg-zinc-950 px-2 py-1 rounded">
                  tmux attach -t pi-setup
                </code>
                <p className="text-[10px] text-zinc-500">
                  Pi führt dich durch Provider-Auswahl und Login. Danach &quot;Start Pi&quot; drücken.
                </p>
              </div>
            )}

            {piError && (
              <p className="text-[11px] text-red-400 whitespace-pre-wrap">
                {piError}
              </p>
            )}

            <p className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
              The AI System Prompt lives in <span className="text-zinc-300">AI Agent Personality</span> below. Restart pi (stop + start) after changing it for the new prompt to take effect.
            </p>
          </div>

          {/* Watermark Settings */}
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <h4 className="text-lg font-medium text-white mb-4">Watermark (Wasserzeichen)</h4>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-zinc-300">Enable Watermark</span>
              <button
                onClick={() => updateSettings({ watermark: { ...settings.watermark, enabled: !settings.watermark?.enabled } as WatermarkSettings })}
                className={`w-12 h-6 rounded-full transition-colors ${settings.watermark?.enabled ? 'bg-[#00e6ff]' : 'bg-zinc-700'} relative`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.watermark?.enabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {settings.watermark?.enabled && (
              <div className="space-y-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/60">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Upload Logo</label>
                  <input
                    type="file"
                    id="watermark-upload"
                    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          updateSettings({ watermark: { ...settings.watermark, image: event.target?.result as string } as WatermarkSettings });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="watermark-upload"
                    className="flex items-center justify-center w-full py-3 px-4 rounded-xl border-2 border-dashed border-zinc-800 hover:border-[#00e6ff]/40 hover:bg-[#00e6ff]/5 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <ImageIcon className="w-5 h-5 text-zinc-500 group-hover:text-[#00e6ff]" />
                      <span className="text-xs text-zinc-500 group-hover:text-zinc-400 font-medium">
                        {settings.watermark.image ? 'Change Logo' : 'Choose File'}
                      </span>
                    </div>
                  </label>

                  {settings.watermark.image && (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Visual Preview</span>
                        <button
                          onClick={() => updateSettings({ watermark: { ...settings.watermark, image: null } as WatermarkSettings })}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>

                      {/* Visual Indicator Box */}
                      <div className="relative aspect-video bg-zinc-900 rounded-xl border border-zinc-800/60 overflow-hidden flex items-center justify-center group">
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]" />
                        <span className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.2em] select-none">Image Canvas Preview</span>

                        {/* The Watermark Mockup */}
                        <div
                          className={`absolute transition-all duration-300 flex items-center justify-center`}
                          style={{
                            top: settings.watermark.position?.includes('top') ? '10%' : settings.watermark.position === 'center' ? '50%' : 'auto',
                            bottom: settings.watermark.position?.includes('bottom') ? '10%' : 'auto',
                            left: settings.watermark.position?.includes('left') ? '10%' : settings.watermark.position === 'center' ? '50%' : 'auto',
                            right: settings.watermark.position?.includes('right') ? '10%' : 'auto',
                            transform: settings.watermark.position === 'center' ? 'translate(-50%, -50%)' : 'none',
                            opacity: settings.watermark.opacity || 0.8,
                            width: `${(settings.watermark.scale || 0.15) * 100}%`,
                            aspectRatio: '1/1',
                            maxWidth: '40%',
                            maxHeight: '40%',
                          }}
                        >
                          <Image
                            src={settings.watermark.image}
                            alt="Watermark preview"
                            fill
                            className="object-contain drop-shadow-lg"
                            unoptimized
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-[#c5a062]/10 rounded-lg">
                        <Folder className="w-4 h-4 text-[#c5a062]" />
                      </div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Manage Collections</h4>
                    </div>
                    <button
                      onClick={openCollectionModal}
                      className="btn-blue-sm px-3 py-1 text-[10px] rounded-lg gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      New
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                    {collections.map((col) => (
                      <div key={col.id} className="group bg-zinc-900 border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between hover:border-zinc-700 transition-all">
                        <div className="space-y-0.5">
                          <h5 className="text-xs font-bold text-white">{col.name}</h5>
                          <p className="text-[9px] text-zinc-600 uppercase tracking-tighter">
                            {savedImages.filter((img) => img.collectionId === col.id).length} Images
                          </p>
                        </div>
                        <button
                          onClick={() => deleteCollection(col.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Delete Collection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {collections.length === 0 && (
                      <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                        <p className="text-[10px] text-zinc-500 italic">No collections created yet.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-[#c5a062]/10 rounded-lg">
                      <Tag className="w-4 h-4 text-[#c5a062]" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Social Media Settings</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.1em]">Channel Name (for Hashtags)</label>
                    <input
                      type="text"
                      value={settings.channelName || ''}
                      onChange={(e) => updateSettings({ channelName: e.target.value })}
                      placeholder="e.g. MultiverseMashupAI"
                      className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Position</label>
                    <select
                      value={settings.watermark.position || 'bottom-right'}
                      onChange={(e) => updateSettings({ watermark: { ...settings.watermark, position: e.target.value as WatermarkSettings['position'] } as WatermarkSettings })}
                      className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-left">Top Left</option>
                      <option value="center">Center</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Opacity</label>
                    <select
                      value={settings.watermark.opacity || 0.8}
                      onChange={(e) => updateSettings({ watermark: { ...settings.watermark, opacity: parseFloat(e.target.value) } as WatermarkSettings })}
                      className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                    >
                      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((val) => (
                        <option key={val} value={val}>{Math.round(val * 100)}%</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Size (Relative to Image)</label>
                  <select
                    value={settings.watermark.scale || 0.15}
                    onChange={(e) => updateSettings({ watermark: { ...settings.watermark, scale: parseFloat(e.target.value) } as WatermarkSettings })}
                    className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                  >
                    {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map((val) => (
                      <option key={val} value={val}>{Math.round(val * 100)}%</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Video Generation Settings */}
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <h4 className="text-lg font-medium text-white mb-4">Default Video Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/60">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Default Duration</label>
                <select
                  value={settings.defaultAnimationDuration || 5}
                  onChange={(e) => updateSettings({ defaultAnimationDuration: Number(e.target.value) as 5 | 10 })}
                  className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                >
                  <option value={5}>5 Seconds</option>
                  <option value={10}>10 Seconds</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Animation Style</label>
                <select
                  value={settings.defaultAnimationStyle || 'DYNAMIC'}
                  onChange={(e) => updateSettings({ defaultAnimationStyle: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                >
                  <option value="DYNAMIC">Dynamic</option>
                  <option value="STATIC">Static</option>
                  <option value="CINEMATIC">Cinematic</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Leonardo Video Model</label>
                <select
                  value={settings.defaultVideoModel || 'kling-3.0'}
                  onChange={(e) => updateSettings({ defaultVideoModel: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
                >
                  <option value="kling-video-o-3">Kling O3 Omni (New)</option>
                  <option value="kling-3.0">Kling 3.0 (Pro Quality)</option>
                  <option value="ray-v2">Ray V2 (High Quality)</option>
                  <option value="ray-v1">Ray V1 (Standard)</option>
                </select>
              </div>
            </div>
          </div>

          {/* AI System Prompt + Personality */}
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <h4 className="text-lg font-medium text-white mb-4">AI System Prompt</h4>
            <div className="space-y-6 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/60">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">System Prompt</label>
                <textarea
                  value={settings.agentPrompt}
                  onChange={(e) => updateSettings({ agentPrompt: e.target.value })}
                  placeholder="Define who the AI is, how it speaks, and what it focuses on..."
                  className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 min-h-[220px] resize-y leading-relaxed font-mono"
                />
                <p className="text-[10px] text-zinc-500 leading-tight">
                  This prompt shapes every AI interaction: idea generation, prompt enhancement, captions, and parameter selection. Applied to every pi request on top of the mode directive. Restart pi (Settings → Pi.dev AI Engine → Stop + Start) after editing.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Platform Niches</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {settings.agentNiches?.map((n) => (
                        <span
                          key={n}
                          className="px-2 py-1 bg-[#00e6ff]/10 text-[#00e6ff] text-[10px] rounded-lg border border-[#00e6ff]/20 flex items-center gap-1 group"
                        >
                          {n}
                          <button
                            onClick={() => updateSettings({ agentNiches: settings.agentNiches?.filter((t) => t !== n) })}
                            className="text-[#00e6ff] hover:text-red-400 transition-all"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Add custom niche..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val && !settings.agentNiches?.includes(val)) {
                            updateSettings({ agentNiches: [...(settings.agentNiches || []), val] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#00e6ff]/30"
                    />
                    <div className="pt-2">
                      <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-tight font-semibold">Recommended Niches</p>
                      <div className="flex flex-wrap gap-1.5">
                        {RECOMMENDED_NICHES.filter((n) => !settings.agentNiches?.includes(n)).map((n) => (
                          <button
                            key={n}
                            onClick={() => updateSettings({ agentNiches: [...(settings.agentNiches || []), n] })}
                            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-[#00e6ff] text-[9px] rounded-xl border border-zinc-800/60 transition-all flex items-center gap-1"
                          >
                            <Plus className="w-2 h-2" />
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Target Genres</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {settings.agentGenres?.map((g) => (
                        <span
                          key={g}
                          className="px-2 py-1 bg-[#00e6ff]/10 text-[#00e6ff] text-[10px] rounded-lg border border-[#00e6ff]/20 flex items-center gap-1 group"
                        >
                          {g}
                          <button
                            onClick={() => updateSettings({ agentGenres: settings.agentGenres?.filter((t) => t !== g) })}
                            className="text-[#00e6ff] hover:text-red-400 transition-all"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Add custom genre..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val && !settings.agentGenres?.includes(val)) {
                            updateSettings({ agentGenres: [...(settings.agentGenres || []), val] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30"
                    />
                    <div className="pt-2">
                      <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-tight font-semibold">Recommended Genres</p>
                      <div className="flex flex-wrap gap-1.5">
                        {RECOMMENDED_GENRES.filter((g) => !settings.agentGenres?.includes(g)).map((g) => (
                          <button
                            key={g}
                            onClick={() => updateSettings({ agentGenres: [...(settings.agentGenres || []), g] })}
                            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-[#00e6ff] text-[9px] rounded-xl border border-zinc-800/60 transition-all flex items-center gap-1"
                          >
                            <Plus className="w-2 h-2" />
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Saved Personalities */}
              <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Saved Personalities</label>
                  {personalityName === null ? (
                    <button
                      onClick={() => setPersonalityName('')}
                      className="text-[10px] text-[#00e6ff] hover:text-[#33eaff] flex items-center gap-1 transition-colors"
                    >
                      <Save className="w-3 h-3" />
                      Save Current
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={personalityName}
                        onChange={(e) => setPersonalityName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && personalityName.trim()) {
                            updateSettings({
                              savedPersonalities: [
                                ...(settings.savedPersonalities || []),
                                {
                                  id: `p-${Date.now()}`,
                                  name: personalityName.trim(),
                                  prompt: settings.agentPrompt || '',
                                  niches: settings.agentNiches || [],
                                  genres: settings.agentGenres || [],
                                },
                              ],
                            });
                            setPersonalityName(null);
                          }
                          if (e.key === 'Escape') setPersonalityName(null);
                        }}
                        placeholder="Personality name…"
                        className="text-[10px] bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 w-28 focus:outline-none focus:ring-1 focus:ring-[#00e6ff]/40"
                      />
                      <button
                        disabled={!personalityName.trim()}
                        onClick={() => {
                          if (!personalityName.trim()) return;
                          updateSettings({
                            savedPersonalities: [
                              ...(settings.savedPersonalities || []),
                              {
                                id: `p-${Date.now()}`,
                                name: personalityName.trim(),
                                prompt: settings.agentPrompt || '',
                                niches: settings.agentNiches || [],
                                genres: settings.agentGenres || [],
                              },
                            ],
                          });
                          setPersonalityName(null);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setPersonalityName(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {settings.savedPersonalities?.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-3 group">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">{p.name}</span>
                        <span className="text-[10px] text-zinc-500">{p.niches.length} Niches • {p.genres.length} Genres</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateSettings({
                            agentPrompt: p.prompt,
                            agentNiches: p.niches,
                            agentGenres: p.genres,
                          })}
                          className="p-2 bg-[#00e6ff]/10 text-[#00e6ff] hover:bg-[#00e6ff]/20 rounded-lg transition-all"
                          title="Load Personality"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateSettings({
                            savedPersonalities: settings.savedPersonalities?.filter((pers) => pers.id !== p.id),
                          })}
                          className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!settings.savedPersonalities || settings.savedPersonalities.length === 0) && (
                    <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                      <p className="text-xs text-zinc-500 italic">No saved personalities yet.</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => updateSettings({
                  agentPrompt: `You are a Master Content Creator and Social Media Growth Strategist. Your mission is to generate high-impact, viral-potential image prompts that drive massive traffic and engagement. You specialize in the 'Multiverse Mashup' niche, blending iconic universes like Marvel, DC, Star Wars, and Warhammer 40k. Your tone is professional yet edgy, focusing on 'what if' scenarios, alternative timelines, and epic cinematic crossovers. Every prompt you generate must be optimized for visual storytelling, high contrast, and emotional resonance to capture attention on platforms like Instagram, TikTok, and Twitter. Research current social media trends, popular crossover memes, and viral "what if" scenarios for these franchises to ensure your output is optimized for virality. Use the provided focus tags to strictly influence the style, theme, and technical execution of your output.`,
                  agentNiches: [
                    'Multiverse Mashup',
                    'Fan Fiction & Lore',
                    'Merchandise & Collectibles',
                    'Cosplay & Fan Art',
                    'Pop Culture Crossovers',
                    'Alternate Realities',
                    'Sci-Fi & Fantasy',
                    'Retro & Nostalgia',
                    'Cyberpunk & Futurism',
                    'Grimdark & Gothic',
                    'Street-Level Heroes',
                    'Galactic Empires',
                    'Eldritch Horrors',
                    'Mythic Legends',
                  ],
                  agentGenres: [
                    'Visual Storytelling',
                    'High Contrast',
                    'Emotional Resonance',
                    'Cinematic Crossovers',
                    'What If Scenarios',
                    'Alternative Timelines',
                    'Epic Battles',
                    'Character Dialogues',
                    'Behind-the-Scenes Concepts',
                    'Meme-worthy Mashups',
                    'Deep Lore Explorations',
                    'Hyper-Realistic',
                    'Dramatic Lighting',
                    'Epic Action',
                    'Concept Art',
                    'Digital Illustration',
                    'Noir & Gritty',
                    'Vibrant & Neon',
                    'Surreal & Abstract',
                    'Minimalist Design',
                  ],
                })}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl font-bold transition-all border border-zinc-800/60 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
              >
                <RefreshCw className="w-3 h-3" />
                Reset to Default Agent Personality
              </button>
            </div>
          </div>

          {/* Desktop configuration — only renders in Tauri desktop build */}
          <DesktopSettingsPanel />
        </div>

        <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="btn-blue-sm px-6 py-2 rounded-lg"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
