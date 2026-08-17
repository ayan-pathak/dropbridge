/**
 * The vault key lives in IndexedDB and nowhere else. It is never sent to
 * Firebase, so clearing site data on every device means the files are gone
 * for good — that is the intended trade, not a bug.
 */

const DB_NAME = 'dropbridge';
const STORE = 'keys';
const VAULT_KEY_ID = 'vault';
const DEVICE_ID = 'deviceId';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function loadVaultKey(): Promise<CryptoKey | null> {
  const stored = await tx<CryptoKey | undefined>('readonly', (store) => store.get(VAULT_KEY_ID));
  return stored ?? null;
}

export async function saveVaultKey(key: CryptoKey): Promise<void> {
  // Structured clone handles CryptoKey natively, so the raw bits never surface
  // in JS memory as an exportable buffer just to be persisted.
  await tx('readwrite', (store) => store.put(key, VAULT_KEY_ID));
}

export async function clearVaultKey(): Promise<void> {
  await tx('readwrite', (store) => store.delete(VAULT_KEY_ID));
}

/**
 * A random, stable identifier for this browser profile. Used only to tell
 * "the device that uploaded" from "a device that downloaded", so that files
 * can self-destruct once they have actually reached the other end.
 *
 * Opaque and unlinked to the account — it reveals nothing to the server beyond
 * the fact that two events came from the same place.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await tx<string | undefined>('readonly', (store) => store.get(DEVICE_ID));
  if (existing) return existing;

  const id = crypto.randomUUID();
  await tx('readwrite', (store) => store.put(id, DEVICE_ID));
  return id;
}
