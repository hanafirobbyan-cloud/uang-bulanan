// -----------------------------------------------------------------------------
// components.js — screen pieces used by several screens: the screen header,
// numbered panels ("[1] AMAN HARI INI"), money text, thin progress bars, the
// period picker, expense table rows and the bucket ("pos") editor.
// -----------------------------------------------------------------------------

import { h, icon, uniqueId, openDialog, alertDialog, makeSwipeable } from './ui.js';
import { formatRupiah, formatPeriod, formatDateShort } from './format.js';
import { getPeriod, previousPeriod, nextPeriod, percentTotal, periodStartDay } from './logic.js';
import { commandForRoute } from './commands.js';
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

/** Title (and optional subtitle and buttons) at the top of a screen: "BER  BERANDA". */
export function screenHeader(title, subtitle = null, actions = null) {
  const command = commandForRoute(document.body.dataset.route || '');
  return h(
    'header',
    { class: 'screen-header' },
    h(
      'div',
      { class: 'screen-heading' },
      h('h1', { class: 'screen-title' }, command ? h('span', { class: 'screen-code', 'aria-hidden': 'true' }, command.code) : null, h('span', null, title)),
      subtitle ? h('p', { class: 'screen-subtitle', text: subtitle }) : null,
    ),
    actions ? h('div', { class: 'screen-actions' }, actions) : null,
  );
}

let panelNumber = 0;

/** Start numbering panels from [1] again (called before every screen is drawn). */
export function resetPanels() {
  panelNumber = 0;
}

/** A panel: a black box with a 1px border and a numbered title strip ("[1] TITLE"). */
export function card(title, ...children) {
  let bar = null;
  if (title) {
    panelNumber += 1;
    bar = h('h2', { class: 'card-title' }, h('span', { class: 'panel-no', 'aria-hidden': 'true' }, `[${panelNumber}]`), h('span', null, title));
  }
  return h('section', { class: 'card' }, bar, h('div', { class: 'card-body' }, children));
}

/**
 * An amount in Rupiah. Negative amounts are red with "▼" in front (so it never
 * depends on color alone). With a countKey, the amount counts to its new value
 * and flashes green/red like a market tick when it changes. `polarity: 'down'`
 * means a higher number is worse (e.g. money spent).
 */
export function money(amount, className = '', countKey = null, polarity = 'up') {
  return h(
    'span',
    {
      class: `money${amount < 0 ? ' is-negative' : ''}${className ? ` ${className}` : ''}`,
      'data-count-key': countKey,
      'data-value': countKey ? String(amount) : null,
      'data-polarity': countKey && polarity === 'down' ? 'down' : null,
    },
    formatRupiah(amount),
  );
}

/** Plan status as a tag: 'aman' → AMAN, 'waspada' → WASPADA, 'tidak-cukup' → TIDAK CUKUP. */
export function statusBadge(status) {
  const labels = { aman: '▲ Aman', waspada: '■ Waspada', 'tidak-cukup': '▼ Tidak cukup' };
  return h('span', { class: `status-badge status-${status}` }, labels[status] || status);
}

/** A calm message for empty lists, with an optional button. */
export function emptyState(message, action = null) {
  return h('div', { class: 'empty' }, h('p', { text: message }), action);
}

/** A notice line. kind: 'info' | 'success' | 'warning' | 'danger'. It starts with a text tag, never color alone. */
export function notice(kind, content, action = null) {
  const tags = { info: 'INFO', success: 'OK', warning: 'AWAS', danger: 'STOP' };
  return h(
    'div',
    { class: `notice notice-${kind}`, role: kind === 'danger' ? 'alert' : null },
    h('span', { class: 'notice-tag', 'aria-hidden': 'true' }, tags[kind] || tags.info),
    h('div', { class: 'notice-text' }, content),
    action,
  );
}

/** How full a meter is (0..2) and its color state: '' (fine), 'is-warning' (90%+), 'is-over' (over). */
function meterState(used, allocation) {
  let ratio = 0;
  if (allocation > 0) ratio = used / allocation;
  else if (used > 0) ratio = 2; // nothing allocated but something used: over budget
  return { ratio: Math.max(0, ratio), state: ratio > 1 ? 'is-over' : ratio >= 0.9 ? 'is-warning' : '' };
}

/**
 * A thin progress bar for "used out of allocation": green, yellow near the
 * limit (90%+), red when over. With a `key`, it fills on open and on change.
 * `tone: 'amber'` is for neutral progress (e.g. money received so far).
 */
export function progressBar(used, allocation, label, key = null, tone = null) {
  const { ratio, state } = tone ? { ratio: allocation > 0 ? Math.max(0, used / allocation) : 0, state: '' } : meterState(used, allocation);
  const fill = h('div', { class: `bar-fill${state ? ` ${state}` : ''}${tone ? ` is-${tone}` : ''}`, style: `transform: ${barTransform(ratio)}` });
  return h('div', { class: 'bar', role: 'img', 'aria-label': label, 'data-bar-key': key, 'data-ratio': String(Math.min(1, ratio)), 'data-state': state }, fill);
}

/** A short meter with its percentage beside it (instead of a ring), e.g. "spent today out of today's allowance". */
export function meter(used, allocation, label, key = null) {
  const percent = allocation > 0 ? Math.round((Math.max(0, used) / allocation) * 100) : used > 0 ? 100 : 0;
  return h('span', { class: 'meter' }, progressBar(used, allocation, label, key), h('span', { class: 'meter-value', 'aria-hidden': 'true' }, `${percent}%`));
}

