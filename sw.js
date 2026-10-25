// -----------------------------------------------------------------------------
// sw.js — the service worker. It stores every app file on the device so the
// app opens and works with no internet at all, and it handles updates.
//
// ===================== HOW TO RELEASE A NEW VERSION =====================
//  1. Change APP_VERSION below, e.g. '1.0.0' -> '1.0.1'.
//  2. Change APP_VERSION in js/version.js to the same value.
//  3. If you added, removed or renamed a file, update the FILES list below.
//  4. Run `npm test` (it checks steps 1–3 for you), then commit and push.
// Because this file changed, phones download the new version in the
// background and show "Versi baru tersedia". Tapping "Muat ulang" switches
// to it. Old cached files are deleted automatically.
// ==========================================================================

const APP_VERSION = '1.0.0';
const CACHE_PREFIX = 'uang-bulanan-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

// Every file the app needs. Paths are relative to this file (./), so the app
// works in any folder, e.g. yourname.github.io/uang-bulanan/
const FILES = [
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/backup.js',
  './js/clock.js',
  './js/components.js',
  './js/data.js',
  './js/format.js',
  './js/logic.js',
  './js/pwa.js',
  './js/storage.js',
  './js/store.js',
  './js/ui.js',
  './js/version.js',
  './js/screens/beranda.js',
  './js/screens/dompet.js',
  './js/screens/expense-form.js',
  './js/screens/pengaturan.js',
  './js/screens/pengeluaran.js',
  './js/screens/pos.js',
  './js/screens/ringkasan.js',
  './js/screens/rutin.js',
  './js/screens/setup.js',
  './js/screens/simulasi.js',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Install: download all files into a new cache named after this version.
// `cache: 'reload'` skips the browser's own HTTP cache, so we never store an old file.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // We do NOT call skipWaiting() here: the new version waits until the user
  // taps "Muat ulang" (or closes the app), so old and new files never mix.
});

// The page asks us to take over when the user taps "Muat ulang".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Activate: delete caches of older versions (only our own, never other apps').
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Fetch: answer from the cache first (works offline); use the network only for
// anything that is not one of our files.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other websites

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Opening the app (e.g. /uang-bulanan/ or /uang-bulanan/index.html) -> the cached page.
      const scopePath = new URL(self.registration.scope).pathname;
      if (request.mode === 'navigate' && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`)) {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      const cached = await cache.match(request, { ignoreSearch: true });
      return cached || fetch(request);
    })(),
  );
});
