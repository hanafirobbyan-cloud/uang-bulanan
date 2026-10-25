// -----------------------------------------------------------------------------
// ui.js — small helpers for building the screen: elements, icons, dialogs,
// sheets, toasts, money inputs, choice "chips", segmented controls, steppers
// and swipe-to-delete rows. Nothing here knows about budgets.
// Animations come from motion.js.
// -----------------------------------------------------------------------------

import { formatNumber, parseMoney } from './format.js';
import { play, stop, shake, pop, ease, duration, openDialogAnimation, closeDialogAnimated } from './motion.js';

/* ------------------------------- elements ------------------------------- */

/**
 * Create an element, e.g. h('button', { class: 'btn', onclick: save }, 'Simpan').
 * Props:
 *   class, text, dataset, style – as you would expect
 *   onclick / oninput / ...     – event listeners
 *   value, checked              – set as properties (after children, so <select> works)
 *   anything else               – set as an attribute (true = empty attribute)
 * Props that are null, undefined or false are skipped.
 * Children can be text, elements, arrays, or null (skipped).
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  let value;
  let checked;
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val === null || val === undefined || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'text') el.textContent = val;
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key === 'value') value = val;
      else if (key === 'checked') checked = val;
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  appendChildren(el, children);
  if (value !== undefined) el.value = value;
  if (checked !== undefined) el.checked = Boolean(checked);
  return el;
}

function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else parent.append(child instanceof Node ? child : String(child));
  }
}

/**
 * Add children to an element, skipping null/false (unlike the built-in
 * element.append, which would show the word "null"). Screens use this.
 */
export function append(parent, ...children) {
  appendChildren(parent, children);
}

let idCounter = 0;
/** A unique id for linking labels and inputs, e.g. 'pos-12'. */
export function uniqueId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/* -------------------------------- icons -------------------------------- */
// Simple line icons (24×24). Drawn here so the app needs no external files.

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>',
  chart: '<path d="M11 4.1A8 8 0 1 0 19.9 13H11z"/><path d="M14 3.5a7.5 7.5 0 0 1 6.5 6.5H14z"/>',
  wallet: '<path d="M18 7V5.5A1.5 1.5 0 0 0 16.5 4H6a3 3 0 0 0-3 3"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M21 11h-4a2 2 0 0 0 0 4h4"/>',
  repeat: '<path d="m17 2 3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plan: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  share: '<path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M8 11H6v9h12v-9h-2"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
};

