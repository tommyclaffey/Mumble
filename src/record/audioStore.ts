/**
 * Recordings, kept in this browser.
 *
 * IndexedDB, not localStorage: localStorage holds ~5 MB of STRINGS, and one
 * minute of audio is ~0.5 MB of binary. IndexedDB stores Blobs directly and
 * has room for hours. Nothing here leaves the device.
 */

export interface AudioStore {
  put(id: string, audio: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB = 'mumble';
const STORE = 'recordings';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

export function browserAudioStore(): AudioStore {
  if (typeof indexedDB === 'undefined') return memoryAudioStore();
  return {
    put: (id, audio) => run('readwrite', (s) => { s.put(audio, id); }).then(() => {}),
    get: (id) => run<Blob>('readonly', (s) => s.get(id)),
    remove: (id) => run('readwrite', (s) => { s.delete(id); }).then(() => {}),
    clear: () => run('readwrite', (s) => { s.clear(); }).then(() => {}),
  };
}

/** For tests, and browsers without IndexedDB (recordings last until reload). */
export function memoryAudioStore(): AudioStore {
  const m = new Map<string, Blob>();
  return {
    put: async (id, a) => { m.set(id, a); },
    get: async (id) => m.get(id),
    remove: async (id) => { m.delete(id); },
    clear: async () => { m.clear(); },
  };
}
