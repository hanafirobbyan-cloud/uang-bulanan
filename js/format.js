// -----------------------------------------------------------------------------
// format.js — turns numbers and dates into Indonesian text (and back).
// No DOM here, so it can be tested (see tests/format.test.js).
// -----------------------------------------------------------------------------

import { parseDateStr, weekday } from './logic.js';

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* -------------------------------- money -------------------------------- */

/** 1500000 -> '1.500.000' */
export function formatNumber(n) {
  return numberFormat.format(n);
}

/**
 * 1500000 -> 'Rp 1.500.000', -25000 -> '-Rp 25.000'.
 * The space after "Rp" is a non-breaking space, so "Rp" never ends up alone on a line.
 */
export function formatRupiah(amount) {
  const n = Math.trunc(Number(amount) || 0);
  return `${n < 0 ? '-' : ''}Rp\u00a0${numberFormat.format(Math.abs(n))}`;
}

/**
 * Read a typed amount: '1.500.000', 'Rp 25.000' or '25000' -> number.
 * Returns null if there are no digits at all.
 */
export function parseMoney(text) {
  const withoutDecimals = String(text ?? '').replace(/,\d{1,2}\s*$/, ''); // '25.000,00' -> '25.000'
  const digits = withoutDecimals.replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits.slice(0, 15));
}

/* -------------------------------- dates -------------------------------- */

/** '2026-10-25' -> 'Minggu, 25 Oktober 2026' */
export function formatDateLong(dateStr) {
  const p = parseDateStr(dateStr);
  if (!p) return '';
  return `${DAYS[weekday(dateStr)]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** '2026-10-25' -> '25 Oktober 2026' */
export function formatDate(dateStr) {
  const p = parseDateStr(dateStr);
  if (!p) return '';
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** '2026-10-25' -> '25 Okt' (or '25 Okt 2026' with withYear) */
export function formatDateShort(dateStr, withYear = false) {
  const p = parseDateStr(dateStr);
  if (!p) return '';
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}${withYear ? ` ${p.year}` : ''}`;
}

/** Heading for a day in a list: 'Hari ini', 'Kemarin' or 'Sabtu, 24 Okt'. */
export function formatDayHeading(dateStr, today) {
  const p = parseDateStr(dateStr);
  if (!p) return '';
  if (dateStr === today) return 'Hari ini';
  const t = parseDateStr(today);
  const sameYear = t && t.year === p.year;
  const label = `${DAYS[weekday(dateStr)]}, ${formatDateShort(dateStr, !sameYear)}`;
  return label;
}

/** A period as text: '25 Sep – 24 Okt 2026' or '25 Des 2026 – 24 Jan 2027'. */
export function formatPeriod(period) {
  const start = parseDateStr(period.start);
  const end = parseDateStr(period.end);
  if (!start || !end) return '';
  const sameYear = start.year === end.year;
  return `${formatDateShort(period.start, !sameYear)} – ${formatDateShort(period.end, true)}`;
}

/** 'YYYY-MM-DD HH:MM' -> '25 Oktober 2026 pukul 14.30' */
export function formatStamp(stamp) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(stamp ?? ''));
  if (!match || !parseDateStr(match[1])) return '';
  const date = formatDate(match[1]);
  return match[2] ? `${date} pukul ${match[2]}.${match[3]}` : date;
}
