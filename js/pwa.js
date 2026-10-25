// -----------------------------------------------------------------------------
// pwa.js — installs the service worker (sw.js), which makes the app work
// offline, and shows the "Versi baru tersedia" banner when a new version has
// been downloaded in the background.
// -----------------------------------------------------------------------------

let registration = null;
let updateRequested = false;

/** True on iPhone / iPad. */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True when opened from the Home Screen / Dock icon (not inside a normal browser tab). */
export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // When a new version takes over, reload once so every file comes from it.
  // (Not on the very first install: then nothing has changed yet.)
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || (!hadController && !updateRequested)) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
    })
    .catch((error) => console.warn('Service worker tidak bisa dipasang:', error));

  // iPhone home-screen apps are often resumed instead of reopened,
  // so also look for a new version whenever the app comes back to the front.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !registration) return;
    if (Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    registration.update().catch(() => {}); // offline: try again later
  });
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  const button = document.getElementById('update-reload');
  if (!banner || !button) return;
  button.onclick = applyUpdate;
  banner.hidden = false;
}

/** Switch to the downloaded version (the page reloads by itself). */
export function applyUpdate() {
  updateRequested = true;
  const waiting = registration && registration.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

/**
 * For the "Periksa pembaruan" button.
 * Resolves to 'update' (new version found), 'latest', 'offline' or 'unsupported'.
 */
export async function checkForUpdate() {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  if (registration.waiting) {
    showUpdateBanner();
    return 'update';
  }
  return registration.installing ? 'update' : 'latest';
}
