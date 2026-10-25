// The "Catat Pengeluaran" / "Ubah Pengeluaran" form (opens as a sheet).

import { h, moneyInput, chipGroup, openSheet, confirmDialog, toast, field, uniqueId } from '../ui.js';
import { formatRupiah, formatDateLong, formatPeriod, formatDate } from '../format.js';
import { getPeriod, isValidDateStr } from '../logic.js';
import { MAX_NOTE_LENGTH } from '../data.js';
import * as store from '../store.js';

/**
 * Open the expense form. Call it directly from a tap so the keyboard opens on iPhone.
 *   expense – an existing expense to edit (or nothing to add a new one)
 *   prefill – { amount, bucketId } for a new expense (used by Simulasi)
 *   onSaved – called after a successful save
 */
export function openExpenseForm(ctx, { expense = null, prefill = {}, onSaved = null } = {}) {
  const data = store.getData();
  const isEdit = Boolean(expense);
  const firstSpendable = data.buckets.find((b) => b.spendable) || data.buckets[0];
  const has = (list, id) => list.some((x) => x.id === id);
  const start = expense || {
    amount: prefill.amount ?? null,
    bucketId: [prefill.bucketId, data.settings.lastBucketId].find((id) => has(data.buckets, id)) || firstSpendable.id,
    walletId: has(data.wallets, data.settings.lastWalletId) ? data.settings.lastWalletId : data.wallets[0].id,
    date: ctx.today,
    note: '',
  };

  const amount = moneyInput({ value: start.amount, id: uniqueId('amount'), large: true, autofocus: !isEdit, label: 'Jumlah pengeluaran' });
  const bucketChoice = chipGroup({ legend: 'Pos', options: data.buckets.map((b) => ({ value: b.id, label: b.name })), value: start.bucketId });
  const walletChoice = chipGroup({ legend: 'Dompet', options: data.wallets.map((w) => ({ value: w.id, label: w.name })), value: start.walletId });

  const dateId = uniqueId('date');
  const dateInput = h('input', { type: 'date', class: 'input', id: dateId, value: start.date, required: true });
  const dateHint = h('p', { class: 'hint' });
  const updateDateHint = () => {
    const value = dateInput.value;
    if (!isValidDateStr(value)) {
      dateHint.textContent = '';
      return;
    }
    const incomeDay = store.getData().settings.incomeDay;
    const period = getPeriod(value, incomeDay);
    const inCurrent = period.start === getPeriod(ctx.today, incomeDay).start;
    dateHint.textContent = formatDateLong(value) + (inCurrent ? '' : ` · masuk periode ${formatPeriod(period)}`);
  };
  dateInput.addEventListener('input', updateDateHint);
  dateInput.addEventListener('change', updateDateHint);
  updateDateHint();

  const noteId = uniqueId('note');
  const noteInput = h('input', {
    type: 'text',
    class: 'input',
    id: noteId,
    value: start.note,
    maxlength: MAX_NOTE_LENGTH,
    placeholder: 'Contoh: makan siang',
    autocomplete: 'off',
    enterkeyhint: 'done',
  });

  const bucketName = (id) => (store.getData().buckets.find((b) => b.id === id) || {}).name || '';

  const footer = isEdit
    ? [
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-danger btn-block',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Hapus pengeluaran ini?',
                message: `${formatRupiah(expense.amount)} · ${bucketName(expense.bucketId)} · ${formatDate(expense.date)}${expense.note ? ` · ${expense.note}` : ''}`,
                confirmLabel: 'Hapus',
                danger: true,
              });
              if (!ok) return;
              store.deleteExpense(expense.id);
              sheet.close();
              toast('Pengeluaran dihapus.');
            },
          },
          'Hapus pengeluaran',
        ),
      ]
    : [];

  const sheet = openSheet({
    title: isEdit ? 'Ubah Pengeluaran' : 'Catat Pengeluaran',
    submitLabel: 'Simpan',
    content: [
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: amount.input.id }, 'Jumlah'), amount.element),
      bucketChoice.element,
      walletChoice.element,
      field({ label: 'Tanggal', control: h('div', null, dateInput, dateHint), forId: dateId }),
      field({ label: 'Catatan (opsional)', control: noteInput, forId: noteId }),
    ],
    footer,
    onSubmit: () => {
      const fields = {
        amount: amount.getValue(),
        bucketId: bucketChoice.value,
        walletId: walletChoice.value,
        date: dateInput.value,
        note: noteInput.value,
      };
      if (isEdit) {
        store.updateExpense(expense.id, fields);
        toast('Perubahan disimpan.', 'success');
      } else {
        store.addExpense(fields);
        toast(`Tersimpan: ${formatRupiah(fields.amount)} · ${bucketName(fields.bucketId)}`, 'success');
      }
      if (onSaved) onSaved();
    },
  });
}
