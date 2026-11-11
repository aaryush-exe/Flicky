import { invoke, isTauri } from '@tauri-apps/api/core';

export interface OrbitOpen {
  paths: string[];

  x: number;
  y: number;

  hint?: string | null;
}

export type RunRequest =
  | { action: 'convert'; paths: string[]; format: string }
  | { action: 'combine'; paths: string[] }
  | { action: 'compress'; paths: string[] }
  | { action: 'compress-options'; paths: string[] }
  | { action: 'extract' | 'extract-to' | 'test' | 'view' | 'winrar'; paths: string[] }
  | { action: 'settings' };

export interface OverlayStatus {
  phase: 'working' | 'done' | 'error';
  text: string;
  progress?: number | null;
}

export const OVERLAY_OPEN_EVENT = 'flicky-overlay-open';
export const OVERLAY_STATUS_EVENT = 'flicky-status';
export const RUN_EVENT = 'flicky-run';

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    console.warn('Flicky overlay call failed', e);
    return fallback;
  }
};

export const quickOrbit = () => (isTauri() ? safe(invoke<boolean>('quick_orbit'), false) : Promise.resolve(false));
export const setHotkeyPaused = (paused: boolean) => (isTauri() ? safe(invoke<void>('set_hotkey_paused', { paused }), undefined) : Promise.resolve());
export const showMainWindow = () => (isTauri() ? safe(invoke<void>('show_main_window'), undefined) : Promise.resolve());

export const overlayHide = () => safe(invoke<void>('overlay_hide'), undefined);
export const overlayDispatch = (request: RunRequest) => safe(invoke<void>('overlay_dispatch', { request }), undefined);
export const overlayTakePending = () => safe(invoke<OrbitOpen | null>('overlay_take_pending'), null);

export const overlayStatus = (status: OverlayStatus) =>
  isTauri() ? safe(invoke<boolean>('overlay_status', { status }), false) : Promise.resolve(false);

export const nameOfPath = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;

export function lightFile(path: string): File {
  const f = new File([], nameOfPath(path));
  Object.defineProperty(f, 'path', { value: path, configurable: false });
  return f;
}
