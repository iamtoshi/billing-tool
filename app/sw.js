/* Deo Ratan Billing - offline support.
   Every app file is saved on the laptop the first time, so the app opens with no internet.
   To ship a new version: change VERSION below, then upload. Open apps show "A new version is ready". */
const VERSION = '2026-10-29.5';
const CACHE = 'deoratan-app-' + VERSION;
const ASSETS = [
  "./",
  "app.js",
  "styles.css",
  "fonts.css",
  "manifest.webmanifest",
  "vendor/html2canvas.min.js",
  "vendor/jspdf.umd.min.js",
  "vendor/xlsx.full.min.js",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "fonts/archivo-latin-600-normal.woff2",
  "fonts/archivo-latin-700-normal.woff2",
  "fonts/archivo-latin-ext-600-normal.woff2",
  "fonts/archivo-latin-ext-700-normal.woff2",
  "fonts/hind-devanagari-400-normal.woff2",
  "fonts/hind-devanagari-500-normal.woff2",
  "fonts/hind-devanagari-600-normal.woff2",
  "fonts/hind-latin-400-normal.woff2",
  "fonts/hind-latin-500-normal.woff2",
  "fonts/hind-latin-600-normal.woff2",
  "fonts/hind-latin-ext-400-normal.woff2",
  "fonts/hind-latin-ext-500-normal.woff2",
  "fonts/hind-latin-ext-600-normal.woff2",
  "fonts/ibm-plex-mono-latin-400-normal.woff2",
  "fonts/ibm-plex-mono-latin-500-normal.woff2",
  "fonts/ibm-plex-mono-latin-ext-400-normal.woff2",
  "fonts/ibm-plex-mono-latin-ext-500-normal.woff2",
  "fonts/noto-sans-devanagari-devanagari-400-normal.woff2",
  "fonts/noto-sans-devanagari-devanagari-600-normal.woff2",
  "fonts/noto-sans-devanagari-latin-400-normal.woff2",
  "fonts/noto-sans-devanagari-latin-600-normal.woff2",
  "fonts/noto-sans-devanagari-latin-ext-400-normal.woff2",
  "fonts/noto-sans-devanagari-latin-ext-600-normal.woff2",
  "fonts/pt-serif-latin-400-normal.woff2",
  "fonts/pt-serif-latin-700-normal.woff2",
  "fonts/pt-serif-latin-ext-400-normal.woff2",
  "fonts/pt-serif-latin-ext-700-normal.woff2"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('deoratan-app-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // /api/* belongs to the server (report endpoint), never to the offline copy of the app
  if (new URL(req.url).pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', {cacheName: CACHE}).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, {cacheName: CACHE, ignoreSearch: true}).then((r) => r || fetch(req)));
});
