export type BankId = 'A' | 'B';

export type TriggerMode = 'oneshot' | 'hold';

export interface PadConfig {
  id: string; // e.g. 'A-0' .. 'A-11', 'B-0' .. 'B-11'
  bank: BankId;
  index: number; // 0..11
  shortcut: string; // '1'..'9', '0', '-', '='
  name: string;
  defaultName: string;
  color: string; // Hex color for LED rim & glow
  defaultColor: string;
  mode: TriggerMode;
  presetKey: string; // Built-in synthesizer preset identifier
  assetUrl?: string; // Bundled local audio asset path
  customFileName?: string | null; // Present if user uploaded a custom sample
  durationSec?: number; // Cached audio duration in seconds
  isCustomSlot?: boolean; // True for user-created boxes via + button
  isEmpty?: boolean; // True until user adds a sound from phone/device
}

export interface ConsoleSettings {
  masterVolume: number; // 0..1
  isMuted: boolean;
  reverbMix: number; // 0..1
  pitchRate: number; // 0.5..2.0
  activeBank: BankId;
}

export interface LedColorOption {
  name: string;
  hex: string;
}

export interface PadPlaybackSnapshot {
  padId: string;
  progress: number; // 0..1 (most recent active voice)
  activeCount: number;
}

export type ActivePage = 'pads' | 'fx' | 'loops';

export interface LoopPadConfig {
  id: string; // 'loop-0' .. 'loop-11'
  index: number;
  label: string;
  defaultLabel: string;
  color: string;
  fileName?: string | null;
  durationSec?: number;
  sourceBpm?: number;
}

