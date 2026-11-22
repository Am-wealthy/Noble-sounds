import {
  loadCustomAudioRecord,
  readRecordArrayBuffer,
  StoredAudioMeta,
} from '../storage/consoleStorage';
import { LoopPadConfig } from '../types/console';
import { audioEngine } from './audioEngine';
import { analyzeAudioTempo } from './bpmDetector';

export interface LoopTransportState {
  isPlaying: boolean;
  activePadId: string | null;
  queuedPadId: string | null;
  currentBeat: 1 | 2 | 3 | 4;
}

interface LoopTrackEntry {
  buffer: AudioBuffer;
  sourceBpm: number;
  leadingSilenceSec: number;
}

class BarSyncLoopEngine {
  private tracks = new Map<string, LoopTrackEntry>();
  private savedLoopMeta = new Map<string, { meta: StoredAudioMeta; savedBpm?: number }>();
  private bpm = 120;

  private isPlaying = false;
  private activePadId: string | null = null;
  private queuedPadId: string | null = null;
  private currentBeat: 1 | 2 | 3 | 4 = 1;

  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;

  private prevBarStartTime = 0;
  private barStartTime = 0;
  private nextBeatTime = 0;
  private nextBeatIndex = 0; // 0..3 corresponding to beats 1..4
  private schedulerTimer: number | null = null;
  private uiTimers: number[] = [];
  private sessionToken = 0;

  private listeners = new Set<(state: LoopTransportState) => void>();

