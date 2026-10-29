// -----------------------------------------------------------------------------
// terminal.js — the terminal frame around every screen:
//   * the status bar: calculation mode, ONLINE/OFFLINE and a live WIB clock
//     (it ticks every second only while the app is visible)
//   * the command line: type a short code ("BER") and press Enter or GO, with
//     suggestions while typing; focus it with "/" or Cmd/Ctrl+K, Esc clears it
//   * the ticker tape with today's key numbers
//   * the "LAIN" menu with every screen, and the F1–F8 keys
//   * arrow keys to move through list rows (Enter opens the row)
// The codes themselves are in commands.js.
// -----------------------------------------------------------------------------

import { COMMANDS, findCommand, suggestCommands, commandForKey } from './commands.js';
import { nowTime } from './clock.js';
import { dailyBudget, addDays } from './logic.js';
import { formatRupiah, formatDelta, formatDateShort } from './format.js';
import { reducedMotion } from './motion.js';
import { h, openDialog } from './ui.js';

let runCommand = () => {};

/* ------------------------------ status bar ------------------------------ */

function startClock() {
  const clock = document.getElementById('sb-clock');
  if (!clock) return;
  let timer = 0;
  const tick = () => {
    clock.textContent = `${nowTime()} WIB`;
  };
  const sync = () => {
    clearInterval(timer);
    timer = 0;
    if (document.visibilityState !== 'visible') return;
    tick();
    timer = setInterval(tick, 1000);
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}

function startNetworkIndicator() {
  const el = document.getElementById('sb-net');
  if (!el) return;
  const show = () => {
    const online = navigator.onLine !== false;
    el.textContent = online ? '● ONLINE' : '○ OFFLINE';
    el.classList.toggle('is-offline', !online);
    el.title = online ? 'Tersambung ke internet' : 'Tanpa internet. Aplikasi tetap jalan; data tersimpan di perangkat ini.';
  };
  window.addEventListener('online', show);
  window.addEventListener('offline', show);
  show();
}

/* ------------------------------ command line ------------------------------ */

function setupCommandLine() {
  const form = document.getElementById('cmdline');
  const input = document.getElementById('cmd');
  const list = document.getElementById('cmd-list');
  const message = document.getElementById('cmd-msg');
  if (!form || !input || !list) return;
  let items = [];
  let active = -1;

  // The block cursor sits after the typed text (monospace: 1 character = 1ch).
  const moveCursor = () => {
    const position = input.selectionStart ?? input.value.length;
    form.style.setProperty('--caret', String(Math.min(position, 24)));
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const showMessage = (text) => {
    message.textContent = text;
    message.hidden = !text;
  };

  const render = () => {
    items = suggestCommands(input.value);
    if (!items.length || document.activeElement !== input) {
      close();
      return;
    }
    active = Math.min(active, items.length - 1);
    list.replaceChildren(
      ...items.map((c, i) =>
        h(
          'li',
          { id: `cmd-opt-${c.code}`, role: 'option', class: `cmd-option${i === active ? ' is-active' : ''}`, 'aria-selected': i === active ? 'true' : 'false', 'data-code': c.code },
          h('span', { class: 'cmd-code' }, c.code),
          h('span', { class: 'cmd-name' }, c.name),
          c.key ? h('kbd', null, c.key) : null,
        ),
      ),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `cmd-opt-${items[active].code}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const run = (command) => {
    input.value = '';
    moveCursor();
    close();
    showMessage('');
    input.blur(); // phones: the keyboard goes away
    runCommand(command);
  };

  input.addEventListener('input', () => {
    active = -1;
    showMessage('');
    moveCursor();
    render();
  });
  input.addEventListener('focus', () => {
    moveCursor();
    render();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  for (const type of ['keyup', 'click', 'select']) input.addEventListener(type, moveCursor);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) render();
      if (!items.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + items.length) % items.length;
      render();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = '';
      showMessage('');
      close();
      input.blur();
    }
  });

  // pointerdown (not click) so the choice is made before the input loses focus.
  list.addEventListener('pointerdown', (event) => {
    const option = event.target.closest('[data-code]');
    if (!option) return;
    event.preventDefault();
    run(findCommand(option.dataset.code));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const typed = input.value.trim();
    const command = (active >= 0 && items[active]) || findCommand(typed) || (typed && items.length === 1 ? items[0] : null);
    if (command) {
      run(command);
      return;
    }
    showMessage(typed ? `Perintah tidak dikenal: ${typed.toUpperCase()}. Contoh: BER, KLR, MSK.` : 'Ketik kode, misalnya BER (Beranda) atau MSK (Jadwal Uang Masuk).');
    if (typed) input.select();
    else input.focus();
  });
}

/** Put the cursor in the command line (from "/" or Cmd/Ctrl+K). */
export function focusCommandLine() {
  const input = document.getElementById('cmd');
  if (input && !input.closest('[hidden]')) input.focus();
}

/* ------------------------------ LAIN menu ------------------------------ */

/** The full list of screens and actions in a terminal window. */
export async function openMenu() {
  const buttons = COMMANDS.filter((c) => c.code !== 'LAIN').map((c) =>
    h(
      'button',
      { type: 'submit', class: 'menu-item', value: c.code },
      h('span', { class: 'cmd-code' }, c.code),
      h('span', { class: 'cmd-name' }, c.name),
      c.key ? h('kbd', null, c.key) : null,
    ),
  );
  const listEl = h('div', { class: 'menu-list', role: 'group', 'aria-label': 'Semua menu' }, buttons);
  listEl.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  setTimeout(() => buttons[0] && buttons[0].focus(), 0);
  const code = await openDialog({ title: 'Semua menu', body: [listEl], buttons: [{ label: 'Tutup', value: 'cancel' }] });
  const command = code && code !== 'cancel' ? findCommand(code) : null;
  if (command) runCommand(command);
}

/* ------------------------------ ticker tape ------------------------------ */

let tickerKey = '';

/** The scrolling line of key numbers, green ▲ / red ▼. Updated after every redraw. */
export function updateTicker(data, today) {
  const track = document.getElementById('ticker-track');
  if (!track || !data.setupDone) return;
  const now = dailyBudget(data, today);
  const yesterday = dailyBudget(data, addDays(today, -1));
  const next = now.incomeStatus.next;
  const sign = (n) => (n < 0 ? 'down' : 'up');
  const items = [
    { label: 'Sisa hari ini', value: formatRupiah(now.sisaHariIni), dir: sign(now.sisaHariIni) },
    { label: 'Aman hari ini', value: formatRupiah(now.amanHariIni), dir: now.amanHariIni >= yesterday.amanHariIni ? 'up' : 'down', delta: formatDelta(now.amanHariIni - yesterday.amanHariIni) },
    { label: 'Uang di tangan', value: formatRupiah(now.cashOnHand), dir: now.cashOnHand >= yesterday.cashOnHand ? 'up' : 'down', delta: formatDelta(now.cashOnHand - yesterday.cashOnHand) },
    next
      ? { label: 'Uang masuk berikut', value: `${formatDateShort(next.date).toUpperCase()} ${formatRupiah(next.amount)}`, dir: 'info', delta: `H-${next.daysUntil}` }
      : { label: 'Uang masuk berikut', value: 'semua sudah masuk', dir: 'info' },
    { label: 'Total bulan', value: formatRupiah(now.income), dir: 'flat' },
  ];
  const key = JSON.stringify(items);
  if (key === tickerKey) return;
  tickerKey = key;
  const group = () =>
    h(
      'div',
      { class: 'ticker-group' },
      items.map((item) =>
        h(
          'span',
          { class: `tick is-${item.dir}` },
          h('span', { class: 'tick-label' }, item.label),
          h('span', { class: 'tick-value' }, item.value),
          item.dir === 'up' || item.dir === 'down' ? h('span', { class: 'tick-arrow' }, item.dir === 'up' ? '▲' : '▼') : null,
          item.delta ? h('span', { class: 'tick-delta' }, item.delta) : null,
        ),
      ),
    );
  track.replaceChildren(group(), group()); // two copies: the loop is seamless
  // Slow and steady: about 40 px per second, whatever the length.
  requestAnimationFrame(() => {
    const width = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width : 0;
    if (width) track.style.setProperty('--ticker-duration', `${Math.max(20, Math.round(width / 40))}s`);
  });
}

function setupTicker() {
  const ticker = document.getElementById('ticker');
  if (!ticker) return;
  // Pause while touched (hover pauses it in CSS).
  ticker.addEventListener('pointerdown', () => ticker.classList.add('is-paused'));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) ticker.addEventListener(type, () => ticker.classList.remove('is-paused'));
}

/** The status bar's mode label. */
export function updateStatusBar(data) {
  const el = document.getElementById('sb-mode');
  if (el) el.textContent = data.settings.calcMode === 'total' ? 'MODE TOTAL' : 'MODE HATI-HATI';
}

/* ------------------------------ keyboard ------------------------------ */

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function setupKeyboard() {
  document.addEventListener('keydown', (event) => {
    const dialogOpen = document.documentElement.classList.contains('has-dialog');
    const target = event.target;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      if (dialogOpen) return;
      event.preventDefault();
      focusCommandLine();
      return;
    }
    if (event.key === '/' && !isTyping(target) && !dialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      focusCommandLine();
      return;
    }
    if (/^F[1-8]$/.test(event.key) && !dialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const command = commandForKey(event.key);
      if (command && !document.body.dataset.route?.startsWith('setup')) {
        event.preventDefault(); // where the browser allows it (some F-keys belong to the browser)
        runCommand(command);
      }
      return;
    }
    // Arrow keys move through list rows on the screen; Enter opens the focused row.
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !dialogOpen && target && target.matches && target.matches('.main .row-button, .main .inst-action')) {
      const rows = [...document.querySelectorAll('.main .row-button')].filter((el) => el.getClientRects().length);
      const index = rows.indexOf(target);
      if (index < 0) return;
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
        next.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    }
  });
}

/* ------------------------------ start ------------------------------ */

/** Keep --head-h (the height of the top bars) exact, so the left column of keys sits right below them. */
function trackHeaderHeight() {
  const head = document.querySelector('.term-head');
  if (!head || typeof ResizeObserver !== 'function') return;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--head-h', `${Math.round(head.getBoundingClientRect().height)}px`);
  }).observe(head);
}

/**
 * Wire up the frame. `run(command)` opens a screen or does an action
 * (see COMMANDS in commands.js); it is given by app.js.
 */
export function setupTerminal({ run }) {
  runCommand = run;
  trackHeaderHeight();
  startClock();
  startNetworkIndicator();
  setupCommandLine();
  setupTicker();
  setupKeyboard();
}
