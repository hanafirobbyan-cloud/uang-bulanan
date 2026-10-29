// -----------------------------------------------------------------------------
// income.js — screen parts for money that arrives in installments
// ("Uang Masuk Bertahap"): the "JADWAL UANG MASUK" panel, the "uang masuk hari
// ini" banner, "Geser tanggal", the schedule editor, "Cara hitung" and the
// special income of one period. All the math is in logic.js and schedule.js.
// -----------------------------------------------------------------------------

import { h, icon, moneyInput, openDialog, openSheet, toast, errorMessage, uniqueId, segmented } from './ui.js';
import { card, money, keyed, progressBar, notice } from './components.js';
import { incomeStatus, periodStartDay, addDays, isValidDateStr } from './logic.js';
import {
  SCHEDULE_PRESETS,
  MAX_INSTALLMENTS,
  splitEvenly,
  rescale,
  presetSchedule,
  sumOf,
  unallocatedText,
  checkDelay,
  canDelay,
  earliestDelayDate,
} from './schedule.js';
import { formatRupiah, formatDate, formatDateShort, formatPeriod } from './format.js';
import { shake } from './motion.js';
import * as store from './store.js';

/* ------------------------------ status badges ------------------------------ */

/** SUDAH MASUK / HARI INI / H-5 / TERTUNDA. */
export function installmentBadge(inst) {
  const text = { masuk: '▲ Sudah masuk', 'hari-ini': '▲ Hari ini', tertunda: '■ Tertunda' }[inst.state] || `H-${inst.daysUntil}`;
  return h('span', { class: `inst-badge inst-${inst.state}` }, text);
}

const dateLabel = (inst) => (inst.delayed ? `${formatDateShort(inst.date)} (jadwal ${formatDateShort(inst.plannedDate)})` : formatDateShort(inst.date));

/* --------------------------- "Geser tanggal" --------------------------- */

/** "Belum masuk, geser tanggal": the money has not arrived; it counts as not received until the new date. */
export async function openDelayDialog(ctx, inst, period) {
  if (!canDelay(inst, period, ctx.today)) {
    await openDialog({
      title: 'Tidak bisa digeser',
      body: [`Tidak ada tanggal yang lebih lambat lagi di periode ini (berakhir ${formatDate(period.end)}). Uang yang masuk setelah itu sudah termasuk periode berikutnya.`],
      buttons: [{ label: 'Mengerti', value: 'ok', kind: 'primary' }],
    });
    return;
  }
  const id = uniqueId('delay');
  const min = earliestDelayDate(inst, ctx.today);
  const input = h('input', { type: 'date', class: 'input', id, value: inst.delayed && inst.date >= min ? inst.date : min, min, max: period.end });
  const buttons = [{ label: 'Simpan', value: 'save', kind: 'primary' }];
  if (inst.delayed) buttons.push({ label: 'Sudah masuk sesuai jadwal', value: 'undo' });
  buttons.push({ label: 'Batal', value: 'cancel' });
  const answer = await openDialog({
    title: 'Geser tanggal uang masuk',
    body: [
      h('p', null, `${formatRupiah(inst.amount)}, dijadwalkan ${formatDate(inst.plannedDate)}.`),
      h('p', { class: 'muted' }, 'Sampai tanggal baru, uang ini dihitung belum masuk. Jatah harian ikut menyesuaikan.'),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, 'Perkiraan masuk'), input),
    ],
    buttons,
    validate: (value) => (value === 'save' ? checkDelay(inst, input.value, period, ctx.today) : ''),
  });
  try {
    if (answer === 'save') {
      store.delayInstallment(period.start, inst.id, input.value, ctx.today);
      toast(`Uang masuk ${formatRupiah(inst.amount)} digeser ke ${formatDate(input.value)}.`, 'success');
    } else if (answer === 'undo') {
      store.undoDelay(period.start, inst.id);
      toast('Kembali ke jadwal semula.', 'success');
    }
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ------------------------- banners on Beranda ------------------------- */

/** "Hari ini uang masuk Rp X. Belum masuk?" for every installment that arrives today. */
export function arrivalBanners(ctx, status) {
  return status.arrivedToday.map((inst) =>
    keyed(
      notice(
        'success',
        [h('strong', null, `Hari ini uang masuk ${formatRupiah(inst.amount)}.`), ' Belum masuk?'],
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => openDelayDialog(ctx, inst, status.period) }, 'Geser tanggal'),
      ),
      `arrived:${inst.id}`,
    ),
  );
}

