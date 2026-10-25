// -----------------------------------------------------------------------------
// app.js — starts the app: loads the data, shows the right screen, and wires
// up navigation, offline support/updates and the change of day at midnight.
//
// Screens live in js/screens/. Each one exports `title` and
// `render(main, ctx)`, where ctx = { data, today, ui, go, refresh }:
//   data    – the saved data (read-only; change it through store.js)
//   today   – today's date in Jakarta, 'YYYY-MM-DD'
//   ui      – things remembered while the app is open (chosen period, filters)
//   go(r)   – open another screen, e.g. go('beranda')
//   refresh – redraw the current screen
// -----------------------------------------------------------------------------

import * as store from './store.js';
import { todayStr } from './clock.js';
import { requestPersistence } from './storage.js';
import { registerServiceWorker } from './pwa.js';
import { h, toast, alertDialog } from './ui.js';
import * as setup from './screens/setup.js';
import * as beranda from './screens/beranda.js';
import * as pengeluaran from './screens/pengeluaran.js';
import * as simulasi from './screens/simulasi.js';
import * as ringkasan from './screens/ringkasan.js';
import * as dompet from './screens/dompet.js';
import * as rutin from './screens/rutin.js';
import * as pengaturan from './screens/pengaturan.js';
import * as pos from './screens/pos.js';

const SCREENS = { setup, beranda, pengeluaran, simulasi, ringkasan, dompet, rutin, pengaturan, pos };

// On phones these screens are reached from Pengaturan, so that tab stays lit.
const PARENT_TAB = { dompet: 'pengaturan', rutin: 'pengaturan', pos: 'pengaturan' };

// Remembered while the app is open (not saved).
const ui = {
  periodStart: null, // period shown in Pengeluaran / Dompet / Ringkasan (null = current period)
  filters: { bucketId: '', walletId: '' },
  simulation: { amount: null, bucketId: null },
};

let shownRoute = null;
let shownToday = null;

function routeFromHash() {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return Object.prototype.hasOwnProperty.call(SCREENS, name) ? name : 'beranda';
}

/** Open a screen by name. */
function go(route) {
  if (window.location.hash === `#/${route}`) render();
  else window.location.hash = `#/${route}`;
}

function updateNav(route) {
  for (const link of document.querySelectorAll('.nav-item')) {
    const target = link.dataset.route;
    const current = target === route || (route === 'pos' && target === 'pengaturan');
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    link.classList.toggle('is-parent', !current && PARENT_TAB[route] === target);
  }
}

function errorScreen() {
  return h(
    'section',
    { class: 'card stack' },
    h('h1', { class: 'screen-title', text: 'Ups, ada masalah' }),
    h('p', { text: 'Halaman ini gagal ditampilkan. Datamu tetap aman. Coba muat ulang aplikasi.' }),
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.location.reload() }, 'Muat ulang'),
  );
}

/** Draw the current screen. Called on start, on navigation and after every data change. */
function render() {
  const data = store.getData();
  const today = todayStr();
  let route = routeFromHash();
  if (!data.setupDone) route = 'setup';
  else if (route === 'setup') route = 'beranda';
  if (window.location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);

  const sameScreen = route === shownRoute;
  const scrollY = window.scrollY;
  shownRoute = route;
  shownToday = today;
  document.body.dataset.route = route;
  updateNav(route);

  const screen = SCREENS[route];
  document.title = route === 'beranda' ? 'Uang Bulanan' : `${screen.title} · Uang Bulanan`;
  const main = document.getElementById('main');
  main.replaceChildren();
  try {
    screen.render(main, { data, today, ui, go, refresh: render });
  } catch (error) {
    console.error(error);
    main.replaceChildren(errorScreen());
  }

  if (sameScreen) {
    window.scrollTo(0, scrollY);
  } else {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

/** Redraw when the date changes (e.g. the app stays open past midnight). */
function checkNewDay() {
  if (todayStr() !== shownToday) render();
}

function start() {
  if (typeof HTMLDialogElement !== 'function' || typeof window.structuredClone !== 'function') {
    document.getElementById('main').replaceChildren(
      h('p', { class: 'card' }, 'Browser ini terlalu lama untuk aplikasi ini. Perbarui iOS (minimal iOS 16) atau gunakan browser terbaru.'),
    );
    return;
  }

  store.load(todayStr());
  store.subscribe(render);
  window.addEventListener('hashchange', render);
  render();

  const messages = store.takeLoadMessages();
  if (messages.length) alertDialog({ title: 'Perhatian', message: messages });

  requestPersistence(); // ask the browser not to delete our data when space is low
  registerServiceWorker(); // offline support + update banner

  setInterval(checkNewDay, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNewDay();
  });

  // The app is open in another tab/window and saved something there:
  // load the new data here too, so this tab never overwrites it with old data.
  window.addEventListener('storage', (event) => {
    if (store.changedElsewhere(event.key)) store.reload(); // reload() redraws the screen
  });

  // Last safety net: unexpected errors are logged and the user gets a calm message.
  let lastErrorToast = 0;
  const onUnexpected = (error) => {
    console.error(error);
    if (Date.now() - lastErrorToast > 10_000) {
      lastErrorToast = Date.now();
      toast('Terjadi kesalahan tak terduga. Datamu tetap aman.', 'error');
    }
  };
  window.addEventListener('error', (event) => onUnexpected(event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => onUnexpected(event.reason));
}

start();
