// -----------------------------------------------------------------------------
// motion.js — the one place for animations, so they feel the same everywhere.
// Terminal feel: crisp and quick (about 80–160 ms), ease-out or linear, no
// springs, no overshoot, no rubber bands.
//
// Rules (please keep them):
//   * Speeds and curves come from the CSS variables in css/app.css
//     (--dur-*, --ease-*). Change them there to tune the whole app.
//   * Only transform and opacity are animated (plus short color/background
//     flashes on changed numbers), so it stays smooth on a phone.
//   * Every animation can be interrupted: starting a new one on the same
//     element/channel stops the old one, and nothing ever waits forever
//     (there is always a timeout), so taps can never get stuck.
//   * With "Reduce Motion" (iPhone: Settings → Accessibility → Motion),
//     there is no movement and no flashing: things appear at once or with a
//     simple fade, and numbers jump straight to the result.
// -----------------------------------------------------------------------------

import { formatRupiah } from './format.js';

const root = document.documentElement;
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const wideQuery = window.matchMedia('(min-width: 640px)');

/** True when the user asked the system for less motion. */
export const reducedMotion = () => reducedQuery.matches;

/* ------------------------------ tokens ------------------------------ */

const FALLBACK = {
  '--ease-out': 'cubic-bezier(0.2, 0, 0, 1)',
  '--ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  '--dur-press': '60ms',
  '--dur-fast': '100ms',
  '--dur-base': '120ms',
  '--dur-page': '120ms',
  '--dur-sheet': '160ms',
  '--dur-slow': '250ms',
};
const tokens = new Map();
reducedQuery.addEventListener?.('change', () => tokens.clear()); // values change with "Reduce Motion"

/** Read a motion setting from the CSS variables (cached). */
function token(name) {
  if (!tokens.has(name)) tokens.set(name, getComputedStyle(root).getPropertyValue(name).trim() || FALLBACK[name]);
  return tokens.get(name);
}

/** A curve by name: 'out' (moving, arriving) or 'in' (leaving). Old names ('spring', 'bounce') mean 'out' now. */
export const ease = (name) => token(`--ease-${name === 'in' ? 'in' : 'out'}`);

/** A duration in milliseconds by name: 'press', 'fast', 'base', 'page', 'sheet', 'slow'. */
export const duration = (name) => parseFloat(token(`--dur-${name}`)) || 120;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------ playing ------------------------------ */

const running = new WeakMap(); // element -> Map(channel -> Animation)

/**
 * Animate an element with the Web Animations API.
 * Stops an older animation on the same element + channel first (interruptible).
 * Returns a promise that always resolves (never rejects, never hangs).
 */
export function play(el, keyframes, { duration: ms = 120, easing = ease('out'), delay = 0, fill = 'none', channel = 'main' } = {}) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  stop(el, channel);
  let animation;
  try {
    animation = el.animate(keyframes, { duration: ms, easing, delay, fill });
  } catch {
    try {
      animation = el.animate(keyframes, { duration: ms, easing: 'ease-out', delay, fill }); // older browser: simpler curve
    } catch {
      return Promise.resolve();
    }
  }
  let channels = running.get(el);
  if (!channels) {
    channels = new Map();
    running.set(el, channels);
  }
  channels.set(channel, animation);
  el.style.willChange = 'transform, opacity'; // only while it moves
  const done = animation.finished.then(
    () => {},
    () => {},
  );
  return Promise.race([done, wait(delay + ms + 150)]).then(() => {
    if (channels.get(channel) === animation) {
      channels.delete(channel);
      if (!channels.size) el.style.removeProperty('will-change');
    }
  });
}

/** Stop an element's animation. With keep: true, the element stays where the animation had moved it. */
export function stop(el, channel = 'main', { keep = false } = {}) {
  const channels = el && running.get(el);
  const animation = channels && channels.get(channel);
  if (!animation) return;
  if (keep) {
    try {
      animation.commitStyles();
    } catch {
      /* element not rendered: nothing to keep */
    }
  }
  animation.cancel();
  channels.delete(channel);
  if (!channels.size) el.style.removeProperty('will-change');
}

/* ------------------------------ small effects ------------------------------ */

/** Fade (and nudge) an element in. */
export function enter(el, { delay = 0, y = 4, scale = 1 } = {}) {
  if (reducedMotion()) return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), fill: 'backwards', channel: 'enter' });
  const from = y || scale !== 1 ? `translateY(${y}px) scale(${scale})` : 'none';
  return play(el, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], {
    duration: duration('base'),
    easing: ease('out'),
    delay,
    fill: 'backwards',
    channel: 'enter',
  });
}

