import { Plus, SlidersHorizontal } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { PadConfig } from '../types/console';

interface PadCardProps {
  pad: PadConfig;
  isPressed: boolean;
  isPlaying: boolean;
  activeCount: number;
  isEditMode: boolean;
  onPointerDown: (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(6, 182, 212, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PadCard = React.memo(function PadCard({
  pad,
  isPressed,
  isPlaying,
  activeCount,
  isEditMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PadCardProps) {
  const ringRadius = 10;
  const circumference = 2 * Math.PI * ringRadius;
  const progressCircleRef = useRef<SVGCircleElement | null>(null);

  // Update SVG progress ring directly in DOM only while this specific pad is playing (zero React re-renders)
  useEffect(() => {
    const circle = progressCircleRef.current;
    if (!isPlaying || !circle) {
      if (circle) {
        circle.style.strokeDashoffset = String(circumference);
      }
      return;
    }

    let rafId = 0;
    const updateRing = () => {
      const progress = audioEngine.getPadProgress(pad.id);
      if (progressCircleRef.current) {
        progressCircleRef.current.style.strokeDashoffset = String(
          circumference * (1 - progress)
        );
      }
      rafId = requestAnimationFrame(updateRing);
    };

    rafId = requestAnimationFrame(updateRing);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, pad.id, circumference]);

  const active = isPressed || isPlaying;
  const rimColorIdle = hexToRgba(pad.color, pad.isEmpty ? 0.45 : 0.36);
  const rimColorActive = hexToRgba(pad.color, 0.95);
  const glowColorIntense = hexToRgba(pad.color, 0.36);

  return (
    <button
      type="button"
      onPointerDown={(e) => onPointerDown(pad, e)}
      onPointerMove={(e) => onPointerMove(pad, e)}
      onPointerUp={(e) => onPointerUp(pad, e)}
      onPointerCancel={(e) => onPointerCancel(pad, e)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${pad.name} pad, shortcut ${pad.shortcut}, ${
        pad.mode === 'oneshot' ? 'One-Shot' : 'Hold'
      } mode${isEditMode ? ', click to edit' : ''}`}
      className={`group relative flex flex-col justify-between rounded-2xl p-3.5 sm:p-4 text-left select-none touch-pan-y cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 min-h-[110px] sm:min-h-[126px] md:min-h-[136px] overflow-hidden transition-transform duration-100 ease-out will-change-transform ${
        isPressed ? 'scale-[0.96] translate-y-[2px]' : 'scale-100 translate-y-0'
      }`}
      style={{
        background: active
          ? `radial-gradient(circle at 50% 42%, ${hexToRgba(
              pad.color,
              0.22
            )} 0%, #10141E 72%, #090B10 100%)`
          : 'linear-gradient(165deg, #161B26 0%, #0C0F16 58%, #080A0F 100%)',
        border: pad.isEmpty
          ? `1.5px dashed ${rimColorIdle}`
          : `1.5px solid ${
              active
                ? rimColorActive
                : isEditMode
                ? hexToRgba(pad.color, 0.6)
                : rimColorIdle
            }`,
        boxShadow: active
          ? `0 0 24px -2px ${glowColorIntense}, inset 0 0 18px ${hexToRgba(
              pad.color,
              0.2
            )}, inset 0 1px 0 rgba(255,255,255,0.2)`
          : '0 10px 20px -10px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Top Row: Keyboard Shortcut Badge & Progress Ring / Edit Affordance */}
      <div className="relative z-10 flex items-center justify-between w-full gap-2">
        <span
          className="font-mono-tabular inline-flex items-center justify-center min-w-[26px] h-[24px] px-1.5 rounded-md text-[11px] font-semibold border transition-colors"
          style={{
            backgroundColor: active
              ? hexToRgba(pad.color, 0.24)
              : 'rgba(255, 255, 255, 0.04)',
            borderColor: active
              ? hexToRgba(pad.color, 0.7)
              : 'rgba(255, 255, 255, 0.1)',
            color: active ? '#FFFFFF' : '#CBD5E1',
          }}
        >
          {pad.shortcut}
        </span>

        {pad.isEmpty ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: hexToRgba(pad.color, 0.14),
              borderColor: hexToRgba(pad.color, 0.45),
              color: '#F8FAFC',
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </span>
        ) : isEditMode ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: hexToRgba(pad.color, 0.14),
              borderColor: hexToRgba(pad.color, 0.45),
              color: '#F8FAFC',
            }}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Edit</span>
          </span>
        ) : (
          <div className="relative w-7 h-7 flex items-center justify-center">
            <svg viewBox="0 0 26 26" className="w-7 h-7 -rotate-90">
              <circle
                cx="13"
                cy="13"
                r={ringRadius}
                fill="none"
                stroke="rgba(148, 163, 184, 0.16)"
                strokeWidth="2.2"
              />
              <circle
                ref={progressCircleRef}
                cx="13"
                cy="13"
                r={ringRadius}
                fill="none"
                stroke={pad.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference}
                style={{ opacity: isPlaying ? 1 : 0 }}
              />
            </svg>
            <span
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: active ? pad.color : hexToRgba(pad.color, 0.45),
              }}
            />
            {activeCount > 1 && (
              <span className="absolute -bottom-1 -right-1 text-[9px] font-mono-tabular font-bold text-white bg-slate-900/90 border border-white/20 rounded px-1 leading-tight">
                {activeCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center/Bottom: Pad Title & Quiet Trigger Metadata */}
      <div className="relative z-10 mt-auto pt-3 flex flex-col gap-1">
        <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-slate-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
          {pad.isEmpty ? 'Tap to Add Sound' : pad.name}
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          {pad.isEmpty ? (
            <span className="text-cyan-300/90">Choose file from phone</span>
          ) : (
            <>
              <span>{pad.mode === 'oneshot' ? 'One-Shot' : 'Hold'}</span>
              {pad.customFileName ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300/90 truncate max-w-[110px]">
                    {pad.customFileName}
                  </span>
                </>
              ) : pad.durationSec ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular text-slate-500">
                    {pad.durationSec.toFixed(1)}s
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Bottom LED Accent Bar */}
      <div
        className="pointer-events-none absolute bottom-0 inset-x-4 h-[2.5px] rounded-full"
        style={{
          backgroundColor: pad.color,
          opacity: active ? 1 : pad.isEmpty ? 0.25 : 0.45,
        }}
      />
    </button>
  );
});
