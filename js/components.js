// -----------------------------------------------------------------------------
// components.js — screen pieces used by several screens: headers, cards,
// money text, progress bars, the period picker, expense rows and the
// bucket ("pos") editor.
// -----------------------------------------------------------------------------

import { h, icon, uniqueId, openDialog, alertDialog, makeSwipeable } from './ui.js';
import { formatRupiah, formatPeriod } from './format.js';
import { getPeriod, previousPeriod, nextPeriod, percentTotal } from './logic.js';
import { barTransform } from './motion.js';

/**
 * Give an element a stable key (data-key). When a screen is redrawn after a
 * change, keyed elements slide to their new place, new ones fade in and removed
 * ones fade out (see motion.js playLayout). Keys must be unique on a screen.
 */
export function keyed(el, key) {
  el.dataset.key = key;
  return el;
}

/** Title (and optional subtitle and buttons) at the top of a screen. */
export function screenHeader(title, subtitle = null, actions = null) {
  return h(
    'header',
    { class: 'screen-header' },
    h('div', { class: 'screen-heading' }, h('h1', { class: 'screen-title', text: title }), subtitle ? h('p', { class: 'screen-subtitle', text: subtitle }) : null),
    actions ? h('div', { class: 'screen-actions' }, actions) : null,
  );
}

/** A white box with an optional title. */
export function card(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', { class: 'card-title', text: title }) : null, children);
}

/**
 * An amount in Rupiah; negative amounts are shown in red.
 * With a countKey, the amount counts smoothly from its last shown value when it changes.
 */
export function money(amount, className = '', countKey = null) {
  return h(
    'span',
    {
      class: `money${amount < 0 ? ' is-negative' : ''}${className ? ` ${className}` : ''}`,
      'data-count-key': countKey,
      'data-value': countKey ? String(amount) : null,
    },
    formatRupiah(amount),
  );
}

/** Plan status as a colored pill: 'aman' → Aman, 'waspada' → Waspada, 'tidak-cukup' → Tidak cukup. */
export function statusBadge(status) {
  const labels = { aman: 'Aman', waspada: 'Waspada', 'tidak-cukup': 'Tidak cukup' };
  return h('span', { class: `status-badge status-${status}` }, labels[status] || status);
}

/** A friendly message for empty lists, with an optional button. */
export function emptyState(message, action = null) {
  return h('div', { class: 'empty' }, h('p', { text: message }), action);
}

/** A colored notice box. kind: 'info' | 'success' | 'warning' | 'danger'. */
export function notice(kind, content, action = null) {
  const iconName = { info: 'info', success: 'check' }[kind] || 'alert';
  return h('div', { class: `notice notice-${kind}`, role: kind === 'danger' ? 'alert' : null }, icon(iconName), h('div', { class: 'notice-text' }, content), action);
}

/** How full a meter is (0..2) and its color state: '' (fine), 'is-warning' (90%+), 'is-over' (over). */
function meterState(used, allocation) {
  let ratio = 0;
  if (allocation > 0) ratio = used / allocation;
  else if (used > 0) ratio = 2; // nothing allocated but something used: over budget
  return { ratio: Math.max(0, ratio), state: ratio > 1 ? 'is-over' : ratio >= 0.9 ? 'is-warning' : '' };
}

/**
 * Progress bar for "used out of allocation". Turns orange near the limit and
 * red when over. With a `key`, it fills smoothly on open and on change.
 */
export function progressBar(used, allocation, label, key = null) {
  const { ratio, state } = meterState(used, allocation);
  const fill = h('div', { class: `bar-fill${state ? ` ${state}` : ''}`, style: `transform: ${barTransform(ratio)}` });
  return h('div', { class: 'bar', role: 'img', 'aria-label': label, 'data-bar-key': key, 'data-ratio': String(Math.min(1, ratio)), 'data-state': state }, fill);
}

