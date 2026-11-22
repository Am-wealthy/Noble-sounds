import { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/audioEngine';

const SEGMENTS = 18;

export function StereoVuMeter() {
  const leftRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rightRefs = useRef<Array<HTMLDivElement | null>>([]);
  const leftPeakRef = useRef(0);
  const rightPeakRef = useRef(0);
  const leftHoldTimer = useRef(0);
  const rightHoldTimer = useRef(0);

  useEffect(() => {
    let rafId = 0;
    let isRunning = false;

    const updateBar = (
      refs: Array<HTMLDivElement | null>,
      level: number,
      peak: number
    ) => {
      const curved = level > 0.002 ? Math.min(1, Math.pow(level, 0.58) * 1.15) : 0;
      const activeCount = Math.round(curved * SEGMENTS);
      const peakIndex = Math.min(SEGMENTS - 1, Math.max(-1, Math.round(peak * SEGMENTS) - 1));

      for (let i = 0; i < SEGMENTS; i++) {
        const el = refs[i];
        if (!el) continue;
        const isLit = i < activeCount;
        const isPeak = i === peakIndex && peak > 0.02;

        if (isLit || isPeak) {
          if (i >= 15) {
            el.style.backgroundColor = '#EF4444';
          } else if (i >= 11) {
            el.style.backgroundColor = '#F59E0B';
          } else {
            el.style.backgroundColor = '#06B6D4';
          }
        } else {
          el.style.backgroundColor = 'rgba(148, 163, 184, 0.12)';
        }
      }
    };

    const tick = () => {
      const { left, right } = audioEngine.getStereoLevels();
      const lCurved = left > 0.002 ? Math.min(1, Math.pow(left, 0.58) * 1.15) : 0;
      const rCurved = right > 0.002 ? Math.min(1, Math.pow(right, 0.58) * 1.15) : 0;

      if (lCurved >= leftPeakRef.current) {
        leftPeakRef.current = lCurved;
        leftHoldTimer.current = 18;
      } else if (leftHoldTimer.current > 0) {
        leftHoldTimer.current -= 1;
      } else {
        leftPeakRef.current = Math.max(0, leftPeakRef.current - 0.05);
      }

      if (rCurved >= rightPeakRef.current) {
        rightPeakRef.current = rCurved;
        rightHoldTimer.current = 18;
      } else if (rightHoldTimer.current > 0) {
        rightHoldTimer.current -= 1;
      } else {
        rightPeakRef.current = Math.max(0, rightPeakRef.current - 0.05);
      }

      updateBar(leftRefs.current, left, leftPeakRef.current);
      updateBar(rightRefs.current, right, rightPeakRef.current);

      if (
        audioEngine.hasActiveVoices() ||
        leftPeakRef.current > 0.01 ||
        rightPeakRef.current > 0.01
      ) {
        rafId = requestAnimationFrame(tick);
      } else {
        isRunning = false;
      }
    };

    const startLoop = () => {
      if (!isRunning) {
        isRunning = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    if (audioEngine.hasActiveVoices()) {
      startLoop();
    }

    const unsubscribe = audioEngine.subscribeActivePads((counts) => {
      if (counts.size > 0) startLoop();
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className="console-recess rounded-lg px-3 py-2 flex flex-col justify-center gap-1.5 min-w-[180px]"
      aria-label="Live stereo VU level meter"
    >
      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
        <span className="tracking-wider text-slate-400">STEREO VU</span>
        <div className="flex items-center gap-3 text-slate-500">
          <span>-24</span>
          <span>-12</span>
          <span>-6</span>
          <span className="text-rose-400/90">0dB</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 text-[10px] font-mono-tabular font-semibold text-slate-400">
          L
        </span>
        <div className="flex-1 grid grid-cols-18 gap-[3px]">
          {Array.from({ length: SEGMENTS }).map((_, idx) => (
            <div
              key={`l-${idx}`}
              ref={(el) => {
                leftRefs.current[idx] = el;
              }}
              className="h-2 rounded-[2px]"
              style={{ backgroundColor: 'rgba(148, 163, 184, 0.12)' }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 text-[10px] font-mono-tabular font-semibold text-slate-400">
          R
        </span>
        <div className="flex-1 grid grid-cols-18 gap-[3px]">
          {Array.from({ length: SEGMENTS }).map((_, idx) => (
            <div
              key={`r-${idx}`}
              ref={(el) => {
                rightRefs.current[idx] = el;
              }}
              className="h-2 rounded-[2px]"
              style={{ backgroundColor: 'rgba(148, 163, 184, 0.12)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
