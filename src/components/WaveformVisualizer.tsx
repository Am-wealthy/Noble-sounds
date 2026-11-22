import { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/audioEngine';

interface WaveformVisualizerProps {
  accentHex?: string;
}

export function WaveformVisualizer({ accentHex = '#06B6D4' }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let isRunning = false;

    const drawFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(120, Math.floor(rect.width * dpr));
      const targetH = Math.max(32, Math.floor(rect.height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Center reticle
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      const samples = audioEngine.getWaveformSamples();

      if (!samples) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        isRunning = false;
        return;
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const step = w / (samples.length - 1);

      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = i * step;
        const clamped = Math.max(-0.95, Math.min(0.95, samples[i] * 1.45));
        const y = midY + clamped * (h * 0.44);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Fast double-stroke glow (avoids expensive mobile shadowBlur)
      ctx.strokeStyle = `${accentHex}44`;
      ctx.lineWidth = 4.5 * dpr;
      ctx.stroke();

      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();

      if (audioEngine.hasActiveVoices()) {
        rafId = requestAnimationFrame(drawFrame);
      } else {
        // Draw one idle frame after audio ends and pause RAF loop
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    // Draw initial idle baseline
    drawFrame();

    const startLoop = () => {
      if (!isRunning) {
        isRunning = true;
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const unsubscribe = audioEngine.subscribeActivePads((counts) => {
      if (counts.size > 0) {
        startLoop();
      }
    });

    const onResize = () => drawFrame();
    window.addEventListener('resize', onResize);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
    };
  }, [accentHex]);

  return (
    <div
      className="console-recess relative h-11 w-full rounded-lg overflow-hidden px-2 py-1 flex items-center"
      aria-label="Live master audio waveform visualizer"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px)',
          backgroundSize: '24px 100%',
        }}
      />
      <canvas ref={canvasRef} className="relative z-10 h-full w-full block" />
    </div>
  );
}