/** Let a list of elements come in one after another, with a very short stagger (≈15 ms). */
export function stagger(elements, { step = 15, max = 12, start = 0, y = 0 } = {}) {
  if (reducedMotion()) return;
  elements.slice(0, max).forEach((el, i) => enter(el, { delay: start + i * step, y }));
}

/** A short, crisp "no" shake, e.g. for an invalid input. */
export function shake(el) {
  if (!el) return Promise.resolve();
  if (reducedMotion()) return play(el, [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'linear', channel: 'shake' });
  return play(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], {
    duration: 160,
    easing: 'linear',
    channel: 'shake',
  });
}

/** A tiny press "tick" (e.g. a value that changed in a stepper). No overshoot. */
export function pop(el, amount = 0.06) {
  if (!el || reducedMotion()) return Promise.resolve();
  return play(el, [{ transform: `scale(${1 - amount})` }, { transform: 'scale(1)' }], { duration: duration('base'), easing: ease('out'), channel: 'pop' });
}

/** Draw attention once, like a terminal: the element blinks twice (used for "Melebihi anggaran"). */
export function attention(el) {
  if (!el) return;
  if (reducedMotion()) return;
  play(el, [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], { duration: 480, easing: 'steps(4, jump-none)', channel: 'attention' });
}

/** Flash an element's background green (better) or red (worse) and fade back, like a market tick. */
export function flash(el, better) {
  if (!el || reducedMotion()) return;
  const color = better ? 'rgba(0, 210, 106, 0.38)' : 'rgba(255, 59, 59, 0.38)';
  play(el, [{ backgroundColor: color }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], { duration: 400, easing: 'ease-out', channel: 'flash' });
}

/* ------------------------------ counting numbers ------------------------------ */

const lastValues = new Map(); // count key -> last shown value

/** Count a number from one value to another in about 250 ms. Always ends on the exact value. */
export function countNumber(el, from, to, format = formatRupiah) {
  if (reducedMotion() || document.hidden) {
    el.textContent = format(to);
    return;
  }
  const ms = 250;
  const start = performance.now();
  el.textContent = format(from);
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 2);
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    if (el.isConnected) el.textContent = format(to); // safety net: exact final value
  }, ms + 150);
}

/**
 * After a screen is drawn: numbers marked with data-count-key="…" and
 * data-value="…" count from the value shown last time to the new one, and
 * flash green when they got better or red when they got worse
 * (data-polarity="down" means a higher number is worse, e.g. money spent).
 */
export function animateNumbers(container) {
  for (const el of container.querySelectorAll('[data-count-key]')) {
    const key = el.dataset.countKey;
    const to = Number(el.dataset.value);
    const from = lastValues.get(key);
    lastValues.set(key, to);
    if (from === undefined || from === to || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    countNumber(el, from, to);
    const up = to > from;
    flash(el, el.dataset.polarity === 'down' ? !up : up);
  }
}

/* ------------------------------ state changes ------------------------------ */

const lastStates = new Map(); // state key -> last state

/** Elements marked with data-state-key="…" and data-state="on|off" blink once when they turn "on". */
export function animateStates(container) {
  for (const el of container.querySelectorAll('[data-state-key]')) {
    const key = el.dataset.stateKey;
    const state = el.dataset.state;
    const previous = lastStates.get(key);
    lastStates.set(key, state);
    if (previous !== state && state === 'on') attention(el);
  }
}

/* ------------------------------ bars ------------------------------ */

const lastBars = new Map(); // bar key -> { ratio, state }

/** The transform that shows a bar filled to `ratio` (0..1): the fill slides in from the left. */
export const barTransform = (ratio) => `translateX(${(Math.min(1, Math.max(0, ratio)) - 1) * 100}%)`;

/**
 * Progress bars (.bar[data-bar-key]) fill in about 250 ms: from empty when a
 * screen opens, from the old value when data changes. Color changes
 * (green → yellow → red) switch at once.
 */
export function animateMeters(container, { entering = false } = {}) {
  const reduced = reducedMotion();
  for (const bar of container.querySelectorAll('[data-bar-key]')) {
    const fill = bar.firstElementChild;
    const key = bar.dataset.barKey;
    const to = Number(bar.dataset.ratio) || 0;
    const state = bar.dataset.state || '';
    const previous = lastBars.get(key);
    lastBars.set(key, { ratio: to, state });
    if (!fill) continue;
    const from = entering || !previous ? 0 : previous.ratio;
    if (reduced || Math.abs(from - to) < 0.001) continue;
    play(fill, [{ transform: barTransform(from) }, { transform: barTransform(to) }], {
      duration: duration('slow'),
      easing: ease('out'),
      delay: entering ? 60 : 0,
      fill: 'backwards',
      channel: 'meter',
    });
  }
}

/* ------------------------------ lists (FLIP) ------------------------------ */

/**
 * Before a screen is redrawn after a data change: remember where every
 * element with data-key="…" was. playLayout() then makes the redraw smooth:
 * moved items slide to their new place, new items fade in, removed items
 * collapse quickly while the rest of the list moves up to close the gap.
 */
export function captureLayout(container) {
  const items = new Map();
  for (const el of container.querySelectorAll('[data-key]')) {
    const parent = el.parentElement && el.parentElement.closest('[data-key]');
    items.set(el.dataset.key, { el, rect: el.getBoundingClientRect(), parentKey: parent && container.contains(parent) ? parent.dataset.key : null });
  }
  return { items, scrollY: window.scrollY };
}

export function playLayout(container, snapshot) {
  if (!snapshot) return;
  const reduced = reducedMotion();
  const now = new Map();
  for (const el of container.querySelectorAll('[data-key]')) now.set(el.dataset.key, el);

  for (const [key, info] of snapshot.items) {
    if (now.has(key) || (info.parentKey && !now.has(info.parentKey))) continue; // still here, or its parent leaves as a whole
    ghostOut(info, snapshot.scrollY, reduced);
  }

  const deltas = new Map();
  for (const [key, el] of now) {
    const old = snapshot.items.get(key);
    if (old) deltas.set(key, old.rect.top + snapshot.scrollY - (el.getBoundingClientRect().top + window.scrollY));
  }
  for (const [key, el] of now) {
    const parent = el.parentElement && el.parentElement.closest('[data-key]');
    const parentKey = parent && container.contains(parent) ? parent.dataset.key : null;
    if (!snapshot.items.has(key)) {
      if (!parentKey || snapshot.items.has(parentKey)) enter(el, { y: 0 });
      continue;
    }
    let dy = deltas.get(key);
    if (parentKey && deltas.has(parentKey)) dy -= deltas.get(parentKey); // the parent already moves it
    if (reduced || Math.abs(dy) < 1) continue;
    play(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: duration('base'), easing: ease('out'), channel: 'layout' });
  }
}

