import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { filesFromNativePaths } from './desktop';

export async function pickFiles(): Promise<File[]> {
  if (isTauri()) {
    const selected = await open({ multiple: true, directory: false, title: 'Choose files for Flicky' });
    if (!selected) return [];
    return filesFromNativePaths(Array.isArray(selected) ? selected : [selected]);
  }
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.multiple = true;
    i.onchange = () => resolve(Array.from(i.files || []));
    i.addEventListener('cancel', () => resolve([]));
    i.click();
  });
}

export async function clipboardFiles(): Promise<File[]> {
  try {
    if (!navigator.clipboard?.read) return [];
    const items = await navigator.clipboard.read();
    const out: File[] = [];
    for (const it of items) {
      const t = it.types.find((x) => x.startsWith('image/') || x.startsWith('audio/'));
      if (!t) continue;
      const b = await it.getType(t);
      const ext = t.split('/')[1].replace('jpeg', 'jpg').replace('mpeg', 'mp3');
      out.push(new File([b], `clipboard-${Date.now()}.${ext}`, { type: t }));
    }
    return out;
  } catch { return []; }
}
export const hasUserActivation = () => (navigator as any).userActivation?.isActive !== false;

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({ directory: true, multiple: false, title: 'Extract to…' });
  return typeof selected === 'string' ? selected : null;
}