/** An icon as a <span> (hidden from screen readers; always put a text label next to it). */
export function icon(name, className = 'icon') {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[name] || ''}</svg>`;
  return span;
}

/* -------------------------------- toasts -------------------------------- */

function checkMark() {
  const span = document.createElement('span');
  span.className = 'toast-check';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><circle cx="12" cy="12" r="11"/><path d="m7 12.5 3.2 3.2L17 8.8"/></svg>';
  return span;
}

/** Make sure the toast area is shown on top of everything (it is a "popover" where supported). */
function showToastArea(region) {
  if (typeof region.showPopover !== 'function' || !region.hasAttribute('popover')) return;
  requestAnimationFrame(() => {
    try {
      const open = region.matches(':popover-open');
      // A window that is just animating away may cover the toasts: bring them back on top.
      if (open && document.querySelector('.ghost-layer')) region.hidePopover();
      if (!region.matches(':popover-open')) region.showPopover();
    } catch {
      /* not important */
    }
  });
}

/**
 * A short message that slides in at the bottom. kind: 'info' | 'success' | 'error'.
 * Success messages get an animated checkmark. With `action` ({ label, onClick }),
 * the toast gets a button, e.g. "Urungkan" (undo).
 */
export function toast(message, kind = 'info', { action = null, ms = null } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  while (region.children.length >= 2) region.firstElementChild.remove(); // never more than 2 on screen
  let timer = null;
  const item = h(
    'div',
    { class: `toast toast-${kind}${action ? ' has-action' : ''}`, role: kind === 'error' ? 'alert' : null },
    kind === 'success' ? checkMark() : null,
    h('span', { class: 'toast-text' }, message),
    action
      ? h(
          'button',
          {
            type: 'button',
            class: 'toast-action',
            onclick: () => {
              dismiss();
              action.onClick();
            },
          },
          action.label,
        )
      : null,
  );
  function dismiss() {
    clearTimeout(timer);
    if (item.classList.contains('is-leaving')) return;
    item.classList.add('is-leaving');
    setTimeout(() => {
      item.remove();
      if (!region.children.length && region.hasAttribute('popover')) {
        try {
          region.hidePopover();
        } catch {
          /* not important */
        }
      }
    }, 240);
  }
  region.append(item);
  showToastArea(region);
  timer = setTimeout(dismiss, ms ?? (action ? 5000 : kind === 'error' ? 5000 : 2600));
}

/** Turn any error into a message for the user. Unexpected errors are logged for debugging. */
export function errorMessage(error) {
  if (error && error.name === 'UserError') return error.message;
  console.error(error);
  return 'Terjadi kesalahan. Coba lagi.';
}

/* -------------------------------- dialogs -------------------------------- */

let openCount = 0;

function showModal(dialog) {
  document.body.append(dialog);
  openCount += 1;
  document.documentElement.classList.add('has-dialog'); // stops the page behind from scrolling
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.documentElement.classList.remove('has-dialog');
    },
    { once: true },
  );
  dialog.showModal();
}

const asParagraphs = (message) =>
  (Array.isArray(message) ? message : [message]).filter(Boolean).map((m) => (m instanceof Node ? m : h('p', { text: m })));

/**
 * A small window with a title, content and buttons. It scales in, and fades
 * out when closed. Resolves with the `value` of the pressed button ('' when
 * closed with Esc or a tap outside).
 * buttons: [{ label, value, kind: 'primary' | 'danger-solid' | ..., autofocus }]
 *   Put the main button FIRST: it is the one used when Enter is pressed, and
 *   the styling shows it on the right.
 * validate(value): optional; return an error message to keep the window open.
 */
export function openDialog({ title, body = [], buttons = [{ label: 'OK', value: 'ok', kind: 'primary' }], validate = null }) {
  return new Promise((resolve) => {
    const titleId = uniqueId('dialog-title');
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const form = h(
      'form',
      { class: 'dialog-form', novalidate: true },
      h('h2', { class: 'dialog-title', id: titleId, text: title }),
      h('div', { class: 'dialog-body' }, asParagraphs(body), error),
      h(
        'div',
        { class: 'dialog-actions' },
        buttons.map((b) =>
          h('button', { type: 'submit', value: b.value, class: `btn ${b.kind ? `btn-${b.kind}` : ''}`, autofocus: b.autofocus || null }, b.label),
        ),
      ),
    );
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId }, form);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeDialogAnimated(dialog, 'dialog');
      resolve(value);
    };
    form.addEventListener('input', () => {
      error.hidden = true; // the user is fixing it
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = event.submitter ? event.submitter.value : buttons[0].value;
      if (validate && value !== 'cancel') {
        const message = validate(value);
        if (message) {
          error.textContent = message;
          error.hidden = false;
          shake(error);
          return;
        }
      }
      finish(value);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault(); // Esc: close with the animation
      finish('');
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(''); // a tap on the dark area outside
    });
    dialog.addEventListener('close', () => {
      if (!settled) {
        settled = true;
        resolve('');
      }
    });
    showModal(dialog);
    openDialogAnimation(dialog, 'dialog');
  });
}

/** Ask a yes/no question. Resolves true if confirmed. */
export async function confirmDialog({ title, message, confirmLabel = 'Ya', cancelLabel = 'Batal', danger = false }) {
  const value = await openDialog({
    title,
    body: message,
    buttons: [
      { label: confirmLabel, value: 'ok', kind: danger ? 'danger-solid' : 'primary' },
      { label: cancelLabel, value: 'cancel', autofocus: danger }, // for risky actions the safe button is focused
    ],
  });
  return value === 'ok';
}

/** Show a message with one button. */
export async function alertDialog({ title, message, buttonLabel = 'Mengerti' }) {
  await openDialog({ title, body: message, buttons: [{ label: buttonLabel, value: 'ok', kind: 'primary' }] });
}

/**
 * Drag the sheet down by its top bar to close it (like iOS).
 * Pulling up resists (rubber band); a quick flick or a long drag closes it.
 */
function enableDragToDismiss(dialog, handle, close) {
  let pointerId = null;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let dragging = false;
  const offsetFor = (dy) => (dy >= 0 ? dy : -Math.min(40, Math.sqrt(-dy) * 4));

  handle.addEventListener('pointerdown', (event) => {
    if (event.button > 0 || event.target.closest('button, a, input, select, textarea')) return;
    pointerId = event.pointerId;
    startY = lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    dragging = false;
    try {
      handle.setPointerCapture(event.pointerId); // keep getting the moves, even below the bar (mouse/trackpad)
    } catch {
      /* not important */
    }
  });
  handle.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const dy = event.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < 4) return;
      dragging = true;
      stop(dialog, 'open', { keep: true }); // grab the sheet where the opening animation has it
      dialog.classList.add('is-dragging');
    }
    const dt = event.timeStamp - lastTime;
    if (dt > 0) velocity = 0.8 * ((event.clientY - lastY) / dt) + 0.2 * velocity;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    dialog.style.transform = `translateY(${offsetFor(dy)}px)`;
  });
  const finish = (event, cancelled) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    dialog.classList.remove('is-dragging');
    const dy = event.clientY - startY;
    const height = dialog.getBoundingClientRect().height;
    if (!cancelled && (dy > height * 0.28 || (velocity > 0.5 && dy > 24))) {
      close({ velocity: Math.max(0, velocity) });
      return;
    }
    const current = dialog.style.transform || 'translateY(0)';
    dialog.style.removeProperty('transform');
    play(dialog, [{ transform: current }, { transform: 'translateY(0)' }], { duration: duration('sheet'), easing: ease('spring'), channel: 'open' });
  };
  handle.addEventListener('pointerup', (event) => finish(event, false));
  handle.addEventListener('pointercancel', (event) => finish(event, true));
}

/**
 * A form window that slides up from the bottom (a centered window on big
 * screens), with "Batal" and the save button in its top bar, so they stay
 * visible above the iPhone keyboard. Drag the top bar down to close it.
 *   onSubmit(): save; throw an error to keep the sheet open and show the message.
 *   fields: { name: element } — the element to shake when an error has that field.
 * Must be called directly from a tap/click, so iOS opens the keyboard for an
 * input marked data-autofocus.
 */
export function openSheet({ title, submitLabel = 'Simpan', content = [], footer = [], onSubmit, fields = {} }) {
  const titleId = uniqueId('sheet-title');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const header = h(
    'header',
    { class: 'sheet-header' },
    h('span', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h('button', { type: 'button', class: 'btn btn-plain', onclick: () => close() }, 'Batal'),
    h('h2', { class: 'sheet-title', id: titleId, text: title }),
    h('button', { type: 'submit', class: 'btn btn-plain btn-plain-strong' }, submitLabel),
  );
  const form = h(
    'form',
    { class: 'sheet-form', novalidate: true },
    header,
    h('div', { class: 'sheet-body' }, error, content, footer.length ? h('div', { class: 'sheet-footer' }, footer) : null),
  );
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId }, form);
  let closing = false;

  function close(options = {}) {
    if (closing || !dialog.open) return;
    closing = true;
    closeDialogAnimated(dialog, 'sheet', options);
  }
  function showError(message, fieldName = null) {
    error.textContent = message;
    error.hidden = false;
    error.scrollIntoView({ block: 'nearest' });
    shake(fields[fieldName] || error);
  }

  form.addEventListener('input', () => {
    error.hidden = true; // the user is fixing it
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (closing) return;
    try {
      onSubmit();
      close();
    } catch (err) {
      showError(errorMessage(err), err && err.field);
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault(); // Esc: close with the animation
    close();
  });

  showModal(dialog);
  // Focus before the slide-up starts, so the iPhone keyboard opens without the page jumping.
  const first = dialog.querySelector('[data-autofocus]');
  if (first) first.focus({ preventScroll: true });
  openDialogAnimation(dialog, 'sheet');
  enableDragToDismiss(dialog, header, close);
  return { close, showError, dialog };
}

/* ------------------------------ form parts ------------------------------ */

/** Re-format a money input as the user types: '1500000' -> '1.500.000', keeping the cursor in place. */
function reformatMoney(input) {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;
  let digits = raw.replace(/,\d{1,2}$/, '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits.length > 10) digits = digits.slice(0, 10);
  const text = digits ? formatNumber(Number(digits)) : '';
  if (text === raw) return;
  input.value = text;
  let position = 0;
  for (let seen = 0; position < text.length && seen < Math.min(digitsBeforeCaret, digits.length); position++) {
    if (/\d/.test(text[position])) seen++;
  }
  try {
    input.setSelectionRange(position, position);
  } catch {
    /* some browsers don't allow this; not important */
  }
}

/**
 * A Rupiah input with the number keypad and thousand separators.
 * Returns { element, input, getValue(), setValue(n) } — getValue() gives a number or null.
 */
export function moneyInput({ value = null, id = uniqueId('money'), placeholder = '0', label = null, autofocus = false, large = false, onInput = null } = {}) {
  const input = h('input', {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    class: 'money-input',
    id,
    placeholder,
    'aria-label': label,
    'data-autofocus': autofocus || null,
  });
  if (Number.isInteger(value)) input.value = formatNumber(value);
  input.addEventListener('input', () => {
    reformatMoney(input);
    if (onInput) onInput(parseMoney(input.value));
  });
  const element = h('div', { class: `money-field${large ? ' money-field-large' : ''}` }, h('span', { class: 'money-prefix', 'aria-hidden': 'true' }, 'Rp'), input);
  return {
    element,
    input,
    getValue: () => parseMoney(input.value),
    setValue: (n) => {
      input.value = Number.isInteger(n) ? formatNumber(n) : '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
}

/**
 * A group of big tappable choices (radio buttons that look like pills).
 * options: [{ value, label }]. Returns { element, value } (value = chosen value or null).
 */
export function chipGroup({ legend, options, value = null, onChange = null }) {
  const name = uniqueId('choice');
  const list = h('div', { class: 'chip-list' });
  for (const option of options) {
    const input = h('input', { type: 'radio', name, value: option.value, checked: option.value === value });
    if (onChange) input.addEventListener('change', () => onChange(option.value));
    list.append(h('label', { class: 'chip' }, input, h('span', null, option.label)));
  }
  const element = h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, legend), list);
  return {
    element,
    get value() {
      const chosen = list.querySelector('input:checked');
      return chosen ? chosen.value : null;
    },
  };
}

/**
 * An iOS-style segmented control: one choice out of a few, with a sliding highlight.
 * options: [{ value, label }]. Returns { element, value }.
 */
export function segmented({ label, options, value = null, onChange = null }) {
  const name = uniqueId('segment');
  const start = Math.max(0, options.findIndex((o) => o.value === value));
  const element = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label, style: `--count: ${options.length}; --index: ${start}` },
    h('span', { class: 'segmented-indicator', 'aria-hidden': 'true' }),
  );
  options.forEach((option, index) => {
    const input = h('input', { type: 'radio', name, value: option.value, checked: index === start });
    input.addEventListener('change', () => {
      element.style.setProperty('--index', String(index));
      if (onChange) onChange(option.value);
    });
    element.append(h('label', { class: 'segmented-option' }, input, h('span', null, option.label)));
  });
  return {
    element,
    get value() {
      const chosen = element.querySelector('input:checked');
      return chosen ? chosen.value : null;
    },
  };
}

/** A − value + stepper. format(value) gives the text in the middle. Returns { element, value }. */
export function stepper({ value, min, max, step, format, label, onChange = null }) {
  let current = value;
  const output = h('output', { class: 'stepper-value', 'aria-live': 'polite' }, format(current));
  const minus = h('button', { type: 'button', 'aria-label': `Kurangi ${label}` }, '−');
  const plus = h('button', { type: 'button', 'aria-label': `Tambah ${label}` }, '+');
  const refresh = () => {
    output.textContent = format(current);
    minus.disabled = current <= min;
    plus.disabled = current >= max;
  };
  const change = (next) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === current) return;
    current = clamped;
    refresh();
    pop(output, 0.1);
    if (onChange) onChange(current);
  };
  minus.addEventListener('click', () => change(current - step));
  plus.addEventListener('click', () => change(current + step));
  refresh();
  return {
    element: h('div', { class: 'stepper', role: 'group', 'aria-label': label }, minus, output, plus),
    get value() {
      return current;
    },
  };
}

/** A part of a form that smoothly opens and closes (height animates without jank). */
export function expandable(content, open = false) {
  const inner = h('div', { class: 'expand-inner' }, h('div', { class: 'expand-pad' }, content));
  const element = h('div', { class: `expand${open ? ' is-open' : ''}` }, inner);
  inner.inert = !open; // closed parts can't be focused
  return {
    element,
    setOpen(next) {
      element.classList.toggle('is-open', next);
      inner.inert = !next;
    },
  };
}

/** A labelled form field. `control` is the input (give it an id that matches `forId`). */
export function field({ label, control, hint = null, forId = null }) {
  return h('div', { class: 'field' }, h('label', { class: 'field-label', for: forId }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
}

/* ------------------------------ swipe rows ------------------------------ */

const ACTION_WIDTH = 88;
let openRow = null; // only one row is swiped open at a time

/** Close the row that is swiped open, if any. */
export function closeOpenRow() {
  if (openRow) openRow.close();
}

// Scrolling or tapping somewhere else closes an open row (like iOS).
window.addEventListener('scroll', closeOpenRow, { passive: true });
document.addEventListener(
  'pointerdown',
  (event) => {
    if (openRow && !openRow.row.contains(event.target)) openRow.close();
  },
  true,
);

/**
 * iOS-style swipe left on a list row to reveal its action button (e.g. "Hapus").
 * `row` contains the action (behind) and `content` (in front, the part that moves).
 * A tap on an open row just closes it. Vertical swipes still scroll the page.
 */
export function makeSwipeable(row, content) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let offset = 0;
  let decided = false;
  let dragging = false;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let suppressClick = false;

  const setOffset = (x) => {
    offset = x;
    if (x) content.style.transform = `translateX(${x}px)`;
    else content.style.removeProperty('transform');
  };
  const api = {
    row,
    close: () => settle(0),
  };
  function settle(to) {
    const from = offset;
    setOffset(to);
    row.classList.toggle('is-open', to !== 0);
    if (to !== 0) {
      if (openRow && openRow !== api) openRow.close();
      openRow = api;
    } else if (openRow === api) {
      openRow = null;
    }
    if (Math.abs(from - to) > 1) {
      play(content, [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: duration('page'), easing: ease('spring'), channel: 'swipe' });
    }
  }

  content.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    suppressClick = false; // a new touch is a real tap, not the end of a swipe
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = event.clientY;
    startOffset = offset;
    lastTime = event.timeStamp;
    velocity = 0;
    decided = false;
    dragging = false;
  });
  content.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided = true;
      dragging = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!dragging) {
        pointerId = null; // up/down: let the page scroll
        return;
      }
      try {
        content.setPointerCapture(event.pointerId);
      } catch {
        /* not important */
      }
      stop(content, 'swipe');
      row.classList.add('is-swiping');
      if (openRow && openRow !== api) openRow.close();
    }
    const dt = event.timeStamp - lastTime;
    if (dt > 0) velocity = 0.8 * ((event.clientX - lastX) / dt) + 0.2 * velocity;
    lastX = event.clientX;
    lastTime = event.timeStamp;
    let x = startOffset + dx;
    if (x > 0) x = Math.min(24, x * 0.25); // rubber band to the right
    else if (x < -ACTION_WIDTH) x = -ACTION_WIDTH + (x + ACTION_WIDTH) * 0.35; // rubber band past the button
    setOffset(x);
  });
  const end = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    row.classList.remove('is-swiping');
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 350);
    const open = (offset < -ACTION_WIDTH / 2 && velocity < 0.4) || velocity < -0.45;
    settle(open ? -ACTION_WIDTH : 0);
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', end);
  // Runs before the row's own click (which opens the edit form).
  content.addEventListener(
    'click',
    (event) => {
      if (!suppressClick && offset === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!suppressClick) settle(0); // a tap on an open row closes it
    },
    true,
  );
  return api;
}
