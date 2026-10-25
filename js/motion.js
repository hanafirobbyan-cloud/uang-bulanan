// -----------------------------------------------------------------------------
// motion.js — the one place for animations, so they feel the same everywhere.
//
// Rules (please keep them):
//   * Speeds and curves come from the CSS variables in css/app.css
//     (--dur-*, --ease-*). Change them there to tune the whole app.
//   * Only transform and opacity are animated (cheap for the phone's GPU).
//   * Every animation can be interrupted: starting a new one on the same
//     element/channel stops the old one, and nothing ever waits forever
//     (there is always a timeout), so taps can never get stuck.
//   * With "Reduce Motion" (iPhone: Settings → Accessibility → Motion),
//     movement becomes a quick fade and counting numbers jump straight to the result.
// -----------------------------------------------------------------------------

import { formatRupiah } from './format.js';

const root = document.documentElement;
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const wideQuery = window.matchMedia('(min-width: 640px)');

/** True when the user asked the system for less motion. */
export const reducedMotion = () => reducedQuery.matches;

/* ------------------------------ tokens ------------------------------ */

const FALLBACK = {
  '--ease-out': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--ease-in': 'cubic-bezier(0.32, 0, 0.67, 0)',
  '--ease-spring': 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  '--ease-bounce': 'cubic-bezier(0.34, 1.5, 0.64, 1)',
  '--dur-press': '90ms',
  '--dur-fast': '160ms',
  '--dur-base': '240ms',
  '--dur-page': '320ms',
  '--dur-sheet': '480ms',
  '--dur-slow': '700ms',
};
const tokens = new Map();
reducedQuery.addEventListener?.('change', () => tokens.clear()); // values change with "Reduce Motion"

/** Read a motion setting from the CSS variables (cached). */
function token(name) {
  if (!tokens.has(name)) tokens.set(name, getComputedStyle(root).getPropertyValue(name).trim() || FALLBACK[name]);
  return tokens.get(name);
}

/** A curve by name: 'out' (moving), 'in' (leaving), 'spring' (soft overshoot), 'bounce' (playful). */
export const ease = (name) => token(`--ease-${name}`);

/** A duration in milliseconds by name: 'press', 'fast', 'base', 'page', 'sheet', 'slow'. */
export const duration = (name) => parseFloat(token(`--dur-${name}`)) || 200;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------ playing ------------------------------ */

const running = new WeakMap(); // element -> Map(channel -> Animation)

/**
 * Animate an element with the Web Animations API.
 * Stops an older animation on the same element + channel first (interruptible).
 * Returns a promise that always resolves (never rejects, never hangs).
 */
export function play(el, keyframes, { duration: ms = 240, easing = ease('out'), delay = 0, fill = 'none', channel = 'main' } = {}) {
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

/** Fade and slide an element in. */
export function enter(el, { delay = 0, y = 10, scale = 1 } = {}) {
  if (reducedMotion()) return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), fill: 'backwards', channel: 'enter' });
  return play(el, [{ opacity: 0, transform: `translateY(${y}px) scale(${scale})` }, { opacity: 1, transform: 'none' }], {
    duration: duration('page'),
    easing: ease('out'),
    delay,
    fill: 'backwards',
    channel: 'enter',
  });
}

/** Let a list of elements come in one after another (only the first `max`, to stay quick). */
export function stagger(elements, { step = 28, max = 10, start = 0, y = 8 } = {}) {
  if (reducedMotion()) return;
  elements.slice(0, max).forEach((el, i) => enter(el, { delay: start + i * step, y }));
}

/** A gentle "no" shake, e.g. for an invalid input. */
export function shake(el) {
  if (!el) return Promise.resolve();
  if (reducedMotion()) return play(el, [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 240, channel: 'shake' });
  return play(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], {
    duration: 380,
    easing: 'ease-out',
    channel: 'shake',
  });
}