/**
 * One bucket with its bar and numbers (Beranda and Ringkasan).
 * With `now: true` the bar uses the money that has arrived so far
 * (allocationNow); the whole month's amount is shown beside it.
 */
export function bucketStatus(report, keyPrefix = 'b', { now = false } = {}) {
  const allocation = now ? report.allocationNow : report.allocation;
  const remaining = now ? report.remainingNow : report.remaining;
  const over = remaining < 0;
  const partial = now && report.allocationNow !== report.allocation;
  return h(
    'li',
    { class: 'bucket-item', 'data-key': `${keyPrefix}:${report.id}` },
    h(
      'div',
      { class: 'bucket-head' },
      h('span', { class: 'bucket-name', text: report.name }),
      h('span', { class: 'bucket-percent', text: `${report.percent}%` }),
      h('span', { class: `tag${report.spendable ? '' : ' tag-muted'}`, text: report.spendable ? 'Harian' : 'Disimpan' }),
    ),
    progressBar(report.used, allocation, `${report.name}: terpakai ${formatRupiah(report.used)} dari ${formatRupiah(allocation)}`, `${keyPrefix}:${report.id}`),
    h(
      'div',
      { class: 'bucket-numbers' },
      h('span', null, money(report.used), ' / ', money(allocation), partial ? h('small', null, ` (sebulan ${formatRupiah(report.allocation)})`) : null),
      h('span', { class: `bucket-remaining${over ? ' is-negative' : ''}` }, 'Sisa ', money(remaining), over ? ' · Melebihi anggaran' : ''),
    ),
    report.recurring > 0 ? h('p', { class: 'hint' }, `Termasuk pengeluaran rutin ${formatRupiah(report.recurring)}`) : null,
  );
}

/** The column titles above an expense table (shown on wide screens; phones use two-line rows). */
export function expenseTableHead() {
  return h(
    'li',
    { class: 'table-head', 'aria-hidden': 'true' },
    h('span', { class: 'col-date' }, 'Tgl'),
    h('span', { class: 'col-pos' }, 'Pos'),
    h('span', { class: 'col-wallet' }, 'Dompet'),
    h('span', { class: 'col-note' }, 'Catatan'),
    h('span', { class: 'col-amount' }, 'Nominal'),
  );
}

/**
 * A table row for one expense: TGL | POS | DOMPET | CATATAN | NOMINAL (tap or
 * Enter = edit). With onDelete, the row can be swiped left to reveal "Hapus"
 * (the edit form also has a delete button, for desktop and accessibility).
 */
export function expenseRow(expense, data, onOpen, onDelete = null) {
  const bucket = data.buckets.find((b) => b.id === expense.bucketId);
  const wallet = data.wallets.find((w) => w.id === expense.walletId);
  const bucketName = bucket ? bucket.name : 'Tanpa pos';
  const walletName = wallet ? wallet.name : 'Tanpa dompet';
  const title = expense.note || bucketName;
  const content = h(
    'button',
    {
      type: 'button',
      class: `row row-button expense-row${onDelete ? ' swipe-content' : ''}`,
      'aria-label': `${formatDateShort(expense.date, true)}, ${bucketName}, ${walletName}${expense.note ? `, ${expense.note}` : ''}, ${formatRupiah(expense.amount)}`,
      onclick: () => onOpen(expense),
    },
    h('span', { class: 'col-date' }, formatDateShort(expense.date)),
    h('span', { class: 'col-pos', text: bucketName }),
    h('span', { class: 'col-wallet', text: walletName }),
    h('span', { class: `col-note${expense.note ? '' : ' is-empty'}`, text: expense.note || '—' }),
    h('span', { class: 'col-amount', text: formatRupiah(expense.amount) }),
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
    row.classList.add('is-removing'); // the row collapses as it disappears
    onDelete(expense);
  });
  return row;
}

/** Sort helper: newest date first, then the most recently entered first. */
export function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
}

/**
 * The period picker ("◀ 25 SEP – 24 OKT 2026 ▶") shared by Pengeluaran,
 * Dompet and Ringkasan. The chosen period is remembered in ctx.ui.periodStart.
 * Returns { period, current, element }.
 */
export function periodControls(ctx) {
  const { data, today, ui } = ctx;
  const startDay = periodStartDay(data);
  const current = getPeriod(today, startDay);
  const period = ui.periodStart ? getPeriod(ui.periodStart, startDay) : current;

  // You can go forward up to the current period, or further if there are planned expenses.
  let lastDate = current.start;
  for (const e of data.expenses) if (e.date > lastDate) lastDate = e.date;
  const lastStart = getPeriod(lastDate, startDay).start;
  const isCurrent = period.start === current.start;

  const show = (p) => {
    const direction = p.start < period.start ? 'back' : 'forward';
    ui.periodStart = p.start === current.start ? null : p.start;
    ctx.refresh({ slide: direction }); // the list changes in the direction you are moving
  };

  const element = h(
    'div',
    { class: 'period-picker' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Periode sebelumnya', onclick: () => show(previousPeriod(period, startDay)) }, icon('chevronLeft')),
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
      { type: 'button', class: 'icon-btn', 'aria-label': 'Periode berikutnya', disabled: period.start >= lastStart, onclick: () => show(nextPeriod(period, startDay)) },
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
    total.replaceChildren(ok ? `▲ Total ${sum}%. Pas!` : `▼ Total ${sum}%. Harus tepat 100%.`);
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
