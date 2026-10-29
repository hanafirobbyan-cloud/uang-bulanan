// Pengaturan: the income schedule ("Jadwal Uang Masuk") and "Cara hitung",
// links to buckets / wallets / recurring, backup (export / import), app
// version and "Hapus semua data".

import { append, h, icon, toast, errorMessage, confirmDialog, openDialog } from '../ui.js';
import { screenHeader, card, notice, keyed } from '../components.js';
import { formatRupiah, formatDate } from '../format.js';
import { scheduleCard, calcModeCard } from '../income.js';
import { exportBackup, chooseBackupFile } from '../backup.js';
import { checkForUpdate, isIOS, isStandalone } from '../pwa.js';
import { isPersisted } from '../storage.js';
import { APP_VERSION } from '../version.js';
import * as store from '../store.js';

export const title = 'Pengaturan';

export function render(main, ctx) {
  const { data } = ctx;
  // Panels are numbered in the order they are made, so make them in the order they are shown.
  const schedule = scheduleCard(ctx);
  const mode = calcModeCard(ctx);
  const active = data.recurring.filter((r) => !r.endDate);
  const inactive = data.recurring.length - active.length;
  let recurringText = 'Belum ada';
  if (active.length) recurringText = `${active.length} aktif · ${formatRupiah(active.reduce((s, r) => s + r.amount, 0))} per periode`;
  else if (inactive) recurringText = `Tidak ada yang aktif (${inactive} nonaktif)`;

  const manage = card(
    'Kelola',
    h(
      'ul',
      { class: 'rows' },
      linkRow('#/pos', 'Pos anggaran', data.buckets.map((b) => `${b.name} ${b.percent}%`).join(' · ')),
      linkRow('#/dompet', 'Dompet', `${data.wallets.length} dompet`),
      linkRow('#/rutin', 'Pengeluaran rutin', recurringText),
    linkRow('#/masuk', 'Status uang masuk periode ini', 'Geser tanggal kalau uang belum masuk'),
    ),
  );
  const backup = backupCard(ctx);
  const about = aboutCard();
  const danger = card(
    'Hapus data',
    h('p', { class: 'muted' }, 'Menghapus semua data aplikasi ini dari perangkat ini. Tidak bisa dibatalkan.'),
    h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: () => deleteEverything(ctx) }, icon('trash'), 'Hapus semua data'),
  );

  append(
    main,
    keyed(screenHeader('Pengaturan'), 'header'),
    schedule,
    mode,
    keyed(manage, 'card:manage'),
    keyed(backup, 'card:backup'),
    keyed(about, 'card:about'),
    keyed(danger, 'card:danger'),
  );
}

function linkRow(href, label, sub) {
  return h(
    'li',
    null,
    h('a', { class: 'row row-button', href }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: label }), h('span', { class: 'row-sub', text: sub })), icon('chevronRight')),
  );
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
    preUpdateSection(ctx),
  );
}

/** "Pulihkan data sebelum update": only shown when a copy from before an app upgrade exists. */
function preUpdateSection(ctx) {
  const info = store.preUpdateInfo();
  if (!info) return null;
  const when = info.savedOn ? formatDate(info.savedOn) : 'sebelum update';
  const restore = async () => {
    const ok = await confirmDialog({
      title: 'Pulihkan data sebelum update?',
      message: [
        `Data sekarang akan diganti dengan salinan yang disimpan otomatis pada ${when}, sebelum aplikasi diperbarui.`,
        'Semua perubahan setelah tanggal itu akan hilang. Sebaiknya ekspor cadangan dulu.',
      ],
      confirmLabel: 'Pulihkan',
      danger: true,
    });
    if (!ok) return;
    try {
      store.restorePreUpdate();
      toast('Data sebelum update sudah dipulihkan.', 'success');
      ctx.go('beranda');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return h(
    'div',
    { class: 'pre-update' },
    h('p', { class: 'hint' }, `Salinan data sebelum aplikasi diperbarui (${when}) disimpan otomatis. Pakai hanya kalau ada data yang hilang setelah update.`),
    h('button', { type: 'button', class: 'btn btn-small', id: 'restore-pre-update', onclick: restore }, 'Pulihkan data sebelum update'),
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
      'Semua pengeluaran, pengeluaran rutin, pos, dompet, jadwal uang masuk, rencana, catatan tabungan, dan pengaturan di perangkat ini akan dihapus.',
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
  ctx.ui.plan = { perDay: null, buy: null };
  store.resetAll();
  toast('Semua data sudah dihapus.');
}