/** A small round progress ring (e.g. "spent today out of today's allowance"). */
export function ring(used, allocation, label, key = null) {
  const { ratio, state } = meterState(used, allocation);
  const radius = 20;
  const length = (2 * Math.PI * radius).toFixed(2);
  const shown = Math.min(1, ratio);
  const el = h('div', { class: `ring${state ? ` ${state}` : ''}`, role: 'img', 'aria-label': label, 'data-ring-key': key, 'data-ratio': String(shown), 'data-state': state });
  el.innerHTML = `<svg viewBox="0 0 48 48" focusable="false" aria-hidden="true"><circle class="ring-track" cx="24" cy="24" r="${radius}"/><circle class="ring-fill" cx="24" cy="24" r="${radius}" stroke-dasharray="${length}" stroke-dashoffset="${(length * (1 - shown)).toFixed(2)}"/></svg>`;
  return el;
}

/** One bucket with its progress bar and numbers (used on Beranda and Ringkasan). */
export function bucketStatus(report, keyPrefix = 'b') {
  const over = report.remaining < 0;
  return h(
    'li',
    { class: 'bucket-item', 'data-key': `${keyPrefix}:${report.id}` },
    h(
      'div',
      { class: 'bucket-head' },
      h('span', { class: 'bucket-name', text: report.name }),
      h('span', { class: `tag${report.spendable ? '' : ' tag-muted'}`, text: report.spendable ? 'Bisa dipakai' : 'Disimpan' }),
    ),
    progressBar(report.used, report.allocation, `${report.name}: terpakai ${formatRupiah(report.used)} dari ${formatRupiah(report.allocation)}`, `${keyPrefix}:${report.id}`),
    h(
      'div',
      { class: 'bucket-numbers' },
      h('span', null, 'Terpakai ', money(report.used), ' dari ', money(report.allocation)),
      h('span', { class: `bucket-remaining${over ? ' is-negative' : ''}` }, 'Sisa ', money(report.remaining), over ? ' · Melebihi anggaran' : ''),
    ),
    report.recurring > 0 ? h('p', { class: 'hint' }, `Termasuk pengeluaran rutin ${formatRupiah(report.recurring)}`) : null,
  );
}

/**
 * A tappable row for one expense (tap = edit). With onDelete, the row can be
 * swiped left to reveal "Hapus" (the edit form also has a delete button, for
 * desktop and accessibility).
 */
export function expenseRow(expense, data, onOpen, onDelete = null) {
  const bucket = data.buckets.find((b) => b.id === expense.bucketId);
  const wallet = data.wallets.find((w) => w.id === expense.walletId);
  const bucketName = bucket ? bucket.name : 'Tanpa pos';
  const title = expense.note || bucketName;
  const content = h(
    'button',
    { type: 'button', class: `row row-button${onDelete ? ' swipe-content' : ''}`, onclick: () => onOpen(expense) },
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title', text: title }),
      h('span', { class: 'row-sub', text: `${expense.note ? `${bucketName} · ` : ''}${wallet ? wallet.name : 'Tanpa dompet'}` }),
    ),
    h('span', { class: 'row-amount', text: formatRupiah(expense.amount) }),
  );
  if (!onDelete) return h('li', { 'data-key': `e:${expense.id}` }, content);

  const action = h(
    'button',
    { type: 'button', class: 'swipe-action', 'aria-label': `Hapus pengeluaran ${title} ${formatRupiah(expense.amount)}` },
    icon('trash'),
    h('span', null, 'Hapus'),
  );
  const row = h('li', { class: 'swipe-row', 'data-key': `e:${expense.id}` }, action, content);
  makeSwipeable(row, content);
  action.addEventListener('click', () => {
    row.classList.add('is-removing'); // the row slides away as it disappears
    onDelete(expense);
  });
  return row;
}

/** Sort helper: newest date first, then the most recently entered first. */
export function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
}

