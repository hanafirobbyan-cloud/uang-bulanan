// Beranda (home): the big "Aman dipakai hari ini" number and this period's buckets.

import { append, h, icon } from '../ui.js';
import { screenHeader, card, money, emptyState, notice, bucketStatus, expenseRow, newestFirst } from '../components.js';
import { dailyBudget, daysBetween } from '../logic.js';
import { formatRupiah, formatDateLong, formatDateShort, formatPeriod } from '../format.js';
import { openExpenseForm } from './expense-form.js';
import { exportBackup } from '../backup.js';
import * as store from '../store.js';

export const title = 'Beranda';

export function render(main, ctx) {
  const { data, today } = ctx;
  const budget = dailyBudget(data, today);

  append(
    main,
    screenHeader('Beranda', formatDateLong(today)),
    ...warnings(budget),
    hero(budget),
    h(
      'div',
      { class: 'home-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', id: 'catat-btn', onclick: () => openExpenseForm(ctx) }, icon('plus'), 'Catat Pengeluaran'),
      h('a', { class: 'btn btn-block', href: '#/simulasi' }, icon('calculator'), 'Kalau beli ini?'),
    ),
    backupReminder(ctx),
    todayCard(ctx),
    card(
      'Pos anggaran periode ini',
      h('p', { class: 'card-sub' }, `${formatPeriod(budget.period)} · pemasukan ${formatRupiah(budget.income)}${budget.incomeIsOverride ? ' (khusus periode ini)' : ''}`),
      h('ul', { class: 'bucket-list' }, budget.buckets.map(bucketStatus)),
    ),
  );
}

function hero(b) {
  const negative = b.sisaHariIni < 0;
  let explanation = null;
  if (b.amanHariIni < 0) {
    explanation = 'Pengeluaran periode ini sudah melebihi uang yang bisa dipakai. Tahan belanja sampai uang masuk lagi.';
  } else if (negative) {
    explanation = 'Pengeluaran hari ini melebihi jatah. Jatah hari-hari berikutnya otomatis berkurang.';
  }
  return h(
    'section',
    { class: `hero${negative ? ' is-negative' : ''}`, 'aria-labelledby': 'hero-label' },
    h('p', { class: 'hero-label', id: 'hero-label' }, 'Aman dipakai hari ini'),
    h('p', { class: 'hero-amount', id: 'sisa-hari-ini' }, formatRupiah(b.sisaHariIni)),
    negative ? h('p', { class: 'badge badge-danger' }, icon('alert'), 'Melebihi anggaran') : null,
    explanation ? h('p', { class: 'hero-explain' }, explanation) : null,
    h(
      'dl',
      { class: 'hero-stats' },
      h('div', null, h('dt', null, 'Jatah hari ini'), h('dd', { id: 'aman-hari-ini' }, money(b.amanHariIni))),
      h('div', null, h('dt', null, 'Terpakai hari ini'), h('dd', null, money(b.spentToday))),
      h('div', null, h('dt', null, 'Sisa hari'), h('dd', { id: 'sisa-hari' }, `${b.daysLeft} hari`, h('small', null, 'termasuk hari ini'))),
      h('div', null, h('dt', null, 'Uang masuk lagi'), h('dd', null, formatDateShort(b.period.nextStart, true))),
    ),
    h('p', { class: 'hero-foot' }, `Bisa dipakai sampai ${formatDateShort(b.period.end)}: `, money(b.remainingInPeriod)),
  );
}

function warnings(b) {
  const list = [];
  if (!store.isStorageAvailable()) {
    list.push(notice('danger', 'Penyimpanan tidak tersedia di browser ini, jadi data TIDAK akan tersimpan setelah aplikasi ditutup.'));
  }
  if (b.percentTotal !== 100) {
    list.push(
      notice('warning', `Total persen pos anggaran ${b.percentTotal}%, seharusnya tepat 100%.`, h('a', { class: 'btn btn-small', href: '#/pos' }, 'Atur pos')),
    );
  }
  if (!b.hasSpendableBucket) {
    list.push(
      notice('warning', 'Belum ada pos yang "bisa dipakai", jadi uang harian selalu Rp 0.', h('a', { class: 'btn btn-small', href: '#/pos' }, 'Atur pos')),
    );
  }
  if (b.income === 0) {
    list.push(
      notice('info', 'Pemasukan periode ini masih Rp 0.', h('a', { class: 'btn btn-small', href: b.incomeIsOverride ? '#/ringkasan' : '#/pengaturan' }, 'Ubah')),
    );
  }
  return list;
}

function backupReminder(ctx) {
  const { lastBackupDate, setupDate } = ctx.data.settings;
  let message = null;
  if (lastBackupDate) {
    const days = daysBetween(lastBackupDate, ctx.today);
    if (days >= 30) message = `Sudah ${days} hari sejak cadangan terakhir.`;
  } else if (setupDate && ctx.data.expenses.length > 0 && daysBetween(setupDate, ctx.today) >= 7) {
    message = 'Kamu belum pernah menyimpan cadangan.';
  }
  if (!message) return null;
  return notice(
    'info',
    `${message} Simpan cadangan supaya datamu aman kalau HP hilang atau rusak.`,
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => exportBackup(ctx.today) }, 'Ekspor'),
  );
}

function todayCard(ctx) {
  const items = ctx.data.expenses.filter((e) => e.date === ctx.today).sort(newestFirst);
  const open = (expense) => openExpenseForm(ctx, { expense });
  return card(
    'Pengeluaran hari ini',
    items.length
      ? h('ul', { class: 'rows' }, items.map((e) => expenseRow(e, ctx.data, open)))
      : emptyState('Belum ada pengeluaran hari ini. Tekan + Catat Pengeluaran untuk mulai.'),
    items.length ? h('a', { class: 'link-btn card-link', href: '#/pengeluaran' }, 'Lihat semua pengeluaran') : null,
  );
}
