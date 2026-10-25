// -----------------------------------------------------------------------------
// components.js — screen pieces used by several screens: headers, cards,
// money text, progress bars, the period picker, expense rows and the
// bucket ("pos") editor.
// -----------------------------------------------------------------------------

import { h, icon, uniqueId, openDialog, alertDialog } from './ui.js';
import { formatRupiah, formatPeriod } from './format.js';
import { getPeriod, previousPeriod, nextPeriod, percentTotal } from './logic.js';

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

/** An amount in Rupiah; negative amounts are shown in red. */
export function money(amount, className = '') {
  return h('span', { class: `money${amount < 0 ? ' is-negative' : ''}${className ? ` ${className}` : ''}` }, formatRupiah(amount));
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

/** Progress bar for "used out of allocation". Turns orange near the limit and red when over. */
export function progressBar(used, allocation, label) {
  let ratio = 0;
  if (allocation > 0) ratio = used / allocation;
  else if (used > 0) ratio = 2; // nothing allocated but something used: over budget
  const width = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const state = ratio > 1 ? ' is-over' : ratio >= 0.9 ? ' is-warning' : '';
  return h('div', { class: 'bar', role: 'img', 'aria-label': label }, h('div', { class: `bar-fill${state}`, style: `width: ${width}%` }));
}

/** One bucket with its progress bar and numbers (used on Beranda and Ringkasan). */
export function bucketStatus(report) {
  const over = report.remaining < 0;
  return h(
    'li',
    { class: 'bucket-item' },
    h(
      'div',
      { class: 'bucket-head' },
      h('span', { class: 'bucket-name', text: report.name }),
      h('span', { class: `tag${report.spendable ? '' : ' tag-muted'}`, text: report.spendable ? 'Bisa dipakai' : 'Disimpan' }),
    ),
    progressBar(report.used, report.allocation, `${report.name}: terpakai ${formatRupiah(report.used)} dari ${formatRupiah(report.allocation)}`),
    h(
      'div',
      { class: 'bucket-numbers' },
      h('span', null, 'Terpakai ', money(report.used), ' dari ', money(report.allocation)),
      h('span', { class: `bucket-remaining${over ? ' is-negative' : ''}` }, 'Sisa ', money(report.remaining), over ? ' · Melebihi anggaran' : ''),
    ),
    report.recurring > 0 ? h('p', { class: 'hint' }, `Termasuk pengeluaran rutin ${formatRupiah(report.recurring)}`) : null,
  );
}

/** A tappable row for one expense. */
export function expenseRow(expense, data, onOpen) {
  const bucket = data.buckets.find((b) => b.id === expense.bucketId);
  const wallet = data.wallets.find((w) => w.id === expense.walletId);
  const bucketName = bucket ? bucket.name : 'Tanpa pos';
  return h(
    'li',
    null,
    h(
      'button',
      { type: 'button', class: 'row row-button', onclick: () => onOpen(expense) },
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title', text: expense.note || bucketName }),
        h('span', { class: 'row-sub', text: `${expense.note ? `${bucketName} · ` : ''}${wallet ? wallet.name : 'Tanpa dompet'}` }),
      ),
      h('span', { class: 'row-amount', text: formatRupiah(expense.amount) }),
    ),
  );
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
    ui.periodStart = p.start === current.start ? null : p.start;
    ctx.refresh();
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
