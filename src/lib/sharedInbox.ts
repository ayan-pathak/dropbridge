/**
 * Handoff between the service worker (which receives Android's share-sheet POST)
 * and the app (which owns the vault key and can therefore encrypt).
 *
 * The SW deliberately cannot upload anything itself: it has no access to the
 * key, which is the whole point.
 */

const DB_NAME = 'dropbridge-share';
const STORE = 'inbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function takeSharedFiles(): Promise<File[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      store.clear();
      resolve((request.result as File[]) ?? []);
    };
    request.onerror = () => reject(request.error);
  });
}
