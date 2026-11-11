export interface WinRarInfo { found: boolean; path?: string; version?: string; }
export interface ArchiveReply { ok: boolean; entries: string[]; truncated: boolean; error?: 'password' | 'failed'; message?: string; }
export interface FlickyHost {
  winrar?: {
    detect(): Promise<WinRarInfo>;
    create(o: { paths: string[]; format: string; level: string; password?: string }, onProgress: (f: number) => void, signal: AbortSignal): Promise<{ ok: boolean; error?: string; output?: string }>;
    extract(o: { path: string; existing: 'ask' | 'merge' | 'new'; password?: string; dest?: string }, onProgress: (f: number) => void, signal: AbortSignal): Promise<{ ok: boolean; error?: 'password' | 'exists' | 'failed'; message?: string }>;
    list?(path: string, password?: string): Promise<ArchiveReply>;
    test?(path: string, password?: string): Promise<ArchiveReply>;
    open?(path: string): Promise<void>;
  };

  startup?: { set(enabled: boolean, minimized: boolean): Promise<void> };

  classicMenu?: { set(enabled: boolean): Promise<void> };
  explorerMenu?: { set(enabled: boolean): Promise<void> };
  engines?: { has(id: string): boolean; refresh?(): Promise<void>; install?(id: string): Promise<void>; convert?(path: string, target: string, engine: string, outputName: string, onProgress: (f: number) => void, signal: AbortSignal): Promise<string>; };
  shortcut?: { register(s: string): Promise<{ ok: boolean; reason?: string }>; };
  output?: { exists(name: string): Promise<boolean>; write(name: string, bytes: Uint8Array): Promise<string>; };
}
declare global { interface Window { flicky?: FlickyHost; } }
export const getHost = (): FlickyHost | undefined => typeof window === 'undefined' ? undefined : window.flicky;
export const hasHost = () => !!getHost();
