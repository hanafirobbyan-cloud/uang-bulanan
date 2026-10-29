// Ringkasan: totals of one period, its installments (received or not), per
// bucket and per wallet, and "Pindahkan sisa ke Tabungan".

import { append, h, icon, confirmDialog, toast, errorMessage, alertDialog } from '../ui.js';
import { screenHeader, card, money, bucketStatus, periodControls, keyed, progressBar } from '../components.js';
import { periodSummary, leftoverMoveStatus } from '../logic.js';
import { formatRupiah, formatPeriod, formatDate, formatDateShort } from '../format.js';
import { installmentBadge, openPeriodIncomeEditor } from '../income.js';
import * as store from '../store.js';

export const title = 'Ringkasan';

export function render(main, ctx) {
  const { data, today } = ctx;
  const { period, element: picker } = periodControls(ctx);
  const s = periodSummary(data, period, today);

  append(
    main,
    keyed(screenHeader('Ringkasan', 'Uang masuk, keluar, dan sisa per periode.'), 'header'),
    keyed(picker, 'picker'),
    keyed(totalsCard(s), 'card:totals'),
    keyed(incomeCard(s, ctx), 'card:installments'),
    keyed(savingsCard(s, ctx), 'card:savings'),
    keyed(card('Per pos', h('ul', { class: 'bucket-list' }, s.buckets.map((b) => bucketStatus(b, 'rb')))), 'card:buckets'),
    keyed(walletsCard(s), 'card:wallets'),
    historyCard(data),
  );
}

function line(label, value, extra = null, className = '') {
  return h('div', { class: `total-row ${className}` }, h('dt', null, label, extra), h('dd', null, value));
}

function totalsCard(s) {
  const negative = s.leftover < 0;
  return card(
    'Total periode',
    h(
      'dl',
      { class: 'totals' },
      line(
        'Pemasukan',
        money(s.income, '', 'ringkasan:income'),
        s.incomeIsOverride ? h('span', { class: 'tag' }, 'khusus periode ini') : null,
      ),
      line('Pengeluaran tercatat', money(s.recordedTotal, '', 'ringkasan:recorded'), h('small', { class: 'muted' }, ` (${s.expenseCount} catatan)`)),
      line('Pengeluaran rutin', money(s.recurringTotal)),
      line('Total pengeluaran', money(s.totalSpent, '', 'ringkasan:total'), null, 'is-strong'),
      line('Sisa', money(s.leftover, '', 'ringkasan:sisa'), negative ? h('span', { class: 'tag tag-danger' }, '▼ Melebihi anggaran') : null, 'is-strong is-big'),
    ),
    s.expenseCount === 0 ? h('p', { class: 'hint' }, 'Belum ada pengeluaran tercatat di periode ini.') : null,
  );
}

/** The period's installments with the dates they arrived, and the total vs what has arrived. */
function incomeCard(s, ctx) {
  const percent = s.income > 0 ? Math.floor((s.received / s.income) * 100) : 0;
  const rows = s.installments.map((inst) =>
    h(
      'li',
      { class: `inst-row is-${inst.state}`, 'data-key': `ri:${inst.id}` },
      h('span', { class: 'inst-date' }, inst.delayed ? `${formatDateShort(inst.date)} (jadwal ${formatDateShort(inst.plannedDate)})` : formatDateShort(inst.date)),
      h('span', { class: 'inst-amount' }, formatRupiah(inst.amount)),
      installmentBadge(inst),
    ),
  );
  return card(
    'Uang masuk',
    rows.length ? h('ul', { class: 'inst-list' }, rows) : h('p', { class: 'muted' }, 'Tidak ada uang masuk di periode ini.'),
    h(
      'div',
      { class: 'inst-progress' },
      h('p', { class: 'inst-progress-text' }, h('span', { class: 'label' }, 'Masuk'), ' ', money(s.received), ' / ', money(s.income), ` (${percent}%)`),
      progressBar(s.received, s.income, `Uang masuk ${formatRupiah(s.received)} dari ${formatRupiah(s.income)}`, `ri:progress:${s.period.start}`, 'amber'),
    ),
    h(
      'button',
      { type: 'button', class: 'btn btn-small', id: 'edit-period-income', onclick: () => openPeriodIncomeEditor(ctx, s.period) },
      icon('pencil'),
      'Ubah uang masuk periode ini',
    ),
    h('p', { class: 'hint' }, s.incomeIsOverride ? 'Periode ini memakai uang masuk khusus; jadwal bulanan tidak berubah.' : 'Mengikuti jadwal bulanan. Ubah di sini kalau periode ini beda.'),
  );
}

