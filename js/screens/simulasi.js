// Simulasi "kalau beli ini": what happens to today's numbers if I buy something. Saves nothing.

import { append, h, icon, moneyInput, chipGroup } from '../ui.js';
import { screenHeader, card, money, notice } from '../components.js';
import { simulatePurchase, dailyBudget } from '../logic.js';
import { checkAmount } from '../data.js';
import { formatRupiah } from '../format.js';
import { openExpenseForm } from './expense-form.js';

export const title = 'Simulasi';

export function render(main, ctx) {
  const { data, ui } = ctx;
  const sim = ui.simulation; // remembered while the app is open
  if (!data.buckets.some((b) => b.id === sim.bucketId)) {
    sim.bucketId = (data.buckets.find((b) => b.spendable) || data.buckets[0]).id;
  }

  const results = h('div', { class: 'sim-results', 'aria-live': 'polite' });
  const amount = moneyInput({
    value: sim.amount,
    id: 'sim-amount',
    large: true,
    placeholder: '0',
    onInput: (value) => {
      sim.amount = value;
      update();
    },
  });
  const bucketChoice = chipGroup({
    legend: 'Masuk pos',
    options: data.buckets.map((b) => ({ value: b.id, label: b.name })),
    value: sim.bucketId,
    onChange: (value) => {
      sim.bucketId = value;
      update();
    },
  });

  function update() {
    results.replaceChildren(...resultNodes(ctx, sim));
  }

  append(
    main,
    screenHeader('Simulasi', 'Kalau beli ini, uang harianku jadi berapa?'),
    card(
      null,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sim-amount' }, 'Harga barang'), amount.element),
      bucketChoice.element,
    ),
    results,
    h('p', { class: 'hint center' }, 'Simulasi tidak menyimpan apa pun.'),
  );
  update();
}

function compareRow(label, before, after, note = null) {
  return h(
    'div',
    { class: 'compare-row' },
    h('dt', null, label),
    h('dd', null, money(before), h('span', { class: 'arrow', 'aria-label': 'menjadi' }, ' → '), money(after), note ? h('small', { class: 'muted' }, ` ${note}`) : null),
  );
}

function resultNodes(ctx, sim) {
  const { data, today } = ctx;
  const bucket = data.buckets.find((b) => b.id === sim.bucketId);

  if (sim.amount === null || sim.amount === 0) {
    const now = dailyBudget(data, today);
    return [card(null, h('p', null, 'Sekarang aman dipakai hari ini: ', money(now.sisaHariIni)), h('p', { class: 'muted' }, 'Ketik harga barang untuk melihat dampaknya.'))];
  }
  const amountError = checkAmount(sim.amount);
  if (amountError) return [notice('warning', amountError)];

  const r = simulatePurchase(data, today, sim.amount, sim.bucketId);
  const nodes = [];

  if (!r.affectsDaily) {
    nodes.push(notice('info', `Pos "${bucket.name}" tidak dipakai untuk uang harian, jadi uang harian tidak berubah. Hanya sisa pos ini yang berkurang.`));
    if (r.after.bucketRemaining < 0) nodes.push(notice('danger', `Pos "${bucket.name}" akan melebihi anggaran sebesar ${formatRupiah(-r.after.bucketRemaining)}.`));
  } else if (r.after.sisaHariIni < 0) {
    const lines = [h('strong', null, `Melebihi anggaran hari ini sebesar ${formatRupiah(-r.after.sisaHariIni)}.`)];
    if (r.hasTomorrow) {
      lines.push(h('span', null, ` Kalau tetap dibeli, jatah per hari mulai besok jadi ${formatRupiah(r.after.amanBesok)}.`));
    }
    if (r.after.remainingInPeriod < 0) {
      lines.push(h('span', null, ' Uang yang bisa dipakai periode ini juga tidak cukup.'));
    }
    nodes.push(notice('danger', lines));
  } else {
    nodes.push(notice('success', `Aman. Setelah beli, masih sisa ${formatRupiah(r.after.sisaHariIni)} untuk hari ini.`));
  }

  nodes.push(
    card(
      'Sebelum → sesudah',
      h(
        'dl',
        { class: 'compare' },
        compareRow('Aman dipakai hari ini', r.before.sisaHariIni, r.after.sisaHariIni),
        compareRow('Jatah hari ini', r.before.amanHariIni, r.after.amanHariIni, '(tetap sampai besok)'),
        r.hasTomorrow
          ? compareRow('Jatah per hari mulai besok', r.before.amanBesok, r.after.amanBesok)
          : h('div', { class: 'compare-row' }, h('dt', null, 'Jatah mulai besok'), h('dd', { class: 'muted' }, 'Besok sudah periode baru.')),
        compareRow(`Sisa pos ${bucket.name}`, r.before.bucketRemaining, r.after.bucketRemaining),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-block',
          onclick: () =>
            openExpenseForm(ctx, {
              prefill: { amount: sim.amount, bucketId: sim.bucketId },
              onSaved: () => {
                sim.amount = null; // it is a real expense now; start a fresh simulation
              },
            }),
        },
        icon('plus'),
        'Jadi beli? Catat pengeluaran',
      ),
    ),
  );
  return nodes;
}
