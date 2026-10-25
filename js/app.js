// -----------------------------------------------------------------------------
// app.js — starts the app: loads the data, shows the right screen, and wires
// up navigation, animations, offline support/updates and the change of day.
//
// Screens live in js/screens/. Each one exports `title` and
// `render(main, ctx)`, where ctx = { data, today, ui, go, refresh }:
//   data       – the saved data (read-only; change it through store.js)
//   today      – today's date in Jakarta, 'YYYY-MM-DD'
//   ui         – things remembered while the app is open (chosen period, filters)
//   go(r)      – open another screen, e.g. go('beranda')
//   refresh(o) – redraw the current screen ({ slide: 'back' | 'forward' } to slide it)
// -----------------------------------------------------------------------------

import * as store from './store.js';
import * as motion from './motion.js';
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
import * as rencana from './screens/rencana.js';

const SCREENS = { setup, beranda, pengeluaran, simulasi, rencana, ringkasan, dompet, rutin, pengaturan, pos };

// On phones these screens are reached from another tab, so that tab stays lit.
const PARENT_TAB = { simulasi: 'beranda', dompet: 'pengaturan', rutin: 'pengaturan', pos: 'pengaturan' };

// Tab order decides the slide direction: moving right slides left, moving left slides right.
const TAB_ORDER = ['beranda', 'pengeluaran', 'simulasi', 'rencana', 'ringkasan', 'dompet', 'rutin', 'pengaturan', 'pos'];

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
let titleWatcher = null;

function routeFromHash() {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return Object.prototype.hasOwnProperty.call(SCREENS, name) ? name : 'beranda';
}

/** Open a screen by name. */
function go(route) {
  if (window.location.hash === `#/${route}`) render();
  else window.location.hash = `#/${route}`;
}

function navDirection(from, to) {
  if (PARENT_TAB[to] === from) return 'forward'; // going deeper
  if (PARENT_TAB[from] === to) return 'back'; // coming back up
  return TAB_ORDER.indexOf(to) >= TAB_ORDER.indexOf(from) ? 'forward' : 'back';
}

function updateNav(route, animate) {
  const nav = document.querySelector('.nav');
  for (const link of nav.querySelectorAll('.nav-item')) {
    const target = link.dataset.route;
    const current = target === route || (route === 'pos' && target === 'pengaturan');
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    link.classList.toggle('is-parent', !current && PARENT_TAB[route] === target);
  }
  const selected = motion.moveNavIndicator(nav, { animate });
  if (selected) motion.pop(selected.querySelector('svg'));
}

/** The small title bar that fades in (with a blur) once the big title scrolls away. */
function updateTopbar(title, main, entering) {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  topbar.querySelector('.topbar-title').textContent = title;
  if (titleWatcher) titleWatcher.disconnect();
  if (entering) topbar.classList.remove('is-stuck');
  const heading = main.querySelector('.screen-title');
  if (!heading || !('IntersectionObserver' in window)) return;
  titleWatcher = new IntersectionObserver(
    ([entry]) => topbar.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 100),
    { rootMargin: '-48px 0px 0px 0px' },
  );
  titleWatcher.observe(heading);
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

/** Let the sections of a newly opened screen (and the first rows of its lists) come in one after another. */
function staggerIn(main) {
  if (motion.reducedMotion()) return;
  [...main.children].slice(0, 8).forEach((section, i) => {
    motion.enter(section, { delay: i * 30, y: 10 });
    const rows = section.querySelectorAll('.rows > li, .bucket-list > li, .timeline > li');
    [...rows].slice(0, 8).forEach((row, j) => motion.enter(row, { delay: i * 30 + 60 + j * 22, y: 6 }));
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
  try {
    screen.render(main, { data, today, ui, go, refresh: render });
  } catch (error) {
    console.error(error);
    main.replaceChildren(errorScreen());
  }

  if (entering) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
  }
  motion.animateNumbers(main);
  motion.animateStates(main);
  motion.animateMeters(main, { entering: entering || Boolean(slide) });
  if (snapshot) motion.playLayout(main, snapshot);
  if (entering) staggerIn(main);
  if (slide) motion.slideIn(main, slide);
  updateTopbar(screen.title, main, entering);
}

/**
 * Show the current screen. Called on start, on navigation and after every
 * data change. A change of screen uses a page transition; a redraw of the
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
    const direction = navDirection(shownRoute, route);
    shownRoute = route;
    pageChangePending = true;
    const safety = setTimeout(() => {
      if (pageChangePending) {
        pageChangePending = false;
        draw({ entering: true });
      }
    }, 1500);
    motion.pageTransition(
      () => {
        clearTimeout(safety);
        pageChangePending = false;
        draw({ entering: true });
      },
      direction,
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
  render();

  const messages = store.takeLoadMessages();
  if (messages.length) alertDialog({ title: 'Perhatian', message: messages });
  if (store.takeUpgradeInfo()) toast('Uang Bulanan sudah diperbarui. Datamu aman, dan salinan data lama disimpan otomatis.', 'success');

  requestPersistence(); // ask the browser not to delete our data when space is low
  registerServiceWorker(); // offline support + update banner

  // iPhone Safari only shows the "pressed" look (:active) if the page listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });

  // Keep the tab highlight under the right tab when the window size changes.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => motion.moveNavIndicator(document.querySelector('.nav'), { animate: false }));
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
