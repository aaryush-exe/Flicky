import { useSyncExternalStore } from 'react';

export interface NoteAction {
  label: string;
  run?: () => void;
}
export interface Note {
  id: string;
  title: string;
  body?: string;
  tone?: 'default' | 'success' | 'error' | 'info';
  actions?: NoteAction[];
  persistent?: boolean;
  duration?: number;
  onDismiss?: () => void;
}

let notes: Note[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;

export function notify(n: Omit<Note, 'id'> & { id?: string }): string {
  const id = n.id ?? `n${++seq}`;
  const note: Note = { ...n, id };
  notes = [note, ...notes.filter((x) => x.id !== id)].slice(0, 6);
  const t = timers.get(id);
  if (t) clearTimeout(t);
  if (!note.persistent) {
    timers.set(
      id,
      window.setTimeout(() => removeNote(id), note.duration ?? 5000),
    );
  }
  emit();
  return id;
}

function removeNote(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  notes = notes.filter((n) => n.id !== id);
  emit();
}

export function dismissNote(id: string) {
  const n = notes.find((x) => x.id === id);
  removeNote(id);
  n?.onDismiss?.();
}

export function runNoteAction(id: string, a: NoteAction) {
  removeNote(id);
  a.run?.();
}

export function closeNote(id: string) {
  removeNote(id);
}

export function askChoice<T extends string>(o: {
  title: string;
  body?: string;
  choices: { id: T; label: string }[];
  fallback: T;
  signal?: AbortSignal;
}): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: T) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const id = notify({
      title: o.title,
      body: o.body,
      persistent: true,
      tone: 'info',
      actions: o.choices.map((c) => ({ label: c.label, run: () => finish(c.id) })),
      onDismiss: () => finish(o.fallback),
    });
    o.signal?.addEventListener('abort', () => {
      removeNote(id);
      finish(o.fallback);
    });
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useNotes = () => useSyncExternalStore(subscribe, () => notes);
