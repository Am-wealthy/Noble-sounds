import { renderPresetBuffer } from './presetSynthesizer';
import {
  loadCustomAudioRecord,
  readRecordArrayBuffer,
  StoredAudioMeta,
} from '../storage/consoleStorage';
import { PadConfig, TriggerMode } from '../types/console';

interface ActiveBufferVoice {
  kind: 'webaudio';
  voiceId: string;
  padId: string;
  mode: TriggerMode;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  bufferDuration: number;
  lastTimestamp: number;
  accumulatedBufferSec: number;
  stopped: boolean;
}

interface ActiveMediaVoice {
  kind: 'media';
  voiceId: string;
  padId: string;
  mode: TriggerMode;
  element: HTMLAudioElement;
  startTimeMs: number;
  durationSec: number;
  capTimer: number;
  stopped: boolean;
}

type ActiveVoice = ActiveBufferVoice | ActiveMediaVoice;

class LiveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private leftAnalyser: AnalyserNode | null = null;
  private rightAnalyser: AnalyserNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private mediaFallbackUrls = new Map<string, string>();
  private presetCache = new Map<string, AudioBuffer>();
  private pendingLoads = new Map<string, Promise<AudioBuffer | null>>();

  private padConfigs = new Map<string, PadConfig>();
  private savedCustomMeta = new Map<string, StoredAudioMeta>();
  private activeVoices = new Map<string, ActiveVoice>();
  private voiceCounter = 0;
  private unlocked = false;

  private masterVolume = 0.85;
  private isMuted = false;
  private reverbMix = 0.18;
  private pitchRate = 1.0;

  private waveformData = new Float32Array(256);
  private leftTimeData = new Float32Array(128);
  private rightTimeData = new Float32Array(128);

  private externalActive = false;
  private activeListeners = new Set<(activeCounts: Map<string, number>) => void>();

  public subscribeActivePads(
    listener: (activeCounts: Map<string, number>) => void
  ): () => void {
    this.activeListeners.add(listener);
    return () => {
      this.activeListeners.delete(listener);
    };
  }

  private emitActiveCounts(): void {
    const counts = new Map<string, number>();
    this.activeVoices.forEach((v) => {
      if (!v.stopped) {
        counts.set(v.padId, (counts.get(v.padId) ?? 0) + 1);
      }
    });
    if (this.externalActive) {
      counts.set('__loop__', 1);
    }
    this.activeListeners.forEach((fn) => fn(counts));
  }

  public setExternalActive(active: boolean): void {
    if (this.externalActive === active) return;
    this.externalActive = active;
    this.emitActiveCounts();
  }

  public getSharedBus(): { ctx: AudioContext; destination: AudioNode } {
    this.unlockSync();
    const ctx = this.ensureContext();
    return { ctx, destination: this.masterGain! };
  }

  public hasActiveVoices(): boolean {
    return this.activeVoices.size > 0 || this.externalActive;
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;

    // Allow playback even if iOS silent switch is on
    try {
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) {
        nav.audioSession.type = 'playback';
      }
    } catch {
      // Ignore if unsupported
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx({ latencyHint: 'interactive' });

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const reverbNode = ctx.createConvolver();
    reverbNode.buffer = this.createStudioImpulseResponse(ctx, 1.15, 2.6);

    const masterGain = ctx.createGain();
    const busLimiter = ctx.createDynamicsCompressor();
    busLimiter.threshold.value = -2;
    busLimiter.knee.value = 6;
    busLimiter.ratio.value = 4;
    busLimiter.attack.value = 0.003;
    busLimiter.release.value = 0.1;

    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.72;

    const splitter = ctx.createChannelSplitter(2);
    const leftAnalyser = ctx.createAnalyser();
    const rightAnalyser = ctx.createAnalyser();
    leftAnalyser.fftSize = 128;
    rightAnalyser.fftSize = 128;
    leftAnalyser.smoothingTimeConstant = 0.65;
    rightAnalyser.smoothingTimeConstant = 0.65;

    dryGain.connect(masterGain);
    reverbNode.connect(wetGain);
    wetGain.connect(masterGain);

    masterGain.connect(busLimiter);
    busLimiter.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);
    masterAnalyser.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);

    this.ctx = ctx;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.reverbNode = reverbNode;
    this.masterGain = masterGain;
    this.masterAnalyser = masterAnalyser;
    this.leftAnalyser = leftAnalyser;
    this.rightAnalyser = rightAnalyser;

    this.waveformData = new Float32Array(masterAnalyser.fftSize);
    this.leftTimeData = new Float32Array(leftAnalyser.fftSize);
    this.rightTimeData = new Float32Array(rightAnalyser.fftSize);

    this.applyMasterGain(true);
    this.applyReverbMix(true);

    return ctx;
  }

  public unlockSync(): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (!this.unlocked) {
      this.unlocked = true;
      try {
        // Silent 1-sample buffer unlocks iOS Safari & Android Chrome Web Audio
        const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // Ignore
      }
    }
  }

  private createStudioImpulseResponse(
    ctx: AudioContext,
    durationSec: number,
    decay: number
  ): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const channelData = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const white = (Math.random() * 2 - 1) * env;
        lp = lp * 0.6 + white * 0.4;
        channelData[i] = lp * 0.65;
      }
    }
    return impulse;
  }

  private trimAndCapBuffer(
    ctx: AudioContext,
    source: AudioBuffer,
    maxSec = 8.0
  ): AudioBuffer {
    const sampleRate = source.sampleRate;
    const channels = source.numberOfChannels;
    const totalLength = source.length;
    const threshold = 0.01;

    // Coarse step scan (every 64 samples) for instant performance on large MP3s
    let firstAudible = totalLength;
    for (let ch = 0; ch < channels; ch++) {
      const data = source.getChannelData(ch);
      for (let i = 0; i < totalLength; i += 64) {
        if (Math.abs(data[i]) > threshold) {
          firstAudible = Math.min(firstAudible, i);
          break;
        }
      }
    }

    const preRoll = Math.floor(sampleRate * 0.02);
    const startSample =
      firstAudible < totalLength ? Math.max(0, firstAudible - preRoll) : 0;
    const maxSamples = Math.floor(maxSec * sampleRate);
    const available = Math.max(1, totalLength - startSample);
    const outLength = Math.min(available, maxSamples);
    const wasTruncated = available > maxSamples;

    if (startSample === 0 && !wasTruncated) {
      return source;
    }

    const trimmed = ctx.createBuffer(channels, outLength, sampleRate);
    const fadeOutSamples = wasTruncated
      ? Math.min(Math.floor(sampleRate * 0.2), outLength)
      : 0;

    for (let ch = 0; ch < channels; ch++) {
      const srcData = source.getChannelData(ch);
      const dstData = trimmed.getChannelData(ch);
      dstData.set(srcData.subarray(startSample, startSample + outLength));

      if (fadeOutSamples > 0) {
        const fadeStart = outLength - fadeOutSamples;
        for (let j = 0; j < fadeOutSamples; j++) {
          const gain = 0.5 * (1 + Math.cos((Math.PI * j) / fadeOutSamples));
          dstData[fadeStart + j] *= gain;
        }
      }
    }

    return trimmed;
  }

  public registerPadsAndCustomMeta(
    pads: PadConfig[],
    customMeta: StoredAudioMeta[]
  ): void {
    this.padConfigs.clear();
    pads.forEach((p) => this.padConfigs.set(p.id, p));

    this.savedCustomMeta.clear();
    customMeta.forEach((m) => this.savedCustomMeta.set(m.padId, m));
  }

  public syncPadConfig(pad: PadConfig): void {
    this.padConfigs.set(pad.id, pad);
  }

  public removePad(padId: string): void {
    this.padConfigs.delete(padId);
    this.savedCustomMeta.delete(padId);
    this.buffers.delete(padId);
    this.mediaFallbackUrls.delete(padId);
  }

  // Gentle sequential preloading of only the bundled assets & custom files (no main-thread freeze)
  public startBackgroundPreload(
    pads: PadConfig[],
    onDurationReady: (padId: string, duration: number) => void
  ): () => void {
    let cancelled = false;

    const run = async () => {
      // Wait briefly so initial paint settles smoothly
      await new Promise((r) => setTimeout(r, 150));

      const priorityPads = pads.filter(
        (p) => !p.isEmpty && (this.savedCustomMeta.has(p.id) || Boolean(p.assetUrl))
      );

      for (const pad of priorityPads) {
        if (cancelled) return;
        if (this.buffers.has(pad.id)) continue;
        try {
          const buf = await this.ensurePadBuffer(pad);
          if (buf && !cancelled) {
            onDurationReady(pad.id, buf.duration);
          }
        } catch {
          // Ignore preload failures; fallback remains active
        }
        // Yield between files so UI stays responsive on mobile
        await new Promise((r) => setTimeout(r, 40));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }

  public async ensurePadBuffer(pad: PadConfig): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(pad.id);
    if (cached) return cached;

    const existingPromise = this.pendingLoads.get(pad.id);
    if (existingPromise) return existingPromise;

    const loadTask = (async (): Promise<AudioBuffer | null> => {
      const ctx = this.ensureContext();

      // 1. Check user-uploaded custom audio in IndexedDB (streamed per pad)
      if (this.savedCustomMeta.has(pad.id)) {
        const record = await loadCustomAudioRecord(pad.id);
        if (record) {
          try {
            const rawBuffer = await readRecordArrayBuffer(record);
            const decoded = await ctx.decodeAudioData(rawBuffer);
            const capped = this.trimAndCapBuffer(ctx, decoded, 8.0);
            this.buffers.set(pad.id, capped);
            return capped;
          } catch {
            const blob =
              record.blob ??
              new Blob([record.data ?? new ArrayBuffer(0)], {
                type: record.mimeType || 'audio/mpeg',
              });
            this.mediaFallbackUrls.set(pad.id, URL.createObjectURL(blob));
            return null;
          }
        }
      }

      // 2. Check bundled assetUrl (/assets/aistudio/...)
      if (pad.assetUrl) {
        try {
          const response = await fetch(pad.assetUrl);
          if (response.ok) {
            const raw = await response.arrayBuffer();
            const decoded = await ctx.decodeAudioData(raw);
            const capped = this.trimAndCapBuffer(ctx, decoded, 8.0);
            this.buffers.set(pad.id, capped);
            return capped;
          }
        } catch {
          // Keep HTMLAudio fallback ready if Web Audio cannot decode container
          this.mediaFallbackUrls.set(pad.id, pad.assetUrl);
          return null;
        }
      }

      if (pad.isEmpty) {
        return null;
      }

      // 3. Fallback / built-in synthesized preset (fast on-demand render)
      const presetKey = pad.presetKey || 'impact';
      let presetBuf = this.presetCache.get(presetKey);
      if (!presetBuf) {
        presetBuf = await renderPresetBuffer(presetKey, ctx.sampleRate);
        this.presetCache.set(presetKey, presetBuf);
      }
      this.buffers.set(pad.id, presetBuf);
      return presetBuf;
    })();

    this.pendingLoads.set(pad.id, loadTask);
    try {
      return await loadTask;
    } finally {
      this.pendingLoads.delete(pad.id);
    }
  }

  public async loadCustomFileForPad(
    padId: string,
    arrayBuffer: ArrayBuffer,
    mimeType = 'audio/mpeg'
  ): Promise<number> {
    const ctx = this.ensureContext();
    try {
      const copy = arrayBuffer.slice(0);
      const decoded = await ctx.decodeAudioData(copy);
      const capped = this.trimAndCapBuffer(ctx, decoded, 8.0);
      this.buffers.set(padId, capped);
      this.mediaFallbackUrls.delete(padId);
      return capped.duration;
    } catch {
      const blob = new Blob([arrayBuffer], { type: mimeType });
      this.mediaFallbackUrls.set(padId, URL.createObjectURL(blob));
      this.buffers.delete(padId);
      return 8.0;
    }
  }

  public async restorePresetForPad(
    padId: string,
    presetKey: string,
    assetUrl?: string
  ): Promise<number> {
    this.savedCustomMeta.delete(padId);
    this.buffers.delete(padId);
    this.mediaFallbackUrls.delete(padId);

    const pad = this.padConfigs.get(padId);
    if (pad) {
      const buf = await this.ensurePadBuffer({
        ...pad,
        presetKey,
        assetUrl,
        customFileName: null,
        isEmpty: false,
      });
      return buf?.duration ?? 2.0;
    }
    const ctx = this.ensureContext();
    const presetBuf = await renderPresetBuffer(presetKey, ctx.sampleRate);
    this.buffers.set(padId, presetBuf);
    return presetBuf.duration;
  }

  public setMasterVolume(volume: number, muted: boolean): void {
    this.masterVolume = Math.min(1, Math.max(0, volume));
    this.isMuted = muted;
    this.applyMasterGain(false);

    // Update any active HTMLAudio fallback voices
    this.activeVoices.forEach((v) => {
      if (v.kind === 'media' && !v.stopped) {
        v.element.volume = this.isMuted ? 0 : this.masterVolume;
      }
    });
  }

  private applyMasterGain(immediate: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.isMuted ? 0 : this.masterVolume;
    const now = this.ctx.currentTime;
    if (immediate) {
      this.masterGain.gain.setValueAtTime(target, now);
    } else {
      this.masterGain.gain.setTargetAtTime(target, now, 0.012);
    }
  }

  public setReverbMix(mix: number): void {
    this.reverbMix = Math.min(1, Math.max(0, mix));
    this.applyReverbMix(false);
  }

  private applyReverbMix(immediate: boolean): void {
    if (!this.ctx || !this.dryGain || !this.wetGain) return;
    const wet = this.reverbMix * 0.85;
    const dry = 1 - this.reverbMix * 0.28;
    const now = this.ctx.currentTime;
    if (immediate) {
      this.dryGain.gain.setValueAtTime(dry, now);
      this.wetGain.gain.setValueAtTime(wet, now);
    } else {
      this.dryGain.gain.setTargetAtTime(dry, now, 0.015);
      this.wetGain.gain.setTargetAtTime(wet, now, 0.015);
    }
  }

  public setPitchRate(rate: number): void {
    const clamped = Math.min(2.0, Math.max(0.5, rate));
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      this.activeVoices.forEach((voice) => {
        if (voice.stopped) return;
        if (voice.kind === 'webaudio') {
          const dt = Math.max(0, now - voice.lastTimestamp);
          voice.accumulatedBufferSec += dt * this.pitchRate;
          voice.lastTimestamp = now;
          voice.source.playbackRate.setTargetAtTime(clamped, now, 0.012);
        } else {
          voice.element.playbackRate = clamped;
        }
      });
    }
    this.pitchRate = clamped;
  }

  public triggerPad(pad: PadConfig, mode: TriggerMode): string {
    this.unlockSync();
    const voiceId = `${pad.id}-${++this.voiceCounter}`;
    void this.startVoiceAsync(pad, mode, voiceId);
    return voiceId;
  }

  private async startVoiceAsync(
    pad: PadConfig,
    mode: TriggerMode,
    voiceId: string
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Continue to try playback
      }
    }

    const buffer = await this.ensurePadBuffer(pad);

    // Fallback to HTMLAudioElement if Web Audio decode failed for container
    if (!buffer) {
      const fallbackUrl = this.mediaFallbackUrls.get(pad.id) || pad.assetUrl;
      if (!fallbackUrl) return;
      this.playMediaElementFallback(pad.id, mode, voiceId, fallbackUrl);
      return;
    }

    if (!this.dryGain || !this.reverbNode) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(this.pitchRate, ctx.currentTime);

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(1.0, ctx.currentTime);

    source.connect(voiceGain);
    voiceGain.connect(this.dryGain);
    if (this.reverbMix > 0.01) {
      voiceGain.connect(this.reverbNode);
    }

    const now = ctx.currentTime;
    const voice: ActiveBufferVoice = {
      kind: 'webaudio',
      voiceId,
      padId: pad.id,
      mode,
      source,
      gainNode: voiceGain,
      bufferDuration: buffer.duration,
      lastTimestamp: now,
      accumulatedBufferSec: 0,
      stopped: false,
    };

    this.activeVoices.set(voiceId, voice);
    this.emitActiveCounts();

    source.onended = () => {
      voice.stopped = true;
      this.activeVoices.delete(voiceId);
      this.emitActiveCounts();
      try {
        source.disconnect();
        voiceGain.disconnect();
      } catch {
        // Ignore
      }
    };

    source.start(now);
  }

  private playMediaElementFallback(
    padId: string,
    mode: TriggerMode,
    voiceId: string,
    url: string
  ): void {
    const audio = new Audio(url);
    audio.volume = this.isMuted ? 0 : this.masterVolume;
    audio.playbackRate = this.pitchRate;

    const capTimer = window.setTimeout(() => {
      this.stopVoice(voiceId);
    }, 8000);

    const voice: ActiveMediaVoice = {
      kind: 'media',
      voiceId,
      padId,
      mode,
      element: audio,
      startTimeMs: performance.now(),
      durationSec: 8.0,
      capTimer,
      stopped: false,
    };

    this.activeVoices.set(voiceId, voice);
    this.emitActiveCounts();

    audio.onended = () => {
      window.clearTimeout(capTimer);
      voice.stopped = true;
      this.activeVoices.delete(voiceId);
      this.emitActiveCounts();
    };

    void audio.play().catch(() => {
      window.clearTimeout(capTimer);
      voice.stopped = true;
      this.activeVoices.delete(voiceId);
      this.emitActiveCounts();
    });
  }

  public stopVoice(voiceId: string): void {
    const voice = this.activeVoices.get(voiceId);
    if (!voice || voice.stopped) return;

    voice.stopped = true;
    this.activeVoices.delete(voiceId);
    this.emitActiveCounts();

    if (voice.kind === 'media') {
      window.clearTimeout(voice.capTimer);
      try {
        voice.element.pause();
        voice.element.currentTime = 0;
      } catch {
        // Ignore
      }
      return;
    }

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      voice.gainNode.gain.cancelScheduledValues(now);
      voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
      voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      voice.source.stop(now + 0.045);
    } catch {
      // Ignore
    }
  }

  public stopAll(): void {
    const voices = Array.from(this.activeVoices.values());
    this.activeVoices.clear();
    this.emitActiveCounts();

    const now = this.ctx?.currentTime ?? 0;
    voices.forEach((voice) => {
      if (voice.stopped) return;
      voice.stopped = true;
      if (voice.kind === 'media') {
        window.clearTimeout(voice.capTimer);
        try {
          voice.element.pause();
          voice.element.currentTime = 0;
        } catch {
          // Ignore
        }
      } else if (this.ctx) {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
          voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.025);
          voice.source.stop(now + 0.03);
        } catch {
          // Ignore
        }
      }
    });
  }

  public getPadProgress(padId: string): number {
    if (this.activeVoices.size === 0) return 0;
    const now = this.ctx?.currentTime ?? 0;
    let best = 1;
    let found = false;

    this.activeVoices.forEach((voice) => {
      if (voice.stopped || voice.padId !== padId) return;
      found = true;
      if (voice.kind === 'media') {
        const elapsed = (performance.now() - voice.startTimeMs) / 1000;
        const p = Math.min(1, Math.max(0, elapsed / voice.durationSec));
        if (p < best) best = p;
      } else {
        const dt = Math.max(0, now - voice.lastTimestamp);
        const elapsed = voice.accumulatedBufferSec + dt * this.pitchRate;
        const p = Math.min(1, Math.max(0, elapsed / Math.max(0.01, voice.bufferDuration)));
        if (p < best) best = p;
      }
    });

    return found ? best : 0;
  }

  public getWaveformSamples(): Float32Array | null {
    if (!this.masterAnalyser || !this.hasActiveVoices()) return null;
    this.masterAnalyser.getFloatTimeDomainData(this.waveformData);
    return this.waveformData;
  }

  public getStereoLevels(): { left: number; right: number } {
    if (!this.leftAnalyser || !this.rightAnalyser || !this.hasActiveVoices()) {
      return { left: 0, right: 0 };
    }
    this.leftAnalyser.getFloatTimeDomainData(this.leftTimeData);
    this.rightAnalyser.getFloatTimeDomainData(this.rightTimeData);

    const calc = (arr: Float32Array): number => {
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = Math.abs(arr[i]);
        if (v > peak) peak = v;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / arr.length);
      return Math.min(1, Math.max(0, peak * 0.55 + rms * 0.9));
    };

    return {
      left: calc(this.leftTimeData),
      right: calc(this.rightTimeData),
    };
  }
}

export const audioEngine = new LiveAudioEngine();