function savingsCard(s, ctx) {
  const status = leftoverMoveStatus(s, ctx.today, ctx.data.settings.setupDate);
  const parts = [];

  if (status === 'done') {
    const entry = s.savings[0];
    parts.push(
      h('p', { class: 'success-text' }, icon('check', 'icon icon-inline'), ` ${formatRupiah(s.savedAmount)} sudah dipindahkan ke Tabungan pada ${formatDate(entry.date)}.`),
    );
    if (s.savedAmount !== s.leftover) {
      parts.push(h('p', { class: 'hint' }, `Sisa sekarang ${formatRupiah(s.leftover)} karena ada perubahan data setelah dipindahkan.`));
    }
    parts.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Batalkan pemindahan?',
              message: `Catatan tabungan ${formatRupiah(s.savedAmount)} untuk periode ${formatPeriod(s.period)} akan dihapus.`,
              confirmLabel: 'Batalkan pemindahan',
              cancelLabel: 'Tidak',
              danger: true,
            });
            if (!ok) return;
            s.savings.forEach((e) => store.undoSavings(e.id));
            toast('Pemindahan dibatalkan.');
          },
        },
        'Batalkan',
      ),
    );
  } else {
    const hints = {
      ok: `Periode ini sudah selesai. Sisa ${formatRupiah(s.leftover)} bisa dicatat sebagai tabungan.`,
      'not-ended': `Bisa dipakai setelah periode ini selesai (mulai ${formatDate(s.period.nextStart)}).`,
      'no-data': 'Belum ada catatan di periode ini, jadi tidak ada sisa yang bisa dipindahkan.',
      'no-leftover': 'Tidak ada sisa untuk dipindahkan.',
    };
    parts.push(h('p', { class: 'muted' }, hints[status]));
    parts.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-block',
          id: 'pindahkan-sisa',
          disabled: status !== 'ok',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Pindahkan sisa ke Tabungan?',
              message: `${formatRupiah(s.leftover)} dari periode ${formatPeriod(s.period)} akan dicatat sebagai tabungan. Ini hanya bisa dilakukan sekali per periode.`,
              confirmLabel: 'Pindahkan',
            });
            if (!ok) return;
            try {
              store.moveLeftoverToSavings(s.period, s.leftover, ctx.today);
              toast('Sisa dicatat sebagai tabungan. Mantap!', 'success');
            } catch (error) {
              alertDialog({ title: 'Gagal', message: errorMessage(error) });
            }
          },
        },
        'Pindahkan sisa ke Tabungan',
      ),
    );
  }
  return card('Sisa ke Tabungan', parts);
}

function walletsCard(s) {
  const wallets = [...s.wallets].sort((a, b) => b.total - a.total);
  return card(
    'Per dompet',
    h(
      'ul',
      { class: 'rows' },
      wallets.map((w) =>
        h(
          'li',
          { class: `row${w.total === 0 ? ' is-quiet' : ''}`, 'data-key': `rw:${w.id}` },
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title', text: w.name }),
            h('span', { class: 'row-sub', text: `${w.count} catatan${w.recurring ? ` · termasuk rutin ${formatRupiah(w.recurring)}` : ''}` }),
          ),
          h('span', { class: 'row-amount' }, formatRupiah(w.total)),
        ),
      ),
    ),
  );
}

function historyCard(data) {
  if (!data.savings.length) return null;
  const entries = [...data.savings].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const rows = entries.map((e) =>
    h(
      'li',
      { class: 'row', 'data-key': `s:${e.id}` },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: `Periode mulai ${formatDate(e.periodStart)}` }), h('span', { class: 'row-sub', text: `Dicatat ${formatDate(e.date)}` })),
      h('span', { class: 'row-amount' }, formatRupiah(e.amount)),
    ),
  );
  return keyed(card('Riwayat tabungan', h('p', null, 'Total sisa yang sudah ditabung: ', money(total)), h('ul', { class: 'rows' }, rows)), 'card:history');
}
