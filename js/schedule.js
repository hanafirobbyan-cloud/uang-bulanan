// -----------------------------------------------------------------------------
// schedule.js — helpers for editing the income schedule ("Jadwal Uang Masuk"):
// checks with Indonesian messages, "Bagi rata", the quick presets,
// "Bagi ulang proporsional", the special income of one period, and moving an
// installment to a later date ("Belum masuk, geser tanggal").
// No DOM here, so it can be tested (see tests/schedule.test.js).
// The money math itself (periods, received money, daily numbers) is in logic.js.
// -----------------------------------------------------------------------------

import { checkAmount, checkDate } from './data.js';
import { addDays, MAX_INSTALLMENTS } from './logic.js';
import { formatRupiah, formatDate } from './format.js';

export { MAX_INSTALLMENTS };

/** Quick choices in the editor. `days: null` = one installment on the current start day. */
export const SCHEDULE_PRESETS = [
  { id: 'sekaligus', label: 'Sekaligus', days: null },
  { id: '2x', label: '2× (tgl 1 & 15)', days: [1, 15] },
  { id: '3x', label: '3× (tgl 1, 11, 21)', days: [1, 11, 21] },
  { id: '4x', label: '4× mingguan', days: [1, 8, 15, 22] },
];

/** Sum of the amounts that are filled in (empty ones count as 0). */
export function sumOf(installments) {
  return installments.reduce((total, i) => total + (Number.isInteger(i.amount) ? i.amount : 0), 0);
}

/** "Bagi rata": `total` in `count` equal whole-Rupiah parts. Leftover Rupiah go to the first parts, so they add up exactly. */
export function splitEvenly(total, count) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let leftover = total - base * count;
  return Array.from({ length: count }, () => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return base + extra;
  });
}

/**
 * "Bagi ulang proporsional": new amounts that keep the same proportions as
 * `amounts` but add up to exactly `newTotal`. Leftover Rupiah go to the first
 * parts. If nothing is filled in yet, the total is split evenly.
 */
export function rescale(amounts, newTotal) {
  const weights = amounts.map((a) => (Number.isInteger(a) && a > 0 ? a : 0));
  const weightSum = weights.reduce((total, w) => total + w, 0);
  if (weightSum === 0) return splitEvenly(newTotal, amounts.length);
  // BigInt keeps the multiplication exact even for very large amounts.
  const parts = weights.map((w) => Number((BigInt(newTotal) * BigInt(w)) / BigInt(weightSum)));
  let leftover = newTotal - parts.reduce((total, p) => total + p, 0);
  for (let i = 0; leftover > 0; i = (i + 1) % parts.length) {
    if (weights[i] > 0) {
      parts[i] += 1;
      leftover -= 1;
    }
  }
  return parts;
}

/** The installments of a preset, with the total split evenly ([{ day, amount }]). */
export function presetSchedule(presetId, total, startDay = 1) {
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId) || SCHEDULE_PRESETS[0];
  const days = preset.days || [startDay];
  const amounts = Number.isInteger(total) && total > 0 ? splitEvenly(total, days.length) : days.map(() => null);
  return days.map((day, i) => ({ day, amount: amounts[i] }));
}

/** 'Belum dialokasikan: Rp 500.000.' (or how much too much, when the installments add up to more than the total). */
export function unallocatedText(gap) {
  if (gap > 0) return `Belum dialokasikan: ${formatRupiah(gap)}.`;
  return `Kelebihan ${formatRupiah(-gap)}: jumlah uang masuk lebih besar dari totalnya.`;
}

/**
 * Check the monthly schedule before saving: { total, installments: [{ day, amount }] }.
 * Returns null if fine, or { message, field, index } in Indonesian.
 */
export function checkSchedule({ total, installments }) {
  const totalError = checkAmount(total, { label: 'Total uang bulanan' });
  if (totalError) return { message: totalError, field: 'total' };
  if (!Array.isArray(installments) || installments.length === 0) return { message: 'Minimal harus ada satu kali uang masuk.', field: 'installments' };
  if (installments.length > MAX_INSTALLMENTS) return { message: `Maksimal ${MAX_INSTALLMENTS} kali uang masuk per bulan.`, field: 'installments' };
  for (let i = 0; i < installments.length; i++) {
    const { day, amount } = installments[i];
    if (!Number.isInteger(day) || day < 1 || day > 31) return { message: `Uang masuk ke-${i + 1}: pilih tanggal 1 sampai 31.`, field: 'installments', index: i };
    const amountError = checkAmount(amount);
    if (amountError) return { message: `Uang masuk ke-${i + 1}: ${amountError}`, field: 'installments', index: i };
  }
  const gap = total - sumOf(installments);
  if (gap !== 0) return { message: unallocatedText(gap), field: 'installments' };
  return null;
}

/**
 * Check the special income of one period ("Ubah uang masuk periode ini"):
 * { total, installments: [{ date, amount }] }. The total may be 0 (no money that period).
 * Returns null if fine, or { message, field, index } in Indonesian.
 */
export function checkPeriodIncome({ total, installments }, period) {
  const totalError = checkAmount(total, { allowZero: true, label: 'Total periode ini' });
  if (totalError) return { message: totalError, field: 'total' };
  if (!Array.isArray(installments)) return { message: 'Daftar uang masuk tidak valid.', field: 'installments' };
  if (installments.length > MAX_INSTALLMENTS) return { message: `Maksimal ${MAX_INSTALLMENTS} kali uang masuk per periode.`, field: 'installments' };
  if (total > 0 && installments.length === 0) return { message: 'Tambahkan minimal satu uang masuk.', field: 'installments' };
  for (let i = 0; i < installments.length; i++) {
    const { date, amount } = installments[i];
    const dateError = checkDate(date);
    if (dateError) return { message: `Uang masuk ke-${i + 1}: ${dateError}`, field: 'installments', index: i };
    if (date < period.start || date > period.end) {
      return { message: `Uang masuk ke-${i + 1}: tanggal harus di periode ini (${formatDate(period.start)} – ${formatDate(period.end)}).`, field: 'installments', index: i };
    }
    const amountError = checkAmount(amount);
    if (amountError) return { message: `Uang masuk ke-${i + 1}: ${amountError}`, field: 'installments', index: i };
  }
  const gap = total - sumOf(installments);
  if (gap !== 0) return { message: unallocatedText(gap), field: 'installments' };
  return null;
}

/** The first date an installment can be moved to: after today and after its planned date. */
export function earliestDelayDate(installment, today) {
  return addDays(installment.plannedDate > today ? installment.plannedDate : today, 1);
}

/** Can this installment still be moved to a later date inside its period? */
export function canDelay(installment, period, today) {
  return earliestDelayDate(installment, today) <= period.end;
}

/**
 * Check a new date for "Belum masuk, geser tanggal". The money then counts as
 * not received until that date. Returns '' if fine, or an Indonesian message.
 */
export function checkDelay(installment, newDate, period, today) {
  const dateError = checkDate(newDate);
  if (dateError) return dateError;
  if (newDate > period.end) return `Paling lambat ${formatDate(period.end)}. Uang yang masuk setelah itu sudah termasuk periode berikutnya.`;
  if (newDate <= today) return 'Pilih tanggal setelah hari ini. Sampai tanggal itu, uangnya dihitung belum masuk.';
  if (newDate <= installment.plannedDate) return `Pilih tanggal setelah ${formatDate(installment.plannedDate)} (jadwal semula).`;
  return '';
}
