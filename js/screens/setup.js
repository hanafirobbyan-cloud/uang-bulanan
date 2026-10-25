// First-run setup: monthly amount, income day and the budget buckets.

import { append, h, icon, moneyInput, toast, errorMessage, field } from '../ui.js';
import { bucketEditor, notice } from '../components.js';
import { DEFAULT_BUCKETS, DEFAULT_WALLETS } from '../data.js';
import { getPeriod, daysBetween } from '../logic.js';
import { formatPeriod } from '../format.js';
import { chooseBackupFile } from '../backup.js';
import { shake } from '../motion.js';
import { isIOS, isStandalone } from '../pwa.js';
import * as store from '../store.js';

export const title = 'Selamat datang';

export function render(main, ctx) {
  const income = moneyInput({ id: 'setup-income', placeholder: 'Contoh: 2.000.000' });
  const daySelect = h(
    'select',
    { id: 'setup-day', class: 'input' },
    Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1), text: `Tanggal ${i + 1}` })),
  );
  const editor = bucketEditor({ buckets: DEFAULT_BUCKETS, makeId: store.makeId });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  // Started in the middle of a period? Then part of this month's money may already be gone.
  const remaining = moneyInput({ id: 'setup-remaining', placeholder: 'Contoh: 800.000' });
  const remainingHint = h('p', { class: 'hint' });
  const updateRemainingHint = () => {
    const period = getPeriod(ctx.today, Number(daySelect.value));
    remainingHint.textContent =
      period.start === ctx.today
        ? `Periode baru dimulai hari ini (${formatPeriod(period)}), jadi biasanya tidak perlu diisi.`
        : `Periode sekarang ${formatPeriod(period)}, sisa ${daysBetween(ctx.today, period.nextStart)} hari. Kalau uang bulan ini sudah sebagian terpakai, isi uang yang masih ada sekarang supaya hitungan harian pas.`;
  };
  daySelect.addEventListener('change', updateRemainingHint);
  updateRemainingHint();

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h(
      'section',
      { class: 'card stack' },
      h('h2', { class: 'card-title' }, '1. Uang bulanan'),
      field({
        label: 'Berapa uang yang biasanya dikirim setiap bulan?',
        control: income.element,
        forId: 'setup-income',
      }),
      field({
        label: 'Tanggal berapa uangnya biasanya masuk?',
        control: daySelect,
        forId: 'setup-day',
        hint: 'Kalau tanggal itu tidak ada di suatu bulan (misalnya tanggal 31), dipakai tanggal terakhir bulan itu.',
      }),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label', for: 'setup-remaining' }, 'Sisa uang untuk periode ini (opsional)'),
        remaining.element,
        remainingHint,
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', { class: 'card-title' }, '2. Pos anggaran'),
      h('p', { class: 'muted' }, 'Uangmu dibagi ke pos-pos ini. Pos yang "bisa dipakai" dihitung untuk uang harian; pos lain disimpan. Boleh diubah sekarang atau nanti di Pengaturan.'),
      editor.element,
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', { class: 'card-title' }, '3. Dompet'),
      h('p', { class: 'muted' }, `${DEFAULT_WALLETS.map((w) => w.name).join(', ')}. Bisa ditambah atau diubah nanti di menu Dompet.`),
    ),
    error,
    h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block' }, 'Mulai'),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      store.completeSetup(
        {
          monthlyIncome: income.getValue(),
          incomeDay: Number(daySelect.value),
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
      const fields = { income: income.element, incomeDay: daySelect, remaining: remaining.element, buckets: editor.element };
      shake(fields[err && err.field] || error);
    }
  });

  append(
    main,
    h(
      'header',
      { class: 'welcome' },
      h('img', { src: './icons/icon-192.png', alt: '', width: '64', height: '64', class: 'welcome-icon' }),
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
