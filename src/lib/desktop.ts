import { invoke, isTauri } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import type { ArchiveReply, FlickyHost, WinRarInfo } from './host';
import { notify } from './notify';

export async function installDesktopBridge() {
  if (!isTauri()) return;
  let engineAvailability = { ffmpeg: false, documents: false, winrar: false, winget: false };
  try { engineAvailability = await invoke<typeof engineAvailability>('engine_status'); } catch {  }
  const host: FlickyHost = {
    winrar: {
      detect: () => invoke<WinRarInfo>('winrar_detect'),
      create: async (o, onProgress, signal) => {
        if (signal.aborted) return { ok: false, error: 'Cancelled' };
        onProgress(0.08);
        try {
          const output = await invoke<string>('winrar_create', {
            paths: o.paths, format: o.format, level: o.level, password: o.password ?? null,
          });
          onProgress(1);
          return { ok: true, output };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      list: (path, password) => invoke<ArchiveReply>('archive_list', { path, password: password ?? null }),
      test: (path, password) => invoke<ArchiveReply>('archive_test', { path, password: password ?? null }),
      open: (path) => invoke<void>('archive_open', { path }),
      extract: async (o, onProgress, signal) => {
        if (signal.aborted) return { ok: false, error: 'failed', message: 'Cancelled' as string };
        onProgress(0.08);
        try {
          const result = await invoke<{ ok: boolean; error?: 'password' | 'exists' | 'failed'; message?: string }>('winrar_extract', {
            path: o.path, existing: o.existing, password: o.password ?? null, dest: o.dest ?? null,
          });
          onProgress(1);
          return result;
        } catch (error) {
          return { ok: false, error: 'failed', message: String(error) };
        }
      },
    },
    startup: {
      set: (enabled, minimized) => invoke<void>('startup_set', { enabled, minimized }),
    },
    classicMenu: {
      set: (enabled) => invoke<void>('classic_menu_set', { enabled }),
    },
    explorerMenu: {
      set: (enabled) => invoke<void>('explorer_menu_set', { enabled }),
    },
    engines: {
      has: (id) => id === 'ffmpeg' ? engineAvailability.ffmpeg : id === 'documents' ? engineAvailability.documents : id === 'winrar' ? engineAvailability.winrar : false,
      refresh: async () => {
        try { engineAvailability = await invoke<typeof engineAvailability>('engine_status'); } catch {  }
      },
      install: async (id) => {
        await invoke<string>('engine_install', { id });
        engineAvailability = await invoke<typeof engineAvailability>('engine_status');
        window.dispatchEvent(new CustomEvent('flicky-engines-updated'));
      },
      convert: async (path, target, engine, outputName, onProgress, signal) => {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        onProgress(0.05);
        const output = await invoke<string>('engine_convert', { path, target, engine, outputName });
        onProgress(1);
        return output;
      },
    },
    shortcut: {
      register: async (shortcut) => {
        try {

          await invoke<void>('set_global_shortcut', { shortcut });
          return { ok: true };
        } catch (error) {
          return { ok: false, reason: String(error) };
        }
      },
    },
    output: {
      exists: (name) => invoke<boolean>('output_exists', { name }),
      write: (name, bytes) => invoke<string>('output_write', bytes, { headers: { 'x-name': encodeURIComponent(name) } }),
    },
  };
  window.flicky = host;
}

const MAX_INLINE_BYTES = 64 * 1024 * 1024;

export async function filesFromNativePaths(paths: string[]): Promise<File[]> {
  const files: File[] = [];
  for (const path of paths) {
    try {
      const name = await basename(path);
      const size = await invoke<number>('input_size', { path });
      let file: File;
      if (size > MAX_INLINE_BYTES) {
        file = new File([], name, { lastModified: Date.now() });
        Object.defineProperty(file, 'size', { value: size });
      } else {
        const buffer = await invoke<ArrayBuffer>('read_input', { path });
        file = new File([buffer], name, { lastModified: Date.now() });
      }
      Object.defineProperty(file, 'path', { value: path, configurable: false });
      files.push(file);
    } catch (error) {
      console.error('Flicky could not read dropped file:', path, error);
      notify({ title: 'Could not open file', body: `${path}\n${String((error as any)?.message || error)}`, tone: 'error' });
    }
  }
  return files;
}
