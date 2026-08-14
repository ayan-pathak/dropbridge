/// <reference lib="webworker" />

/**
 * Hand-rolled rather than Workbox: the only jobs are precaching the shell and
 * catching the Android share-sheet POST, and both are short enough that a
 * dependency would cost more than it saves.
 */

const MANIFEST = self.__WB_MANIFEST || [];
const CACHE = 'dropbridge-shell-v1';
const SHARE_DB = 'dropbridge-share';
const SHARE_STORE = 'inbox';

self.addEventListener('install', (event) => {
  const urls = MANIFEST.map((entry) => (typeof entry === 'string' ? entry : entry.url));
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(urls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function stashShared(files) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { autoIncrement: true });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(SHARE_STORE, 'readwrite');
      files.forEach((file) => tx.objectStore(SHARE_STORE).add(file));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Android share sheet lands here as a multipart POST. Stash the files and
  // bounce into the app, which holds the key and does the encrypting.
  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(
      (async () => {
        try {
          const form = await event.request.formData();
          const files = form.getAll('files').filter((entry) => entry instanceof File);
          if (files.length) await stashShared(files);
        } catch {
          // Fall through to the redirect: better to open the app empty-handed
          // than to show the user a service worker error page.
        }
        return Response.redirect('/?shared=1', 303);
      })(),
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Cache-first for the precached shell; everything else (Firebase, blobs)
  // goes straight to the network and is never cached.
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});
