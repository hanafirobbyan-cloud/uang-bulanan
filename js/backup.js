// -----------------------------------------------------------------------------
// backup.js — "Ekspor cadangan" (save all data as a .json file) and
// "Impor cadangan" (restore from such a file, after checking and confirming).
// -----------------------------------------------------------------------------

import * as store from './store.js';
import { makeBackup, readBackup } from './data.js';
import { nowStamp } from './clock.js';
import { formatStamp } from './format.js';
import { APP_VERSION } from './version.js';
import { isIOS } from './pwa.js';
import { h, toast, alertDialog, confirmDialog, errorMessage } from './ui.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — far more than years of data

/**
 * Save a backup file. On iPhone this opens the share sheet ("Simpan ke File",
 * AirDrop, WhatsApp, ...); elsewhere it downloads the file.
 * Must be called directly from a tap/click (the share sheet requires it).
 */
export async function exportBackup(today) {
  const text = JSON.stringify(makeBackup(store.getData(), APP_VERSION, nowStamp()), null, 2);
  const fileName = `uang-bulanan-cadangan-${today}.json`;
  const file = new File([text], fileName, { type: 'application/json' });

  if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Cadangan Uang Bulanan' });
      store.markBackupDone(today);
      toast('Cadangan siap. Pastikan kamu memilih "Simpan ke File" atau mengirimnya ke tempat aman.', 'success');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return; // the user closed the share sheet
      // Sharing failed for another reason: fall back to a normal download below.
    }
  }

  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: fileName, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  store.markBackupDone(today);
  toast(`File cadangan diunduh: ${fileName}`, 'success');
}

/** Let the user pick a backup file, check it, ask for confirmation, then restore it. */
export function chooseBackupFile({ onRestored = null } = {}) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (file) restoreFromFile(file, onRestored);
  });
  document.body.append(input);
  input.click();
}

async function restoreFromFile(file, onRestored) {
  if (file.size > MAX_FILE_SIZE) {
    await alertDialog({ title: 'Cadangan tidak bisa dipakai', message: 'File terlalu besar untuk sebuah cadangan.' });
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    await alertDialog({ title: 'Cadangan tidak bisa dipakai', message: 'File tidak bisa dibaca. Coba pilih file lagi.' });
    return;
  }

  const result = readBackup(text);
  if (!result.ok) {
    await alertDialog({ title: 'Cadangan tidak bisa dipakai', message: result.error });
    return;
  }

  const d = result.data;
  const made = formatStamp(result.exportedAt);
  const message = [
    made ? `Cadangan dibuat ${made}.` : null,
    `Isi: ${d.expenses.length} pengeluaran, ${d.recurring.length} pengeluaran rutin, ${d.buckets.length} pos, ${d.wallets.length} dompet.`,
    ...(result.problems.length ? ['Catatan:', ...result.problems] : []),
    'Semua data di perangkat ini akan DIGANTI dengan isi cadangan ini. Lanjutkan?',
  ];
  const ok = await confirmDialog({ title: 'Pulihkan cadangan?', message, confirmLabel: 'Ganti data', danger: true });
  if (!ok) return;

  try {
    store.replaceAllData(d);
  } catch (error) {
    await alertDialog({ title: 'Gagal memulihkan', message: errorMessage(error) });
    return;
  }
  toast('Cadangan berhasil dipulihkan.', 'success');
  if (onRestored) onRestored();
}