/** A see-through copy of a removed element that collapses quickly where the element used to be. */
function ghostOut(info, scrollY, reduced) {
  const { el, rect } = info;
  if (!rect.width || !rect.height) return;
  const ghost = el.cloneNode(true);
  for (const node of [ghost, ...ghost.querySelectorAll('[id], [data-key]')]) {
    node.removeAttribute('id');
    node.removeAttribute('data-key');
  }
  ghost.classList.add('ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${rect.left + window.scrollX}px`,
    top: `${rect.top + scrollY}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    transformOrigin: 'top',
  });
  document.body.append(ghost);
  const swiped = el.classList.contains('is-open') || el.classList.contains('is-removing');
  let frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleY(0.2)' }];
  if (reduced) frames = [{ opacity: 1 }, { opacity: 0 }];
  else if (swiped) frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-30%) scaleY(0.4)' }];
  play(ghost, frames, { duration: reduced ? 100 : duration('base'), easing: ease('in'), fill: 'forwards', channel: 'ghost' }).then(() => ghost.remove());
}

/** Remove one element with a quick collapse, and move its siblings into the gap. */
export async function removeWithFlip(el) {
  const parent = el.parentElement;
  if (!parent) return;
  const siblings = [...parent.children].filter((child) => child !== el);
  const before = new Map(siblings.map((child) => [child, child.getBoundingClientRect().top]));
  await play(el, reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleY(0.2)' }], {
    duration: duration('fast'),
    easing: ease('in'),
    fill: 'forwards',
    channel: 'remove',
  });
  el.remove();
  if (reducedMotion()) return;
  for (const child of siblings) {
    const dy = before.get(child) - child.getBoundingClientRect().top;
    if (Math.abs(dy) >= 1) play(child, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: duration('base'), easing: ease('out'), channel: 'layout' });
  }
}

/* ------------------------------ page changes ------------------------------ */

/**
 * Change the screen with a very short crossfade (about 120 ms). Uses the
 * browser's View Transitions when available (Safari 18+, recent Chrome);
 * otherwise the new screen fades in.
 */
export function pageTransition(update, direction, main) {
  if (typeof document.startViewTransition === 'function' && !document.hidden) {
    root.dataset.navDir = direction;
    try {
      const transition = document.startViewTransition(update);
      // If the browser cuts a transition short (e.g. the app goes to the background),
      // that's harmless: the new screen is drawn anyway. Don't report it as an error.
      const ignore = () => {};
      transition.ready.catch(ignore);
      transition.updateCallbackDone.catch(ignore);
      transition.finished.catch(ignore).finally(() => {
        if (root.dataset.navDir === direction) delete root.dataset.navDir;
      });
      return;
    } catch {
      delete root.dataset.navDir;
    }
  }
  update();
  slideIn(main, direction);
}

/** The fallback screen change, also used when a list changes period: a quick fade with a tiny nudge. */
export function slideIn(el, direction = 'forward') {
  if (reducedMotion()) return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), channel: 'page' });
  const x = direction === 'back' ? -6 : 6;
  return play(el, [{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: duration('page'), easing: ease('out'), channel: 'page' });
}

/* ------------------------------ function keys ------------------------------ */

/**
 * Move the inverted amber highlight (.nav-indicator) to the lit key, quickly.
 * Returns the newly lit key if it changed.
 */
export function moveNavIndicator(nav, { animate = true } = {}) {
  const indicator = nav && nav.querySelector('.nav-indicator');
  if (!indicator) return null;
  const visible = [...nav.querySelectorAll('.nav-item')].filter((item) => item.getClientRects().length);
  const lit = visible.find((item) => item.getAttribute('aria-current') === 'page') || visible.find((item) => item.classList.contains('is-parent'));
  if (!lit) {
    indicator.classList.remove('is-ready');
    return null;
  }
  const target = lit.dataset.route || lit.dataset.action;
  const changed = indicator.dataset.target !== target;
  const instant = !animate || !indicator.classList.contains('is-ready') || reducedMotion();
  if (instant) indicator.style.transition = 'none';
  indicator.style.width = `${lit.offsetWidth}px`;
  indicator.style.height = `${lit.offsetHeight}px`;
  indicator.style.transform = `translate(${lit.offsetLeft}px, ${lit.offsetTop}px)`;
  indicator.dataset.target = target;
  if (instant) {
    void indicator.getBoundingClientRect();
    indicator.style.removeProperty('transition');
  }
  indicator.classList.add('is-ready');
  return changed && !instant ? lit : null;
}

/* ------------------------------ windows ------------------------------ */

/** Opening a window: a quick fade with a tiny lift (forms) or a tiny scale (dialogs). */
export function openDialogAnimation(dialog, kind) {
  if (reducedMotion()) return play(dialog, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), channel: 'open' });
  const from = kind === 'sheet' && !wideQuery.matches ? 'translateY(12px)' : kind === 'sheet' ? 'translateY(6px)' : 'scale(0.98)';
  return play(dialog, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: duration('sheet'), easing: ease('out'), channel: 'open' });
}

/**
 * Close a window right away (so it can never block taps), and let a
 * see-through copy fade out in its place. `velocity` (px/ms) comes from a
 * drag-to-dismiss, so a fast flick also leaves fast.
 */
export function closeDialogAnimated(dialog, kind, { velocity = 0 } = {}) {
  if (!dialog.open) return;
  const rect = dialog.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'ghost-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const backdrop = document.createElement('div');
  backdrop.className = 'ghost-backdrop';
  const panel = document.createElement('div');
  panel.className = `${dialog.className} ghost-panel`;
  for (const child of dialog.childNodes) panel.append(child.cloneNode(true));
  for (const node of panel.querySelectorAll('[id]')) node.removeAttribute('id');
  const offset = dialog.style.transform || 'none'; // where a drag left it
  Object.assign(panel.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', transform: 'none' });
  layer.append(backdrop, panel);
  document.body.append(layer);
  if (typeof layer.showPopover === 'function') {
    try {
      layer.popover = 'manual'; // puts the copy above any other open window
      layer.showPopover();
    } catch {
      /* not important */
    }
  }
  const scroller = dialog.querySelector('.sheet-body');
  const copyScroller = panel.querySelector('.sheet-body');
  if (scroller && copyScroller) copyScroller.scrollTop = scroller.scrollTop;

  dialog.close();

  const reduced = reducedMotion();
  const ms = reduced || velocity <= 0.3 ? duration('fast') : 80;
  let panelFrames = [{ opacity: 1 }, { opacity: 0 }];
  if (!reduced) {
    const to = kind === 'sheet' && !wideQuery.matches ? 'translateY(16px)' : 'scale(0.98)';
    panelFrames = [{ opacity: 1, transform: offset === 'none' ? 'none' : offset }, { opacity: 0, transform: to }];
  }
  const remove = () => layer.remove();
  Promise.all([
    play(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' }),
    play(panel, panelFrames, { duration: ms, easing: ease('in'), fill: 'forwards' }),
  ]).then(remove);
  setTimeout(remove, 600); // safety net
}
