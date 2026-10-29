// Pengeluaran: all expenses of a period in one table, newest first, with filters.

import { append, h, icon } from '../ui.js';
import { screenHeader, card, money, emptyState, expenseRow, expenseTableHead, newestFirst, periodControls, keyed } from '../components.js';
import { expensesForPeriod, recurringForPeriod } from '../logic.js';
import { formatDayHeading, formatRupiah } from '../format.js';
import { openExpenseForm, deleteExpenseWithUndo } from './expense-form.js';

export const title = 'Pengeluaran';

const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

export function render(main, ctx) {
  const { data, today, ui } = ctx;
  const { period, element: picker } = periodControls(ctx);

  // Forget filters that point to a deleted bucket or wallet.
  if (ui.filters.bucketId && !data.buckets.some((b) => b.id === ui.filters.bucketId)) ui.filters.bucketId = '';
  if (ui.filters.walletId && !data.wallets.some((w) => w.id === ui.filters.walletId)) ui.filters.walletId = '';

  const all = expensesForPeriod(data.expenses, period);
  const shown = all
    .filter((e) => (!ui.filters.bucketId || e.bucketId === ui.filters.bucketId) && (!ui.filters.walletId || e.walletId === ui.filters.walletId))
    .sort(newestFirst);
  const recurringTotal = sum(recurringForPeriod(data.recurring, period));
  const filtered = Boolean(ui.filters.bucketId || ui.filters.walletId);

  const addButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'klr-add', onclick: () => openExpenseForm(ctx) }, icon('plus'), 'Catat');

  const filterSelect = (label, key, allLabel, options) => {
    const select = h(
      'select',
      { class: 'input', 'aria-label': label, value: ui.filters[key] },
      h('option', { value: '' }, allLabel),
      options.map((o) => h('option', { value: o.id }, o.name)),
    );
    select.addEventListener('change', () => {
      ui.filters[key] = select.value;
      ctx.refresh();
    });
    return select;
  };

  append(
    main,
    keyed(screenHeader('Pengeluaran', null, addButton), 'header'),
    keyed(picker, 'picker'),
    h(
      'div',
      { class: 'filters', 'data-key': 'filters' },
      filterSelect('Saring menurut pos', 'bucketId', 'Semua pos', data.buckets),
      filterSelect('Saring menurut dompet', 'walletId', 'Semua dompet', data.wallets),
    ),
    h(
      'p',
      { class: 'list-summary', 'data-key': 'summary' },
      `${shown.length} pengeluaran · total `,
      money(sum(shown)),
      recurringTotal > 0 && !filtered ? h('span', { class: 'muted' }, ` · ditambah rutin ${formatRupiah(recurringTotal)}`) : null,
    ),
  );

  if (shown.length === 0) {
    const clearFilters = () => {
      ui.filters.bucketId = '';
      ui.filters.walletId = '';
      ctx.refresh();
    };
    const empty =
      filtered && all.length > 0
        ? emptyState('Tidak ada pengeluaran yang cocok dengan saringan ini.', h('button', { type: 'button', class: 'btn', onclick: clearFilters }, 'Hapus saringan'))
        : emptyState('Belum ada pengeluaran. Tekan + untuk mulai.', h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openExpenseForm(ctx) }, icon('plus'), 'Catat Pengeluaran'));
    append(main, keyed(card(null, empty), 'empty'));
    return;
  }

  // One table; a separator row with the day's total starts every day.
  const days = new Map();
  for (const e of shown) {
    if (!days.has(e.date)) days.set(e.date, []);
    days.get(e.date).push(e);
  }
  const open = (expense) => openExpenseForm(ctx, { expense });
  const rows = [expenseTableHead()];
  for (const [date, items] of days) {
    rows.push(
      h(
        'li',
        { class: 'day-sep', 'data-key': `day:${date}` },
        h('span', { class: 'day-heading' }, formatDayHeading(date, today)),
        h('span', { class: 'day-total' }, `${items.length} trx · `, money(sum(items))),
      ),
      ...items.map((e) => expenseRow(e, data, open, deleteExpenseWithUndo)),
    );
  }
  append(main, keyed(card('Daftar pengeluaran', h('ul', { class: 'rows expense-table' }, rows), h('p', { class: 'hint' }, 'Ketuk baris untuk mengubah. Geser ke kiri untuk menghapus. Keyboard: ↑ ↓ lalu Enter.')), 'card:list'));
}