/* ------------------------- JADWAL UANG MASUK panel ------------------------- */

/**
 * The panel with this period's installments: date, amount, status, a progress
 * line "Rp masuk / Rp total (xx%)", the countdown to the next one and
 * "UANG DI TANGAN". With `actions`, every installment can be moved.
 */
export function incomePanel(ctx, budget, { actions = true, title = 'Jadwal uang masuk' } = {}) {
  const status = budget.incomeStatus;
  const percent = status.total > 0 ? Math.floor((status.received / status.total) * 100) : 0;
  const rows = status.installments.map((inst) =>
    h(
      'li',
      { class: `inst-row is-${inst.state}`, 'data-key': `inst:${inst.id}` },
      h('span', { class: 'inst-date' }, dateLabel(inst)),
      h('span', { class: 'inst-amount' }, formatRupiah(inst.amount)),
      installmentBadge(inst),
      actions
        ? h(
            'button',
            { type: 'button', class: 'btn btn-small inst-action', 'aria-label': `Geser tanggal uang masuk ${formatRupiah(inst.amount)} ${formatDate(inst.date)}`, onclick: () => openDelayDialog(ctx, inst, status.period) },
            inst.delayed ? 'Ubah' : 'Geser',
          )
        : null,
    ),
  );
  const next = status.next;
  const countdown = next
    ? h('p', { class: 'inst-next' }, h('span', { class: 'label' }, 'Berikutnya'), ` ${formatDateShort(next.date, true)} · ${formatRupiah(next.amount)} · `, h('strong', null, next.daysUntil === 1 ? 'besok' : `${next.daysUntil} hari lagi`))
    : h('p', { class: 'inst-next' }, h('span', { class: 'label' }, 'Berikutnya'), ' Semua uang periode ini sudah masuk.');
  return keyed(
    card(
      title,
      status.installments.length
        ? h('ul', { class: 'inst-list' }, rows)
        : h('p', { class: 'muted' }, 'Tidak ada uang masuk di periode ini.'),
      h(
        'div',
        { class: 'inst-progress' },
        h('p', { class: 'inst-progress-text' }, h('span', { class: 'label' }, 'Masuk'), ' ', money(status.received, '', 'income:received'), ' / ', money(status.total), ` (${percent}%)`),
        progressBar(status.received, status.total, `Uang masuk ${formatRupiah(status.received)} dari ${formatRupiah(status.total)}`, 'income:progress', 'amber'),
      ),
      countdown,
      h(
        'div',
        { class: 'cash-line' },
        h('span', { class: 'label' }, 'Uang di tangan'),
        money(budget.cashOnHand, 'cash-amount', 'income:cash'),
      ),
      h('p', { class: 'hint' }, 'Uang di tangan = uang yang sudah masuk − pengeluaran sampai hari ini − tagihan rutin yang sudah jatuh tempo.'),
    ),
    'card:income',
  );
}

/* ------------------------------ schedule editor ------------------------------ */

const dayOptions = () => Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, `Tgl ${i + 1}`));

/**
 * Edit the monthly schedule: the monthly total, 1–8 installments (day + amount),
 * "Bagi rata", presets, "Bagi ulang proporsional", and a live
 * "Belum dialokasikan: Rp X" until the installments add up exactly.
 * With a single installment, its amount follows the total ("Sekaligus").
 * Nothing is saved here: getValue() returns { total, installments }.
 */
