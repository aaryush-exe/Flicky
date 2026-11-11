import { useSyncExternalStore } from 'react';
import { askChoice } from './notify';
import { baseName, engineForFormat, getFormat } from './formats';
import { getSettings, logError } from './settings';
import { idbAll, idbDelete, idbPut } from './idb';
import { sink } from './sink';
import { getHost } from './host';

export type JobKind = 'convert' | 'combine' | 'compress' | 'extract';
export type JobStatus = 'queued' | 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  batchId: string;
  kind: JobKind;
  files: File[];
  target: string;
  label: string;
  name: string;
  status: JobStatus;
  progress: number | null;
  error?: string;
  note?: string;
  outputs: string[];
  createdAt: number;
}
export interface Skip {
  name: string;
  reason: string;
}
export interface Entry {
  kind: JobKind;
  files: File[];
  target: string;
  label: string;
  name: string;
}
export interface Summary {
  batchId: string;
  completed: number;
  failed: { name: string; reason: string }[];
  cancelled: number;
  skipped: Skip[];
  outputs: string[];
}
export interface RunCtx {
  job: Job;
  signal: AbortSignal;
  setProgress: (f: number | null) => void;
  setWaiting: (w: boolean) => void;
}
export type Runner = (job: Job, ctx: RunCtx) => Promise<string[]>;

const TERMINAL: JobStatus[] = ['completed', 'failed', 'cancelled'];
const isTerminal = (s: JobStatus) => TERMINAL.includes(s);
let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function autoConcurrency(): number {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory as number | undefined;
  let n = Math.max(1, Math.min(4, Math.floor(cores / 2)));
  if (mem && mem <= 4) n = Math.min(n, 2);
  return n;
}

class Queue {
  jobs: Job[] = [];
  paused = false;
  private listeners = new Set<() => void>();
  private ctrls = new Map<string, AbortController>();
  private running = new Set<string>();
  private runners = new Map<JobKind, Runner>();
  private batches = new Map<string, { skipped: Skip[]; reported: boolean }>();
  private idleWaiters: (() => void)[] = [];
  onFailure?: (job: Job) => void;
  onBatchFinished?: (s: Summary) => void;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getJobs = () => this.jobs;
  private set(jobs: Job[]) {
    this.jobs = jobs;
    this.listeners.forEach((l) => l());
  }
  private patch(id: string, p: Partial<Job>) {
    this.set(this.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }
  registerRunner(kind: JobKind, r: Runner) {
    this.runners.set(kind, r);
  }

  activeCount = () => this.jobs.filter((j) => !isTerminal(j.status)).length;
  concurrency = () => {
    const c = getSettings().concurrency;
    return c > 0 ? c : autoConcurrency();
  };

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.pump();
  }

  addBatch(entries: Entry[], skipped: Skip[], persist = true): string {
    const batchId = uid();
    this.batches.set(batchId, { skipped, reported: false });
    const jobs: Job[] = entries.map((e) => ({
      id: uid(),
      batchId,
      kind: e.kind,
      files: e.files,
      target: e.target,
      label: e.label,
      name: e.name,
      status: 'queued',
      progress: null,
      outputs: [],
      createdAt: Date.now(),
    }));
    if (persist) {
      jobs.forEach((j) => {
        if (j.kind === 'convert' || j.kind === 'combine') {
          idbPut({ id: j.id, batchId, kind: j.kind, target: j.target, label: j.label, name: j.name, files: j.files, createdAt: j.createdAt });
        }
      });
    }
    this.set([...this.jobs, ...jobs]);
    if (jobs.length === 0) this.checkBatch(batchId);
    this.pump();
    return batchId;
  }

  async recover(): Promise<string[]> {
    const rows = await idbAll<any>();
    if (!rows.length) return [];
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const batchId = uid();
    this.batches.set(batchId, { skipped: [], reported: false });
    const jobs: Job[] = rows.map((r) => ({
      id: r.id,
      batchId,
      kind: r.kind,
      files: r.files,
      target: r.target,
      label: r.label,
      name: r.name,
      status: 'queued',
      progress: null,
      outputs: [],
      createdAt: r.createdAt,
    }));
    this.set([...this.jobs, ...jobs]);
    this.pump();
    return jobs.map((j) => j.name);
  }

  private pump() {
    if (this.paused) return;
    while (this.running.size < this.concurrency()) {
      const next = this.jobs.find((j) => j.status === 'queued' && !this.running.has(j.id));
      if (!next) break;
      this.start(next);
    }
  }

  private async start(job: Job) {
    const runner = this.runners.get(job.kind);
    const ctrl = new AbortController();
    this.ctrls.set(job.id, ctrl);
    this.running.add(job.id);
    this.patch(job.id, { status: 'processing', progress: null });
    try {
      if (!runner) throw new Error('No runner available for this operation');
      const outputs = await runner(job, {
        job,
        signal: ctrl.signal,
        setProgress: (f) => {
          const cur = this.jobs.find((j) => j.id === job.id);
          if (cur && cur.status !== 'cancelled') this.patch(job.id, { progress: f === null ? null : Math.max(0, Math.min(1, f)) });
        },
        setWaiting: (w) => this.patch(job.id, { status: w ? 'waiting' : 'processing' }),
      });
      const cur = this.jobs.find((j) => j.id === job.id);
      if (cur?.status === 'cancelled') {

      } else if (outputs.length === 0) {
        this.patch(job.id, { status: 'cancelled', note: 'Skipped — file already exists' });
      } else {
        this.patch(job.id, { status: 'completed', progress: 1, outputs });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || ctrl.signal.aborted) {
        this.patch(job.id, { status: 'cancelled', note: 'Cancelled' });
      } else {
        const reason = String(e?.message || e || 'Unknown error').slice(0, 200);
        this.patch(job.id, { status: 'failed', error: reason });
        logError(job.name, reason);
        this.onFailure?.({ ...job, status: 'failed', error: reason });
      }
    } finally {
      this.running.delete(job.id);
      this.ctrls.delete(job.id);
      idbDelete(job.id);
      this.checkBatch(job.batchId);
      this.pump();
      if (this.activeCount() === 0) {
        this.idleWaiters.forEach((w) => w());
        this.idleWaiters = [];
      }
    }
  }

