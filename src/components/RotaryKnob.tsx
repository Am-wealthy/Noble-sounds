import React, { useRef } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  accentColor: string;
  formatValue: (val: number) => string;
  onChange: (val: number) => void;
  bipolar?: boolean;
}

export function RotaryKnob({
  label,
  value,
  min,
  max,
  defaultValue,
  accentColor,
  formatValue,
  onChange,
  bipolar = false,
}: RotaryKnobProps) {
  const dragStartY = useRef<number>(0);
  const dragStartVal = useRef<number>(value);
  const isDragging = useRef(false);

  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const startAngle = -135;
  const endAngle = 135;
  const currentAngle = startAngle + normalized * (endAngle - startAngle);

  const radius = 25;
  const cx = 32;
  const cy = 32;

  const polarToCartesian = (angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const describeArc = (a1: number, a2: number) => {
    const start = polarToCartesian(a1);
    const end = polarToCartesian(a2);
    const largeArc = Math.abs(a2 - a1) > 180 ? 1 : 0;
    const sweep = a2 >= a1 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
  };

  const centerNorm = (defaultValue - min) / (max - min);
  const centerAngle = startAngle + centerNorm * (endAngle - startAngle);

  const activeArcPath = bipolar
    ? Math.abs(currentAngle - centerAngle) > 1
      ? describeArc(
          Math.min(centerAngle, currentAngle),
          Math.max(centerAngle, currentAngle)
        )
      : ''
    : normalized > 0.01
    ? describeArc(startAngle, currentAngle)
    : '';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartVal.current = value;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const deltaY = dragStartY.current - e.clientY;
    const sensitivity = (max - min) / 140;
    const next = Math.min(max, Math.max(min, dragStartVal.current + deltaY * sensitivity));
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const step = (max - min) * 0.04;
    const delta = e.deltaY < 0 ? step : -step;
    onChange(Math.min(max, Math.max(min, value + delta)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (max - min) * 0.05;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(defaultValue);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        title={`${label}: ${formatValue(value)} (Drag vertically or double-click to reset)`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className="relative w-16 h-16 cursor-ns-resize touch-none flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible">
          {/* Background LED track */}
          <path
            d={describeArc(startAngle, endAngle)}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Active LED arc */}
          {activeArcPath && (
            <path
              d={activeArcPath}
              fill="none"
              stroke={accentColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 5px ${accentColor})` }}
            />
          )}
        </svg>

        {/* Anodized Aluminum Rotary Cap */}
        <div
          className="pointer-events-none absolute w-10 h-10 rounded-full border border-white/15 flex items-center justify-center"
          style={{
            background:
              'radial-gradient(circle at 32% 28%, #2E3748 0%, #151A24 62%, #0B0E14 100%)',
            boxShadow:
              '0 6px 14px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.2)',
            transform: `rotate(${currentAngle}deg)`,
          }}
        >
          <div
            className="w-[2.5px] h-3 rounded-full -translate-y-2.5"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 6px ${accentColor}`,
            }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center leading-tight">
        <span className="text-[10px] font-medium tracking-wider uppercase text-slate-400">
          {label}
        </span>
        <span className="font-mono-tabular text-[11px] font-semibold text-slate-200">
          {formatValue(value)}
        </span>
      </div>
    </div>
  );
}
