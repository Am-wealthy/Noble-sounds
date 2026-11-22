import { createDefaultPads, DEFAULT_SETTINGS } from '../data/defaultPads';
import { ConsoleSettings, LoopPadConfig, PadConfig } from '../types/console';

const PADS_STORAGE_KEY = 'live_fx_console_pads_v2';
const LOOP_PADS_STORAGE_KEY = 'live_fx_console_loop_pads_v1';
const LOOP_BPM_STORAGE_KEY = 'live_fx_console_loop_bpm_v1';
const SETTINGS_STORAGE_KEY = 'live_fx_console_settings_v1';
const IDB_NAME = 'live_fx_console_db';
const IDB_VERSION = 2;
const AUDIO_STORE = 'custom_audio';
const META_STORE = 'console_meta';

export interface StoredAudioRecord {
  padId: string;
  fileName: string;
  mimeType: string;
  blob?: Blob;
  data?: ArrayBuffer;
  sizeBytes?: number;
  updatedAt: number;
}

export interface StoredAudioMeta {
  padId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'padId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist();
    }
  } catch {
    // Ignore if unsupported
  }
}

export async function readRecordArrayBuffer(
  record: StoredAudioRecord
): Promise<ArrayBuffer> {
  if (record.blob) {
    return record.blob.arrayBuffer();
  }
  if (record.data) {
    return record.data.slice(0);
  }
  throw new Error('Stored audio record contains no binary data.');
}

export async function saveCustomAudioFile(
  padId: string,
  file: Blob,
  fileName: string,
  mimeType: string
): Promise<void> {
  const db = await openDatabase();
  const record: StoredAudioRecord = {
    padId,
    fileName,
    mimeType: mimeType || 'audio/mpeg',
    blob: file,
    sizeBytes: file.size,
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE);
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to save custom audio to IndexedDB.'));
    };
  });
}

export async function saveCustomAudio(record: StoredAudioRecord): Promise<void> {
  const blob =
    record.blob ??
    (record.data
      ? new Blob([record.data], { type: record.mimeType || 'audio/mpeg' })
      : undefined);
  const normalized: StoredAudioRecord = {
    padId: record.padId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    blob,
    sizeBytes: blob?.size ?? record.sizeBytes ?? 0,
    updatedAt: record.updatedAt,
  };

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE);
    store.put(normalized);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to save custom audio.'));
    };
  });
}

export async function loadCustomAudioRecord(
  padId: string
): Promise<StoredAudioRecord | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const store = tx.objectStore(AUDIO_STORE);
      const request = store.get(padId);
      request.onsuccess = () => {
        db.close();
        resolve((request.result as StoredAudioRecord | undefined) ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error ?? new Error('Failed to read custom audio record.'));
      };
    });
  } catch {
    return null;
  }
}

export async function listStoredAudioMeta(): Promise<StoredAudioMeta[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const store = tx.objectStore(AUDIO_STORE);
      const results: StoredAudioMeta[] = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          db.close();
          resolve(results);
          return;
        }
        const val = cursor.value as StoredAudioRecord;
        results.push({
          padId: val.padId,
          fileName: val.fileName,
          mimeType: val.mimeType,
          sizeBytes: val.sizeBytes ?? val.blob?.size ?? val.data?.byteLength ?? 0,
          updatedAt: val.updatedAt,
        });
        cursor.continue();
      };
      cursorReq.onerror = () => {
        db.close();
        reject(cursorReq.error ?? new Error('Failed to list custom audio metadata.'));
      };
    });
  } catch {
    return [];
  }
}

export async function deleteCustomAudio(padId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE);
    store.delete(padId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to delete custom audio.'));
    };
  });
}

export async function loadAllCustomAudio(): Promise<StoredAudioRecord[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const store = tx.objectStore(AUDIO_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        db.close();
        resolve((request.result as StoredAudioRecord[]) ?? []);
      };
      request.onerror = () => {
        db.close();
        reject(request.error ?? new Error('Failed to load custom audio.'));
      };
    });
  } catch {
    return [];
  }
}

