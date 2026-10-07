/* Mumble's service worker -- the "installable" half (Oct 6).

   Paths are RELATIVE to this file, so it works at both addresses: GitHub
   Pages (/Mumble/) and Railway (/). Pages are NETWORK FIRST -- the cache is
   only what you get offline, so a deploy is never hidden behind yesterday's
   app. Built assets are hashed, so caching them by URL can't go stale.

   ⚠️ Recordings are NOT here: they live in IndexedDB and never leave the
   browser (CLAUDE.md). This only keeps the app itself opening offline. */
const CACHE = 'mumble-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./', copy));
      return res;
    }).catch(() => caches.match('./')));
    return;
  }

  /* Hashed assets, icons, the demo audio and the team faces: cache first, filled as used. */
  if (/\/assets\/|\/icons\/|\/demo-audio\/|\/people\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
