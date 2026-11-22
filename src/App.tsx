import {
  Grid3X3,
  OctagonX,
  Plus,
  Repeat,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from './audio/audioEngine';
import { loopEngine } from './audio/loopEngine';
import { LoopPage } from './components/LoopPage';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PadCard } from './components/PadCard';
import { PadEditorModal } from './components/PadEditorModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { RotaryKnob } from './components/RotaryKnob';
import { StereoVuMeter } from './components/StereoVuMeter';
import { StudioFader } from './components/StudioFader';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { LED_COLOR_PALETTE, PAD_SHORTCUTS } from './data/defaultPads';
import {
  deleteCustomAudio,
  listStoredAudioMeta,
  loadConsoleSettings,
  loadLoopBpm,
  loadLoopPads,
  loadLoopPadsFromIndexedDB,
  loadPadConfigs,
  loadPadConfigsFromIndexedDB,
  requestPersistentStorage,
  saveConsoleSettings,
  saveCustomAudioFile,
  saveLoopBpm,
  saveLoopPads,
  savePadConfigs,
} from './storage/consoleStorage';
import {
  ActivePage,
  BankId,
  ConsoleSettings,
  LoopPadConfig,
  PadConfig,
  TriggerMode,
} from './types/console';

export default function App() {
  const [pads, setPads] = useState<PadConfig[]>(() => loadPadConfigs());
  const [loopPads, setLoopPads] = useState<LoopPadConfig[]>(() => loadLoopPads());
  const [loopBpm, setLoopBpm] = useState<number>(() => loadLoopBpm());
  const [settings, setSettings] = useState<ConsoleSettings>(() => loadConsoleSettings());
  const [activePage, setActivePage] = useState<ActivePage>('pads');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPadId, setEditingPadId] = useState<string | null>(null);

  const [pressedPads, setPressedPads] = useState<Record<string, boolean>>({});
  const [activePadCounts, setActivePadCounts] = useState<Map<string, number>>(
    () => new Map()
  );

  // Track active Hold voices per pointer/key so releasing stops the exact voice
  const pointerVoiceRef = useRef<Map<number, { padId: string; voiceId: string }>>(new Map());
  const keyVoiceRef = useRef<Map<string, { padId: string; voiceId: string }>>(new Map());
  const touchGesturesRef = useRef<
    Map<
      number,
      {
        startX: number;
        startY: number;
        moved: boolean;
        pad: PadConfig;
        holdTimer?: number;
        voiceId?: string;
      }
    >
  >(new Map());

  const padsRef = useRef(pads);
  padsRef.current = pads;
  const activeBankRef = useRef(settings.activeBank);
  activeBankRef.current = settings.activeBank;
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;
  const editingPadIdRef = useRef(editingPadId);
  editingPadIdRef.current = editingPadId;
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  // Load saved IndexedDB custom records & gently preload bundled audio without blocking UI
  useEffect(() => {
    let cancelPreload: (() => void) | undefined;
    let mounted = true;

    async function setupAudio() {
      void requestPersistentStorage();

      const [idbPads, idbLoopPads, customMeta] = await Promise.all([
        loadPadConfigsFromIndexedDB(),
        loadLoopPadsFromIndexedDB(),
        listStoredAudioMeta(),
      ]);
      if (!mounted) return;

      const effectivePads = idbPads ?? padsRef.current;
      const effectiveLoopPads = idbLoopPads ?? loopPads;

      if (idbPads) setPads(idbPads);
      if (idbLoopPads) setLoopPads(idbLoopPads);

      audioEngine.registerPadsAndCustomMeta(effectivePads, customMeta);
      audioEngine.setMasterVolume(settings.masterVolume, settings.isMuted);
      audioEngine.setReverbMix(settings.reverbMix);
      audioEngine.setPitchRate(settings.pitchRate);

      cancelPreload = audioEngine.startBackgroundPreload(
        effectivePads,
        (padId, duration) => {
          if (!mounted) return;
          setPads((prev) =>
            prev.map((p) => (p.id === padId ? { ...p, durationSec: duration } : p))
          );
        }
      );

      void loopEngine.loadSavedLoopBuffers(
        customMeta,
        effectiveLoopPads,
        (padId, duration, sourceBpm) => {
          if (!mounted) return;
          setLoopPads((prev) =>
            prev.map((p) =>
              p.id === padId
                ? { ...p, durationSec: duration, sourceBpm: p.sourceBpm ?? sourceBpm }
                : p
            )
          );
        }
      );
    }

    void setupAudio();
    const unsubscribe = audioEngine.subscribeActivePads((counts) => {
      setActivePadCounts(counts);
    });

    return () => {
      mounted = false;
      unsubscribe();
      cancelPreload?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync master settings to AudioEngine & persist to localStorage
  useEffect(() => {
    saveConsoleSettings(settings);
    audioEngine.setMasterVolume(settings.masterVolume, settings.isMuted);
    audioEngine.setReverbMix(settings.reverbMix);
    audioEngine.setPitchRate(settings.pitchRate);
  }, [settings]);

  // Sync loop BPM & pads
  useEffect(() => {
    saveLoopBpm(loopBpm);
    loopEngine.setBpm(loopBpm);
  }, [loopBpm]);

  useEffect(() => {
    saveLoopPads(loopPads);
  }, [loopPads]);

  // Persist pad configs whenever they change
  useEffect(() => {
    savePadConfigs(pads);
    pads.forEach((p) => audioEngine.syncPadConfig(p));
  }, [pads]);

  const handleStopAll = useCallback(() => {
    audioEngine.stopAll();
    loopEngine.stop();
    pointerVoiceRef.current.clear();
    keyVoiceRef.current.clear();
    setPressedPads({});
  }, []);

  const setPadPressedState = useCallback((padId: string, pressed: boolean) => {
    setPressedPads((prev) => {
      if (Boolean(prev[padId]) === pressed) return prev;
      return { ...prev, [padId]: pressed };
    });
  }, []);

  const triggerPadStart = useCallback(
    (pad: PadConfig): string => {
      const voiceId = audioEngine.triggerPad(pad, pad.mode);
      setPadPressedState(pad.id, true);
      return voiceId;
    },
    [setPadPressedState]
  );

  // Pointer interaction on PadCard (supports smooth mobile touch scrolling without false triggers)
  const handlePadPointerDown = useCallback(
    (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => {
      audioEngine.unlockSync();

      if (e.pointerType === 'touch') {
        const gesture: {
          startX: number;
          startY: number;
          moved: boolean;
          pad: PadConfig;
          holdTimer?: number;
          voiceId?: string;
        } = {
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          pad,
        };

        // For Hold pads, start playback only after finger stays stationary for 90ms
        if (!isEditMode && !pad.isEmpty && pad.mode === 'hold') {
          gesture.holdTimer = window.setTimeout(() => {
            const current = touchGesturesRef.current.get(e.pointerId);
            if (!current || current.moved) return;
            current.voiceId = triggerPadStart(pad);
          }, 90);
        }

        touchGesturesRef.current.set(e.pointerId, gesture);
        return;
      }

      // Desktop mouse / pen: zero-latency immediate trigger
      if (isEditMode || pad.isEmpty) {
        setEditingPadId(pad.id);
        return;
      }
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if unsupported
      }
      const voiceId = triggerPadStart(pad);
      if (pad.mode === 'hold') {
        pointerVoiceRef.current.set(e.pointerId, { padId: pad.id, voiceId });
      }
    },
    [isEditMode, triggerPadStart]
  );

  const handlePadPointerMove = useCallback(
    (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== 'touch') return;
      const gesture = touchGesturesRef.current.get(e.pointerId);
      if (!gesture || gesture.moved) return;

      const dist = Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY);
      if (dist > 8) {
        gesture.moved = true;
        if (gesture.holdTimer !== undefined) {
          window.clearTimeout(gesture.holdTimer);
          gesture.holdTimer = undefined;
        }
        if (gesture.voiceId) {
          audioEngine.stopVoice(gesture.voiceId);
          gesture.voiceId = undefined;
        }
        setPadPressedState(pad.id, false);
      }
    },
    [setPadPressedState]
  );

  const handlePadPointerRelease = useCallback(
    (pad: PadConfig, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') {
        const gesture = touchGesturesRef.current.get(e.pointerId);
        touchGesturesRef.current.delete(e.pointerId);
        if (!gesture) return;

        if (gesture.holdTimer !== undefined) {
          window.clearTimeout(gesture.holdTimer);
          gesture.holdTimer = undefined;
        }

        if (gesture.moved || e.type === 'pointercancel') {
          if (gesture.voiceId) {
            audioEngine.stopVoice(gesture.voiceId);
          }
          setPadPressedState(pad.id, false);
          return;
        }

        // Clean stationary tap on touch device
        if (isEditMode || pad.isEmpty) {
          setPadPressedState(pad.id, false);
          setEditingPadId(pad.id);
          return;
        }

        if (pad.mode === 'oneshot') {
          triggerPadStart(pad);
          window.setTimeout(() => setPadPressedState(pad.id, false), 140);
        } else {
          // Hold pad: stop if already started, or play a crisp short tap if released <90ms
          if (gesture.voiceId) {
            audioEngine.stopVoice(gesture.voiceId);
            setPadPressedState(pad.id, false);
          } else {
            const quickVoice = triggerPadStart(pad);
            window.setTimeout(() => {
              audioEngine.stopVoice(quickVoice);
              setPadPressedState(pad.id, false);
            }, 160);
          }
        }
        return;
      }

      if (isEditMode || pad.isEmpty) return;
      setPadPressedState(pad.id, false);
      const activeHold = pointerVoiceRef.current.get(e.pointerId);
      if (activeHold) {
        audioEngine.stopVoice(activeHold.voiceId);
        pointerVoiceRef.current.delete(e.pointerId);
      }
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    },
    [isEditMode, setPadPressedState, triggerPadStart]
  );

  // Keyboard shortcuts: 1-9, 0, -, = and Escape for STOP ALL
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape' && editingPadIdRef.current) {
          setEditingPadId(null);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (editingPadIdRef.current) {
          setEditingPadId(null);
        } else {
          handleStopAll();
        }
        return;
      }

      if (
        editingPadIdRef.current ||
        isEditModeRef.current ||
        activePageRef.current === 'loops'
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;

      const shortcutIndex = PAD_SHORTCUTS.indexOf(
        e.key as (typeof PAD_SHORTCUTS)[number]
      );
      if (shortcutIndex === -1) return;

      e.preventDefault();
      audioEngine.unlockSync();
      const pad = padsRef.current.find(
        (p) => p.bank === activeBankRef.current && p.index === shortcutIndex
      );
      if (!pad || pad.isEmpty) return;

      const voiceId = triggerPadStart(pad);
      if (pad.mode === 'hold') {
        keyVoiceRef.current.set(e.key, { padId: pad.id, voiceId });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const shortcutIndex = PAD_SHORTCUTS.indexOf(
        e.key as (typeof PAD_SHORTCUTS)[number]
      );
      if (shortcutIndex === -1) return;

      const pad = padsRef.current.find(
        (p) => p.bank === activeBankRef.current && p.index === shortcutIndex
      );
      if (pad) {
        setPadPressedState(pad.id, false);
      }

      const held = keyVoiceRef.current.get(e.key);
      if (held) {
        audioEngine.stopVoice(held.voiceId);
        setPadPressedState(held.padId, false);
        keyVoiceRef.current.delete(e.key);
      }
    };

    const onWindowBlur = () => {
      keyVoiceRef.current.forEach((held) => {
        audioEngine.stopVoice(held.voiceId);
      });
      keyVoiceRef.current.clear();
      setPressedPads({});
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [handleStopAll, setPadPressedState, triggerPadStart]);

  const activePads = useMemo(
    () =>
      pads
        .filter((p) => p.bank === settings.activeBank)
        .sort((a, b) => a.index - b.index),
    [pads, settings.activeBank]
  );

  const editingPad = useMemo(
    () => pads.find((p) => p.id === editingPadId) ?? null,
    [pads, editingPadId]
  );

  // Plus button: creates a new empty box in the active bank
  const handleAddNewBox = useCallback(() => {
    const bankPads = padsRef.current.filter((p) => p.bank === activeBankRef.current);
    const nextIndex =
      bankPads.length > 0 ? Math.max(...bankPads.map((p) => p.index)) + 1 : 0;
    const customNum = bankPads.filter((p) => p.isCustomSlot).length + 1;
    const colorOpt =
      LED_COLOR_PALETTE[(bankPads.length + customNum) % LED_COLOR_PALETTE.length];

    const newPad: PadConfig = {
      id: `${activeBankRef.current}-custom-${Date.now()}`,
      bank: activeBankRef.current,
      index: nextIndex,
      shortcut: `+${customNum}`,
      name: 'Add Sound',
      defaultName: 'Custom Sound',
      color: colorOpt.hex,
      defaultColor: colorOpt.hex,
      mode: 'oneshot',
      presetKey: 'custom',
      customFileName: null,
      isCustomSlot: true,
      isEmpty: true,
    };

    setPads((prev) => [...prev, newPad]);
  }, []);

  const handleSavePadMeta = useCallback(
    (padId: string, updates: { name: string; color: string; mode: TriggerMode }) => {
      setPads((prev) =>
        prev.map((p) =>
          p.id === padId
            ? { ...p, name: updates.name, color: updates.color, mode: updates.mode }
            : p
        )
      );
    },
    []
  );

  const handleUploadPadAudio = useCallback(async (padId: string, file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || 'audio/mpeg';
    const duration = await audioEngine.loadCustomFileForPad(
      padId,
      arrayBuffer,
      mimeType
    );
    await saveCustomAudioFile(padId, file, file.name, mimeType);
    setPads((prev) =>
      prev.map((p) =>
        p.id === padId
          ? {
              ...p,
              customFileName: file.name,
              durationSec: duration,
              isEmpty: false,
            }
          : p
      )
    );
  }, []);

  const handleResetPad = useCallback(async (padId: string) => {
    const target = padsRef.current.find((p) => p.id === padId);
    if (!target) return;
    await deleteCustomAudio(padId);
    const duration = await audioEngine.restorePresetForPad(
      padId,
      target.presetKey,
      target.assetUrl
    );
    setPads((prev) =>
      prev.map((p) =>
        p.id === padId
          ? {
              ...p,
              name: p.defaultName,
              color: p.defaultColor,
              customFileName: null,
              durationSec: duration,
              isEmpty: false,
            }
          : p
      )
    );
  }, []);

  const handleDeletePad = useCallback(async (padId: string) => {
    await deleteCustomAudio(padId);
    audioEngine.removePad(padId);
    setPads((prev) => prev.filter((p) => p.id !== padId));
  }, []);

  const handleAuditionPad = useCallback((padId: string) => {
    const target = padsRef.current.find((p) => p.id === padId);
    if (!target || target.isEmpty) return;
    audioEngine.unlockSync();
    audioEngine.triggerPad(target, 'oneshot');
  }, []);

  const handleUploadLoopAudio = useCallback(async (padId: string, file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || 'audio/mpeg';
    const { duration, sourceBpm } = await loopEngine.decodeAndStoreFile(
      padId,
      arrayBuffer,
      file.name
    );
    await saveCustomAudioFile(padId, file, file.name, mimeType);
    setLoopPads((prev) =>
      prev.map((p) =>
        p.id === padId
          ? { ...p, fileName: file.name, durationSec: duration, sourceBpm }
          : p
      )
    );
  }, []);

  const handleUpdateLoopPadMeta = useCallback(
    (padId: string, label: string, sourceBpm?: number) => {
      if (typeof sourceBpm === 'number') {
        loopEngine.setTrackSourceBpm(padId, sourceBpm);
      }
      setLoopPads((prev) =>
        prev.map((p) =>
          p.id === padId
            ? {
                ...p,
                label,
                sourceBpm: typeof sourceBpm === 'number' ? sourceBpm : p.sourceBpm,
              }
            : p
        )
      );
    },
    []
  );

  const handleLazyAnalyzedLoopPad = useCallback(
    (padId: string, duration: number, sourceBpm: number) => {
      setLoopPads((prev) =>
        prev.map((p) =>
          p.id === padId
            ? { ...p, durationSec: duration, sourceBpm: p.sourceBpm ?? sourceBpm }
            : p
        )
      );
    },
    []
  );

  const handleClearLoopPad = useCallback(async (padId: string) => {
    await deleteCustomAudio(padId);
    loopEngine.removeBuffer(padId);
    setLoopPads((prev) =>
      prev.map((p) =>
        p.id === padId
          ? { ...p, fileName: null, durationSec: undefined, sourceBpm: undefined }
          : p
      )
    );
  }, []);

  const switchBank = (bank: BankId) => {
    if (bank === settings.activeBank) return;
    keyVoiceRef.current.forEach((held) => audioEngine.stopVoice(held.voiceId));
    keyVoiceRef.current.clear();
    setPressedPads({});
    setSettings((prev) => ({ ...prev, activeBank: bank }));
  };

  return (
    <div className="relative min-h-screen w-full bg-[#06070A] text-slate-100 flex flex-col items-center px-3 py-4 sm:px-6 sm:py-8 overflow-x-hidden">
      {/* Main Luxury Studio Hardware Console Chassis */}
      <main className="console-chassis relative z-10 my-auto w-full max-w-[1060px] rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 md:p-7 flex flex-col gap-5">
        {/* 1. TOP CONSOLE HEADER */}
        <header className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 pb-4 border-b border-white/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-[0.06em] uppercase bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent whitespace-nowrap shrink-0">
              LIVE FX CONSOLE
            </h1>
            <div className="flex items-center gap-2 md:hidden">
              <PWAInstallButton />
              {activePage === 'pads' && isEditMode && (
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 cursor-pointer whitespace-nowrap"
                >
                  Done Editing
                </button>
              )}
            </div>
          </div>

          <div className="w-full min-w-0">
            <WaveformVisualizer
              accentHex={settings.activeBank === 'A' ? '#22D3EE' : '#F59E0B'}
            />
          </div>

          <div className="hidden md:flex items-center gap-2 justify-end">
            {activePage === 'pads' && isEditMode && (
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 cursor-pointer whitespace-nowrap"
              >
                Done Editing
              </button>
            )}
            <PWAInstallButton />
          </div>
        </header>

        {/* 2. CONSOLE PAGE NAVIGATION (PAGE 1: PADS | PAGE 2: CONTROLS & FX | PAGE 3: BAR SYNC) */}
        <nav
          aria-label="Console Pages"
          className="flex flex-col lg:flex-row items-center justify-between gap-3"
        >
          <div
            role="tablist"
            aria-label="Console View Pages"
            className="console-recess relative grid grid-cols-3 p-1 rounded-xl w-full lg:w-auto lg:min-w-[490px]"
          >
            {(
              [
                { id: 'pads' as const, label: 'Page 1 · Pads', icon: Grid3X3 },
                { id: 'fx' as const, label: 'Page 2 · Controls & FX', icon: Sliders },
                { id: 'loops' as const, label: 'Page 3 · Bar Sync', icon: Repeat },
              ] as const
            ).map((tab) => {
              const isSelected = activePage === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setActivePage(tab.id);
                    if (tab.id !== 'pads') setIsEditMode(false);
                  }}
                  className={`relative z-10 py-2 px-2.5 sm:px-3.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="active-page-pill"
                      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                      className="absolute inset-0 rounded-lg border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="relative z-10 tracking-wide truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            {activePage === 'pads' && isEditMode ? (
              <span className="text-cyan-300 font-medium">
                Tap any pad to load sound, rename, or change LED color
              </span>
            ) : activePage === 'loops' ? (
              <span>Any audio length · Switches on Beat 1</span>
            ) : (
              <>
                <span>Keys 1–9, 0, -, =</span>
                <span aria-hidden="true">·</span>
                <span>Esc to Stop All</span>
              </>
            )}
          </div>
        </nav>

        {/* PAGE 1: BANK SWITCHER + PLUS BUTTON + 3x4 MPC-STYLE PAD GRID */}
        {activePage === 'pads' ? (
          <>
            <div className="flex items-center justify-between gap-3">
              {/* Glowing Bank Pill Switcher */}
              <div
                role="tablist"
                aria-label="Soundboard Banks"
                className="console-recess relative grid grid-cols-2 p-1 rounded-full flex-1 max-w-md"
              >
                {(
                  [
                    { id: 'A' as BankId, title: 'BANK A', sub: 'FX & Animals' },
                    { id: 'B' as BankId, title: 'BANK B', sub: 'Risers & Drops' },
                  ] as const
                ).map((bank) => {
                  const isSelected = settings.activeBank === bank.id;
                  return (
                    <button
                      key={bank.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => switchBank(bank.id)}
                      className={`relative z-10 py-2 px-3 sm:px-4 rounded-full text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="active-bank-pill"
                          transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                          className="absolute inset-0 rounded-full border"
                          style={{
                            background:
                              bank.id === 'A'
                                ? 'linear-gradient(180deg, rgba(6, 182, 212, 0.24) 0%, rgba(8, 145, 178, 0.14) 100%)'
                                : 'linear-gradient(180deg, rgba(245, 158, 11, 0.24) 0%, rgba(217, 119, 6, 0.14) 100%)',
                            borderColor:
                              bank.id === 'A'
                                ? 'rgba(34, 211, 238, 0.55)'
                                : 'rgba(251, 191, 36, 0.55)',
                          }}
                        />
                      )}
                      <span className="relative z-10 font-display font-semibold tracking-wider">
                        {bank.title}
                      </span>
                      <span className="relative z-10 text-slate-400/90 hidden sm:inline">
                        ·
                      </span>
                      <span className="relative z-10 font-medium text-[11px] opacity-90 hidden sm:inline">
                        {bank.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Plus Button: Creates a new box in the pad grid */}
              <button
                type="button"
                onClick={handleAddNewBox}
                title="Create a new pad box"
                aria-label="Create a new sound pad box"
                className="h-10 px-3.5 sm:px-4 rounded-full border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-[0_0_16px_rgba(6,182,212,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Plus className="w-4 h-4" />
                <span>Add Box</span>
              </button>
            </div>

            <section
              aria-label={`Bank ${settings.activeBank} Performance Pads`}
              className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-5"
            >
              {activePads.map((pad) => {
                const count = activePadCounts.get(pad.id) ?? 0;
                return (
                  <PadCard
                    key={pad.id}
                    pad={pad}
                    isPressed={Boolean(pressedPads[pad.id])}
                    isPlaying={count > 0}
                    activeCount={count}
                    isEditMode={isEditMode}
                    onPointerDown={handlePadPointerDown}
                    onPointerMove={handlePadPointerMove}
                    onPointerUp={handlePadPointerRelease}
                    onPointerCancel={handlePadPointerRelease}
                  />
                );
              })}
            </section>
          </>
        ) : activePage === 'fx' ? (
          /* PAGE 2: STOP ALL, EDIT/LOAD AUDIO, MASTER OUTPUT, STEREO VU, REVERB & PITCH/SPEED FX */
          <section
            aria-label="Console Controls, Stop All, Edit Audio, and FX"
            className="flex flex-col gap-5 py-1"
          >
            {/* Action Controls Row on Page 2: Edit / Load Audio & Glowing Crimson STOP ALL */}
            <div className="metallic-bezel rounded-2xl border border-white/[0.08] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold tracking-wide text-white">
                  Console Actions
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stop active sounds or edit any pad sample
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditMode(true);
                    setActivePage('pads');
                  }}
                  className="h-10 px-4 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-2 border bg-white/[0.05] border-white/15 text-slate-100 hover:bg-white/[0.1] hover:border-cyan-400/40 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Edit / Load Audio</span>
                </button>

                <button
                  type="button"
                  onClick={handleStopAll}
                  title="Stop all playing sounds immediately (Esc)"
                  className="h-10 px-5 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center gap-2 border border-rose-500/70 bg-gradient-to-b from-rose-500/90 to-red-700/90 text-white shadow-[0_0_24px_rgba(239,68,68,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] hover:from-rose-400 hover:to-red-600 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <OctagonX className="w-4 h-4" />
                  <span>STOP ALL</span>
                </button>
              </div>
            </div>

            {/* Master Volume Fader & Live Stereo VU Meter */}
            <div className="metallic-bezel rounded-2xl border border-white/[0.08] p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.3fr_auto] items-center gap-6">
              <StudioFader
                volume={settings.masterVolume}
                isMuted={settings.isMuted}
                onChangeVolume={(val) =>
                  setSettings((prev) => ({
                    ...prev,
                    masterVolume: val,
                    isMuted: false,
                  }))
                }
                onToggleMute={() =>
                  setSettings((prev) => ({ ...prev, isMuted: !prev.isMuted }))
                }
              />

              <StereoVuMeter />
            </div>

            {/* Live FX Rack: Reverb & Pitch/Speed */}
            <div className="metallic-bezel rounded-2xl border border-white/[0.08] p-5 sm:p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.07]">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-wide text-white">
                    Live FX Processors
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drag knobs vertically or scroll to adjust in real time · Double-click to reset
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      reverbMix: 0.18,
                      pitchRate: 1.0,
                    }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset FX</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-2">
                {/* Reverb Card */}
                <div className="console-recess rounded-xl p-5 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-sm font-semibold text-slate-100">
                      Studio Hall Reverb
                    </span>
                    <span className="text-xs text-slate-400">
                      Wet/dry convolution ambience
                    </span>
                    <span className="font-mono-tabular text-xs text-cyan-300 mt-1">
                      Mix: {Math.round(settings.reverbMix * 100)}%
                    </span>
                  </div>
                  <RotaryKnob
                    label="Reverb"
                    value={settings.reverbMix}
                    min={0}
                    max={1}
                    defaultValue={0.18}
                    accentColor="#06B6D4"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(val) =>
                      setSettings((prev) => ({ ...prev, reverbMix: val }))
                    }
                  />
                </div>

                {/* Pitch / Speed Card */}
                <div className="console-recess rounded-xl p-5 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-sm font-semibold text-slate-100">
                      Pitch & Speed
                    </span>
                    <span className="text-xs text-slate-400">
                      Real-time sample playback rate
                    </span>
                    <span className="font-mono-tabular text-xs text-amber-300 mt-1">
                      Rate: {settings.pitchRate.toFixed(2)}x
                    </span>
                  </div>
                  <RotaryKnob
                    label="Pitch / Speed"
                    value={settings.pitchRate}
                    min={0.5}
                    max={2.0}
                    defaultValue={1.0}
                    accentColor="#F59E0B"
                    bipolar
                    formatValue={(v) => `${v.toFixed(2)}x`}
                    onChange={(val) =>
                      setSettings((prev) => ({ ...prev, pitchRate: val }))
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* PAGE 3: BAR-SYNCED UNLIMITED-LENGTH LOOP LAUNCHER */
          <LoopPage
            loopPads={loopPads}
            bpm={loopBpm}
            onChangeBpm={setLoopBpm}
            onUploadLoopAudio={handleUploadLoopAudio}
            onUpdateLoopPadMeta={handleUpdateLoopPadMeta}
            onClearLoopPad={handleClearLoopPad}
            onLazyAnalyzedLoopPad={handleLazyAnalyzedLoopPad}
          />
        )}
      </main>

      {/* Edit / Load Audio Modal */}
      <PadEditorModal
        pad={editingPad}
        onClose={() => setEditingPadId(null)}
        onSaveMeta={handleSavePadMeta}
        onUploadAudio={handleUploadPadAudio}
        onResetPad={handleResetPad}
        onDeletePad={handleDeletePad}
        onAudition={handleAuditionPad}
      />

      <OfflineIndicator />
    </div>
  );
}
