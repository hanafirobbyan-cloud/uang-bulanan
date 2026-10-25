// Tests for js/data.js (checks, repairing broken data, backups).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyData,
  checkAmount,
  checkName,
  checkDate,
  checkBuckets,
  normalizeData,
  makeBackup,
  readBackup,
  DEFAULT_BUCKETS,
  MAX_AMOUNT,
} from '../js/data.js';
import { percentTotal } from '../js/logic.js';

function validData() {
  const data = createEmptyData();
  data.setupDone = true;
  data.settings.monthlyIncome = 3_000_000;
  data.settings.incomeDay = 25;
  data.settings.setupDate = '2026-10-01';
  data.expenses.push({ id: 'e1', amount: 25_000, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-10-25', note: 'Makan', createdAt: 1 });
  data.recurring.push({ id: 'r1', name: 'Kos', amount: 1_000_000, bucketId: 'kebutuhan', walletId: 'bank', startDate: '2026-10-01', endDate: null });
  data.incomeOverrides['2026-09-25'] = 3_500_000;
  data.savings.push({ id: 's1', periodStart: '2026-09-25', amount: 100_000, date: '2026-10-25' });
  return data;
}

test('defaults: four buckets totaling 100% and five wallets', () => {
  const data = createEmptyData();
  assert.equal(percentTotal(data.buckets), 100);
  assert.deepEqual(data.buckets.map((b) => [b.name, b.percent, b.spendable]), [
    ['Kebutuhan', 50, true],
    ['Keinginan', 30, true],
    ['Tabungan/Investasi', 15, false],
    ['Dana Cadangan', 5, false],
  ]);
  assert.deepEqual(data.wallets.map((w) => w.name), ['Tunai', 'Bank', 'GoPay', 'Dana', 'ShopeePay']);
  data.buckets[0].percent = 99; // changing a copy must not change the defaults
  assert.equal(DEFAULT_BUCKETS[0].percent, 50);
});

test('amount checks', () => {
  assert.equal(checkAmount(25_000), '');
  assert.match(checkAmount(null), /wajib diisi/);
  assert.match(checkAmount(0), /lebih dari Rp 0/);
  assert.equal(checkAmount(0, { allowZero: true }), '');
  assert.match(checkAmount(-5), /tidak boleh negatif/);
  assert.match(checkAmount(10.5), /angka bulat/);
  assert.match(checkAmount(MAX_AMOUNT + 1), /terlalu besar/);
  assert.match(checkAmount('100'), /angka bulat/);
});

test('name and date checks', () => {
  assert.equal(checkName('OVO', ['GoPay']), '');
  assert.match(checkName('   '), /wajib diisi/);
  assert.match(checkName('x'.repeat(31)), /terlalu panjang/);
  assert.match(checkName(' gopay ', ['GoPay']), /sudah dipakai/);
  assert.equal(checkDate('2026-10-25'), '');
  assert.match(checkDate('2026-02-30'), /tidak valid/);
  assert.match(checkDate(''), /wajib diisi/);
  assert.match(checkDate('1999-12-31'), /Tahun/);
});

test('bucket list checks', () => {
  assert.equal(checkBuckets(DEFAULT_BUCKETS), '');
  assert.match(checkBuckets([]), /Minimal/);
  assert.match(checkBuckets(DEFAULT_BUCKETS.map((b, i) => (i === 0 ? { ...b, percent: 40 } : b))), /tepat 100% \(sekarang 90%\)/);
  assert.match(checkBuckets(DEFAULT_BUCKETS.map((b, i) => (i === 1 ? { ...b, name: 'kebutuhan' } : b))), /sudah dipakai/);
  assert.match(checkBuckets(DEFAULT_BUCKETS.map((b, i) => (i === 1 ? { ...b, percent: NaN } : b))), /Persen/);
});

test('valid data passes unchanged and repairing is stable', () => {
  const data = validData();
  const first = normalizeData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(first.problems, []);
  assert.deepEqual(first.data, data);
  const second = normalizeData(first.data);
  assert.deepEqual(second.problems, []);
});

test('garbage never crashes: start fresh and say so', () => {
  for (const garbage of [null, 'teks', 42, [], undefined]) {
    const { data, problems } = normalizeData(garbage);
    assert.equal(data.setupDone, false);
    assert.equal(problems.length, 1);
  }
});

test('broken records are skipped or repaired, with messages', () => {
  const data = validData();
  data.expenses.push({ id: 'bad1', amount: -5, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-10-25' });
  data.expenses.push({ id: 'bad2', amount: 10, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-13-01' });
  data.expenses.push({ id: 'lost', amount: 10, bucketId: 'hilang', walletId: 'tunai', date: '2026-10-25' });
  data.expenses.push({ id: 'e1', amount: 10, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-10-25' }); // duplicate id
  data.settings.incomeDay = 40;
  const { data: fixed, problems } = normalizeData(data);
  assert.equal(fixed.expenses.length, 3);
  assert.equal(fixed.expenses.find((e) => e.id === 'lost').bucketId, 'kebutuhan');
  assert.equal(new Set(fixed.expenses.map((e) => e.id)).size, 3);
  assert.equal(fixed.settings.incomeDay, 1);
  assert.ok(problems.some((p) => p.includes('2 pengeluaran tidak valid')));
  assert.ok(problems.some((p) => p.includes('Tanggal uang masuk')));
  assert.ok(problems.some((p) => p.includes('dipindahkan')));
});

test('backups: round trip and clear errors', () => {
  const data = validData();
  const text = JSON.stringify(makeBackup(data, '1.0.0', '2026-10-25 14:30'));
  const result = readBackup(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, data);
  assert.equal(result.exportedAt, '2026-10-25 14:30');

  assert.equal(readBackup('').ok, false);
  assert.match(readBackup('{tidak json').error, /tidak bisa dibaca/);
  assert.match(readBackup(JSON.stringify({ hello: 1 })).error, /bukan cadangan/);
  assert.match(readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 99, data: {} })).error, /lebih baru/);
});