async function saveMetaToIndexedDB(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put({ key, value });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to save metadata to IndexedDB.'));
      };
    });
  } catch {
    // Fallback gracefully
  }
}

async function loadMetaFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        const row = req.result as { key: string; value: T } | undefined;
        resolve(row ? row.value : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to read metadata from IndexedDB.'));
      };
    });
  } catch {
    return null;
  }
}

function normalizePadConfigs(parsed: Partial<PadConfig>[]): PadConfig[] {
  const defaults = createDefaultPads();
  const byId = new Map(parsed.map((item) => [item.id, item]));
  const mergedDefaults = defaults.map((def) => {
    const saved = byId.get(def.id);
    if (!saved) return def;
    return {
      ...def,
      name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : def.name,
      color: typeof saved.color === 'string' ? saved.color : def.color,
      mode: saved.mode === 'hold' || saved.mode === 'oneshot' ? saved.mode : def.mode,
      customFileName:
        typeof saved.customFileName === 'string' ? saved.customFileName : null,
      isEmpty: false,
    };
  });

  const defaultIds = new Set(defaults.map((d) => d.id));
  const customSlots: PadConfig[] = parsed
    .filter((item) => item.id && !defaultIds.has(item.id) && item.isCustomSlot)
    .map((item, idx) => ({
      id: item.id!,
      bank: item.bank === 'B' ? 'B' : 'A',
      index: typeof item.index === 'number' ? item.index : 12 + idx,
      shortcut: typeof item.shortcut === 'string' ? item.shortcut : `+${idx + 1}`,
      name:
        typeof item.name === 'string' && item.name.trim() ? item.name : 'Add Sound',
      defaultName: 'Custom Sound',
      color: typeof item.color === 'string' ? item.color : '#06B6D4',
      defaultColor: '#06B6D4',
      mode: item.mode === 'hold' ? 'hold' : 'oneshot',
      presetKey: 'custom',
      customFileName:
        typeof item.customFileName === 'string' ? item.customFileName : null,
      isCustomSlot: true,
      isEmpty: typeof item.isEmpty === 'boolean' ? item.isEmpty : !item.customFileName,
    }));

  return [...mergedDefaults, ...customSlots];
}