export function scheduleEditor({ total = null, installments = [], startDay = 1 } = {}) {
  let list = installments.length ? installments.map((i) => ({ ...i })) : [{ day: startDay, amount: total }];
  let lastTotal = total;
  const rows = h('ol', { class: 'sched-rows' });
  const status = h('p', { class: 'sched-status', 'aria-live': 'polite' });
  const totalInput = moneyInput({ value: total, id: uniqueId('sched-total'), placeholder: 'Contoh: 3.000.000', onInput: onTotal });
  const addButton = h('button', { type: 'button', class: 'btn btn-small', onclick: addRow }, icon('plus'), 'Tambah uang masuk');
  const presets = h(
    'div',
    { class: 'button-row sched-presets', role: 'group', 'aria-label': 'Pilihan cepat' },
    SCHEDULE_PRESETS.map((p) => h('button', { type: 'button', class: 'btn btn-small', onclick: () => applyPreset(p.id) }, p.label)),
  );
  const helpers = h(
    'div',
    { class: 'button-row' },
    h('button', { type: 'button', class: 'btn btn-small', onclick: splitEven }, 'Bagi rata'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: splitProportional }, 'Bagi ulang proporsional'),
  );
  const element = h(
    'div',
    { class: 'sched-editor' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: totalInput.input.id }, 'Total uang bulanan'), totalInput.element),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Pilihan cepat'), presets),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Uang masuk (tanggal & jumlah)'), rows, h('div', { class: 'button-row' }, addButton)),
    helpers,
    status,
  );

  function onTotal(value) {
    // "Sekaligus": one installment simply follows the total.
    if (list.length === 1 && (list[0].amount === null || list[0].amount === lastTotal)) {
      list[0].amount = value;
      const input = rows.querySelector('.money-input');
      if (input) input.value = Number.isInteger(value) ? value.toLocaleString('id-ID') : '';
    }
    lastTotal = value;
    updateStatus();
  }

  function row(item, index) {
    const daySelect = h('select', { class: 'input sched-day', 'aria-label': `Tanggal uang masuk ke-${index + 1}`, value: String(item.day) }, dayOptions());
    daySelect.addEventListener('change', () => {
      item.day = Number(daySelect.value);
      updateStatus();
    });
    const amount = moneyInput({
      value: item.amount,
      label: `Jumlah uang masuk ke-${index + 1}`,
      placeholder: '0',
      onInput: (value) => {
        item.amount = value;
        updateStatus();
      },
    });
    return h(
      'li',
      { class: 'sched-row' },
      h('span', { class: 'sched-no', 'aria-hidden': 'true' }, `#${index + 1}`),
      daySelect,
      amount.element,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Hapus uang masuk ke-${index + 1}`, disabled: list.length <= 1, onclick: () => removeRow(item) }, icon('trash')),
    );
  }

  function draw() {
    rows.replaceChildren(...list.map(row));
    addButton.disabled = list.length >= MAX_INSTALLMENTS;
    updateStatus();
  }

  function updateStatus() {
    const totalValue = totalInput.getValue();
    const gap = (Number.isInteger(totalValue) ? totalValue : 0) - sumOf(list);
    const days = [...new Set(list.map((i) => i.day))].sort((a, b) => a - b);
    const ok = gap === 0 && sumOf(list) > 0;
    status.className = `sched-status ${ok ? 'is-ok' : 'is-error'}`;
    status.replaceChildren(
      ok ? `▲ Pas: semua sudah dialokasikan. ` : `▼ ${unallocatedText(gap)} `,
      h('span', { class: 'muted' }, `Periode mulai tanggal ${days[0] || 1}; uang masuk tgl ${days.join(', ')}.`),
    );
  }

  function addRow() {
    if (list.length >= MAX_INSTALLMENTS) return;
    const lastDay = list.length ? list[list.length - 1].day : 1;
    list.push({ day: Math.min(31, lastDay + 7), amount: null });
    draw();
    rows.lastElementChild.querySelector('.money-input').focus();
  }

  function removeRow(item) {
    if (list.length <= 1) return;
    list = list.filter((i) => i !== item);
    draw();
  }

  function applyPreset(id) {
    const startNow = list.length ? Math.min(...list.map((i) => i.day)) : startDay;
    list = presetSchedule(id, totalInput.getValue(), startNow);
    draw();
  }

  function splitEven() {
    const totalValue = totalInput.getValue();
    if (!Number.isInteger(totalValue) || totalValue <= 0) {
      shake(totalInput.element);
      return;
    }
    splitEvenly(totalValue, list.length).forEach((amount, i) => {
      list[i].amount = amount;
    });
    draw();
  }

  function splitProportional() {
    const totalValue = totalInput.getValue();
    if (!Number.isInteger(totalValue) || totalValue <= 0) {
      shake(totalInput.element);
      return;
    }
    rescale(list.map((i) => i.amount), totalValue).forEach((amount, i) => {
      list[i].amount = amount;
    });
    draw();
  }

  draw();
  return {
    element,
    totalElement: totalInput.element,
    rowsElement: rows,
    getValue: () => ({ total: totalInput.getValue(), installments: list.map((i) => ({ ...i })) }),
  };
}

/** Pengaturan / MSK: the schedule editor with its save key. */
export function scheduleCard(ctx) {
  const { data, today } = ctx;
  const editor = scheduleEditor({
    total: data.settings.monthlyIncome || null,
    installments: data.settings.incomeSchedule.map((i) => ({ id: i.id, day: i.day, amount: i.amount })),
    startDay: periodStartDay(data),
  });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h('p', { class: 'muted' }, 'Kapan saja dan berapa uang dikirim setiap bulan. Tanggal paling awal memulai periode. Total harus sama dengan jumlah semua uang masuk.'),
    editor.element,
    error,
    h('button', { type: 'submit', class: 'btn btn-primary', id: 'save-schedule' }, 'Simpan jadwal'),
    h('p', { class: 'hint' }, 'Bulan ini beda (misalnya dapat kiriman tambahan)? Ubah uang masuk khusus periode itu di Ringkasan.'),
  );
  form.addEventListener('input', () => {
    error.hidden = true;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const notes = store.updateIncomeSchedule(editor.getValue(), today);
      toast(['Jadwal uang masuk disimpan.', ...notes].join(' '), 'success');
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
      shake(err && err.field === 'total' ? editor.totalElement : err && err.field === 'installments' ? editor.rowsElement : error);
    }
  });
  return keyed(card('Jadwal uang masuk', form), 'card:schedule');
}

/* ------------------------------- Cara hitung ------------------------------- */

const MODE_TEXT = {
  'hati-hati': {
    label: 'Hati-hati',
    title: 'Hati-hati (hanya uang yang sudah masuk)',
    text: 'Jatah harian dihitung dari uang yang sudah masuk saja, dibagi sampai sehari sebelum uang masuk berikutnya. Paling aman kalau kiriman kadang telat. Saat uang baru masuk, jatah harian naik; sisa yang tidak terpakai ikut terbawa.',
  },
  total: {
    label: 'Total bulan',
    title: 'Total bulan (dibagi rata)',
    text: 'Jatah harian dihitung dari total uang sebulan, dibagi rata sampai akhir periode (seperti versi sebelumnya). Angkanya stabil, tapi bisa lebih besar dari uang yang sudah benar-benar ada. Kalau begitu, muncul peringatan.',
  },
};

/** The "Cara hitung" switch with an explanation of both ways. Saves right away. */
export function calcModeCard(ctx) {
  const current = ctx.data.settings.calcMode;
  const choice = segmented({
    label: 'Cara hitung',
    value: current,
    options: Object.entries(MODE_TEXT).map(([value, m]) => ({ value, label: m.label })),
    onChange: (value) => {
      try {
        store.setCalcMode(value);
        toast(`Cara hitung: ${MODE_TEXT[value].title}.`, 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    },
  });
  return keyed(
    card(
      'Cara hitung',
      choice.element,
      h(
        'dl',
        { class: 'mode-list' },
        Object.entries(MODE_TEXT).map(([value, m]) =>
          h('div', { class: `mode-item${value === current ? ' is-current' : ''}` }, h('dt', null, value === current ? `▶ ${m.title}` : m.title, value === 'hati-hati' ? h('span', { class: 'tag' }, 'Disarankan') : null), h('dd', null, m.text)),
        ),
      ),
    ),
    'card:mode',
  );
}

/* --------------------------- special period income --------------------------- */

/**
 * "Ubah uang masuk periode ini": amounts and dates of ONE period's installments,
 * without changing the monthly schedule. The sum must equal that period's total.
 */
export function openPeriodIncomeEditor(ctx, period) {
  const data = store.getData();
  const status = incomeStatus(data, ctx.today, period);
  const isOverride = Boolean(data.incomeOverrides[period.start]);
  let list = status.installments.map((i) => ({ id: i.id, date: i.date, amount: i.amount }));
  const rows = h('ol', { class: 'sched-rows' });
  const info = h('p', { class: 'sched-status', 'aria-live': 'polite' });
  const totalInput = moneyInput({ value: status.total, id: uniqueId('period-total'), placeholder: '0', onInput: updateStatus });
  const addButton = h('button', { type: 'button', class: 'btn btn-small', onclick: addRow }, icon('plus'), 'Tambah uang masuk');

  function row(item, index) {
    const date = h('input', { type: 'date', class: 'input', value: item.date, min: period.start, max: period.end, 'aria-label': `Tanggal uang masuk ke-${index + 1}` });
    const onDate = () => {
      item.date = date.value;
      updateStatus();
    };
    date.addEventListener('input', onDate);
    date.addEventListener('change', onDate);
    const amount = moneyInput({
      value: item.amount,
      label: `Jumlah uang masuk ke-${index + 1}`,
      onInput: (value) => {
        item.amount = value;
        updateStatus();
      },
    });
    return h(
      'li',
      { class: 'sched-row sched-row-date' },
      h('span', { class: 'sched-no', 'aria-hidden': 'true' }, `#${index + 1}`),
      date,
      amount.element,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Hapus uang masuk ke-${index + 1}`, onclick: () => removeRow(item) }, icon('trash')),
    );
  }
  function draw() {
    rows.replaceChildren(...list.map(row));
    addButton.disabled = list.length >= MAX_INSTALLMENTS;
    updateStatus();
  }
  function updateStatus() {
    const total = totalInput.getValue() ?? 0;
    const gap = total - sumOf(list);
    info.className = `sched-status ${gap === 0 ? 'is-ok' : 'is-error'}`;
    info.textContent = gap === 0 ? '▲ Pas: semua sudah dialokasikan.' : `▼ ${unallocatedText(gap)}`;
  }
  function addRow() {
    const last = list.length ? list[list.length - 1].date : period.start;
    const date = isValidDateStr(last) && addDays(last, 7) <= period.end ? addDays(last, 7) : period.end;
    list.push({ date, amount: null });
    draw();
  }
  function removeRow(item) {
    list = list.filter((i) => i !== item);
    draw();
  }
  function splitEven() {
    const total = totalInput.getValue();
    if (!Number.isInteger(total) || !list.length) return;
    splitEvenly(total, list.length).forEach((amount, i) => {
      list[i].amount = amount;
    });
    draw();
  }

  const footer = [];
  if (isOverride) {
    footer.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-block',
          onclick: () => {
            try {
              store.setPeriodIncome(period.start, null);
              sheet.close();
              toast('Periode ini kembali memakai jadwal biasa.', 'success');
            } catch (err) {
              sheet.showError(errorMessage(err));
            }
          },
        },
        'Pakai jadwal biasa',
      ),
    );
  }

  const sheet = openSheet({
    title: 'Uang masuk periode ini',
    content: [
      h('p', { class: 'muted' }, `Hanya untuk periode ${formatPeriod(period)}, misalnya kalau ada kiriman tambahan atau tanggalnya beda. Jadwal bulanan tidak berubah.`),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: totalInput.input.id }, 'Total periode ini'), totalInput.element),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Uang masuk (tanggal & jumlah)'), rows, h('div', { class: 'button-row' }, addButton, h('button', { type: 'button', class: 'btn btn-small', onclick: splitEven }, 'Bagi rata'))),
      info,
    ],
    footer,
    fields: { total: totalInput.element, installments: rows },
    onSubmit: () => {
      store.setPeriodIncome(period.start, { total: totalInput.getValue(), installments: list.map((i) => ({ ...i })) });
      toast('Uang masuk periode ini disimpan.', 'success');
    },
  });
  draw();
  return sheet;
}

