const DB = 'flicky';
const STORE = 'jobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    t.onerror = () => reject(t.error);
  });
}

export const idbPut = (v: unknown) => tx('readwrite', (s) => s.put(v)).catch(() => undefined);
export const idbDelete = (id: string) => tx('readwrite', (s) => s.delete(id)).catch(() => undefined);
export const idbAll = <T>() => tx<T[]>('readonly', (s) => s.getAll() as IDBRequest<T[]>).catch(() => [] as T[]);
