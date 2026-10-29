// First-run setup: the income schedule (when and how much money arrives), the
// money left right now, and the budget buckets.

import { append, h, icon, moneyInput, toast, errorMessage } from '../ui.js';
import { bucketEditor, notice } from '../components.js';
import { DEFAULT_BUCKETS, DEFAULT_WALLETS } from '../data.js';
import { getPeriod, daysBetween } from '../logic.js';
import { formatPeriod } from '../format.js';
import { chooseBackupFile } from '../backup.js';
import { shake } from '../motion.js';
import { isIOS, isStandalone } from '../pwa.js';
import { scheduleEditor } from '../income.js';
import * as store from '../store.js';

export const title = 'Selamat datang';

export function render(main, ctx) {
  const schedule = scheduleEditor({ total: null, installments: [{ day: 1, amount: null }], startDay: 1 });
  const editor = bucketEditor({ buckets: DEFAULT_BUCKETS, makeId: store.makeId });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  // Started in the middle of a period? Then part of this month's money may already be gone.
  const remaining = moneyInput({ id: 'setup-remaining', placeholder: 'Contoh: 800.000' });
  const remainingHint = h('p', { class: 'hint' });
  const updateRemainingHint = () => {
    const days = schedule.getValue().installments.map((i) => i.day);
    const period = getPeriod(ctx.today, Math.min(...days));
    remainingHint.textContent =
      period.start === ctx.today
        ? `Periode baru dimulai hari ini (${formatPeriod(period)}), jadi biasanya tidak perlu diisi.`
        : `Periode sekarang ${formatPeriod(period)}, sisa ${daysBetween(ctx.today, period.nextStart)} hari. Kalau uang yang sudah masuk periode ini sebagian terpakai, isi uang yang masih ada sekarang. Uang masuk yang jadwalnya masih nanti tetap dihitung.`;
  };
  schedule.element.addEventListener('change', updateRemainingHint);
  schedule.element.addEventListener('click', () => setTimeout(updateRemainingHint, 0));
  updateRemainingHint();

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, h('span', { class: 'panel-no', 'aria-hidden': 'true' }, '[1]'), h('span', null, 'Uang bulanan')),
      h(
        'div',
        { class: 'card-body' },
        h('p', { class: 'muted' }, 'Berapa uang yang dikirim setiap bulan, dan tanggal berapa? Kalau dikirim sekaligus, cukup isi totalnya dan tanggalnya. Kalau bertahap, pakai pilihan cepat atau tambah uang masuk.'),
        schedule.element,
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'setup-remaining' }, 'Sisa uang untuk periode ini (opsional)'), remaining.element, remainingHint),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, h('span', { class: 'panel-no', 'aria-hidden': 'true' }, '[2]'), h('span', null, 'Pos anggaran')),
      h(
        'div',
        { class: 'card-body' },
        h('p', { class: 'muted' }, 'Uangmu dibagi ke pos-pos ini. Pos yang "bisa dipakai" dihitung untuk uang harian; pos lain disimpan. Boleh diubah sekarang atau nanti di Pengaturan.'),
        editor.element,
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, h('span', { class: 'panel-no', 'aria-hidden': 'true' }, '[3]'), h('span', null, 'Dompet')),
      h('div', { class: 'card-body' }, h('p', { class: 'muted' }, `${DEFAULT_WALLETS.map((w) => w.name).join(', ')}. Bisa ditambah atau diubah nanti di menu Dompet.`)),
    ),
    error,
    h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', id: 'setup-start' }, 'Mulai'),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      store.completeSetup(
        {
          income: schedule.getValue(),
          buckets: editor.getBuckets(),
          currentRemaining: remaining.getValue(), // null when left empty
        },
        ctx.today,
      );
      toast('Siap! Selamat mengatur uang bulananmu.', 'success');
      ctx.go('beranda');
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
      error.scrollIntoView({ block: 'center' });
      const fields = { total: schedule.totalElement, installments: schedule.rowsElement, remaining: remaining.element, buckets: editor.element };
      shake(fields[err && err.field] || error);
    }
  });

  append(
    main,
    h(
      'header',
      { class: 'welcome' },
      h('p', { class: 'welcome-mark', 'aria-hidden': 'true' }, 'Rp_'),
      h('h1', { class: 'screen-title' }, 'Selamat datang di Uang Bulanan'),
      h('p', { class: 'muted' }, 'Atur uang kiriman bulananmu supaya cukup sampai transfer berikutnya. Semua data hanya tersimpan di perangkat ini, tanpa akun dan tanpa internet.'),
    ),
    isIOS() && !isStandalone()
      ? notice(
          'info',
          [
            h('strong', null, 'Pakai iPhone? Pasang aplikasinya dulu.'),
            h('span', null, ' Ketuk tombol Bagikan ', icon('share', 'icon icon-inline'), ' di Safari → "Tambahkan ke Layar Utama", lalu buka dari ikon di Layar Utama dan isi data di sana. Data di Safari dan di aplikasi yang terpasang tidak saling terhubung.'),
          ],
        )
      : null,
    form,
    h(
      'p',
      { class: 'center muted restore-line' },
      'Sudah punya file cadangan? ',
      h('button', { type: 'button', class: 'link-btn', onclick: () => chooseBackupFile({ onRestored: () => ctx.go('beranda') }) }, 'Pulihkan dari file cadangan'),
    ),
  );
}