/**
 * The period picker ("‹ 25 Sep – 24 Okt 2026 ›") shared by Pengeluaran,
 * Dompet and Ringkasan. The chosen period is remembered in ctx.ui.periodStart.
 * Returns { period, current, element }.
 */
export function periodControls(ctx) {
  const { data, today, ui } = ctx;
  const incomeDay = data.settings.incomeDay;
  const current = getPeriod(today, incomeDay);
  const period = ui.periodStart ? getPeriod(ui.periodStart, incomeDay) : current;

  // You can go forward up to the current period, or further if there are planned expenses.
  let lastDate = current.start;
  for (const e of data.expenses) if (e.date > lastDate) lastDate = e.date;
  const lastStart = getPeriod(lastDate, incomeDay).start;
  const isCurrent = period.start === current.start;

  const show = (p) => {
    const direction = p.start < period.start ? 'back' : 'forward';
    ui.periodStart = p.start === current.start ? null : p.start;
    ctx.refresh({ slide: direction }); // the list slides in from the side you are moving to
  };

  const element = h(
    'div',
    { class: 'period-picker' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Periode sebelumnya', onclick: () => show(previousPeriod(period, incomeDay)) }, icon('chevronLeft')),
    h(
      'div',
      { class: 'period-label' },
      h('strong', { text: formatPeriod(period) }),
      isCurrent
        ? h('span', { class: 'period-note', text: 'Periode ini' })
        : h('button', { type: 'button', class: 'link-btn', onclick: () => show(current) }, 'Kembali ke periode ini'),
    ),
    h(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': 'Periode berikutnya', disabled: period.start >= lastStart, onclick: () => show(nextPeriod(period, incomeDay)) },
      icon('chevronRight'),
    ),
  );
  return { period, current, element };
}

/* ----------------------------- bucket editor ----------------------------- */

function joinWords(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} dan ${words[words.length - 1]}`;
}

/**
 * Edit the list of buckets: name, percent, "bisa dipakai" switch; add and delete.
 * Used in the first-run setup and in Pengaturan → Pos anggaran.
 * Nothing is saved here; the screen calls getBuckets() / getReassign() and saves.
 *   usageOf(id) -> { expenses, recurring }   how many records use a bucket
 *   makeId(prefix)                           creates ids for new buckets
 */
export function bucketEditor({ buckets, usageOf = () => ({ expenses: 0, recurring: 0 }), makeId }) {
  const list = buckets.map((b) => ({ ...b }));
  const reassign = {}; // deleted bucket id -> bucket id that takes over its records
  const rows = h('div', { class: 'bucket-rows' });
  const total = h('p', { class: 'percent-total', 'aria-live': 'polite' });
  const addButton = h('button', { type: 'button', class: 'btn btn-ghost', onclick: addBucket }, icon('plus'), 'Tambah pos');
  const element = h('div', { class: 'bucket-editor' }, rows, total, addButton);

  function updateTotal() {
    const sum = percentTotal(list.map((b) => ({ percent: Number.isInteger(b.percent) ? b.percent : 0 })));
    const ok = sum === 100;
    total.className = `percent-total ${ok ? 'is-ok' : 'is-warning'}`;
    total.replaceChildren(icon(ok ? 'check' : 'alert'), ok ? `Total ${sum}%. Pas!` : `Total ${sum}%. Harus tepat 100%.`);
  }

  function row(bucket) {
    const nameInput = h('input', { type: 'text', class: 'input', value: bucket.name, maxlength: 30, placeholder: 'Nama pos', 'aria-label': 'Nama pos', autocomplete: 'off' });
    nameInput.addEventListener('input', () => {
      bucket.name = nameInput.value;
    });
    const percentInput = h('input', {
      type: 'text',
      class: 'input percent-input',
      inputmode: 'numeric',
      value: Number.isInteger(bucket.percent) ? String(bucket.percent) : '',
      'aria-label': 'Persen',
      autocomplete: 'off',
    });
    percentInput.addEventListener('input', () => {
      const digits = percentInput.value.replace(/\D/g, '').slice(0, 3);
      if (digits !== percentInput.value) percentInput.value = digits;
      bucket.percent = digits === '' ? NaN : Number(digits);
      updateTotal();
    });
    const switchId = uniqueId('spendable');
    const toggle = h('input', { type: 'checkbox', class: 'switch', id: switchId, checked: bucket.spendable });
    toggle.addEventListener('change', () => {
      bucket.spendable = toggle.checked;
    });
    return h(
      'div',
      { class: 'bucket-row' },
      h(
        'div',
        { class: 'bucket-row-top' },
        nameInput,
        h('div', { class: 'percent-field' }, percentInput, h('span', { 'aria-hidden': 'true' }, '%')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Hapus pos ini', onclick: () => removeBucket(bucket) }, icon('trash')),
      ),
      h('label', { class: 'switch-row', for: switchId }, toggle, h('span', null, 'Bisa dipakai untuk uang harian')),
    );
  }

  function draw() {
    rows.replaceChildren(...list.map(row));
    updateTotal();
  }

  function addBucket() {
    list.push({ id: makeId('pos'), name: '', percent: 0, spendable: true });
    draw();
    rows.lastElementChild.querySelector('input').focus();
  }

  // Records in this bucket, plus records of deleted buckets that were moved into it.
  function usageCount(id) {
    const ids = [id, ...Object.keys(reassign).filter((key) => reassign[key] === id)];
    return ids.reduce(
      (sum, x) => {
        const u = usageOf(x);
        return { expenses: sum.expenses + u.expenses, recurring: sum.recurring + u.recurring };
      },
      { expenses: 0, recurring: 0 },
    );
  }

  async function removeBucket(bucket) {
    if (list.length <= 1) {
      await alertDialog({ title: 'Tidak bisa dihapus', message: 'Minimal harus ada satu pos.' });
      return;
    }
    const others = list.filter((b) => b !== bucket);
    const usage = usageCount(bucket.id);
    const moving = [];
    if (Number.isInteger(bucket.percent) && bucket.percent > 0) moving.push(`persentasenya (${bucket.percent}%)`);
    if (usage.expenses) moving.push(`${usage.expenses} pengeluaran`);
    if (usage.recurring) moving.push(`${usage.recurring} pengeluaran rutin`);
    const name = bucket.name.trim() || 'tanpa nama';
    const select = h('select', { class: 'input', id: uniqueId('move-to') }, others.map((b) => h('option', { value: b.id, text: b.name.trim() || '(tanpa nama)' })));
    const body = moving.length
      ? [h('p', { text: `Pos "${name}" akan dihapus. ${joinWords(moving)} akan dipindahkan ke pos lain.` }), h('div', { class: 'field' }, h('label', { class: 'field-label', for: select.id }, 'Pindahkan ke'), select)]
      : [h('p', { text: `Pos "${name}" akan dihapus.` })];
    const answer = await openDialog({
      title: 'Hapus pos?',
      body,
      buttons: [
        { label: 'Hapus', value: 'ok', kind: 'danger-solid' },
        { label: 'Batal', value: 'cancel', autofocus: true },
      ],
    });
    if (answer !== 'ok') return;
    const target = others.find((b) => b.id === select.value) || others[0];
    if (Number.isInteger(bucket.percent)) target.percent = (Number.isInteger(target.percent) ? target.percent : 0) + bucket.percent;
    for (const key of Object.keys(reassign)) if (reassign[key] === bucket.id) reassign[key] = target.id;
    reassign[bucket.id] = target.id;
    list.splice(list.indexOf(bucket), 1);
    draw();
  }

  draw();
  return {
    element,
    getBuckets: () => list.map((b) => ({ ...b })),
    getReassign: () => ({ ...reassign }),
  };
}