  public subscribe(listener: (state: LoopTransportState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): LoopTransportState {
    return {
      isPlaying: this.isPlaying,
      activePadId: this.activePadId,
      queuedPadId: this.queuedPadId,
      currentBeat: this.currentBeat,
    };
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  private computePlaybackRate(sourceBpm: number): number {
    const safeSource = Math.min(240, Math.max(40, sourceBpm || this.bpm));
    const ratio = this.bpm / safeSource;
    return Math.min(4.0, Math.max(0.25, ratio));
  }

  public setBpm(nextBpm: number): void {
    const clamped = Math.min(240, Math.max(40, Math.round(nextBpm)));
    this.bpm = clamped;

    // Immediately re-align the currently playing track's speed to match the new Master BPM
    if (this.isPlaying && this.activePadId && this.activeSource) {
      const entry = this.tracks.get(this.activePadId);
      if (entry) {
        const { ctx } = audioEngine.getSharedBus();
        try {
          this.activeSource.playbackRate.setValueAtTime(
            this.computePlaybackRate(entry.sourceBpm),
            ctx.currentTime
          );
        } catch {
          // Ignore
        }
      }
    }
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setTrackSourceBpm(padId: string, nextSourceBpm: number): void {
    const clamped = Math.min(240, Math.max(40, Math.round(nextSourceBpm)));
    const saved = this.savedLoopMeta.get(padId);
    if (saved) {
      saved.savedBpm = clamped;
    }
    const entry = this.tracks.get(padId);
    if (!entry) return;
    entry.sourceBpm = clamped;

    if (this.isPlaying && this.activePadId === padId && this.activeSource) {
      const { ctx } = audioEngine.getSharedBus();
      try {
        this.activeSource.playbackRate.setValueAtTime(
          this.computePlaybackRate(clamped),
          ctx.currentTime
        );
      } catch {
        // Ignore
      }
    }
  }

  public hasBuffer(padId: string): boolean {
    return this.tracks.has(padId) || this.savedLoopMeta.has(padId);
  }

  public async loadSavedLoopBuffers(
    metaList: StoredAudioMeta[],
    existingPads: LoopPadConfig[],
    onLoaded: (padId: string, duration: number, sourceBpm: number) => void
  ): Promise<void> {
    const loopMeta = metaList.filter((r) => r.padId.startsWith('loop-'));
    if (loopMeta.length === 0) return;

    const padById = new Map(existingPads.map((p) => [p.id, p]));
    loopMeta.forEach((meta) => {
      const savedBpm = padById.get(meta.padId)?.sourceBpm;
      this.savedLoopMeta.set(meta.padId, { meta, savedBpm });
    });

    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    const decoder = new OfflineCtx(2, 44100, 44100);

    for (const meta of loopMeta) {
      try {
        const record = await loadCustomAudioRecord(meta.padId);
        if (!record) continue;
        const rawBuffer = await readRecordArrayBuffer(record);
        const decoded = await decoder.decodeAudioData(rawBuffer);
        const savedBpm = this.savedLoopMeta.get(meta.padId)?.savedBpm;
        const analysis = analyzeAudioTempo(decoded, meta.fileName);
        const sourceBpm = savedBpm ?? analysis.bpm;

        this.tracks.set(meta.padId, {
          buffer: decoded,
          sourceBpm,
          leadingSilenceSec: analysis.leadingSilenceSec,
        });
        onLoaded(meta.padId, decoded.duration, sourceBpm);
      } catch {
        // Fallback: will decode via live AudioContext when tapped
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  // No 8-second cap: supports audio of any duration and auto-detects BPM immediately
  public async decodeAndStoreFile(
    padId: string,
    arrayBuffer: ArrayBuffer,
    fileName?: string
  ): Promise<{ duration: number; sourceBpm: number }> {
    const { ctx } = audioEngine.getSharedBus();
    const copy = arrayBuffer.slice(0);
    const decoded = await ctx.decodeAudioData(copy);
    const analysis = analyzeAudioTempo(decoded, fileName);

    this.tracks.set(padId, {
      buffer: decoded,
      sourceBpm: analysis.bpm,
      leadingSilenceSec: analysis.leadingSilenceSec,
    });
    this.savedLoopMeta.delete(padId);

    return { duration: decoded.duration, sourceBpm: analysis.bpm };
  }

  public removeBuffer(padId: string): void {
    if (this.activePadId === padId) {
      this.stop();
    }
    if (this.queuedPadId === padId) {
      this.queuedPadId = null;
      this.emit();
    }
    this.tracks.delete(padId);
    this.savedLoopMeta.delete(padId);
  }

  private configureLoopSource(
    ctx: AudioContext,
    destination: AudioNode,
    entry: LoopTrackEntry,
    startTime: number,
    withFadeIn: boolean
  ): { source: AudioBufferSourceNode; gain: GainNode } {
    const { buffer, sourceBpm, leadingSilenceSec } = entry;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Align tempo immediately so sourceBpm plays at Master BPM (e.g. 150 BPM track -> 120 BPM = 0.80x)
    const rate = this.computePlaybackRate(sourceBpm);
    source.playbackRate.setValueAtTime(rate, startTime);

    const loopStart = Math.min(leadingSilenceSec, Math.max(0, buffer.duration - 0.1));
    source.loopStart = loopStart;

    // Lock loopEnd cleanly to whole bars in source-buffer time when buffer matches bar grid
    const trimmedDuration = Math.max(0.1, buffer.duration - loopStart);
    const sourceBarDuration = (60 / sourceBpm) * 4;
    const nearestBars = Math.max(1, Math.round(trimmedDuration / sourceBarDuration));
    if (Math.abs(trimmedDuration - nearestBars * sourceBarDuration) <= 0.25) {
      source.loopEnd = Math.min(
        buffer.duration,
        loopStart + nearestBars * sourceBarDuration
      );
    } else {
      source.loopEnd = buffer.duration;
    }

    const gain = ctx.createGain();
    if (withFadeIn) {
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(1.0, startTime + 0.005); // 5ms de-click crossfade
    } else {
      gain.gain.setValueAtTime(1.0, startTime);
    }

    source.connect(gain);
    gain.connect(destination);
    source.start(startTime, loopStart);

    return { source, gain };
  }

  public async handlePadClick(
    padId: string,
    onLazyAnalyzed?: (padId: string, duration: number, sourceBpm: number) => void
  ): Promise<void> {
    audioEngine.unlockSync();
    const { ctx, destination } = audioEngine.getSharedBus();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Continue
      }
    }

    let entry = this.tracks.get(padId);
    if (!entry) {
      const saved = this.savedLoopMeta.get(padId);
      if (saved) {
        try {
          const record = await loadCustomAudioRecord(padId);
          if (!record) return;
          const rawBuffer = await readRecordArrayBuffer(record);
          const decoded = await ctx.decodeAudioData(rawBuffer);
          const analysis = analyzeAudioTempo(decoded, saved.meta.fileName);
          const sourceBpm = saved.savedBpm ?? analysis.bpm;
          entry = {
            buffer: decoded,
            sourceBpm,
            leadingSilenceSec: analysis.leadingSilenceSec,
          };
          this.tracks.set(padId, entry);
          onLazyAnalyzed?.(padId, decoded.duration, sourceBpm);
        } catch {
          return;
        }
      }
    }
    if (!entry) return;

    // 1. Nothing playing -> start immediately on Beat 1 aligned to Master BPM
    if (!this.isPlaying || !this.activePadId) {
      this.startFirstTrack(ctx, destination, padId, entry);
      return;
    }

    // 2. Clicking the already-queued pad cancels the queue
    if (this.queuedPadId === padId) {
      this.queuedPadId = null;
      this.emit();
      return;
    }

    // 3. Clicking the currently playing pad cancels any pending switch
    if (this.activePadId === padId) {
      if (this.queuedPadId) {
        this.queuedPadId = null;
        this.emit();
      }
      return;
    }

    // 4. Bar-aligned switch: queue clicked pad for Beat 1 of the next bar
    this.queuedPadId = padId;
    this.emit();
  }

  private startFirstTrack(
    ctx: AudioContext,
    destination: AudioNode,
    padId: string,
    entry: LoopTrackEntry
  ): void {
    this.clearTimers();
    this.sessionToken += 1;
    const startTime = ctx.currentTime + 0.015;

    const { source, gain } = this.configureLoopSource(
      ctx,
      destination,
      entry,
      startTime,
      true
    );

    this.activeSource = source;
    this.activeGain = gain;
    this.activePadId = padId;
    this.queuedPadId = null;
    this.isPlaying = true;
    this.currentBeat = 1;

    this.prevBarStartTime = startTime;
    this.barStartTime = startTime;
    this.nextBeatTime = startTime;
    this.nextBeatIndex = 0;

    audioEngine.setExternalActive(true);
    this.emit();

    // Sample-accurate 25ms lookahead Web Audio clock scheduler
    this.schedulerLoop();
    this.schedulerTimer = window.setInterval(() => this.schedulerLoop(), 25);
  }

  private schedulerLoop(): void {
    if (!this.isPlaying) return;
    const { ctx, destination } = audioEngine.getSharedBus();
    const token = this.sessionToken;
    const lookaheadSec = 0.12;

    while (this.nextBeatTime < ctx.currentTime + lookaheadSec) {
      const beatTime = this.nextBeatTime;
      const beatNumber = ((this.nextBeatIndex % 4) + 1) as 1 | 2 | 3 | 4;
      const isBarBoundary = beatNumber === 1 && beatTime > this.barStartTime + 0.01;

      if (isBarBoundary) {
        this.prevBarStartTime = this.barStartTime;
        this.barStartTime = beatTime;

        // Execute queued bar-aligned switch with 5ms crossfade on exact Beat 1
        if (this.queuedPadId) {
          const nextPadId = this.queuedPadId;
          const nextEntry = this.tracks.get(nextPadId);

          if (nextEntry) {
            const oldSource = this.activeSource;
            const oldGain = this.activeGain;

            if (oldGain && oldSource) {
              oldGain.gain.setValueAtTime(1.0, beatTime);
              oldGain.gain.linearRampToValueAtTime(0.0001, beatTime + 0.005);
              oldSource.stop(beatTime + 0.006);
            }

            const { source: newSource, gain: newGain } = this.configureLoopSource(
              ctx,
              destination,
              nextEntry,
              beatTime,
              true
            );

            this.activeSource = newSource;
            this.activeGain = newGain;
            this.activePadId = nextPadId;
            this.queuedPadId = null;

            const delayMs = Math.max(0, (beatTime - ctx.currentTime) * 1000);
            const swapTimer = window.setTimeout(() => {
              if (this.sessionToken !== token || !this.isPlaying) return;
              this.currentBeat = 1;
              this.emit();
            }, delayMs);
            this.uiTimers.push(swapTimer);
          } else {
            this.queuedPadId = null;
          }
        }
      }

      // Schedule exact beat indicator update
      const beatDelayMs = Math.max(0, (beatTime - ctx.currentTime) * 1000);
      const beatTimer = window.setTimeout(() => {
        if (this.sessionToken !== token || !this.isPlaying) return;
        if (this.currentBeat !== beatNumber) {
          this.currentBeat = beatNumber;
          this.emit();
        }
      }, beatDelayMs);
      this.uiTimers.push(beatTimer);

      // Advance clock mathematically using exact AudioContext.currentTime intervals
      const beatDuration = 60 / this.bpm;
      this.nextBeatTime += beatDuration;
      this.nextBeatIndex = (this.nextBeatIndex + 1) % 4;
    }

    // Prune completed timer references periodically
    if (this.uiTimers.length > 32) {
      this.uiTimers = this.uiTimers.slice(-16);
    }
  }

  public getBarProgress(): number {
    if (!this.isPlaying) return 0;
    const { ctx } = audioEngine.getSharedBus();
    const barDuration = (60 / this.bpm) * 4;
    const anchor =
      ctx.currentTime >= this.barStartTime ? this.barStartTime : this.prevBarStartTime;
    const elapsed = Math.max(0, ctx.currentTime - anchor);
    return Math.min(1, elapsed / barDuration);
  }

  private clearTimers(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.uiTimers.forEach((id) => window.clearTimeout(id));
    this.uiTimers = [];
  }

  public stop(): void {
    this.sessionToken += 1;
    this.clearTimers();

    if (this.activeSource && this.activeGain) {
      const { ctx } = audioEngine.getSharedBus();
      const now = ctx.currentTime;
      try {
        this.activeGain.gain.cancelScheduledValues(now);
        this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, now);
        this.activeGain.gain.linearRampToValueAtTime(0.0001, now + 0.015);
        this.activeSource.stop(now + 0.02);
      } catch {
        // Ignore
      }
    }

    this.activeSource = null;
    this.activeGain = null;
    this.isPlaying = false;
    this.activePadId = null;
    this.queuedPadId = null;
    this.currentBeat = 1;

    audioEngine.setExternalActive(false);
    this.emit();
  }
}

export const loopEngine = new BarSyncLoopEngine();
