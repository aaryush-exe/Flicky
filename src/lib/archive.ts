import { useSyncExternalStore } from 'react';
import { getHost, type WinRarInfo } from './host';
import { askChoice } from './notify';
import { queue } from './queue';

export async function detectWinRar(): Promise<WinRarInfo> {
  const h = getHost()?.winrar;
  if (!h) return { found: false };
  try {
    return await h.detect();
  } catch {
    return { found: false };
  }
}

export const WINRAR_URL = 'https://www.win-rar.com/download.html';

const secrets = new Map<string, string>();
export const setJobSecret = (id: string, pw?: string) => (pw ? secrets.set(id, pw) : secrets.delete(id));

export interface PasswordRequest {
  fileName: string;
  retry: boolean;
  resolve: (pw: string | null) => void;
}
let pwReq: PasswordRequest | null = null;
const pwListeners = new Set<() => void>();
export const askPassword = (fileName: string, retry: boolean) =>
  new Promise<string | null>((resolve) => {
    pwReq = {
      fileName,
      retry,
      resolve: (pw) => {
        pwReq = null;
        pwListeners.forEach((l) => l());
        resolve(pw);
      },
    };
    pwListeners.forEach((l) => l());
  });
export const usePasswordRequest = () =>
  useSyncExternalStore(
    (l) => {
      pwListeners.add(l);
      return () => pwListeners.delete(l);
    },
    () => pwReq,
  );

const pathOf = (f: File) => (f as any).path as string | undefined;

queue.registerRunner('compress', async (job, ctx) => {
  const w = getHost()?.winrar;
  if (!w) throw new Error('WinRAR is not available');
  const paths = job.files.map(pathOf);
  if (paths.some((p) => !p)) throw new Error('File paths are required to create archives');
  const [format, level] = job.target.split('|');
  const pw = secrets.get(job.id);
  secrets.delete(job.id);
  const r = await w.create({ paths: paths as string[], format, level, password: pw }, ctx.setProgress, ctx.signal);
  if (!r.ok) throw new Error(r.error || 'WinRAR could not create the archive');
  return [r.output || job.name];
});

queue.registerRunner('extract', async (job, ctx) => {
  const w = getHost()?.winrar;
  if (!w) throw new Error('WinRAR is not available');
  const path = pathOf(job.files[0]);
  if (!path) throw new Error('File path is required to extract archives');

  const dest = job.target.split('|')[1] || undefined;
  let existing: 'ask' | 'merge' | 'new' = 'ask';
  let password: string | undefined;
  let retry = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await w.extract({ path, existing, password, dest }, ctx.setProgress, ctx.signal);
    if (r.ok) return [job.name];
    if (r.error === 'password') {
      ctx.setWaiting(true);
      const pw = await askPassword(job.name, retry);
      ctx.setWaiting(false);
      if (pw === null) throw new DOMException('Cancelled', 'AbortError');
      password = pw;
      retry = true;
      continue;
    }
    if (r.error === 'exists') {
      ctx.setWaiting(true);
      const c = await askChoice({
        title: 'Destination folder already exists',
        body: job.name.replace(/\.[^.]+$/, ''),
        choices: [
          { id: 'merge', label: 'Merge' },
          { id: 'new', label: 'New folder' },
          { id: 'cancel', label: 'Cancel' },
        ],
        fallback: 'cancel',
        signal: ctx.signal,
      });
      ctx.setWaiting(false);
      if (c === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      existing = c;
      continue;
    }
    throw new Error(r.message || 'WinRAR could not extract the archive');
  }
  throw new Error('Extraction was not completed');
});