/** A small springy "pop" (e.g. a tab icon when it gets selected). */
export function pop(el, amount = 0.14) {
  if (!el || reducedMotion()) return Promise.resolve();
  return play(el, [{ transform: 'scale(1)' }, { transform: `scale(${1 - amount})` }, { transform: 'scale(1)' }], { duration: 420, easing: ease('bounce'), channel: 'pop' });
}

/** Draw attention once without being annoying (used for "Melebihi anggaran"). */
export function attention(el) {
  if (!el) return;
  if (reducedMotion()) {
    play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), channel: 'attention' });
    return;
  }
  play(el, [{ transform: 'scale(0.85)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: ease('bounce'), channel: 'attention' }).then(() =>
    play(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-in-out', delay: 180, channel: 'attention' }),
  );
}

/* ------------------------------ counting numbers ------------------------------ */

const lastValues = new Map(); // count key -> last shown value

/** Count a number from one value to another, e.g. Rp 160.000 → Rp 135.000. Always ends on the exact value. */
export function countNumber(el, from, to, format = formatRupiah) {
  if (reducedMotion() || document.hidden) {
    el.textContent = format(to);
    return;
  }
  const ms = Math.min(900, 420 + Math.log10(Math.abs(to - from) + 1) * 50);
  const start = performance.now();
  el.textContent = format(from);
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    if (el.isConnected) el.textContent = format(to); // safety net: exact final value
  }, ms + 200);
}

/**
 * After a screen is drawn: numbers marked with data-count-key="…" and
 * data-value="…" count from the value shown last time to the new one.
 * When a number turns negative, it pulses once.
 */
export function animateNumbers(container) {
  for (const el of container.querySelectorAll('[data-count-key]')) {
    const key = el.dataset.countKey;
    const to = Number(el.dataset.value);
    const from = lastValues.get(key);
    lastValues.set(key, to);
    if (from === undefined || from === to || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    countNumber(el, from, to);
    if (from >= 0 && to < 0 && !reducedMotion()) {
      play(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 520, easing: ease('bounce'), delay: 120, channel: 'pulse' });
    }
  }
}

/* ------------------------------ state changes ------------------------------ */

const lastStates = new Map(); // state key -> last state

/**
 * Elements marked with data-state-key="…" and data-state="on|off" animate
 * when their state changes compared to the last time they were shown:
 *   .hero-tint fades in/out (e.g. the red glow when over budget),
 *   anything else gets attention() when it turns "on".
 */
export function animateStates(container) {
  for (const el of container.querySelectorAll('[data-state-key]')) {
    const key = el.dataset.stateKey;
    const state = el.dataset.state;
    const previous = lastStates.get(key);
    lastStates.set(key, state);
    if (previous === state) continue;
    if (el.classList.contains('hero-tint')) {
      if (previous === undefined) continue;
      const on = state === 'on';
      play(el, [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: duration('slow'), easing: ease('out'), channel: 'tint' });
    } else if (state === 'on') {
      attention(el);
    }
  }
}

/* ------------------------------ bars and rings ------------------------------ */

const lastBars = new Map(); // bar key -> { ratio, state }

/** The transform that shows a bar filled to `ratio` (0..1). A sliding fill keeps the round ends round. */
export const barTransform = (ratio) => `translateX(${(Math.min(1, Math.max(0, ratio)) - 1) * 100}%)`;

