// Ringkasan: totals of one period, per bucket and per wallet, and "Pindahkan sisa ke Tabungan".

import { append, h, icon, moneyInput, openDialog, confirmDialog, toast, errorMessage, alertDialog } from '../ui.js';
import { screenHeader, card, money, bucketStatus, periodControls } from '../components.js';
import { periodSummary, leftoverMoveStatus } from '../logic.js';
import { checkAmount } from '../data.js';
import { formatRupiah, formatPeriod, formatDate } from '../format.js';
import * as store from '../store.js';

export const title = 'Ringkasan';

export function render(main, ctx) {
  const { data } = ctx;
  const { period, element: picker } = periodControls(ctx);
  const s = periodSummary(data, period);

  append(
    main,
    screenHeader('Ringkasan', 'Uang masuk, keluar, dan sisa per periode.'),
    picker,
    totalsCard(s, ctx),
    savingsCard(s, ctx),
    card('Per pos', h('ul', { class: 'bucket-list' }, s.buckets.map(bucketStatus))),
    walletsCard(s),
    historyCard(data),
  );
}

function line(label, value, extra = null, className = '') {
  return h('div', { class: `total-row ${className}` }, h('dt', null, label, extra), h('dd', null, value));
}

function totalsCard(s, ctx) {
  const negative = s.leftover < 0;
  return card(
    null,
    h(
      'dl',
      { class: 'totals' },
      line(
        'Pemasukan',
        money(s.income),
        s.incomeIsOverride ? h('span', { class: 'tag' }, 'khusus periode ini') : null,
      ),
      line('Pengeluaran tercatat', money(s.recordedTotal), h('small', { class: 'muted' }, ` (${s.expenseCount} catatan)`)),
      line('Pengeluaran rutin', money(s.recurringTotal)),
      line('Total pengeluaran', money(s.totalSpent), null, 'is-strong'),
      line('Sisa', money(s.leftover), negative ? h('span', { class: 'tag tag-danger' }, 'Melebihi anggaran') : null, 'is-strong is-big'),
    ),
    s.expenseCount === 0 ? h('p', { class: 'hint' }, 'Belum ada pengeluaran tercatat di periode ini.') : null,
    h(
      'button',
      { type: 'button', class: 'btn btn-small', onclick: () => editIncome(s, ctx) },
      icon('pencil'),
      'Ubah pemasukan periode ini',
    ),
  );
}

async function editIncome(s, ctx) {
  const monthly = ctx.data.settings.monthlyIncome;
  const input = moneyInput({ value: s.income, label: 'Pemasukan periode ini' });
  const buttons = [{ label: 'Simpan', value: 'save', kind: 'primary' }];
  if (s.incomeIsOverride) buttons.push({ label: 'Pakai jumlah biasa', value: 'reset' });
  buttons.push({ label: 'Batal', value: 'cancel' });
  const answer = await openDialog({
    title: 'Pemasukan periode ini',
    body: [
      h('p', null, `Untuk periode ${formatPeriod(s.period)} saja, misalnya kalau bulan ini dapat kiriman tambahan. Periode lain tetap memakai uang bulanan biasa (${formatRupiah(monthly)}).`),
      input.element,
    ],
    buttons,
    validate: (value) => (value === 'save' ? checkAmount(input.getValue(), { allowZero: true, label: 'Pemasukan' }) : ''),
  });
  try {
    if (answer === 'save') {
      const amount = input.getValue();
      store.setIncomeOverride(s.period.start, amount === monthly ? null : amount);
      toast('Pemasukan periode ini disimpan.', 'success');
    } else if (answer === 'reset') {
      store.setIncomeOverride(s.period.start, null);
      toast('Kembali memakai uang bulanan biasa.', 'success');
    }
  } catch (error) {
    alertDialog({ title: 'Gagal menyimpan', message: errorMessage(error) });
  }
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
          { class: `row${w.total === 0 ? ' is-quiet' : ''}` },
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
  return card(
    'Riwayat tabungan',
    h('p', null, 'Total sisa yang sudah ditabung: ', money(total)),
    h(
      'ul',
      { class: 'rows' },
      entries.map((e) =>
        h(
          'li',
          { class: 'row' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: `Periode mulai ${formatDate(e.periodStart)}` }), h('span', { class: 'row-sub', text: `Dicatat ${formatDate(e.date)}` })),
          h('span', { class: 'row-amount' }, formatRupiah(e.amount)),
        ),
      ),
    ),
  );
}
