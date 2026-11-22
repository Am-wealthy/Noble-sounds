import { ConsoleSettings, LedColorOption, PadConfig } from '../types/console';

export const PAD_SHORTCUTS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  '-',
  '=',
] as const;

export const LED_COLOR_PALETTE: LedColorOption[] = [
  { name: 'Laser Cyan', hex: '#06B6D4' },
  { name: 'Cobalt Blue', hex: '#3B82F6' },
  { name: 'Electric Violet', hex: '#8B5CF6' },
  { name: 'Studio Amber', hex: '#F59E0B' },
  { name: 'Crimson Red', hex: '#EF4444' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Magenta Rose', hex: '#EC4899' },
  { name: 'Tangerine', hex: '#F97316' },
  { name: 'Glacier Mint', hex: '#2DD4BF' },
  { name: 'Platinum', hex: '#E2E8F0' },
];

export const DEFAULT_SETTINGS: ConsoleSettings = {
  masterVolume: 0.85,
  isMuted: false,
  reverbMix: 0.18,
  pitchRate: 1.0,
  activeBank: 'A',
};

const BANK_A_SPECS: Array<{
  name: string;
  color: string;
  presetKey: string;
  assetUrl?: string;
  mode: 'oneshot' | 'hold';
}> = [
  {
    name: 'Eagle Cry',
    color: '#F59E0B',
    presetKey: 'eagle',
    assetUrl: '/assets/aistudio/vidssave.com_Eagle_Sound_Effect_48kbps_c753d2c5.mp4',
    mode: 'oneshot',
  },
  {
    name: 'Horse Neigh',
    color: '#F97316',
    presetKey: 'wolf',
    assetUrl: '/assets/aistudio/HORSE_-_Sound_Effect_-_Sound_Bar_f8f11113.mp3',
    mode: 'oneshot',
  },
  {
    name: 'Forest Flute',
    color: '#10B981',
    presetKey: 'ocean',
    assetUrl:
      '/assets/aistudio/Japanese_Forest_Flute_Ambience__Sound_Effect_-_Noisy_Clips_6d3846a3.mp3',
    mode: 'oneshot',
  },
  {
    name: 'Shofar Horn',
    color: '#E2E8F0',
    presetKey: 'bell',
    assetUrl:
      '/assets/aistudio/Shofar_Blowing_-_Sound_with_Pictures_-_nikkyttmessianic_PraiseandWorship_b945ad12.mp3',
    mode: 'oneshot',
  },
  {
    name: 'Cymbal Roll',
    color: '#06B6D4',
    presetKey: 'rev_cymbal',
    assetUrl:
      '/assets/aistudio/Cymbal_roll_sound_effect_-_John_michael_villaber_9eef116a.mp3',
    mode: 'oneshot',
  },
  {
    name: 'Bass Impact',
    color: '#EF4444',
    presetKey: 'impact',
    assetUrl:
      '/assets/aistudio/Bass_Impact_-_Sound_Effect_for_editing_-_Sound_Library_1c8c3c3b.mp3',
    mode: 'oneshot',
  },
  { name: 'Thunder Clap', color: '#3B82F6', presetKey: 'thunder', mode: 'oneshot' },
  { name: 'Air Horn', color: '#EC4899', presetKey: 'airhorn', mode: 'hold' },
  { name: 'Laser Zap', color: '#2DD4BF', presetKey: 'laser', mode: 'oneshot' },
  { name: 'Lion Roar', color: '#F97316', presetKey: 'lion', mode: 'oneshot' },
  { name: 'Glass Shatter', color: '#2DD4BF', presetKey: 'glass', mode: 'oneshot' },
  { name: 'Stadium Cheer', color: '#10B981', presetKey: 'cheer', mode: 'hold' },
];

const BANK_B_SPECS: Array<{
  name: string;
  color: string;
  presetKey: string;
  assetUrl?: string;
  mode: 'oneshot' | 'hold';
}> = [
  { name: 'Cyber Riser', color: '#06B6D4', presetKey: 'cyber_riser', mode: 'oneshot' },
  { name: '808 Sub Drop', color: '#EF4444', presetKey: 'sub_drop', mode: 'oneshot' },
  { name: 'Reverse Cymbal', color: '#F59E0B', presetKey: 'rev_cymbal', mode: 'oneshot' },
  { name: 'Downlifter', color: '#3B82F6', presetKey: 'downlifter', mode: 'oneshot' },
  { name: 'Snare Roll', color: '#F97316', presetKey: 'snare_roll', mode: 'oneshot' },
  { name: 'Impact Hit', color: '#EC4899', presetKey: 'impact', mode: 'oneshot' },
  { name: 'Tape Stop', color: '#8B5CF6', presetKey: 'tape_stop', mode: 'oneshot' },
  { name: 'Uplift Chord', color: '#10B981', presetKey: 'uplift_chord', mode: 'oneshot' },
  { name: 'Jet Whoosh', color: '#2DD4BF', presetKey: 'jet_whoosh', mode: 'oneshot' },
  { name: 'Tension Siren', color: '#EF4444', presetKey: 'siren_build', mode: 'hold' },
  { name: 'Bass Cannon', color: '#F59E0B', presetKey: 'bass_cannon', mode: 'oneshot' },
  { name: 'Strobe Gate', color: '#06B6D4', presetKey: 'strobe_gate', mode: 'hold' },
];

export function createDefaultPads(): PadConfig[] {
  const bankA: PadConfig[] = BANK_A_SPECS.map((spec, idx) => ({
    id: `A-${idx}`,
    bank: 'A',
    index: idx,
    shortcut: PAD_SHORTCUTS[idx],
    name: spec.name,
    defaultName: spec.name,
    color: spec.color,
    defaultColor: spec.color,
    mode: spec.mode,
    presetKey: spec.presetKey,
    assetUrl: spec.assetUrl,
    customFileName: null,
  }));

  const bankB: PadConfig[] = BANK_B_SPECS.map((spec, idx) => ({
    id: `B-${idx}`,
    bank: 'B',
    index: idx,
    shortcut: PAD_SHORTCUTS[idx],
    name: spec.name,
    defaultName: spec.name,
    color: spec.color,
    defaultColor: spec.color,
    mode: spec.mode,
    presetKey: spec.presetKey,
    assetUrl: spec.assetUrl,
    customFileName: null,
  }));

  return [...bankA, ...bankB];
}