/**
 * Progress bars (.bar[data-bar-key]) and rings (.ring[data-ring-key]) fill
 * smoothly: from empty when a screen opens, from the old value when data changes.
 * Color changes (green → orange → red) fade.
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
    if (previous && previous.state !== state && !entering) fadeStateClass(fill, previous.state, state);
    const from = entering || !previous ? 0 : previous.ratio;
    if (reduced || Math.abs(from - to) < 0.001) continue;
    play(fill, [{ transform: barTransform(from) }, { transform: barTransform(to) }], {
      duration: duration('slow'),
      easing: ease('out'),
      delay: entering ? 120 : 0,
      fill: 'backwards',
      channel: 'meter',
    });
  }
  for (const ring of container.querySelectorAll('[data-ring-key]')) {
    const arc = ring.querySelector('.ring-fill');
    const key = `ring:${ring.dataset.ringKey}`;
    const to = Number(ring.dataset.ratio) || 0;
    const state = ring.dataset.state || '';
    const previous = lastBars.get(key);
    lastBars.set(key, { ratio: to, state });
    if (!arc) continue;
    if (previous && previous.state !== state && !entering) fadeStateClass(ring, previous.state, state, 'ring');
    const from = entering || !previous ? 0 : previous.ratio;
    if (reduced || Math.abs(from - to) < 0.001) continue;
    const length = Number(arc.getAttribute('stroke-dasharray'));
    // stroke-dashoffset only repaints this tiny circle; it does not move anything else on the page.
    play(arc, [{ strokeDashoffset: length * (1 - from) }, { strokeDashoffset: length * (1 - to) }], {
      duration: duration('slow'),
      easing: ease('out'),
      delay: entering ? 150 : 0,
      fill: 'backwards',
      channel: 'meter',
    });
  }
}

/** Show the old color class for one frame, then switch, so the CSS color transition runs. */
function fadeStateClass(el, oldState, newState, base = 'bar-fill') {
  const keep = [...el.classList].filter((c) => c !== newState && c !== oldState && c.startsWith(base));
  el.className = [...keep, oldState].filter(Boolean).join(' ');
  void el.getBoundingClientRect(); // let the browser see the old color first
  el.className = [...keep, newState].filter(Boolean).join(' ');
}

/* ------------------------------ lists (FLIP) ------------------------------ */

/**
 * Before a screen is redrawn after a data change: remember where every
 * element with data-key="…" was. playLayout() then makes the redraw smooth:
 * moved items slide to their new place, new items fade in, removed items fade
 * out while the rest of the list slides up to close the gap.
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
      if (!parentKey || snapshot.items.has(parentKey)) enter(el, { y: 6, scale: 0.98 });
      continue;
    }
    let dy = deltas.get(key);
    if (parentKey && deltas.has(parentKey)) dy -= deltas.get(parentKey); // the parent already moves it
    if (reduced || Math.abs(dy) < 1) continue;
    play(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: duration('page'), easing: ease('out'), channel: 'layout' });
  }
}

/** A see-through copy of a removed element that fades away where the element used to be. */
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
  });
  document.body.append(ghost);
  const swiped = el.classList.contains('is-open') || el.classList.contains('is-removing');
  let frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }];
  if (reduced) frames = [{ opacity: 1 }, { opacity: 0 }];
  else if (swiped) frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-35%)' }];
  play(ghost, frames, { duration: reduced ? 120 : 240, easing: ease('in'), fill: 'forwards', channel: 'ghost' }).then(() => ghost.remove());
}

/** Remove one element with an animation, and slide its siblings into the gap. */
export async function removeWithFlip(el) {
  const parent = el.parentElement;
  if (!parent) return;
  const siblings = [...parent.children].filter((child) => child !== el);
  const before = new Map(siblings.map((child) => [child, child.getBoundingClientRect().top]));
  await play(el, reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.95)' }], {
    duration: reducedMotion() ? 120 : duration('fast'),
    easing: ease('in'),
    fill: 'forwards',
    channel: 'remove',
  });
  el.remove();
  if (reducedMotion()) return;
  for (const child of siblings) {
    const dy = before.get(child) - child.getBoundingClientRect().top;
    if (Math.abs(dy) >= 1) play(child, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: duration('page'), easing: ease('out'), channel: 'layout' });
  }
}

/* ------------------------------ page changes ------------------------------ */

/**
 * Change the page with a smooth transition. Uses the browser's View
 * Transitions when available (Safari 18+, recent Chrome); otherwise the new
 * page slides in. direction: 'forward' (slides left) or 'back' (slides right).
 */
