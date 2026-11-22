import { Volume2, VolumeX } from 'lucide-react';
import React, { useRef } from 'react';

interface StudioFaderProps {
  volume: number; // 0..1
  isMuted: boolean;
  onChangeVolume: (val: number) => void;
  onToggleMute: () => void;
}

export function StudioFader({
  volume,
  isMuted,
  onChangeVolume,
  onToggleMute,
}: StudioFaderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const effectivePercent = isMuted ? 0 : Math.round(volume * 100);
  const displayPercent = Math.round(volume * 100);

  const updateFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const clamped = Math.min(1, Math.max(0, ratio));
    onChangeVolume(clamped);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChangeVolume(Math.min(1, volume + 0.02));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChangeVolume(Math.max(0, volume - 0.02));
    }
  };

  return (
    <div className="flex items-center gap-3.5 w-full">
      {/* Mute / Speaker Button */}
      <button
        type="button"
        onClick={onToggleMute}
        title={isMuted ? 'Unmute Master Output' : 'Mute Master Output'}
        aria-label={isMuted ? 'Unmute Master Output' : 'Mute Master Output'}
        className={`h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
          isMuted
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-[0_0_16px_rgba(239,68,68,0.25)]'
            : 'bg-white/[0.04] border-white/10 text-cyan-300 hover:bg-white/[0.08] hover:border-cyan-400/40'
        }`}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-4.5 h-4.5" />
        ) : (
          <Volume2 className="w-4.5 h-4.5" />
        )}
      </button>

      {/* Fader Track & Scale */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-slate-400 uppercase">
          <span>Master Output</span>
          <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
            {isMuted ? 'MUTE' : `${displayPercent}%`}
          </span>
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Master Volume Fader"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={effectivePercent}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="relative h-7 flex items-center cursor-ew-resize select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-md"
        >
          {/* Recessed groove */}
          <div className="console-recess relative w-full h-2.5 rounded-full overflow-hidden">
            {/* Glowing cyan fill */}
            <div
              className="h-full rounded-full transition-[opacity] duration-150"
              style={{
                width: `${effectivePercent}%`,
                background: isMuted
                  ? 'linear-gradient(90deg, rgba(148,163,184,0.3), rgba(148,163,184,0.45))'
                  : 'linear-gradient(90deg, #0891B2 0%, #06B6D4 65%, #22D3EE 100%)',
                boxShadow: isMuted ? 'none' : '0 0 14px rgba(6, 182, 212, 0.75)',
              }}
            />
          </div>

          {/* Machined Aluminum Studio Fader Cap */}
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-6 rounded-[4px] border border-white/25 flex items-center justify-center"
            style={{
              left: `${effectivePercent}%`,
              background:
                'linear-gradient(180deg, #334155 0%, #1E293B 45%, #0F172A 100%)',
              boxShadow:
                '0 4px 10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            <div
              className={`w-[2px] h-3.5 rounded-full ${
                isMuted
                  ? 'bg-slate-400'
                  : 'bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.9)]'
              }`}
            />
          </div>
        </div>

        {/* Precision tick marks */}
        <div className="flex justify-between px-0.5 pointer-events-none">
          {Array.from({ length: 11 }).map((_, idx) => (
            <div
              key={idx}
              className={`w-[1px] ${
                idx % 5 === 0 ? 'h-1.5 bg-slate-500/60' : 'h-1 bg-slate-600/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
