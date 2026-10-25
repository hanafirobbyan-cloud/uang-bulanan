// Dompet: wallet tags (Tunai, Bank, GoPay, ...), spending per wallet, add / rename / delete.

import { append, h, icon, openDialog, confirmDialog, alertDialog, toast, errorMessage, uniqueId } from '../ui.js';
import { screenHeader, card, periodControls, keyed } from '../components.js';
import { shake } from '../motion.js';
import { periodSummary } from '../logic.js';
import { checkName, MAX_NAME_LENGTH } from '../data.js';
import { formatRupiah } from '../format.js';
import * as store from '../store.js';

export const title = 'Dompet';

export function render(main, ctx) {
  const { data } = ctx;
  const { period, element: picker } = periodControls(ctx);
  const summary = periodSummary(data, period);

  const nameInput = h('input', { type: 'text', class: 'input', id: 'new-wallet', maxlength: MAX_NAME_LENGTH, placeholder: 'Contoh: OVO', autocomplete: 'off', enterkeyhint: 'done' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const addForm = h(
    'form',
    { class: 'inline-form', novalidate: true },
    h('label', { class: 'field-label', for: 'new-wallet' }, 'Nama dompet baru'),
    h('div', { class: 'inline-row' }, nameInput, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), 'Tambah')),
    error,
  );
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const wallet = store.addWallet(nameInput.value);
      toast(`Dompet "${wallet.name}" ditambahkan.`, 'success');
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
      shake(nameInput);
    }
  });

  append(
    main,
    keyed(screenHeader('Dompet', 'Tandai dari mana uangmu keluar.'), 'header'),
    keyed(picker, 'picker'),
    keyed(card('Pengeluaran per dompet', h('ul', { class: 'rows' }, summary.wallets.map(walletRow))), 'card:wallets'),
    keyed(card(null, addForm), 'card:add'),
  );
}

function walletRow(w) {
  return h(
    'li',
    { class: 'row wallet-row', 'data-key': `w:${w.id}` },
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title', text: w.name }),
      h('span', { class: 'row-sub', text: `${formatRupiah(w.total)} · ${w.count} catatan${w.recurring ? ` · termasuk rutin ${formatRupiah(w.recurring)}` : ''}` }),
    ),
    h(
      'span',
      { class: 'row-actions' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Ubah nama ${w.name}`, onclick: () => renameWallet(w) }, icon('pencil')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Hapus ${w.name}`, onclick: () => deleteWallet(w) }, icon('trash')),
    ),
  );
}

async function renameWallet(wallet) {
  const id = uniqueId('wallet-name');
  const input = h('input', { type: 'text', class: 'input', id, value: wallet.name, maxlength: MAX_NAME_LENGTH, autocomplete: 'off' });
  const others = () => store.getData().wallets.filter((w) => w.id !== wallet.id).map((w) => w.name);
  const answer = await openDialog({
    title: 'Ubah nama dompet',
    body: [h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, 'Nama'), input)],
    buttons: [
      { label: 'Simpan', value: 'save', kind: 'primary' },
      { label: 'Batal', value: 'cancel' },
    ],
    validate: () => checkName(input.value, others()),
  });
  if (answer !== 'save') return;
  try {
    store.renameWallet(wallet.id, input.value);
    toast('Nama dompet diubah.', 'success');
  } catch (err) {
    alertDialog({ title: 'Gagal', message: errorMessage(err) });
  }
}

async function deleteWallet(wallet) {
  const data = store.getData();
  if (data.wallets.length <= 1) {
    await alertDialog({ title: 'Tidak bisa dihapus', message: 'Minimal harus ada satu dompet.' });
    return;
  }
  const usage = store.walletUsage(wallet.id);
  try {
    if (usage.expenses + usage.recurring === 0) {
      const ok = await confirmDialog({ title: `Hapus dompet "${wallet.name}"?`, message: 'Dompet ini belum dipakai di catatan mana pun.', confirmLabel: 'Hapus', danger: true });
      if (!ok) return;
      store.deleteWallet(wallet.id);
    } else {
      const used = [usage.expenses ? `${usage.expenses} pengeluaran` : null, usage.recurring ? `${usage.recurring} pengeluaran rutin` : null].filter(Boolean).join(' dan ');
      const selectId = uniqueId('move-wallet');
      const select = h('select', { class: 'input', id: selectId }, data.wallets.filter((w) => w.id !== wallet.id).map((w) => h('option', { value: w.id }, w.name)));
      const answer = await openDialog({
        title: `Hapus dompet "${wallet.name}"?`,
        body: [
          h('p', null, `Dompet ini dipakai di ${used}. Supaya catatannya tidak hilang, semuanya dipindahkan ke dompet lain dulu.`),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: selectId }, 'Pindahkan ke'), select),
        ],
        buttons: [
          { label: 'Pindahkan & hapus', value: 'ok', kind: 'danger-solid' },
          { label: 'Batal', value: 'cancel', autofocus: true },
        ],
      });
      if (answer !== 'ok') return;
      store.deleteWallet(wallet.id, select.value);
    }
    toast(`Dompet "${wallet.name}" dihapus.`);
  } catch (err) {
    alertDialog({ title: 'Gagal', message: errorMessage(err) });
  }
}