export function pageTransition(update, direction, main) {
  if (typeof document.startViewTransition === 'function' && !document.hidden) {
    root.dataset.navDir = direction;
    try {
      const transition = document.startViewTransition(update);
      // If the browser cuts a transition short (e.g. the app goes to the background),
      // that's harmless: the new page is drawn anyway. Don't report it as an error.
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

/** The fallback page animation: fade in with a small slide in the direction of travel. */
export function slideIn(el, direction = 'forward') {
  if (reducedMotion()) return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), channel: 'page' });
  const x = direction === 'back' ? -24 : 24;
  return play(el, [{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: duration('page'), easing: ease('out'), channel: 'page' });
}

/* ------------------------------ tab bar ------------------------------ */

/**
 * Glide the tab bar's highlight (.nav-indicator) to the selected tab.
 * Returns the newly selected tab if it changed (so its icon can pop).
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
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const insetX = wide ? 0 : 4;
  const insetY = wide ? 0 : 6;
  const x = lit.offsetLeft + insetX;
  const y = lit.offsetTop + insetY;
  const changed = indicator.dataset.target !== lit.dataset.route;
  const instant = !animate || !indicator.classList.contains('is-ready') || reducedMotion();
  if (instant) indicator.style.transition = 'none';
  indicator.style.width = `${lit.offsetWidth - insetX * 2}px`;
  indicator.style.height = `${lit.offsetHeight - insetY * 2}px`;
  indicator.style.transform = `translate(${x}px, ${y}px)`;
  indicator.dataset.target = lit.dataset.route;
  if (instant) {
    void indicator.getBoundingClientRect();
    indicator.style.removeProperty('transition');
  }
  indicator.classList.add('is-ready');
  return changed && !instant ? lit : null;
}

/* ------------------------------ dialogs and sheets ------------------------------ */

/** Opening animation: sheets slide up from the bottom with a spring, dialogs scale in from 96%. */
export function openDialogAnimation(dialog, kind) {
  if (reducedMotion()) return play(dialog, [{ opacity: 0 }, { opacity: 1 }], { duration: duration('fast'), channel: 'open' });
  if (kind === 'sheet' && !wideQuery.matches) {
    return play(dialog, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: duration('sheet'), easing: ease('spring'), channel: 'open' });
  }
  const from = kind === 'sheet' ? 'translateY(24px) scale(0.98)' : 'scale(0.96)';
  return play(dialog, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: kind === 'sheet' ? 340 : 240, easing: ease('out'), channel: 'open' });
}

/**
 * Close a dialog right away (so it can never block taps), and let a
 * see-through copy animate out in its place. `velocity` (px/ms) comes from a
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
  const fade = reduced ? duration('fast') : kind === 'sheet' ? 260 : 180;
  let panelFrames;
  let panelMs = fade;
  let panelEase = ease('in');
  if (reduced) {
    panelFrames = [{ opacity: 1 }, { opacity: 0 }];
  } else if (kind === 'sheet' && !wideQuery.matches) {
    const distance = Math.max(0, window.innerHeight - rect.top);
    panelMs = Math.max(160, Math.min(320, distance / Math.max(velocity, distance / 300)));
    panelEase = velocity > 0.3 ? 'cubic-bezier(0.2, 0.6, 0.4, 1)' : ease('in');
    panelFrames = [{ transform: 'translateY(0)' }, { transform: `translateY(${distance}px)` }];
  } else {
    panelFrames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: kind === 'sheet' ? 'translateY(16px) scale(0.98)' : 'scale(0.96)' }];
  }
  const remove = () => layer.remove();
  Promise.all([
    play(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: Math.max(fade, panelMs), easing: 'ease-out', fill: 'forwards' }),
    play(panel, panelFrames, { duration: panelMs, easing: panelEase, fill: 'forwards' }),
  ]).then(remove);
  setTimeout(remove, 800); // safety net
}
