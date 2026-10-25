// Beranda (home): the big "Aman dipakai hari ini" number and this period's buckets.

import { append, h, icon } from '../ui.js';
import { screenHeader, card, money, emptyState, notice, bucketStatus, expenseRow, newestFirst, keyed, ring, statusBadge } from '../components.js';
import { dailyBudget, daysBetween } from '../logic.js';
import { planReport } from '../planner.js';
import { formatRupiah, formatDateLong, formatDateShort, formatPeriod } from '../format.js';
import { openExpenseForm, deleteExpenseWithUndo } from './expense-form.js';
import { exportBackup } from '../backup.js';
import * as store from '../store.js';

export const title = 'Beranda';

export function render(main, ctx) {
  const { data, today } = ctx;
  const budget = dailyBudget(data, today);

  append(
    main,
    keyed(screenHeader('Beranda', formatDateLong(today)), 'header'),
    ...warnings(budget),
    hero(budget),
    keyed(
      h(
        'div',
        { class: 'home-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', id: 'catat-btn', onclick: () => openExpenseForm(ctx) }, icon('plus'), 'Catat Pengeluaran'),
        h('a', { class: 'btn btn-block', href: '#/simulasi' }, icon('calculator'), 'Kalau beli ini?'),
      ),
      'actions',
    ),
    planCard(ctx),
    backupReminder(ctx),
    todayCard(ctx),
    keyed(
      card(
        'Pos anggaran periode ini',
        h('p', { class: 'card-sub' }, `${formatPeriod(budget.period)} · pemasukan ${formatRupiah(budget.income)}${budget.incomeIsOverride ? ' (khusus periode ini)' : ''}`),
        h('ul', { class: 'bucket-list' }, budget.buckets.map((b) => bucketStatus(b, 'b'))),
      ),
      'card:buckets',
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
    { class: `hero${negative ? ' is-negative' : ''}`, 'aria-labelledby': 'hero-label', 'data-key': 'hero' },
    // A soft red glow that fades in when over budget (and out again).
    h('div', { class: `hero-tint${negative ? ' is-on' : ''}`, 'aria-hidden': 'true', 'data-state-key': 'beranda:tint', 'data-state': negative ? 'on' : 'off' }),
    h('p', { class: 'hero-label', id: 'hero-label' }, 'Aman dipakai hari ini'),
    h('p', { class: 'hero-amount', id: 'sisa-hari-ini', 'data-count-key': 'beranda:sisa', 'data-value': String(b.sisaHariIni) }, formatRupiah(b.sisaHariIni)),
    negative
      ? h('p', { class: 'badge badge-danger', 'data-state-key': 'beranda:over', 'data-state': 'on' }, icon('alert'), 'Melebihi anggaran')
      : h('span', { hidden: true, 'data-state-key': 'beranda:over', 'data-state': 'off' }),
    explanation ? h('p', { class: 'hero-explain' }, explanation) : null,
    h(
      'dl',
      { class: 'hero-stats' },
      h('div', null, h('dt', null, 'Jatah hari ini'), h('dd', { id: 'aman-hari-ini' }, money(b.amanHariIni, '', 'beranda:aman'))),
      h('div', null, h('dt', null, 'Terpakai hari ini'), h('dd', null, money(b.spentToday, '', 'beranda:terpakai'))),
      h('div', null, h('dt', null, 'Sisa hari'), h('dd', { id: 'sisa-hari' }, `${b.daysLeft} hari`, h('small', null, 'termasuk hari ini'))),
      h('div', null, h('dt', null, 'Uang masuk lagi'), h('dd', null, formatDateShort(b.period.nextStart, true))),
    ),
    h('p', { class: 'hero-foot' }, `Bisa dipakai sampai ${formatDateShort(b.period.end)}: `, money(b.remainingInPeriod, '', 'beranda:periode')),
  );
}

/** The compact "Rencana Cukup" card, only while a plan is active. Tap to open the plan. */
function planCard(ctx) {
  const plan = ctx.data.plans.active;
  if (!plan) return null;
  const r = planReport(plan, ctx.data.expenses, ctx.today);
  const ended = r.phase === 'ended';
  return h(
    'a',
    { class: 'plan-card', href: '#/rencana', 'data-key': 'plan-card', 'aria-label': `Rencana Cukup: ${ended ? 'sudah selesai' : `sisa hari ini ${formatRupiah(r.sisaHariIni)}`}` },
    h(
      'span',
      { class: 'plan-card-main' },
      h('span', { class: 'plan-card-head' }, h('span', { class: 'plan-card-title' }, icon('plan'), 'Rencana Cukup'), statusBadge(r.status)),
      ended
        ? h('span', { class: 'plan-card-amount' }, 'Rencana selesai, lihat hasilnya')
        : h('span', { class: 'plan-card-amount' }, 'Sisa hari ini ', money(r.sisaHariIni, '', 'plan:sisa')),
      h('span', { class: 'plan-card-sub' }, ended ? `Berakhir ${formatDateShort(plan.endDate, true)}` : `${r.daysLeft} hari lagi · sampai ${formatDateShort(plan.endDate)}`),
    ),
    ended ? null : ring(r.spentToday, r.allowanceToday, 'Terpakai hari ini dari jatah rencana', 'home:plan'),
    icon('chevronRight'),
  );
}

function warnings(b) {
  const list = [];
  if (!store.isStorageAvailable()) {
    list.push(keyed(notice('danger', 'Penyimpanan tidak tersedia di browser ini, jadi data TIDAK akan tersimpan setelah aplikasi ditutup.'), 'warn:storage'));
  }
  if (b.percentTotal !== 100) {
    list.push(
      keyed(
        notice('warning', `Total persen pos anggaran ${b.percentTotal}%, seharusnya tepat 100%.`, h('a', { class: 'btn btn-small', href: '#/pos' }, 'Atur pos')),
        'warn:percent',
      ),
    );
  }
  if (!b.hasSpendableBucket) {
    list.push(
      keyed(
        notice('warning', 'Belum ada pos yang "bisa dipakai", jadi uang harian selalu Rp 0.', h('a', { class: 'btn btn-small', href: '#/pos' }, 'Atur pos')),
        'warn:spendable',
      ),
    );
  }
  if (b.income === 0) {
    list.push(
      keyed(
        notice('info', 'Pemasukan periode ini masih Rp 0.', h('a', { class: 'btn btn-small', href: b.incomeIsOverride ? '#/ringkasan' : '#/pengaturan' }, 'Ubah')),
        'warn:income',
      ),
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
  return keyed(
    notice(
      'info',
      `${message} Simpan cadangan supaya datamu aman kalau HP hilang atau rusak.`,
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => exportBackup(ctx.today) }, 'Ekspor'),
    ),
    'notice:backup',
  );
}

function todayCard(ctx) {
  const items = ctx.data.expenses.filter((e) => e.date === ctx.today).sort(newestFirst);
  const open = (expense) => openExpenseForm(ctx, { expense });
  return keyed(
    card(
      'Pengeluaran hari ini',
      items.length
        ? h('ul', { class: 'rows' }, items.map((e) => expenseRow(e, ctx.data, open, deleteExpenseWithUndo)))
        : keyed(emptyState('Belum ada pengeluaran hari ini. Tekan + Catat Pengeluaran untuk mulai.'), 'empty:today'),
      items.length ? h('a', { class: 'link-btn card-link', href: '#/pengeluaran' }, 'Lihat semua pengeluaran') : null,
    ),
    'card:today',
  );
}
