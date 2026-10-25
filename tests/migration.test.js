// Tests for upgrading saved data from older app versions (js/data.js migrate / normalizeData).
// The most important promise: upgrading never loses the user's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, dataVersion, migrate, normalizeData, readBackup } from '../js/data.js';

/** Data exactly as version 1 of the app saved it (no plans, no due days). */
function v1Data() {
  return {
    schemaVersion: 1,
    setupDone: true,
    settings: { monthlyIncome: 3_000_000, incomeDay: 25, setupDate: '2026-10-25', lastBackupDate: '2026-11-01', lastBucketId: 'keinginan', lastWalletId: 'gopay' },
    buckets: [
      { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
      { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
      { id: 'tabungan', name: 'Tabungan/Investasi', percent: 15, spendable: false },
      { id: 'cadangan', name: 'Dana Cadangan', percent: 5, spendable: false },
    ],
    wallets: [
      { id: 'tunai', name: 'Tunai' },
      { id: 'bank', name: 'Bank' },
      { id: 'gopay', name: 'GoPay' },
      { id: 'dana', name: 'Dana' },
      { id: 'shopeepay', name: 'ShopeePay' },
    ],
    expenses: [
      { id: 'e-1', amount: 25_000, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-10-26', note: 'Makan siang', createdAt: 1761460000000 },
      { id: 'e-2', amount: 150_000, bucketId: 'keinginan', walletId: 'gopay', date: '2026-10-30', note: 'Nonton', createdAt: 1761800000000 },
      { id: 'e-3', amount: 7_500, bucketId: 'kebutuhan', walletId: 'dana', date: '2026-11-02', note: '', createdAt: 1762060000000 },
    ],
    recurring: [
      { id: 'r-1', name: 'Kos', amount: 1_000_000, bucketId: 'kebutuhan', walletId: 'bank', startDate: '2026-10-25', endDate: null },
      { id: 'r-2', name: 'Spotify', amount: 55_000, bucketId: 'keinginan', walletId: 'gopay', startDate: '2026-10-25', endDate: '2026-11-01' },
    ],
    incomeOverrides: { '2026-10-25': 3_500_000 },
    savings: [{ id: 's-1', periodStart: '2026-09-25', amount: 120_000, date: '2026-10-25' }],
  };
}

test('the current data version is 2', () => {
  assert.equal(SCHEMA_VERSION, 2);
});

test('data without a version number counts as version 1', () => {
  assert.equal(dataVersion({}), 1);
  assert.equal(dataVersion(null), 1);
  assert.equal(dataVersion({ schemaVersion: 'dua' }), 1);
  assert.equal(dataVersion({ schemaVersion: 2 }), 2);
});

test('empty data: a clean, usable version 2 shape, never a crash', () => {
  for (const empty of [null, undefined, {}, [], '']) {
    const { data } = normalizeData(empty);
    assert.equal(data.schemaVersion, 2);
    assert.equal(data.setupDone, false);
    assert.deepEqual(data.plans, { active: null, history: [] });
    assert.equal(data.buckets.length, 4);
    assert.equal(data.wallets.length, 5);
  }
});

test('version 1 data is upgraded without losing anything', () => {
  const old = v1Data();
  const untouched = structuredClone(old);
  const { data, problems } = normalizeData(old);
  assert.deepEqual(problems, []);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.setupDone, true);
  assert.deepEqual(data.settings, old.settings);
  assert.deepEqual(data.buckets, old.buckets);
  assert.deepEqual(data.wallets, old.wallets);
  assert.deepEqual(data.expenses, old.expenses);
  assert.deepEqual(data.incomeOverrides, old.incomeOverrides);
  assert.deepEqual(data.savings, old.savings);
  assert.deepEqual(data.recurring, old.recurring.map((r) => ({ ...r, dueDay: null })));
  assert.deepEqual(data.plans, { active: null, history: [] });
  assert.deepEqual(old, untouched, 'the original object is not changed');
});

test('version 1 data without the version number is upgraded the same way', () => {
  const old = v1Data();
  delete old.schemaVersion;
  const { data, problems } = normalizeData(old);
  assert.deepEqual(problems, []);
  assert.deepEqual(data, normalizeData(v1Data()).data);
});

test('upgrading twice changes nothing more', () => {
  const once = migrate(v1Data());
  assert.deepEqual(migrate(once), once);
  const first = normalizeData(v1Data()).data;
  const second = normalizeData(first);
  assert.deepEqual(second.problems, []);
  assert.deepEqual(second.data, first);
});

test('corrupted version 1 data is repaired with clear messages', () => {
  const old = v1Data();
  old.expenses.push({ id: 'bad', amount: 'banyak', date: 'kemarin' });
  old.recurring.push({ id: 'r-bad', name: '', amount: -5 });
  old.recurring[0].dueDay = 99; // nonsense due day (would not exist in v1, but must not break anything)
  const { data, problems } = normalizeData(old);
  assert.equal(data.expenses.length, 3);
  assert.equal(data.recurring.length, 2);
  assert.equal(data.recurring[0].dueDay, null);
  assert.ok(problems.some((p) => p.includes('1 pengeluaran tidak valid')));
  assert.ok(problems.some((p) => p.includes('1 pengeluaran rutin tidak valid')));
});

test('a valid plan is kept exactly; broken plans are dropped or repaired with a message', () => {
  const plan = {
    id: 'p-1',
    startDate: '2026-11-10',
    endDate: '2026-11-24',
    endMode: 'income',
    money: 900_000,
    obligations: [{ id: 'o-1', name: 'Pulsa', amount: 50_000, date: '2026-11-15', paid: false, fromRecurringId: null }],
    emergency: 100_000,
    minDaily: 30_000,
    pattern: 'weekend',
    weekendWeight: 150,
    baselineIds: ['e-3'],
    createdOn: '2026-11-10',
  };
  const history = [{ id: 'p-0', startDate: '2026-10-01', endDate: '2026-10-24', endedOn: '2026-10-25', endedEarly: false, days: 24, money: 800_000, obligationsTotal: 0, emergency: 0, spendable: 800_000, spent: 750_000, leftover: 50_000 }];
  const v2 = { ...normalizeData(v1Data()).data, plans: { active: plan, history } };
  const kept = normalizeData(v2);
  assert.deepEqual(kept.problems, []);
  assert.deepEqual(kept.data.plans.active, plan);
  assert.deepEqual(kept.data.plans.history, history);

  const brokenPlan = normalizeData({ ...v2, plans: { active: { ...plan, endDate: '2026-11-01' }, history } });
  assert.equal(brokenPlan.data.plans.active, null);
  assert.ok(brokenPlan.problems.some((p) => p.includes('Rencana Cukup yang aktif rusak')));

  const badParts = normalizeData({
    ...v2,
    plans: { active: { ...plan, obligations: [...plan.obligations, { name: 'X', amount: 0, date: 'x' }], pattern: '??' }, history: [...history, { id: 'h' }] },
  });
  assert.equal(badParts.data.plans.active.obligations.length, 1);
  assert.equal(badParts.data.plans.active.pattern, 'even');
  assert.equal(badParts.data.plans.history.length, 1);
  assert.ok(badParts.problems.some((p) => p.includes('1 kewajiban')));
  assert.ok(badParts.problems.some((p) => p.includes('1 riwayat')));
});

test('old backup files (version 1) still import correctly', () => {
  const text = JSON.stringify({ app: 'uang-bulanan', schemaVersion: 1, appVersion: '1.0.0', exportedAt: '2026-11-01 20:15', data: v1Data() });
  const result = readBackup(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.data.schemaVersion, 2);
  assert.equal(result.data.expenses.length, 3);
  assert.deepEqual(result.data.plans, { active: null, history: [] });
  assert.equal(result.exportedAt, '2026-11-01 20:15');
});

test('backups from a newer app version are refused, corrupted files explained', () => {
  const newer = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 3, data: {} }));
  assert.match(newer.error, /lebih baru/);
  const newerInside = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 2, data: { schemaVersion: 3 } }));
  assert.match(newerInside.error, /lebih baru/);
  assert.match(readBackup('{"app": "uang-bul').error, /tidak bisa dibaca/);
  assert.match(readBackup('null').error, /bukan cadangan/);
});
