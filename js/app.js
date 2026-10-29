// -----------------------------------------------------------------------------
// app.js — starts the app: loads the data, shows the right screen, and wires
// up navigation (function keys, command line), animations, offline
// support/updates and the change of day.
//
// Screens live in js/screens/. Each one exports `title` and
// `render(main, ctx)`, where ctx = { data, today, ui, go, refresh, entering }:
//   data       – the saved data (read-only; change it through store.js)
//   today      – today's date in Jakarta, 'YYYY-MM-DD'
//   ui         – things remembered while the app is open (chosen period, filters)
//   go(r)      – open another screen, e.g. go('beranda')
//   refresh(o) – redraw the current screen ({ slide: 'back' | 'forward' } to animate it)
//   entering   – true when the screen was just opened (not a redraw after a change)
// -----------------------------------------------------------------------------

import * as store from './store.js';
import * as motion from './motion.js';
import { todayStr } from './clock.js';
import { requestPersistence } from './storage.js';
import { registerServiceWorker } from './pwa.js';
import { h, toast, alertDialog } from './ui.js';
import { resetPanels } from './components.js';
import { setupTerminal, updateTicker, updateStatusBar, openMenu } from './terminal.js';
import { exportBackup } from './backup.js';
import { openExpenseForm } from './screens/expense-form.js';
import * as setup from './screens/setup.js';
import * as beranda from './screens/beranda.js';
import * as pengeluaran from './screens/pengeluaran.js';
import * as simulasi from './screens/simulasi.js';
import * as ringkasan from './screens/ringkasan.js';
import * as dompet from './screens/dompet.js';
import * as rutin from './screens/rutin.js';
import * as pengaturan from './screens/pengaturan.js';
import * as pos from './screens/pos.js';
import * as rencana from './screens/rencana.js';
import * as masuk from './screens/masuk.js';

const SCREENS = { setup, beranda, pengeluaran, simulasi, rencana, masuk, ringkasan, dompet, rutin, pengaturan, pos };

// These screens are reached from Pengaturan, so its key stays lit (on wide screens).
const PARENT_TAB = { dompet: 'pengaturan', rutin: 'pengaturan', pos: 'pengaturan' };

// Remembered while the app is open (not saved).
const ui = {
  periodStart: null, // period shown in Pengeluaran / Dompet / Ringkasan (null = current period)
  filters: { bucketId: '', walletId: '' },
  simulation: { amount: null, bucketId: null },
  plan: { perDay: null, buy: null }, // the two calculators on Rencana Cukup
};

let shownRoute = null;
let shownToday = null;
let pageChangePending = false;

function routeFromHash() {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return Object.prototype.hasOwnProperty.call(SCREENS, name) ? name : 'beranda';
}

/** Open a screen by name. */
function go(route) {
  if (window.location.hash === `#/${route}`) render();
  else window.location.hash = `#/${route}`;
}

/** Run a command from the command line, a function key or the LAIN menu (see commands.js). */
function runCommand(command) {
  if (!store.getData().setupDone) return;
  if (command.route) go(command.route);
  else if (command.action === 'menu') openMenu();
  else if (command.action === 'catat') openExpenseForm({ data: store.getData(), today: todayStr() });
  else if (command.action === 'cadangan') exportBackup(todayStr());
}

/** Light up the key of the current screen. On phones, screens without a visible key light up F5 LAIN. */
function updateNav(route, animate) {
  const nav = document.querySelector('.nav');
  const items = [...nav.querySelectorAll('.nav-item')];
  const visible = (item) => item.getClientRects().length > 0;
  let lit = false;
  for (const item of items) {
    const target = item.dataset.route;
    const current = Boolean(target) && target === route;
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
    const parent = Boolean(target) && PARENT_TAB[route] === target && visible(item);
    item.classList.toggle('is-parent', parent);
    if ((current && visible(item)) || parent) lit = true;
  }
  const lain = nav.querySelector('[data-action="menu"]');
  if (lain) lain.classList.toggle('is-parent', !lit);
  motion.moveNavIndicator(nav, { animate });
}

function errorScreen() {
  return h(
    'section',
    { class: 'card' },
    h('h1', { class: 'screen-title' }, 'Ups, ada masalah'),
    h('div', { class: 'card-body' }, h('p', { text: 'Halaman ini gagal ditampilkan. Datamu tetap aman. Coba muat ulang aplikasi.' }), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.location.reload() }, 'Muat ulang')),
  );
}

