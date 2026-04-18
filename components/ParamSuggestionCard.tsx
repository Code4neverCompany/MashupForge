'use client';

import { useState } from 'react';
import { Lightbulb, Check, X, Edit3 } from 'lucide-react';
import type { ParamSuggestion } from '@/lib/param-suggest';
import { LEONARDO_MODELS, type GenerateOptions } from '@/types/mashup';

interface Props {
  suggestion: ParamSuggestion;
  availableStyles: { name: string; uuid: string }[];
  onApply: (modelIds: string[], options: Partial<GenerateOptions>) => void;
  onDismiss: () => void;
}

/**
 * V030-007: shows a suggestion card under the prompt textarea with
 * ranked models, aspect ratio, style, image size, and negative prompt —
 * each labeled with a one-line reason. "Edit" reveals inline form
 * controls so the user can override any field before applying.
 */
export function ParamSuggestionCard({
  suggestion,
  availableStyles,
  onApply,
  onDismiss,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [modelIds, setModelIds] = useState<string[]>(suggestion.modelIds);
  const [aspectRatio, setAspectRatio] = useState<string>(suggestion.aspectRatio);
  const [style, setStyle] = useState<string | undefined>(suggestion.style);
  const [imageSize, setImageSize] = useState<'1K' | '2K'>(suggestion.imageSize);
  const [negativePrompt, setNegativePrompt] = useState<string>(
    suggestion.negativePrompt ?? '',
  );
  const [quality, setQuality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | undefined>(
    suggestion.quality,
  );
  const [promptEnhance, setPromptEnhance] = useState<'ON' | 'OFF' | undefined>(
    suggestion.promptEnhance,
  );

  const toggleModel = (id: string) => {
    setModelIds(prev => (prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]));
  };

  const handleApply = () => {
    onApply(modelIds, {
      aspectRatio,
      style,
      imageSize,
      negativePrompt: negativePrompt.trim() || undefined,
      quality,
      promptEnhance,
    });
  };

  const aspectOptions = ['1:1', '2:3', '3:2', '9:16', '16:9', '3:4', '4:3', '4:5', '5:4'];
  const sizeOptions: ('1K' | '2K')[] = ['1K', '2K'];
  const qualityOptions: ('LOW' | 'MEDIUM' | 'HIGH')[] = ['LOW', 'MEDIUM', 'HIGH'];

  return (
    <div className="bg-[#0a1a1f]/80 border border-[#00e6ff]/25 rounded-xl p-4 space-y-3 shadow-[0_0_18px_rgba(0,230,255,0.08)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#00e6ff] uppercase tracking-wider font-medium">
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Smart Suggestions</span>
          <span
            className={
              'text-[9px] normal-case tracking-normal px-1.5 py-0.5 rounded border ' +
              (suggestion.source === 'ai'
                ? 'border-[#00e6ff]/40 text-[#9fefff] bg-[#00e6ff]/10'
                : suggestion.source === 'ai+rules'
                  ? 'border-amber-400/30 text-amber-300 bg-amber-400/5'
                  : 'border-zinc-700 text-zinc-400 bg-zinc-800/40')
            }
            title={
              suggestion.source === 'ai'
                ? 'pi.dev authored this suggestion'
                : suggestion.source === 'ai+rules'
                  ? 'pi.dev suggested most fields; missing ones were filled from rule-based defaults'
                  : 'pi.dev unavailable — rule-based fallback'
            }
          >
            {suggestion.source === 'ai' ? 'pi' : suggestion.source === 'ai+rules' ? 'pi + rules' : 'rules'}
          </span>
          {suggestion.priorMatchCount > 0 && (
            <span className="text-[10px] text-zinc-500 normal-case tracking-normal">
              — {suggestion.priorMatchCount} prior match{suggestion.priorMatchCount === 1 ? '' : 'es'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(e => !e)}
            className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            title={editMode ? 'Show summary' : 'Override suggestions'}
          >
            <Edit3 className="w-3 h-3" />
            {editMode ? 'View' : 'Edit'}
          </button>
          <button
            onClick={onDismiss}
            className="text-[11px] text-zinc-500 hover:text-red-400 flex items-center gap-1 transition-colors"
            title="Dismiss"
          >
            <X className="w-3 h-3" />
            Dismiss
          </button>
        </div>
      </div>

      {suggestion.reasons.overall && (
        <div className="text-[11px] text-zinc-300 leading-relaxed bg-[#00e6ff]/5 border border-[#00e6ff]/15 rounded-lg px-3 py-2">
          {suggestion.reasons.overall}
        </div>
      )}

      {!editMode ? (
        <div className="space-y-2 text-xs">
          <SuggestionRow label="Models" value={modelIds.map(formatModel).join(', ') || '—'} reason={suggestion.reasons.models} />
          <SuggestionRow label="Aspect Ratio" value={aspectRatio} reason={suggestion.reasons.aspectRatio} />
          {style && (
            <SuggestionRow label="Style" value={style} reason={suggestion.reasons.style} />
          )}
          <SuggestionRow label="Image Size" value={imageSize} reason={suggestion.reasons.imageSize} />
          {quality && (
            <SuggestionRow label="Quality" value={quality} reason={suggestion.reasons.quality} />
          )}
          {promptEnhance && (
            <SuggestionRow
              label="Prompt Enhance"
              value={promptEnhance}
              reason={suggestion.reasons.promptEnhance}
            />
          )}
          {negativePrompt && (
            <SuggestionRow
              label="Negative Prompt"
              value={negativePrompt.length > 60 ? `${negativePrompt.slice(0, 60)}…` : negativePrompt}
              reason={suggestion.reasons.negativePrompt}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Models</label>
            <div className="flex flex-wrap gap-1.5">
              {LEONARDO_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  className={
                    'px-2.5 py-1 rounded-lg border text-[11px] transition-colors ' +
                    (modelIds.includes(m.id)
                      ? 'bg-[#00e6ff]/15 border-[#00e6ff]/40 text-[#9fefff]'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white')
                  }
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
              >
                {aspectOptions.map(a => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Image Size</label>
              <select
                value={imageSize}
                onChange={e => setImageSize(e.target.value as '1K' | '2K')}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
              >
                {sizeOptions.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {quality !== undefined && (
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Quality <span className="text-zinc-600 normal-case">(gpt-image-1.5)</span>
                </label>
                <select
                  value={quality}
                  onChange={e => setQuality(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
                >
                  {qualityOptions.map(q => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {promptEnhance !== undefined && (
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Prompt Enhance
                </label>
                <select
                  value={promptEnhance}
                  onChange={e => setPromptEnhance(e.target.value as 'ON' | 'OFF')}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
                >
                  <option value="ON">ON</option>
                  <option value="OFF">OFF</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Style</label>
            <select
              value={style ?? ''}
              onChange={e => setStyle(e.target.value || undefined)}
              className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
            >
              <option value="">(auto — pi picks per model)</option>
              {availableStyles.map(s => (
                <option key={s.uuid} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Negative Prompt</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="(optional — blurry, low-res, watermark, etc.)"
              className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#00e6ff]/40"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={handleApply}
          disabled={modelIds.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#00e6ff]/15 border border-[#00e6ff]/40 text-[#9fefff] hover:bg-[#00e6ff]/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Apply
        </button>
      </div>
    </div>
  );
}

function SuggestionRow({
  label,
  value,
  reason,
}: {
  label: string;
  value: string;
  reason?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-24 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-zinc-200 break-words">{value}</div>
        {reason && <div className="text-[10px] text-zinc-500 mt-0.5">{reason}</div>}
      </div>
    </div>
  );
}

function formatModel(id: string): string {
  return LEONARDO_MODELS.find(m => m.id === id)?.name ?? id;
}
