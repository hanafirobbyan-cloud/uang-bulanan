// Pengaturan: monthly amount, income day, links to buckets / wallets / recurring,
// backup (export / import), app version and "Hapus semua data".

import { append, h, icon, moneyInput, toast, errorMessage, field, confirmDialog, openDialog } from '../ui.js';
import { screenHeader, card, notice } from '../components.js';
import { getPeriod } from '../logic.js';
import { formatRupiah, formatDate, formatPeriod } from '../format.js';
import { exportBackup, chooseBackupFile } from '../backup.js';
import { checkForUpdate, isIOS, isStandalone } from '../pwa.js';
import { isPersisted } from '../storage.js';
import { APP_VERSION } from '../version.js';
import * as store from '../store.js';

export const title = 'Pengaturan';

export function render(main, ctx) {
  const { data } = ctx;
  append(
    main,
    screenHeader('Pengaturan'),
    incomeCard(ctx),
    card(
      'Kelola',
      h(
        'ul',
        { class: 'rows' },
        linkRow('#/pos', 'Pos anggaran', data.buckets.map((b) => `${b.name} ${b.percent}%`).join(' · ')),
        linkRow('#/dompet', 'Dompet', `${data.wallets.length} dompet`),
        linkRow(
          '#/rutin',
          'Pengeluaran rutin',
          (() => {
            const active = data.recurring.filter((r) => !r.endDate);
            const inactive = data.recurring.length - active.length;
            if (active.length) return `${active.length} aktif · ${formatRupiah(active.reduce((s, r) => s + r.amount, 0))} per periode`;
            return inactive ? `Tidak ada yang aktif (${inactive} nonaktif)` : 'Belum ada';
          })(),
        ),
      ),
    ),
    backupCard(ctx),
    aboutCard(),
    card(
      'Hapus data',
      h('p', { class: 'muted' }, 'Menghapus semua data aplikasi ini dari perangkat ini. Tidak bisa dibatalkan.'),
      h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: () => deleteEverything(ctx) }, icon('trash'), 'Hapus semua data'),
    ),
  );
}

function linkRow(href, label, sub) {
  return h(
    'li',
    null,
    h('a', { class: 'row row-button', href }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: label }), h('span', { class: 'row-sub', text: sub })), icon('chevronRight')),
  );
}

function incomeCard(ctx) {
  const { data, today } = ctx;
  const income = moneyInput({ value: data.settings.monthlyIncome, id: 'set-income' });
  const daySelect = h(
    'select',
    { id: 'set-day', class: 'input', value: String(data.settings.incomeDay) },
    Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, `Tanggal ${i + 1}`)),
  );
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const current = getPeriod(today, data.settings.incomeDay);

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    field({ label: 'Uang bulanan', control: income.element, forId: 'set-income' }),
    field({
      label: 'Tanggal uang masuk',
      control: daySelect,
      forId: 'set-day',
      hint: `Periode sekarang: ${formatPeriod(current)}. Kalau tanggalnya tidak ada di suatu bulan, dipakai tanggal terakhir bulan itu.`,
    }),
    error,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Simpan perubahan'),
    h('p', { class: 'hint' }, 'Dapat kiriman tambahan bulan ini? Ubah pemasukan khusus periode itu di Ringkasan.'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const notes = store.updateIncomeSettings({ monthlyIncome: income.getValue(), incomeDay: Number(daySelect.value) }, today);
      toast(['Pengaturan disimpan.', ...notes].join(' '), 'success');
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
    }
  });
  return card('Uang bulanan', form);
}

function backupCard(ctx) {
  const last = ctx.data.settings.lastBackupDate;
  return card(
    'Cadangan data',
    h('p', { class: 'muted' }, 'Data hanya tersimpan di perangkat ini. Simpan cadangan setiap bulan, dan pakai file cadangan untuk memindahkan data ke perangkat lain.'),
    h('p', null, 'Cadangan terakhir: ', h('strong', null, last ? formatDate(last) : 'belum pernah')),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'ekspor-btn', onclick: () => exportBackup(ctx.today) }, icon('download'), 'Ekspor cadangan'),
      h('button', { type: 'button', class: 'btn', id: 'impor-btn', onclick: () => chooseBackupFile({ onRestored: () => ctx.go('beranda') }) }, icon('upload'), 'Impor cadangan'),
    ),
  );
}

function aboutCard() {
  const persistText = h('span', null, 'memeriksa…');
  isPersisted().then((value) => {
    persistText.textContent =
      value === true ? 'aktif' : value === false ? 'belum diizinkan browser. Data tetap tersimpan, tapi rutin simpan cadangan supaya aman.' : 'tidak diketahui';
  });
  const updateButton = h('button', { type: 'button', class: 'btn btn-small' }, 'Periksa pembaruan');
  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    const result = await checkForUpdate();
    updateButton.disabled = false;
    const messages = {
      update: 'Versi baru ditemukan. Ketuk "Muat ulang" di bagian bawah layar.',
      latest: 'Aplikasi sudah versi terbaru.',
      offline: 'Tidak bisa memeriksa pembaruan. Pastikan ada internet.',
      unsupported: 'Pembaruan otomatis tidak didukung di browser ini.',
    };
    toast(messages[result], result === 'offline' ? 'error' : 'info');
  });

  return card(
    'Tentang',
    h('p', null, 'Uang Bulanan versi ', h('strong', { id: 'app-version' }, APP_VERSION)),
    h('p', { class: 'muted' }, 'Penyimpanan permanen: ', persistText),
    isIOS() && !isStandalone()
      ? notice('info', 'Kamu membuka aplikasi ini di Safari. Untuk dipakai sehari-hari, pasang ke Layar Utama: Bagikan → "Tambahkan ke Layar Utama". Data di Safari dan di aplikasi terpasang terpisah.')
      : null,
    updateButton,
  );
}

async function deleteEverything(ctx) {
  const first = await confirmDialog({
    title: 'Hapus semua data?',
    message: [
      'Semua pengeluaran, pengeluaran rutin, pos, dompet, catatan tabungan, dan pengaturan di perangkat ini akan dihapus.',
      'Sebaiknya ekspor cadangan dulu.',
    ],
    confirmLabel: 'Lanjutkan',
    danger: true,
  });
  if (!first) return;

  const input = h('input', { type: 'text', class: 'input', id: 'confirm-delete', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'HAPUS' });
  const answer = await openDialog({
    title: 'Yakin? Ini tidak bisa dibatalkan.',
    body: [h('p', null, 'Ketik HAPUS untuk menghapus semua data.'), input],
    buttons: [
      { label: 'Hapus semua', value: 'ok', kind: 'danger-solid' },
      { label: 'Batal', value: 'cancel', autofocus: true },
    ],
    validate: () => (input.value.trim().toUpperCase() === 'HAPUS' ? '' : 'Ketik HAPUS (huruf besar semua) untuk melanjutkan.'),
  });
  if (answer !== 'ok') return;

  ctx.ui.periodStart = null;
  ctx.ui.filters = { bucketId: '', walletId: '' };
  ctx.ui.simulation = { amount: null, bucketId: null };
  store.resetAll();
  toast('Semua data sudah dihapus.');
}
