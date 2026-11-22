import { Minus, Pencil, Plus, Square, Trash2, Upload, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { loopEngine, LoopTransportState } from '../audio/loopEngine';
import { LoopPadConfig } from '../types/console';

interface LoopPageProps {
  loopPads: LoopPadConfig[];
  bpm: number;
  onChangeBpm: (next: number) => void;
  onUploadLoopAudio: (padId: string, file: File) => Promise<void>;
  onUpdateLoopPadMeta: (padId: string, label: string, sourceBpm?: number) => void;
  onClearLoopPad: (padId: string) => Promise<void>;
  onLazyAnalyzedLoopPad: (padId: string, duration: number, sourceBpm: number) => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LoopPage({
  loopPads,
  bpm,
  onChangeBpm,
  onUploadLoopAudio,
  onUpdateLoopPadMeta,
  onClearLoopPad,
  onLazyAnalyzedLoopPad,
}: LoopPageProps) {
  const [transport, setTransport] = useState<LoopTransportState>(() =>
    loopEngine.getState()
  );
  const [bpmInput, setBpmInput] = useState<string>(String(bpm));
  const [dragOverPadId, setDragOverPadId] = useState<string | null>(null);
  const [uploadingPadId, setUploadingPadId] = useState<string | null>(null);
  const [editingPad, setEditingPad] = useState<LoopPadConfig | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSourceBpm, setEditSourceBpm] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadPadIdRef = useRef<string | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const barProgressFillRef = useRef<HTMLDivElement | null>(null);

  // Touch scroll vs tap disambiguation refs
  const touchStartRef = useRef<Map<number, { x: number; y: number; moved: boolean }>>(
    new Map()
  );

  useEffect(() => {
    setBpmInput(String(bpm));
  }, [bpm]);

  useEffect(() => {
    return loopEngine.subscribe((state) => {
      setTransport(state);
    });
  }, []);

  // Animate active pad's 1-bar countdown progress bar via direct DOM transform (0 React re-renders)
  useEffect(() => {
    if (!transport.isPlaying || !transport.activePadId) {
      if (barProgressFillRef.current) {
        barProgressFillRef.current.style.transform = 'scaleX(0)';
      }
      return;
    }

    let rafId = 0;
    const tick = () => {
      if (barProgressFillRef.current) {
        const progress = loopEngine.getBarProgress();
        barProgressFillRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [transport.isPlaying, transport.activePadId]);

  const commitBpmInput = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 40 && parsed <= 240) {
      onChangeBpm(Math.round(parsed));
    } else {
      setBpmInput(String(bpm));
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [now];
      return;
    }
    taps.push(now);
    if (taps.length > 6) taps.shift();

    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) {
        sum += taps[i] - taps[i - 1];
      }
      const avgMs = sum / (taps.length - 1);
      if (avgMs > 0) {
        const computed = Math.min(240, Math.max(40, Math.round(60000 / avgMs)));
        onChangeBpm(computed);
      }
    }
  };

  const triggerFileBrowse = (padId: string) => {
    pendingUploadPadIdRef.current = padId;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (padId: string, file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploadingPadId(padId);
    try {
      await onUploadLoopAudio(padId, file);
    } catch {
      setUploadError('Could not decode this audio file. Please try an .mp3 or .wav file.');
    } finally {
      setUploadingPadId(null);
    }
  };

  const handlePadActivation = (pad: LoopPadConfig) => {
    const hasAudio = Boolean(pad.fileName) && loopEngine.hasBuffer(pad.id);
    if (!hasAudio) {
      triggerFileBrowse(pad.id);
      return;
    }
    audioEngine.unlockSync();
    void loopEngine.handlePadClick(pad.id, onLazyAnalyzedLoopPad);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Hidden shared file input for click-to-upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const targetId = pendingUploadPadIdRef.current;
          if (targetId && file) {
            void handleFileChosen(targetId, file);
          }
          e.target.value = '';
        }}
      />

      {/* 1. MASTER BPM & TRANSPORT HEADER */}
      <section
        aria-label="Master BPM and Transport Controls"
        className="metallic-bezel rounded-2xl border border-white/[0.08] p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4"
      >
        {/* BPM Stepper, Input & Tap Tempo */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="console-recess flex items-center rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => onChangeBpm(Math.max(40, bpm - 1))}
              aria-label="Decrease BPM"
              className="h-9 w-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-baseline gap-1 px-2">
              <input
                type="number"
                min={40}
                max={240}
                value={bpmInput}
                onChange={(e) => {
                  setBpmInput(e.target.value);
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 40 && n <= 240) {
                    onChangeBpm(Math.round(n));
                  }
                }}
                onBlur={() => commitBpmInput(bpmInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitBpmInput(bpmInput);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Master BPM"
                className="w-14 bg-transparent text-center font-mono-tabular text-lg font-bold text-cyan-300 focus:outline-none"
              />
              <span className="text-[10px] font-mono-tabular tracking-wider text-slate-400 uppercase">
                BPM
              </span>
            </div>

            <button
              type="button"
              onClick={() => onChangeBpm(Math.min(240, bpm + 1))}
              aria-label="Increase BPM"
              className="h-9 w-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleTapTempo}
            className="h-11 px-4 rounded-xl text-xs font-semibold tracking-wide border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] hover:border-cyan-400/50 text-slate-100 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            Tap Tempo
          </button>
        </div>

        {/* 4-Beat Visual Indicator (1 · 2 · 3 · 4) + Stop Button */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
          <div
            aria-label={`Bar beat ${transport.currentBeat} of 4`}
            className="console-recess rounded-xl px-3.5 py-2 flex items-center gap-2.5"
          >
            {([1, 2, 3, 4] as const).map((beat) => {
              const isBeatActive =
                transport.isPlaying && transport.currentBeat === beat;
              const isBeatOne = beat === 1;
              return (
                <div key={beat} className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full transition-colors duration-75"
                      style={{
                        backgroundColor: isBeatActive
                          ? isBeatOne
                            ? '#F59E0B'
                            : '#22D3EE'
                          : 'rgba(148, 163, 184, 0.2)',
                        boxShadow: isBeatActive
                          ? isBeatOne
                            ? '0 0 10px rgba(245, 158, 11, 0.9)'
                            : '0 0 10px rgba(34, 211, 238, 0.85)'
                          : 'none',
                      }}
                    />
                    <span
                      className={`font-mono-tabular text-xs font-bold ${
                        isBeatActive
                          ? isBeatOne
                            ? 'text-amber-300'
                            : 'text-cyan-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {beat}
                    </span>
                  </div>
                  {beat < 4 && (
                    <span aria-hidden="true" className="text-slate-600 text-xs">
                      ·
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => loopEngine.stop()}
            className="h-11 px-4 sm:px-5 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center gap-2 border border-rose-500/70 bg-gradient-to-b from-rose-500/90 to-red-700/90 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)] hover:from-rose-400 hover:to-red-600 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </section>

      {uploadError && (
        <p className="text-xs text-rose-400 px-1" role="alert">
          {uploadError}
        </p>
      )}

      {/* 2. SIMPLE 3x4 BAR-SYNCED PAD GRID */}
      <section
        aria-label="Bar-Synced Loop Pads"
        className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-5"
      >
        {loopPads.map((pad) => {
          const isLoaded = Boolean(pad.fileName);
          const isActive = transport.isPlaying && transport.activePadId === pad.id;
          const isQueued = transport.isPlaying && transport.queuedPadId === pad.id;
          const isUploading = uploadingPadId === pad.id;
          const isDragOver = dragOverPadId === pad.id;

          return (
            <div
              key={pad.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                // Only handle non-touch clicks directly; touch uses tap-vs-scroll pointer handling
                if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
                handlePadActivation(pad);
              }}
              onPointerDown={(e) => {
                if (e.pointerType !== 'touch') return;
                touchStartRef.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                });
              }}
              onPointerMove={(e) => {
                if (e.pointerType !== 'touch') return;
                const st = touchStartRef.current.get(e.pointerId);
                if (!st || st.moved) return;
                if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
                  st.moved = true;
                }
              }}
              onPointerUp={(e) => {
                if (e.pointerType !== 'touch') return;
                const st = touchStartRef.current.get(e.pointerId);
                touchStartRef.current.delete(e.pointerId);
                if (st && !st.moved) {
                  handlePadActivation(pad);
                }
              }}
              onPointerCancel={(e) => {
                touchStartRef.current.delete(e.pointerId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePadActivation(pad);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPadId(pad.id);
              }}
              onDragLeave={() => setDragOverPadId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverPadId(null);
                void handleFileChosen(pad.id, e.dataTransfer.files[0]);
              }}
              aria-label={`${pad.label} loop pad${
                isActive ? ', playing' : isQueued ? ', queued for next bar' : ''
              }`}
              className={`group relative flex flex-col justify-between rounded-2xl p-3.5 sm:p-4 text-left select-none touch-pan-y cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 min-h-[118px] sm:min-h-[132px] md:min-h-[142px] overflow-hidden transition-transform duration-100 active:scale-[0.98] ${
                isQueued ? 'animate-pulse' : ''
              }`}
              style={{
                background: isActive
                  ? 'radial-gradient(circle at 50% 42%, rgba(6, 182, 212, 0.22) 0%, #101520 72%, #090B10 100%)'
                  : isQueued
                  ? 'radial-gradient(circle at 50% 42%, rgba(245, 158, 11, 0.22) 0%, #171310 72%, #090B10 100%)'
                  : isDragOver
                  ? 'rgba(6, 182, 212, 0.14)'
                  : 'linear-gradient(165deg, #161B26 0%, #0C0F16 58%, #080A0F 100%)',
                border: isActive
                  ? '1.5px solid rgba(34, 211, 238, 0.95)'
                  : isQueued
                  ? '1.5px solid rgba(245, 158, 11, 0.95)'
                  : isDragOver
                  ? '1.5px dashed #22D3EE'
                  : isLoaded
                  ? `1.5px solid ${pad.color}66`
                  : '1.5px dashed rgba(148, 163, 184, 0.28)',
                boxShadow: isActive
                  ? '0 0 24px -4px rgba(6, 182, 212, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : isQueued
                  ? '0 0 22px -4px rgba(245, 158, 11, 0.45)'
                  : '0 10px 20px -10px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {/* Top Row: State Badge / Edit Label Button */}
              <div className="relative z-10 flex items-center justify-between gap-2 w-full">
                {isActive ? (
                  <span className="font-mono-tabular text-[10px] font-bold tracking-wider uppercase text-cyan-300">
                    Playing · {bpm}
                  </span>
                ) : isQueued ? (
                  <span className="font-mono-tabular text-[10px] font-bold tracking-wider uppercase text-amber-300">
                    Queued
                  </span>
                ) : isLoaded ? (
                  <span className="font-mono-tabular text-[10px] sm:text-[11px] text-slate-400 truncate">
                    {pad.sourceBpm
                      ? pad.sourceBpm !== bpm
                        ? `${pad.sourceBpm}→${bpm}`
                        : `${pad.sourceBpm} BPM`
                      : formatDuration(pad.durationSec) || 'Ready'}
                  </span>
                ) : (
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPad(pad);
                    setEditLabel(pad.label);
                    setEditSourceBpm(pad.sourceBpm ? String(pad.sourceBpm) : '');
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  aria-label={`Edit ${pad.label} pad`}
                  className="h-7 w-7 rounded-md bg-white/[0.05] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center text-slate-300 cursor-pointer transition-colors shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>

              {/* Center/Bottom: Short Label & File Info */}
              <div className="relative z-10 mt-auto pt-2 flex flex-col gap-1">
                <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-white leading-snug truncate">
                  {pad.label}
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  {isUploading
                    ? 'Detecting BPM...'
                    : pad.fileName
                    ? `${pad.fileName}${pad.durationSec ? ` · ${formatDuration(pad.durationSec)}` : ''}`
                    : 'Click or drop .mp3 / .wav'}
                </span>
              </div>

              {/* Sleek 1-Bar Countdown Progress Bar Inside Active Pad */}
              <div className="relative z-10 mt-2.5 h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                {isActive && (
                  <div
                    ref={barProgressFillRef}
                    className="h-full w-full origin-left bg-gradient-to-r from-cyan-400 to-amber-300 will-change-transform"
                    style={{ transform: 'scaleX(0)' }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Edit Label / Replace / Clear Modal */}
      {editingPad && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEditingPad(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="loop-pad-editor-title"
        >
          <div
            className="console-chassis w-full max-w-md rounded-2xl p-6 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2
                id="loop-pad-editor-title"
                className="font-display text-lg font-semibold text-white"
              >
                Edit Section Pad
              </h2>
              <button
                type="button"
                onClick={() => setEditingPad(null)}
                aria-label="Close modal"
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleaned = editLabel.trim() || editingPad.defaultLabel;
                const parsedBpm = Number(editSourceBpm);
                const nextSourceBpm =
                  Number.isFinite(parsedBpm) && parsedBpm >= 40 && parsedBpm <= 240
                    ? Math.round(parsedBpm)
                    : editingPad.sourceBpm;
                onUpdateLoopPadMeta(editingPad.id, cleaned, nextSourceBpm);
                setEditingPad(null);
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <div>
                <label
                  htmlFor="loop-label-input"
                  className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Short Label (e.g., Intro, Verse, Chorus, Bridge)
                </label>
                <input
                  id="loop-label-input"
                  type="text"
                  maxLength={20}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="console-recess w-full rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              {editingPad.fileName && (
                <div>
                  <label
                    htmlFor="loop-source-bpm-input"
                    className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Track Native BPM (auto-aligned to {bpm} BPM)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="loop-source-bpm-input"
                      type="number"
                      min={40}
                      max={240}
                      value={editSourceBpm}
                      onChange={(e) => setEditSourceBpm(e.target.value)}
                      className="console-recess flex-1 rounded-xl px-3.5 py-2 text-sm font-mono-tabular text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(editSourceBpm) || editingPad.sourceBpm || 120;
                        const halved = Math.max(40, Math.round(cur / 2));
                        setEditSourceBpm(String(halved));
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-mono-tabular font-semibold border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 cursor-pointer"
                    >
                      ÷2
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(editSourceBpm) || editingPad.sourceBpm || 120;
                        const doubled = Math.min(240, Math.round(cur * 2));
                        setEditSourceBpm(String(doubled));
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-mono-tabular font-semibold border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 cursor-pointer"
                    >
                      ×2
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerFileBrowse(editingPad.id);
                  setEditingPad(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {editingPad.fileName ? 'Replace Audio (.mp3 / .wav)' : 'Upload Audio (.mp3 / .wav)'}
                </span>
              </button>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                {editingPad.fileName ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearLoopPad(editingPad.id);
                      setEditingPad(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Audio</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPad(null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 bg-white/[0.04] border border-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