export function loadPadConfigs(): PadConfig[] {
  const defaults = createDefaultPads();
  try {
    const raw = localStorage.getItem(PADS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PadConfig>[];
    if (!Array.isArray(parsed)) return defaults;
    return normalizePadConfigs(parsed);
  } catch {
    return defaults;
  }
}

export async function loadPadConfigsFromIndexedDB(): Promise<PadConfig[] | null> {
  const saved = await loadMetaFromIndexedDB<Partial<PadConfig>[]>(PADS_STORAGE_KEY);
  if (!Array.isArray(saved)) return null;
  return normalizePadConfigs(saved);
}

export function savePadConfigs(pads: PadConfig[]): void {
  const serializable = pads.map((p) => ({
    id: p.id,
    bank: p.bank,
    index: p.index,
    shortcut: p.shortcut,
    name: p.name,
    color: p.color,
    mode: p.mode,
    customFileName: p.customFileName ?? null,
    isCustomSlot: Boolean(p.isCustomSlot),
    isEmpty: Boolean(p.isEmpty),
  }));
  void saveMetaToIndexedDB(PADS_STORAGE_KEY, serializable);
  try {
    localStorage.setItem(PADS_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // IndexedDB remains authoritative if localStorage quota is exceeded
  }
}

export function loadConsoleSettings(): ConsoleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ConsoleSettings>;
    return {
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? Math.min(1, Math.max(0, parsed.masterVolume))
          : DEFAULT_SETTINGS.masterVolume,
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : DEFAULT_SETTINGS.isMuted,
      reverbMix:
        typeof parsed.reverbMix === 'number'
          ? Math.min(1, Math.max(0, parsed.reverbMix))
          : DEFAULT_SETTINGS.reverbMix,
      pitchRate:
        typeof parsed.pitchRate === 'number'
          ? Math.min(2, Math.max(0.5, parsed.pitchRate))
          : DEFAULT_SETTINGS.pitchRate,
      activeBank: parsed.activeBank === 'B' ? 'B' : 'A',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveConsoleSettings(settings: ConsoleSettings): void {
  void saveMetaToIndexedDB(SETTINGS_STORAGE_KEY, settings);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

const DEFAULT_LOOP_SPECS: Array<{ label: string; color: string }> = [
  { label: 'Intro', color: '#06B6D4' },
  { label: 'Verse', color: '#3B82F6' },
  { label: 'Chorus', color: '#F59E0B' },
  { label: 'Bridge', color: '#8B5CF6' },
  { label: 'Pre-Chorus', color: '#10B981' },
  { label: 'Build', color: '#F97316' },
  { label: 'Drop', color: '#EF4444' },
  { label: 'Outro', color: '#EC4899' },
  { label: 'Interlude', color: '#2DD4BF' },
  { label: 'Solo', color: '#E2E8F0' },
  { label: 'Vamp', color: '#06B6D4' },
  { label: 'Tag', color: '#F59E0B' },
];

export function createDefaultLoopPads(): LoopPadConfig[] {
  return DEFAULT_LOOP_SPECS.map((spec, idx) => ({
    id: `loop-${idx}`,
    index: idx,
    label: spec.label,
    defaultLabel: spec.label,
    color: spec.color,
    fileName: null,
  }));
}

function normalizeLoopPads(parsed: Partial<LoopPadConfig>[]): LoopPadConfig[] {
  const defaults = createDefaultLoopPads();
  const byId = new Map(parsed.map((item) => [item.id, item]));
  return defaults.map((def) => {
    const saved = byId.get(def.id);
    if (!saved) return def;
    return {
      ...def,
      label:
        typeof saved.label === 'string' && saved.label.trim()
          ? saved.label
          : def.label,
      color: typeof saved.color === 'string' ? saved.color : def.color,
      fileName: typeof saved.fileName === 'string' ? saved.fileName : null,
      sourceBpm:
        typeof saved.sourceBpm === 'number' &&
        Number.isFinite(saved.sourceBpm) &&
        saved.sourceBpm >= 40 &&
        saved.sourceBpm <= 240
          ? Math.round(saved.sourceBpm)
          : undefined,
    };
  });
}

export function loadLoopPads(): LoopPadConfig[] {
  const defaults = createDefaultLoopPads();
  try {
    const raw = localStorage.getItem(LOOP_PADS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LoopPadConfig>[];
    if (!Array.isArray(parsed)) return defaults;
    return normalizeLoopPads(parsed);
  } catch {
    return defaults;
  }
}

export async function loadLoopPadsFromIndexedDB(): Promise<LoopPadConfig[] | null> {
  const saved = await loadMetaFromIndexedDB<Partial<LoopPadConfig>[]>(
    LOOP_PADS_STORAGE_KEY
  );
  if (!Array.isArray(saved)) return null;
  return normalizeLoopPads(saved);
}

export function saveLoopPads(pads: LoopPadConfig[]): void {
  const serializable = pads.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    fileName: p.fileName ?? null,
    sourceBpm: p.sourceBpm ?? null,
  }));
  void saveMetaToIndexedDB(LOOP_PADS_STORAGE_KEY, serializable);
  try {
    localStorage.setItem(LOOP_PADS_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // IndexedDB remains authoritative
  }
}

export function loadLoopBpm(): number {
  try {
    const raw = localStorage.getItem(LOOP_BPM_STORAGE_KEY);
    if (!raw) return 120;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 40 && n <= 240) return Math.round(n);
    return 120;
  } catch {
    return 120;
  }
}

export function saveLoopBpm(bpm: number): void {
  const rounded = Math.round(bpm);
  void saveMetaToIndexedDB(LOOP_BPM_STORAGE_KEY, rounded);
  try {
    localStorage.setItem(LOOP_BPM_STORAGE_KEY, String(rounded));
  } catch {
    // Ignore
  }
}
