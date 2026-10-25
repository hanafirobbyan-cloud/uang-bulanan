// Tests for js/format.js (Indonesian money and date text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRupiah, formatNumber, parseMoney, formatDateLong, formatDate, formatDateShort, formatDayHeading, formatPeriod, formatStamp } from '../js/format.js';

const NBSP = '\u00a0'; // non-breaking space

test('formatRupiah uses id-ID grouping and shows negatives', () => {
  assert.equal(formatRupiah(1_500_000), `Rp${NBSP}1.500.000`);
  assert.equal(formatRupiah(0), `Rp${NBSP}0`);
  assert.equal(formatRupiah(999), `Rp${NBSP}999`);
  assert.equal(formatRupiah(-25_000), `-Rp${NBSP}25.000`);
  assert.equal(formatNumber(1_000_000_000), '1.000.000.000');
});

test('parseMoney reads typed amounts', () => {
  assert.equal(parseMoney('1.500.000'), 1_500_000);
  assert.equal(parseMoney('Rp 25.000'), 25_000);
  assert.equal(parseMoney('25.000,00'), 25_000);
  assert.equal(parseMoney('7'), 7);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(null), null);
});

test('dates in Indonesian', () => {
  assert.equal(formatDateLong('2026-10-25'), 'Minggu, 25 Oktober 2026');
  assert.equal(formatDateLong('2028-02-29'), 'Selasa, 29 Februari 2028');
  assert.equal(formatDate('2026-08-17'), '17 Agustus 2026');
  assert.equal(formatDateShort('2026-08-17'), '17 Agu');
  assert.equal(formatDateShort('2026-08-17', true), '17 Agu 2026');
  assert.equal(formatDateLong('bukan tanggal'), '');
});

test('day headings and periods', () => {
  assert.equal(formatDayHeading('2026-10-25', '2026-10-25'), 'Hari ini');
  assert.equal(formatDayHeading('2026-10-24', '2026-10-25'), 'Sabtu, 24 Okt');
  assert.equal(formatDayHeading('2025-12-31', '2026-01-02'), 'Rabu, 31 Des 2025');
  assert.equal(formatPeriod({ start: '2026-09-25', end: '2026-10-24' }), '25 Sep – 24 Okt 2026');
  assert.equal(formatPeriod({ start: '2026-12-25', end: '2027-01-24' }), '25 Des 2026 – 24 Jan 2027');
});

test('timestamps from backup files', () => {
  assert.equal(formatStamp('2026-10-25 14:30'), '25 Oktober 2026 pukul 14.30');
  assert.equal(formatStamp('2026-10-25'), '25 Oktober 2026');
  assert.equal(formatStamp(''), '');
});