  private checkBatch(batchId: string) {
    const b = this.batches.get(batchId);
    if (!b || b.reported) return;
    const js = this.jobs.filter((j) => j.batchId === batchId);
    if (!js.every((j) => isTerminal(j.status))) return;
    b.reported = true;
    this.onBatchFinished?.({
      batchId,
      completed: js.filter((j) => j.status === 'completed').length,
      failed: js.filter((j) => j.status === 'failed').map((j) => ({ name: j.name, reason: j.error || 'Failed' })),
      cancelled: js.filter((j) => j.status === 'cancelled').length,
      skipped: b.skipped.concat(js.filter((j) => j.status === 'cancelled' && j.note?.startsWith('Skipped')).map((j) => ({ name: j.name, reason: 'File already exists' }))),
      outputs: js.flatMap((j) => j.outputs),
    });
  }

  cancel(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j || isTerminal(j.status)) return;
    if (j.status === 'queued') {
      this.patch(id, { status: 'cancelled', note: 'Cancelled' });
      idbDelete(id);
      this.checkBatch(j.batchId);
      if (this.activeCount() === 0) {
        this.idleWaiters.forEach((w) => w());
        this.idleWaiters = [];
      }
    } else {
      this.ctrls.get(id)?.abort();
    }
  }
  cancelAll() {
    this.jobs.filter((j) => !isTerminal(j.status)).forEach((j) => this.cancel(j.id));
  }
  retry(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j || j.status !== 'failed') return;
    const b = this.batches.get(j.batchId);
    if (b) b.reported = false;
    this.patch(id, { status: 'queued', progress: null, error: undefined });
    if (j.kind === 'convert' || j.kind === 'combine') {
      idbPut({ id: j.id, batchId: j.batchId, kind: j.kind, target: j.target, label: j.label, name: j.name, files: j.files, createdAt: j.createdAt });
    }
    this.pump();
  }
  dismiss(id: string) {
    this.set(this.jobs.filter((j) => j.id !== id));
  }
  pruneFinished() {
    this.set(this.jobs.filter((j) => !(j.status === 'completed' || j.status === 'cancelled')));
  }
  whenIdle(): Promise<void> {
    if (this.activeCount() === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }
}

export const queue = new Queue();
export const useJobs = () => useSyncExternalStore(queue.subscribe, queue.getJobs);

async function resolveName(name: string, ctx: RunCtx): Promise<string | null> {
  if (!(await sink.exists(name))) return name;
  ctx.setWaiting(true);
  const choice = await askChoice({
    title: 'File already exists',
    body: name,
    choices: [
      { id: 'replace', label: 'Replace' },
      { id: 'rename', label: 'Rename' },
      { id: 'skip', label: 'Skip' },
    ],
    fallback: 'skip',
    signal: ctx.signal,
  });
  if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  ctx.setWaiting(false);
  if (choice === 'skip') return null;
  if (choice === 'rename') return sink.uniqueName(name);
  return name;
}

queue.registerRunner('convert', async (job, ctx) => {
  const fmt = getFormat(job.target);
  const eng = fmt && engineForFormat(fmt.id);
  if (!fmt || !eng) throw new Error('Unknown output format');
  if (!eng.available()) throw new Error(`${eng.name} is not installed`);
  const sourcePath = (job.files[0] as any).path as string | undefined;
  if (!eng.convert && sourcePath && getHost()?.engines?.convert) {
    const name = await resolveName(`${baseName(job.files[0].name)}.${fmt.ext}`, ctx);
    if (!name) return [];
    ctx.setProgress(0.02);
    const output = await getHost()!.engines!.convert!(sourcePath, fmt.ext, eng.id, name, ctx.setProgress, ctx.signal);
    return [output];
  }
  if (!eng.convert) throw new Error(`${eng.name} is not available in this build`);
  const blob = await eng.convert(job.files[0], fmt, { settings: getSettings(), signal: ctx.signal, onProgress: ctx.setProgress });
  const name = await resolveName(`${baseName(job.files[0].name)}.${fmt.ext}`, ctx);
  if (!name) return [];
  await sink.write(name, blob);
  return [name];
});

queue.registerRunner('combine', async (job, ctx) => {
  const fmt = getFormat(job.target);
  const eng = fmt && engineForFormat(fmt.id);
  if (!fmt || !eng?.combine) throw new Error('This engine cannot combine files');
  const blob = await eng.combine(job.files, fmt, { settings: getSettings(), signal: ctx.signal, onProgress: ctx.setProgress });
  const name = await resolveName(`${baseName(job.files[0].name)}_combined.${fmt.ext}`, ctx);
  if (!name) return [];
  await sink.write(name, blob);
  return [name];
});
