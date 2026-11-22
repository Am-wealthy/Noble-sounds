import { Play, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { LED_COLOR_PALETTE } from '../data/defaultPads';
import { PadConfig, TriggerMode } from '../types/console';

interface PadEditorModalProps {
  pad: PadConfig | null;
  onClose: () => void;
  onSaveMeta: (padId: string, updates: { name: string; color: string; mode: TriggerMode }) => void;
  onUploadAudio: (padId: string, file: File) => Promise<void>;
  onResetPad: (padId: string) => Promise<void>;
  onDeletePad: (padId: string) => Promise<void>;
  onAudition: (padId: string) => void;
}

export function PadEditorModal({
  pad,
  onClose,
  onSaveMeta,
  onUploadAudio,
  onResetPad,
  onDeletePad,
  onAudition,
}: PadEditorModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#06B6D4');
  const [mode, setMode] = useState<TriggerMode>('oneshot');
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pad) return;
    setName(pad.name);
    setColor(pad.color);
    setMode(pad.mode);
    setErrorMsg(null);
  }, [pad]);

  if (!pad) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setIsUploading(true);
    try {
      await onUploadAudio(pad.id, file);
      if (name === pad.defaultName || pad.isEmpty || name === 'Add Sound') {
        const stripped = file.name.replace(/\.[^/.]+$/, '').slice(0, 26);
        if (stripped) {
          setName(stripped);
          onSaveMeta(pad.id, { name: stripped, color, mode });
        }
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not decode this audio file. Please try an .mp3 or .wav file.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyAndClose = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || pad.defaultName;
    onSaveMeta(pad.id, { name: trimmed, color, mode });
    onClose();
  };

  const handleImmediateUpdate = (updates: {
    name?: string;
    color?: string;
    mode?: TriggerMode;
  }) => {
    const nextName = (updates.name ?? name).trim() || pad.defaultName;
    const nextColor = updates.color ?? color;
    const nextMode = updates.mode ?? mode;
    if (updates.name !== undefined) setName(updates.name);
    if (updates.color !== undefined) setColor(updates.color);
    if (updates.mode !== undefined) setMode(updates.mode);
    onSaveMeta(pad.id, { name: nextName, color: nextColor, mode: nextMode });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pad-editor-title"
    >
      <div
        className="console-chassis relative w-full max-w-lg rounded-2xl p-6 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-slate-400">
              <span>BANK {pad.bank}</span>
              <span aria-hidden="true">·</span>
              <span>PAD {pad.index + 1}</span>
              <span aria-hidden="true">·</span>
              <span>KEY [{pad.shortcut}]</span>
            </div>
            <h2
              id="pad-editor-title"
              className="font-display text-xl font-semibold tracking-tight text-white mt-1"
            >
              Configure Pad & Load Audio
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close pad editor"
            className="h-9 w-9 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-slate-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleApplyAndClose} className="mt-5 flex flex-col gap-5">
          {/* Audio File Dropzone */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium tracking-wider uppercase text-slate-400">
                Sample Audio Source
              </label>
              <button
                type="button"
                onClick={() => onAudition(pad.id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Audition Pad</span>
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                void handleFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`console-recess rounded-xl p-4 border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                isDraggingFile
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-white/10 hover:border-cyan-400/50'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <Upload className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">
                    {isUploading
                      ? 'Loading audio...'
                      : pad.customFileName
                      ? pad.customFileName
                      : pad.isEmpty
                      ? 'No sound selected yet'
                      : pad.assetUrl
                      ? `Studio Sample: ${pad.defaultName}`
                      : `Built-in Preset: ${pad.defaultName}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tap to choose audio from your phone or device (max 8s)
                  </p>
                </div>
              </div>

              <span className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 whitespace-nowrap">
                Choose File
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            {errorMsg && (
              <p className="mt-2 text-xs text-rose-400" role="alert">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Pad Name Input */}
          <div>
            <label
              htmlFor="pad-name-input"
              className="block text-xs font-medium tracking-wider uppercase text-slate-400 mb-2"
            >
              Pad Label
            </label>
            <input
              id="pad-name-input"
              type="text"
              maxLength={28}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={pad.defaultName}
              className="console-recess w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Trigger Mode Selector */}
          <div>
            <span className="block text-xs font-medium tracking-wider uppercase text-slate-400 mb-2">
              Trigger Behavior
            </span>
            <div className="console-recess grid grid-cols-2 gap-1.5 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleImmediateUpdate({ mode: 'oneshot' })}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  mode === 'oneshot'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_14px_rgba(6,182,212,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                One-Shot (Full Sound)
              </button>
              <button
                type="button"
                onClick={() => handleImmediateUpdate({ mode: 'hold' })}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  mode === 'hold'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_14px_rgba(6,182,212,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Hold (Stop on Release)
              </button>
            </div>
          </div>

          {/* LED Glow Color Picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium tracking-wider uppercase text-slate-400">
                LED Rim Accent
              </span>
              <span className="font-mono-tabular text-xs text-slate-400 uppercase">
                {color}
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-2.5">
              {LED_COLOR_PALETTE.map((opt) => {
                const selected = color.toLowerCase() === opt.hex.toLowerCase();
                return (
                  <button
                    key={opt.hex}
                    type="button"
                    title={opt.name}
                    aria-label={`Select ${opt.name} LED color`}
                    onClick={() => handleImmediateUpdate({ color: opt.hex })}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      selected ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-[#090B10]' : 'hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: opt.hex,
                      boxShadow: selected ? `0 0 14px ${opt.hex}` : `0 0 6px ${opt.hex}66`,
                    }}
                  />
                );
              })}

              <label
                title="Custom hex LED color"
                className="relative w-7 h-7 rounded-full border border-white/25 overflow-hidden cursor-pointer flex items-center justify-center bg-gradient-to-tr from-rose-500 via-amber-400 to-cyan-400"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleImmediateUpdate({ color: e.target.value })}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  aria-label="Custom LED color picker"
                />
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
            {pad.isCustomSlot ? (
              <button
                type="button"
                onClick={async () => {
                  await onDeletePad(pad.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Box</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await onResetPad(pad.id);
                  setName(pad.defaultName);
                  setColor(pad.defaultColor);
                  setMode(pad.mode);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Factory</span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-colors cursor-pointer whitespace-nowrap"
              >
                Save Pad
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
