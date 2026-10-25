// The "Rencana Cukup" form: create a plan or change the active one (opens as a sheet).

import { h, icon, moneyInput, segmented, stepper, expandable, openSheet, openDialog, alertDialog, toast, field, uniqueId } from '../ui.js';
import { statusBadge } from '../components.js';
import { dailyBudget, isValidDateStr, daysBetween } from '../logic.js';
import { planEndDate, planReport, nextDueDate, WEEKEND_WEIGHT_DEFAULT, WEEKEND_WEIGHT_MIN, WEEKEND_WEIGHT_MAX, WEEKEND_WEIGHT_STEP } from '../planner.js';
import { MAX_NAME_LENGTH } from '../data.js';
import { formatRupiah, formatDate, formatDateLong, formatDateShort } from '../format.js';
import { enter, removeWithFlip } from '../motion.js';
import * as store from '../store.js';

/** 150 -> '1,5×' */
const formatWeight = (weight) => `${(weight / 100).toLocaleString('id-ID')}×`;

/**
 * Open the plan form. Call it directly from a tap (the keyboard opens on iPhone).
 *   plan – the active plan to change, or nothing to make a new one (starting today)
 */
export function openPlanForm(ctx, { plan = null } = {}) {
  const data = store.getData();
  const isEdit = Boolean(plan);
  const startDate = isEdit ? plan.startDate : ctx.today;
  const incomeDay = data.settings.incomeDay;
  const state = {
    endMode: isEdit ? plan.endMode : 'income',
    customEnd: isEdit && plan.endMode === 'custom' ? plan.endDate : planEndDate('income', startDate, incomeDay),
    pattern: isEdit ? plan.pattern : 'even',
    weekendWeight: isEdit ? plan.weekendWeight : WEEKEND_WEIGHT_DEFAULT,
    obligations: isEdit ? plan.obligations.map((o) => ({ ...o })) : [],
  };
  const endDate = () => (state.endMode === 'custom' ? state.customEnd : planEndDate(state.endMode, startDate, incomeDay));

  /* ---- 1. money ---- */
  const money = moneyInput({ value: isEdit ? plan.money : null, id: uniqueId('plan-money'), large: true, autofocus: !isEdit, label: 'Uang yang kupunya sekarang', onInput: updatePreview });
  const fillButton = isEdit
    ? null
    : h('button', { type: 'button', class: 'btn btn-small', id: 'plan-fill', onclick: fillFromBudget }, 'Isi dari sisa anggaran');
  function fillFromBudget() {
    const left = dailyBudget(store.getData(), ctx.today).remainingInPeriod;
    money.setValue(Math.max(0, left));
    toast(left > 0 ? `Diisi ${formatRupiah(left)}: sisa uang yang bisa dipakai periode ini.` : 'Sisa anggaran periode ini sudah habis.');
  }

  /* ---- 2. until when ---- */
  const endInfo = h('p', { class: 'hint plan-end-info' });
  const customId = uniqueId('plan-end');
  const customInput = h('input', { type: 'date', class: 'input', id: customId, value: state.customEnd, min: startDate });
  const onCustom = () => {
    state.customEnd = customInput.value;
    updatePreview();
  };
  customInput.addEventListener('input', onCustom);
  customInput.addEventListener('change', onCustom);
  const customPart = expandable(field({ label: 'Tanggal akhir', control: customInput, forId: customId }), state.endMode === 'custom');
  const endChoice = segmented({
    label: 'Sampai kapan?',
    value: state.endMode,
    options: [
      { value: 'month', label: 'Akhir bulan' },
      { value: 'income', label: 'Uang masuk berikutnya' },
      { value: 'custom', label: 'Tanggal sendiri' },
    ],
    onChange: (value) => {
      state.endMode = value;
      customPart.setOpen(value === 'custom');
      updatePreview();
    },
  });

  /* ---- 3. obligations ---- */
  const obligationList = h('div', { class: 'obligation-list' });
  function obligationRow(o) {
    const nameInput = h('input', { type: 'text', class: 'input', value: o.name, maxlength: MAX_NAME_LENGTH, placeholder: 'Contoh: Kos', 'aria-label': 'Nama kewajiban', autocomplete: 'off' });
    nameInput.addEventListener('input', () => {
      o.name = nameInput.value;
    });
    const amount = moneyInput({ value: o.amount, label: 'Jumlah kewajiban', onInput: (value) => {
      o.amount = value;
      updatePreview();
    } });
    const dateInput = h('input', { type: 'date', class: 'input', value: o.date, 'aria-label': 'Tanggal bayar' });
    const onDate = () => {
      o.date = dateInput.value;
      updatePreview();
    };
    dateInput.addEventListener('input', onDate);
    dateInput.addEventListener('change', onDate);
    const row = h(
      'div',
      { class: 'obligation-row' },
      h(
        'div',
        { class: 'obligation-top' },
        nameInput,
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': 'Hapus kewajiban ini',
            onclick: () => {
              state.obligations = state.obligations.filter((x) => x !== o);
              removeWithFlip(row);
              updatePreview();
            },
          },
          icon('trash'),
        ),
      ),
      h('div', { class: 'obligation-bottom' }, amount.element, dateInput),
    );
    return row;
  }
  function addObligation(o) {
    state.obligations.push(o);
    const row = obligationRow(o);
    obligationList.append(row);
    enter(row, { y: 8 });
    updatePreview();
    return row;
  }
  state.obligations.forEach((o) => obligationList.append(obligationRow(o)));

  async function importRecurring() {
    const current = store.getData();
    const end = endDate();
    if (!isValidDateStr(end) || end < startDate) {
      await alertDialog({ title: 'Pilih tanggal akhir dulu', message: 'Tentukan "Sampai kapan?" dulu, supaya tagihan yang jatuh tempo sebelum tanggal itu bisa diambil.' });
      return;
    }
    const taken = new Set(state.obligations.map((o) => o.fromRecurringId).filter(Boolean));
    const candidates = [];
    let later = 0;
    for (const bill of current.recurring) {
      if (bill.endDate || taken.has(bill.id) || bill.startDate > end) continue; // inactive, already added, or starts later
      const due = bill.dueDay ? nextDueDate(startDate, bill.dueDay) : startDate;
      if (due > end) later++;
      else candidates.push({ bill, due });
    }
    if (!candidates.length) {
      await alertDialog({
        title: 'Tidak ada yang bisa diambil',
        message: later ? `${later} pengeluaran rutin jatuh tempo setelah ${formatDate(end)}, jadi tidak ikut dihitung.` : 'Belum ada pengeluaran rutin aktif yang bisa diambil.',
      });
      return;
    }
    const choices = candidates.map(({ bill, due }) => {
      const id = uniqueId('bill');
      const box = h('input', { type: 'checkbox', id, checked: true });
      const when = bill.dueDay ? `jatuh tempo ${formatDateShort(due)}` : 'tanpa tanggal jatuh tempo, dihitung mulai hari ini';
      return { bill, due, box, row: h('label', { class: 'check-row', for: id }, box, h('span', null, h('strong', null, bill.name), ` · ${formatRupiah(bill.amount)}`, h('small', null, when))) };
    });
    const answer = await openDialog({
      title: 'Ambil dari pengeluaran rutin',
      body: [
        h('p', null, `Centang tagihan yang BELUM dibayar sampai ${formatDate(end)}.`),
        h('div', { class: 'check-list' }, choices.map((c) => c.row)),
        later ? h('p', { class: 'hint' }, `${later} tagihan lain jatuh tempo setelah tanggal akhir, jadi tidak diambil.`) : null,
      ],
      buttons: [
        { label: 'Ambil', value: 'ok', kind: 'primary' },
        { label: 'Batal', value: 'cancel' },
      ],
    });
    if (answer !== 'ok') return;
    for (const choice of choices) {
      if (choice.box.checked) addObligation({ name: choice.bill.name, amount: choice.bill.amount, date: choice.due, paid: false, fromRecurringId: choice.bill.id });
    }
  }

  /* ---- 4 & 5. emergency money and minimum per day ---- */
  const emergency = moneyInput({ value: isEdit && plan.emergency ? plan.emergency : null, id: uniqueId('plan-emergency'), placeholder: '0', onInput: updatePreview });
  const minDaily = moneyInput({ value: isEdit && plan.minDaily ? plan.minDaily : null, id: uniqueId('plan-min'), placeholder: 'Contoh: 30.000', onInput: updatePreview });

  /* ---- 6. pattern ---- */
  const weight = stepper({
    value: state.weekendWeight,
    min: WEEKEND_WEIGHT_MIN,
    max: WEEKEND_WEIGHT_MAX,
    step: WEEKEND_WEIGHT_STEP,
    format: formatWeight,
    label: 'bobot akhir pekan',
    onChange: (value) => {
      state.weekendWeight = value;
      updatePreview();
    },
  });
  const weekendPart = expandable(h('div', { class: 'weekend-row' }, h('span', null, 'Jatah Sabtu & Minggu dibanding hari biasa:'), weight.element), state.pattern === 'weekend');
  const patternChoice = segmented({
    label: 'Pola pembagian',
    value: state.pattern,
    options: [
      { value: 'even', label: 'Rata' },
      { value: 'weekend', label: 'Akhir pekan lebih longgar' },
    ],
    onChange: (value) => {
      state.pattern = value;
      weekendPart.setOpen(value === 'weekend');
      updatePreview();
    },
  });

  /* ---- live preview ---- */
  const preview = h('div', { class: 'plan-preview', 'aria-live': 'polite' });
  const baselineIds = isEdit ? plan.baselineIds : data.expenses.filter((e) => e.date === ctx.today).map((e) => e.id);
  function draftPlan() {
    return {
      id: isEdit ? plan.id : 'draft',
      startDate,
      endDate: endDate(),
      endMode: state.endMode,
      money: money.getValue() ?? 0,
      obligations: state.obligations.filter((o) => Number.isInteger(o.amount) && o.amount > 0 && isValidDateStr(o.date)),
      emergency: emergency.getValue() ?? 0,
      minDaily: minDaily.getValue() ?? 0,
      pattern: state.pattern,
      weekendWeight: state.weekendWeight,
      baselineIds,
      createdOn: isEdit ? plan.createdOn : ctx.today,
    };
  }
  function updatePreview() {
    const end = endDate();
    const endOk = isValidDateStr(end) && end >= startDate;
    endInfo.textContent = endOk ? `Sampai ${formatDateLong(end)} · ${daysBetween(startDate, end) + 1} hari` : 'Tanggal akhir tidak boleh sebelum tanggal mulai.';
    endInfo.classList.toggle('is-error', !endOk);
    if (!endOk || money.getValue() === null) {
      preview.replaceChildren(h('p', { class: 'muted' }, 'Isi uang yang kamu punya untuk melihat hitungannya.'));
      return;
    }
    const report = planReport(draftPlan(), store.getData().expenses, ctx.today);
    const perDay = state.pattern === 'weekend' ? `${formatRupiah(report.perWeekday)} hari biasa · ${formatRupiah(report.perWeekendDay)} akhir pekan` : `${formatRupiah(report.perWeekday)} per hari`;
    preview.replaceChildren(
      h('div', { class: 'plan-preview-top' }, h('span', null, 'Bisa dibelanjakan'), statusBadge(report.status)),
      h('p', { class: 'plan-preview-amount' }, formatRupiah(report.spendable)),
      h('p', { class: 'muted' }, perDay),
    );
  }

  const sheet = openSheet({
    title: isEdit ? 'Ubah Rencana' : 'Rencana Cukup',
    submitLabel: isEdit ? 'Simpan' : 'Buat',
    content: [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label', for: money.input.id }, isEdit ? `Uang saat rencana dimulai (${formatDateShort(startDate)})` : 'Uang yang kupunya sekarang'),
        money.element,
        fillButton,
        isEdit ? h('p', { class: 'hint' }, 'Dapat uang tambahan? Tambahkan selisihnya di sini.') : null,
      ),
      h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, 'Sampai kapan?'), endChoice.element, customPart.element, endInfo),
      h(
        'fieldset',
        { class: 'field' },
        h('legend', { class: 'field-label' }, 'Kewajiban yang belum dibayar (opsional)'),
        h('p', { class: 'hint' }, 'Misalnya kos, pulsa, iuran. Uangnya disisihkan dulu. Yang tanggalnya setelah tanggal akhir tidak dihitung.'),
        obligationList,
        h(
          'div',
          { class: 'button-row' },
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
            const row = addObligation({ name: '', amount: null, date: startDate, paid: false, fromRecurringId: null });
            row.querySelector('input').focus();
          } }, icon('plus'), 'Tambah kewajiban'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'plan-import', onclick: importRecurring }, icon('repeat'), 'Ambil dari pengeluaran rutin'),
        ),
      ),
      field({ label: 'Sisakan dana darurat (opsional)', control: emergency.element, forId: emergency.input.id, hint: 'Uang yang tidak mau kamu sentuh sama sekali.' }),
      field({ label: 'Minimal belanja per hari (opsional)', control: minDaily.element, forId: minDaily.input.id, hint: 'Misalnya untuk makan. Dipakai untuk memberi peringatan kalau rencananya tidak realistis.' }),
      h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, 'Pola'), patternChoice.element, weekendPart.element),
      preview,
    ],
    fields: { money: money.element, endDate: endChoice.element, obligations: obligationList, emergency: emergency.element, minDaily: minDaily.element, pattern: patternChoice.element },
    onSubmit: () => {
      const input = {
        endMode: state.endMode,
        endDate: endDate(),
        money: money.getValue(),
        obligations: state.obligations,
        emergency: emergency.getValue() ?? 0,
        minDaily: minDaily.getValue() ?? 0,
        pattern: state.pattern,
        weekendWeight: state.weekendWeight,
      };
      if (isEdit) store.updatePlan(input);
      else store.createPlan(input, ctx.today);
      toast(isEdit ? 'Rencana disimpan.' : 'Rencana dibuat. Semangat!', 'success');
    },
  });
  updatePreview();
  return sheet;
}
