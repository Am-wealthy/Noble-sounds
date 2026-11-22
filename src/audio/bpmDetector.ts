export interface AudioTempoAnalysis {
  bpm: number;
  leadingSilenceSec: number;
}

function extractBpmFromFilename(fileName?: string): number | null {
  if (!fileName) return null;
  const match = fileName.match(/(?:^|[\s_\-[\]()])(\d{2,3}(?:\.\d+)?)\s*bpm\b/i);
  if (!match) return null;
  const val = Number(match[1]);
  if (Number.isFinite(val) && val >= 45 && val <= 220) {
    return Math.round(val);
  }
  return null;
}

function detectLeadingDigitalSilence(buffer: AudioBuffer): number {
  const sampleRate = buffer.sampleRate;
  const maxScanSamples = Math.min(buffer.length, Math.floor(sampleRate * 0.4));
  const threshold = 0.003;
  const channels = Math.min(2, buffer.numberOfChannels);

  for (let i = 0; i < maxScanSamples; i++) {
    for (let ch = 0; ch < channels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) {
        return i / sampleRate;
      }
    }
  }
  return 0;
}

/**
 * Fast, non-blocking Web Audio onset-autocorrelation BPM detector.
 * Evaluates low-band + transient energy flux across a 35s active window.
 */
export function analyzeAudioTempo(
  buffer: AudioBuffer,
  fileName?: string
): AudioTempoAnalysis {
  const leadingSilenceSec = detectLeadingDigitalSilence(buffer);

  const filenameBpm = extractBpmFromFilename(fileName);
  if (filenameBpm !== null) {
    return { bpm: filenameBpm, leadingSilenceSec };
  }

  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  if (duration < 0.8) {
    return { bpm: 120, leadingSilenceSec };
  }

  // Analyze up to 35 seconds from an active section of the track
  const windowSec = Math.min(35, duration - leadingSilenceSec);
  const startSec =
    duration > 42
      ? Math.min(duration - windowSec, Math.max(leadingSilenceSec, duration * 0.18))
      : leadingSilenceSec;
  const startSample = Math.floor(startSec * sampleRate);
  const totalSamples = Math.min(
    buffer.length - startSample,
    Math.floor(windowSec * sampleRate)
  );

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  // 10ms hop => 100 onset frames per second
  const hopSamples = Math.max(64, Math.round(sampleRate * 0.01));
  const frameCount = Math.floor(totalSamples / hopSamples);
  if (frameCount < 60) {
    return { bpm: 120, leadingSilenceSec };
  }

  // 1-pole low-pass (~180 Hz) and high-pass (~1400 Hz) filters for kick + snare/hat separation
  const lpAlpha = Math.min(1, (2 * Math.PI * 180) / sampleRate);
  const hpAlpha = sampleRate / (sampleRate + 2 * Math.PI * 1400);
  let lpState = 0;
  let hpState = 0;
  let prevSample = 0;

  const lowEnergy = new Float32Array(frameCount);
  const highEnergy = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const base = startSample + f * hopSamples;
    let lowSum = 0;
    let highSum = 0;

    for (let i = 0; i < hopSamples; i++) {
      const idx = base + i;
      const sample = ch1 ? 0.5 * (ch0[idx] + ch1[idx]) : ch0[idx];

      lpState += lpAlpha * (sample - lpState);
      hpState = hpAlpha * (hpState + sample - prevSample);
      prevSample = sample;

      lowSum += lpState * lpState;
      highSum += hpState * hpState;
    }

    lowEnergy[f] = Math.log1p(120 * Math.sqrt(lowSum / hopSamples));
    highEnergy[f] = Math.log1p(120 * Math.sqrt(highSum / hopSamples));
  }

  // Positive onset flux
  const rawFlux = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f++) {
    const dLow = Math.max(0, lowEnergy[f] - lowEnergy[f - 1]);
    const dHigh = Math.max(0, highEnergy[f] - highEnergy[f - 1]);
    rawFlux[f] = dLow * 1.45 + dHigh * 0.85;
  }

  // Subtract local moving average (adaptive threshold)
  const flux = new Float32Array(frameCount);
  const radius = 8; // +/-80ms
  for (let f = 0; f < frameCount; f++) {
    const lo = Math.max(0, f - radius);
    const hi = Math.min(frameCount - 1, f + radius);
    let avg = 0;
    for (let k = lo; k <= hi; k++) avg += rawFlux[k];
    avg /= hi - lo + 1;
    flux[f] = Math.max(0, rawFlux[f] - avg * 1.05);
  }

  const framesPerSec = sampleRate / hopSamples;

  const evalLag = (lagFloat: number): number => {
    const lag0 = Math.floor(lagFloat);
    const frac = lagFloat - lag0;
    const limit = frameCount - lag0 - 2;
    if (limit <= 10) return 0;

    let sum = 0;
    for (let i = 0; i < limit; i++) {
      const target = flux[i + lag0] * (1 - frac) + flux[i + lag0 + 1] * frac;
      sum += flux[i] * target;
    }
    return sum / limit;
  };

  const rawScoreForBpm = (bpm: number): number => {
    const beatLag = (60 / bpm) * framesPerSec;
    const s1 = evalLag(beatLag);
    const s2 = evalLag(beatLag * 2);
    const s4 = evalLag(beatLag * 4);
    return s1 + 0.8 * s2 + 0.55 * s4;
  };

  let bestBpm = 120;
  let bestWeightedScore = -1;
  let bestRawScore = 0;

  // Sweep 60..190 BPM in 0.5 BPM increments
  for (let bpm = 60; bpm <= 190; bpm += 0.5) {
    const raw = rawScoreForBpm(bpm);
    // Gentle Gaussian tempo prior centered at 120 BPM (sigma=48) to reduce octave ambiguity
    const z = (bpm - 120) / 48;
    const prior = 0.78 + 0.22 * Math.exp(-0.5 * z * z);
    const weighted = raw * prior;

    if (weighted > bestWeightedScore) {
      bestWeightedScore = weighted;
      bestRawScore = raw;
      bestBpm = bpm;
    }
  }

  // Octave disambiguation (half-time vs double-time check)
  if (bestRawScore > 0) {
    if (bestBpm < 84 && bestBpm * 2 <= 175) {
      const doubleScore = rawScoreForBpm(bestBpm * 2);
      if (doubleScore >= bestRawScore * 0.82) {
        bestBpm = bestBpm * 2;
      }
    } else if (bestBpm > 164 && bestBpm / 2 >= 76) {
      const halfScore = rawScoreForBpm(bestBpm / 2);
      if (halfScore >= bestRawScore * 1.04) {
        bestBpm = bestBpm / 2;
      }
    }
  }

  // If this is a tight loop (<= 24s) that lands within ±2 BPM of an exact whole-bar duration, lock cleanly
  const trimmedDuration = Math.max(0.5, duration - leadingSilenceSec);
  if (trimmedDuration <= 24) {
    const estBars = Math.max(1, Math.round((trimmedDuration * bestBpm) / 240));
    const exactLoopBpm = (estBars * 240) / trimmedDuration;
    if (
      exactLoopBpm >= 55 &&
      exactLoopBpm <= 200 &&
      Math.abs(exactLoopBpm - bestBpm) <= 2.0
    ) {
      bestBpm = exactLoopBpm;
    }
  }

  const finalBpm = Math.min(240, Math.max(40, Math.round(bestBpm)));
  return { bpm: finalBpm, leadingSilenceSec };
}
