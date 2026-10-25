// Pengeluaran rutin: bills that repeat every period (kos, pulsa, langganan...).
// They are counted automatically each period and are NOT stored as expenses.

import { append, h, icon, moneyInput, chipGroup, openSheet, confirmDialog, toast, field, uniqueId } from '../ui.js';
import { screenHeader, card, money, emptyState, notice } from '../components.js';
import { MAX_NAME_LENGTH } from '../data.js';
import { getPeriod } from '../logic.js';
import { formatRupiah, formatDate, formatDateShort, formatPeriod } from '../format.js';
import * as store from '../store.js';

export const title = 'Pengeluaran rutin';

export function render(main, ctx) {
  const { data } = ctx;
  const active = data.recurring.filter((r) => !r.endDate);
  const inactive = data.recurring.filter((r) => r.endDate);
  const total = active.reduce((sum, r) => sum + r.amount, 0);
  const add = () => openRecurringForm(ctx);

  append(
    main,
    screenHeader('Pengeluaran rutin', 'Tagihan yang sama setiap periode.', h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tambah')),
    notice('info', 'Dihitung otomatis setiap periode dan langsung mengurangi pos-nya. Tidak perlu dicatat lagi sebagai pengeluaran.'),
    card(
      'Aktif',
      active.length
        ? [h('p', { class: 'card-sub' }, 'Total per periode: ', money(total)), h('ul', { class: 'rows' }, active.map((r) => recurringRow(r, data, ctx)))]
        : emptyState(
            'Belum ada pengeluaran rutin. Tambahkan kos, pulsa, atau langganan supaya otomatis dihitung.',
            h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tambah pengeluaran rutin'),
          ),
    ),
    inactive.length ? card('Nonaktif', h('ul', { class: 'rows' }, inactive.map((r) => recurringRow(r, data, ctx)))) : null,
  );
}

function recurringRow(bill, data, ctx) {
  const bucket = data.buckets.find((b) => b.id === bill.bucketId);
  const wallet = data.wallets.find((w) => w.id === bill.walletId);
  let status = '';
  if (bill.endDate) status = ` · nonaktif sejak ${formatDate(bill.endDate)}`;
  else if (bill.startDate > ctx.today) status = ` · mulai ${formatDate(bill.startDate)}`;
  const sub = `${bucket ? bucket.name : '-'} · ${wallet ? wallet.name : '-'}${status}`;
  return h(
    'li',
    null,
    h(
      'button',
      { type: 'button', class: `row row-button${bill.endDate ? ' is-quiet' : ''}`, onclick: () => openRecurringForm(ctx, bill) },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: bill.name }), h('span', { class: 'row-sub', text: sub })),
      h('span', { class: 'row-amount' }, formatRupiah(bill.amount)),
    ),
  );
}

function openRecurringForm(ctx, bill = null) {
  const data = store.getData();
  const isEdit = Boolean(bill);
  const firstSpendable = data.buckets.find((b) => b.spendable) || data.buckets[0];
  const start = bill || { name: '', amount: null, bucketId: firstSpendable.id, walletId: data.wallets[0].id };

  const nameId = uniqueId('bill-name');
  const nameInput = h('input', { type: 'text', class: 'input', id: nameId, value: start.name, maxlength: MAX_NAME_LENGTH, placeholder: 'Contoh: Kos', autocomplete: 'off', autofocus: !isEdit });
  const amount = moneyInput({ value: start.amount, id: uniqueId('bill-amount') });
  const bucketChoice = chipGroup({ legend: 'Pos', options: data.buckets.map((b) => ({ value: b.id, label: b.name })), value: start.bucketId });
  const walletChoice = chipGroup({ legend: 'Dompet', options: data.wallets.map((w) => ({ value: w.id, label: w.name })), value: start.walletId });

  // New bills: count from this period, or from the next one (if this period's bill is already paid).
  const current = getPeriod(ctx.today, data.settings.incomeDay);
  const startChoice = isEdit
    ? null
    : chipGroup({
        legend: 'Mulai dihitung',
        options: [
          { value: 'now', label: 'Periode ini' },
          { value: 'next', label: `Periode berikutnya (${formatDateShort(current.nextStart)})` },
        ],
        value: 'now',
      });

  const footer = [];
  if (isEdit) {
    const active = !bill.endDate;
    footer.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-block',
          onclick: async () => {
            if (active) {
              const ok = await confirmDialog({
                title: `Nonaktifkan "${bill.name}"?`,
                message: 'Tidak dihitung lagi mulai periode ini. Periode sebelumnya tetap menghitungnya. Bisa diaktifkan lagi kapan saja.',
                confirmLabel: 'Nonaktifkan',
              });
              if (!ok) return;
            }
            store.setRecurringActive(bill.id, !active, ctx.today);
            sheet.close();
            toast(active ? 'Pengeluaran rutin dinonaktifkan.' : 'Pengeluaran rutin aktif lagi.', 'success');
          },
        },
        active ? 'Nonaktifkan' : 'Aktifkan lagi',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger btn-block',
          onclick: async () => {
            const ok = await confirmDialog({
              title: `Hapus "${bill.name}"?`,
              message: 'Tagihan ini juga hilang dari ringkasan periode-periode lalu. Kalau hanya berhenti, pilih "Nonaktifkan" saja.',
              confirmLabel: 'Hapus',
              danger: true,
            });
            if (!ok) return;
            store.deleteRecurring(bill.id);
            sheet.close();
            toast('Pengeluaran rutin dihapus.');
          },
        },
        'Hapus',
      ),
    );
  }

  const sheet = openSheet({
    title: isEdit ? 'Ubah pengeluaran rutin' : 'Tambah pengeluaran rutin',
    content: [
      field({ label: 'Nama', control: nameInput, forId: nameId }),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: amount.input.id }, 'Jumlah per periode'), amount.element),
      bucketChoice.element,
      walletChoice.element,
      startChoice
        ? [startChoice.element, h('p', { class: 'hint' }, 'Pilih "Periode berikutnya" kalau tagihan periode ini sudah dibayar, supaya tidak terhitung dua kali.')]
        : h('p', { class: 'hint' }, `Dihitung sejak periode ${formatPeriod(getPeriod(bill.startDate, data.settings.incomeDay))}.`),
    ],
    footer,
    onSubmit: () => {
      const fields = { name: nameInput.value, amount: amount.getValue(), bucketId: bucketChoice.value, walletId: walletChoice.value };
      if (isEdit) store.updateRecurring(bill.id, fields);
      else store.addRecurring(fields, startChoice.value === 'next' ? current.nextStart : ctx.today);
      toast(isEdit ? 'Perubahan disimpan.' : 'Pengeluaran rutin ditambahkan.', 'success');
    },
  });
}