/** Let the panels of a newly opened screen (and the first rows of their lists) appear one after another, quickly. */
function staggerIn(main) {
  if (motion.reducedMotion()) return;
  [...main.children].slice(0, 10).forEach((section, i) => {
    motion.enter(section, { delay: i * 15, y: 4 });
    const rows = section.querySelectorAll('.rows > li, .bucket-list > li, .timeline > li, .inst-list > li');
    [...rows].slice(0, 10).forEach((row, j) => motion.enter(row, { delay: i * 15 + 30 + j * 15, y: 0 }));
  });
}

/** Actually draw the current screen. */
function draw({ entering = false, slide = null } = {}) {
  const route = shownRoute;
  const data = store.getData();
  const today = todayStr();
  shownToday = today;
  document.body.dataset.route = route;
  updateNav(route, true);

  const screen = SCREENS[route];
  document.title = route === 'beranda' ? 'Uang Bulanan' : `${screen.title} · Uang Bulanan`;
  const main = document.getElementById('main');
  const scrollY = window.scrollY;
  const snapshot = !entering && !slide ? motion.captureLayout(main) : null;

  main.replaceChildren();
  resetPanels();
  try {
    screen.render(main, { data, today, ui, go, refresh: render, entering });
  } catch (error) {
    console.error(error);
    main.replaceChildren(errorScreen());
  }

  if (entering) {
    window.scrollTo(0, 0);
    // Focus the new screen (for keyboards and screen readers), unless someone is typing a command.
    if (!(document.activeElement && document.activeElement.closest('.cmdline'))) main.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
  }
  motion.animateNumbers(main);
  motion.animateStates(main);
  motion.animateMeters(main, { entering: entering || Boolean(slide) });
  if (snapshot) motion.playLayout(main, snapshot);
  if (entering) staggerIn(main);
  if (slide) motion.slideIn(main, slide);

  updateStatusBar(data);
  if (data.setupDone) updateTicker(data, today);
}

/**
 * Show the current screen. Called on start, on navigation and after every
 * data change. A change of screen uses a short crossfade; a redraw of the
 * same screen animates only what changed.
 */
function render(options = {}) {
  const data = store.getData();
  let route = routeFromHash();
  if (!data.setupDone) route = 'setup';
  else if (route === 'setup') route = 'beranda';
  if (window.location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);

  if (pageChangePending) {
    shownRoute = route; // a page change is under way; it will draw the newest state
    return;
  }
  if (shownRoute !== null && route !== shownRoute) {
    shownRoute = route;
    pageChangePending = true;
    const safety = setTimeout(() => {
      if (pageChangePending) {
        pageChangePending = false;
        draw({ entering: true });
      }
    }, 1000);
    motion.pageTransition(
      () => {
        clearTimeout(safety);
        pageChangePending = false;
        draw({ entering: true });
      },
      'forward',
      document.getElementById('main'),
    );
    return;
  }
  const entering = shownRoute === null;
  shownRoute = route;
  draw({ entering, slide: options.slide || null });
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
  store.subscribe(() => render());
  window.addEventListener('hashchange', () => render());
  setupTerminal({ run: runCommand });
  document.querySelector('[data-action="menu"]')?.addEventListener('click', () => openMenu());
  render();

  const messages = store.takeLoadMessages();
  if (messages.length) alertDialog({ title: 'Perhatian', message: messages });
  const upgradedFrom = store.takeUpgradeInfo();
  if (upgradedFrom) {
    toast(
      upgradedFrom < 3
        ? 'Uang Bulanan sudah diperbarui. Datamu aman (salinan lama disimpan). Uang bulananmu sekarang satu kali uang masuk; bagi jadi bertahap di Pengaturan → Jadwal Uang Masuk.'
        : 'Uang Bulanan sudah diperbarui. Datamu aman, dan salinan data lama disimpan otomatis.',
      'success',
      { ms: 9000 },
    );
  }

  requestPersistence(); // ask the browser not to delete our data when space is low
  registerServiceWorker(); // offline support + update banner

  // iPhone Safari only shows the "pressed" look (:active) if the page listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });

  // Keep the key highlight under the right key when the window size changes.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => updateNav(shownRoute, false));
  });

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
