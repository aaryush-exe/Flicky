import { getHost } from './host';

let dir: any = null;
const session = new Set<string>();
export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const folderName = () => (dir ? (dir.name as string) : (getHost() ? 'Downloads\\Flicky' : null));

export async function chooseFolder(): Promise<string | null> {
  if (getHost()) return 'Downloads\\Flicky';
  try { dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' }); session.clear(); return dir.name; }
  catch { return null; }
}
export function clearFolder() { dir = null; session.clear(); }
async function exists(name: string): Promise<boolean> {
  const host = getHost()?.output;
  if (host) return host.exists(name);
  if (dir) {
    try { await dir.getFileHandle(name); return true; }
    catch (e: any) { if (e?.name === 'NotFoundError') return false; throw e; }
  }
  return session.has(name.toLowerCase());
}
async function uniqueName(name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 1000; i++) { const c = `${base} (${i})${ext}`; if (!(await exists(c))) return c; }
  return `${base} (${Date.now()})${ext}`;
}
async function write(name: string, blob: Blob): Promise<void> {
  const host = getHost()?.output;
  if (host) {
    await host.write(name, new Uint8Array(await blob.arrayBuffer()));
    return;
  }
  if (dir) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob); await w.close(); return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  session.add(name.toLowerCase());
}
export const sink = { exists, uniqueName, write };
