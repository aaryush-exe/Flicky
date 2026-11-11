import { useSyncExternalStore } from 'react';

export interface Settings {
  setupDone: boolean;

  startWithWindows: boolean;
  startMinimized: boolean;
  explorerMenu: boolean;
  classicMenu: boolean;

  launcherEnabled: boolean;

  shortcut: string;

  imageQuality: number;
  imageMaxDim: number;

  audioSampleRate: number;
  audioChannels: number;
  audioBitrate: number;

  videoResolution: string;
  videoCodec: string;
  videoBitrate: number;
  videoQuality: string;

  docPageSize: 'fit' | 'a4' | 'letter';
  docOrientation: 'auto' | 'portrait' | 'landscape';
  docMarginMm: number;

  archiveFormat: 'zip' | 'rar' | '7z';
  archiveLevel: 'store' | 'fast' | 'normal' | 'good' | 'best';

  engineAutoUpdate: boolean;

  concurrency: number;

  glow: number;
  uiScale: number;
  reduceMotion: boolean;
}

export const DEFAULT_SHORTCUT = 'Ctrl+Shift+Space';

export const DEFAULTS: Settings = {
  setupDone: false,
  startWithWindows: true,
  startMinimized: true,
  explorerMenu: true,
  classicMenu: false,
  launcherEnabled: false,
  shortcut: DEFAULT_SHORTCUT,
  imageQuality: 90,
  imageMaxDim: 0,
  audioSampleRate: 0,
  audioChannels: 0,
  audioBitrate: 192,
  videoResolution: 'source',
  videoCodec: 'h264',
  videoBitrate: 0,
  videoQuality: 'balanced',
  docPageSize: 'fit',
  docOrientation: 'auto',
  docMarginMm: 0,
  archiveFormat: 'zip',
  archiveLevel: 'normal',
  engineAutoUpdate: true,
  concurrency: 0,
  glow: 60,
  uiScale: 1,
  reduceMotion: false,
};

const KEY = 'flicky.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = { ...DEFAULTS, ...JSON.parse(raw) };

      if (saved.shortcut === 'Alt+C') saved.shortcut = DEFAULT_SHORTCUT;
      return saved;
    }
  } catch {

  }
  return { ...DEFAULTS };
}

let state: Settings = load();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    listeners.forEach((l) => l());
  });
}

export const getSettings = () => state;

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {

  }
  listeners.forEach((l) => l());
}

export function resetSettings() {
  state = { ...DEFAULTS, setupDone: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {

  }
  listeners.forEach((l) => l());
}

export const useSettings = () => useSyncExternalStore(subscribe, getSettings);

export interface ErrorEntry {
  t: number;
  file: string;
  reason: string;
}
const ERR_KEY = 'flicky.errors.v1';
let errors: ErrorEntry[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
  } catch {
    return [];
  }
})();
const errListeners = new Set<() => void>();
export const getErrors = () => errors;
export function logError(file: string, reason: string) {
  errors = [{ t: Date.now(), file, reason }, ...errors].slice(0, 50);
  try {
    localStorage.setItem(ERR_KEY, JSON.stringify(errors));
  } catch {

  }
  errListeners.forEach((l) => l());
}
export function clearErrors() {
  errors = [];
  try {
    localStorage.removeItem(ERR_KEY);
  } catch {

  }
  errListeners.forEach((l) => l());
}
export const useErrors = () =>
  useSyncExternalStore(
    (l) => {
      errListeners.add(l);
      return () => errListeners.delete(l);
    },
    getErrors,
  );
