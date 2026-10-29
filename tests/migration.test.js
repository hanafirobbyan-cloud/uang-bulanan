// Tests for upgrading saved data from older app versions (js/data.js migrate / normalizeData).
// The most important promise: upgrading never loses the user's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, dataVersion, migrate, normalizeData, readBackup, makeBackup } from '../js/data.js';

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

const PLAN = {
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
const HISTORY = [{ id: 'p-0', startDate: '2026-10-01', endDate: '2026-10-24', endedOn: '2026-10-25', endedEarly: false, days: 24, money: 800_000, obligationsTotal: 0, emergency: 0, spendable: 800_000, spent: 750_000, leftover: 50_000 }];

/** Data exactly as version 2 of the app saved it: plans, due days, a special income of 0 and one of Rp 3.500.000. */
function v2Data() {
  const data = v1Data();
  data.schemaVersion = 2;
  data.recurring = data.recurring.map((r, i) => ({ ...r, dueDay: i === 0 ? 5 : null }));
  data.incomeOverrides = { '2026-10-25': 3_500_000, '2026-08-25': 0 };
  data.plans = { active: structuredClone(PLAN), history: structuredClone(HISTORY) };
  return data;
}

/** Data as version 3 saves it: a schedule in three parts, a special period, a late installment and the "Total bulan" mode. */
function v3Data() {
  const data = normalizeData(v2Data()).data;
  data.settings.incomeSchedule = [
    { id: 'i-a', day: 1, amount: 1_000_000 },
    { id: 'i-b', day: 12, amount: 1_000_000 },
    { id: 'i-c', day: 22, amount: 1_000_000 },
  ];
  data.settings.incomeDay = 1;
  data.settings.calcMode = 'total';
  data.incomeOverrides = { '2026-10-01': { installments: [{ id: 'k-1', date: '2026-10-01', amount: 2_000_000 }, { id: 'k-2', date: '2026-10-20', amount: 500_000 }] } };
  data.incomeDelays = { '2026-11-01': { 'i-b': '2026-11-15' } };
  data.savings = [{ id: 's-1', periodStart: '2026-09-01', amount: 120_000, date: '2026-10-01' }];
  return data;
}

test('the current data version is 3', () => {
  assert.equal(SCHEMA_VERSION, 3);
});

test('data without a version number counts as version 1', () => {
  assert.equal(dataVersion({}), 1);
  assert.equal(dataVersion(null), 1);
  assert.equal(dataVersion({ schemaVersion: 'dua' }), 1);
  assert.equal(dataVersion({ schemaVersion: 2 }), 2);
  assert.equal(dataVersion({ schemaVersion: 3 }), 3);
});

test('empty data: a clean, usable version 3 shape, never a crash', () => {
  for (const empty of [null, undefined, {}, [], '']) {
    const { data } = normalizeData(empty);
    assert.equal(data.schemaVersion, 3);
    assert.equal(data.setupDone, false);
    assert.deepEqual(data.plans, { active: null, history: [] });
    assert.deepEqual(data.settings.incomeSchedule, []);
    assert.equal(data.settings.calcMode, 'hati-hati');
    assert.deepEqual(data.incomeOverrides, {});
    assert.deepEqual(data.incomeDelays, {});
    assert.equal(data.buckets.length, 4);
    assert.equal(data.wallets.length, 5);
  }
});

test('version 1 data is upgraded without losing anything', () => {
  const old = v1Data();
  const untouched = structuredClone(old);
  const { data, problems } = normalizeData(old);
  assert.deepEqual(problems, []);
  assert.equal(data.schemaVersion, 3);
  assert.equal(data.setupDone, true);
  assert.deepEqual(data.settings, { ...old.settings, incomeSchedule: [{ id: 'i-1', day: 25, amount: 3_000_000 }], calcMode: 'hati-hati' });
  assert.deepEqual(data.buckets, old.buckets);
  assert.deepEqual(data.wallets, old.wallets);
  assert.deepEqual(data.expenses, old.expenses);
  assert.deepEqual(data.incomeOverrides, { '2026-10-25': { installments: [{ id: 'k-1', date: '2026-10-25', amount: 3_500_000 }] } });
  assert.deepEqual(data.incomeDelays, {});
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

test('version 2 data: one installment on the same income day, everything else kept', () => {
  const old = v2Data();
  const untouched = structuredClone(old);
  const { data, problems } = normalizeData(old);
  assert.deepEqual(problems, []);
  assert.equal(data.schemaVersion, 3);
  assert.deepEqual(data.settings.incomeSchedule, [{ id: 'i-1', day: 25, amount: 3_000_000 }]);
  assert.equal(data.settings.monthlyIncome, 3_000_000);
  assert.equal(data.settings.incomeDay, 25);
  assert.equal(data.settings.calcMode, 'hati-hati');
  // A special income becomes one installment on the period's first day; 0 stays 0 (an empty list).
  assert.deepEqual(data.incomeOverrides, {
    '2026-10-25': { installments: [{ id: 'k-1', date: '2026-10-25', amount: 3_500_000 }] },
    '2026-08-25': { installments: [] },
  });
  assert.deepEqual(data.recurring.map((r) => r.dueDay), [5, null], 'due days are kept (empty = the period start, like before)');
  assert.deepEqual(data.plans.active, PLAN);
  assert.deepEqual(data.plans.history, HISTORY);
  for (const key of ['buckets', 'wallets', 'expenses', 'savings']) assert.deepEqual(data[key], old[key], key);
  assert.deepEqual(old, untouched, 'the original object is not changed');
});

test('version 3 data is kept exactly', () => {
  const data = v3Data();
  const { data: again, problems } = normalizeData(structuredClone(data));
  assert.deepEqual(problems, []);
  assert.deepEqual(again, data);
});

test('upgrading twice changes nothing more', () => {
  const once = migrate(v1Data());
  assert.deepEqual(migrate(once), once);
  for (const make of [v1Data, v2Data]) {
    const first = normalizeData(make()).data;
    const second = normalizeData(first);
    assert.deepEqual(second.problems, []);
    assert.deepEqual(second.data, first);
  }
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

test('corrupted version 2 data: broken income settings and special incomes are repaired', () => {
  const old = v2Data();
  old.settings.incomeDay = 45;
  old.settings.monthlyIncome = -1;
  old.incomeOverrides['tanggal'] = 5;
  old.incomeOverrides['2026-09-25'] = 'banyak';
  const { data, problems } = normalizeData(old);
  assert.equal(data.schemaVersion, 3);
  assert.equal(data.settings.monthlyIncome, 0);
  assert.equal(data.settings.incomeDay, 1);
  assert.deepEqual(data.settings.incomeSchedule, []);
  assert.equal(data.expenses.length, 3, 'expenses are never lost');
  assert.ok(problems.some((p) => p.includes('Uang bulanan tidak valid')));
  assert.ok(problems.some((p) => p.includes('Tanggal uang masuk tidak valid')));
  assert.ok(problems.some((p) => p.includes('2 pemasukan khusus periode tidak valid')));
});

test('corrupted version 3 data: schedule, special periods, delays and mode are repaired with messages', () => {
  const data = v3Data();
  data.settings.incomeSchedule.push({ id: 'i-a', day: 40, amount: 5 }, { id: 'i-a', day: 28, amount: 500_000 }, 'x');
  data.settings.calcMode = 'acak';
  data.incomeOverrides['2026-09-01'] = { installments: [{ id: 'z', date: '2026-12-31', amount: 10 }] }; // outside its period
  data.incomeOverrides['2026-08-01'] = 1_000; // old shape inside version 3 data
  data.incomeOverrides['2026-10-01'].installments.push({ id: 'k-1', date: '2026-10-05', amount: 1 }); // duplicate id
  data.incomeDelays['2026-11-01']['i-c'] = 'besok';
  const { data: fixed, problems } = normalizeData(data);
  assert.deepEqual(fixed.settings.incomeSchedule.map((i) => [i.id, i.day, i.amount]), [
    ['i-a', 1, 1_000_000],
    ['i-b', 12, 1_000_000],
    ['i-c', 22, 1_000_000],
    ['i-fix-4', 28, 500_000],
  ]);
  assert.equal(fixed.settings.monthlyIncome, 3_500_000, 'the total follows the schedule');
  assert.equal(fixed.settings.calcMode, 'hati-hati');
  assert.equal(fixed.incomeOverrides['2026-09-01'], undefined);
  assert.equal(fixed.incomeOverrides['2026-08-01'], undefined);
  assert.deepEqual(fixed.incomeOverrides['2026-10-01'].installments.map((i) => i.id), ['k-1', 'k-fix-3', 'k-2']);
  assert.deepEqual(fixed.incomeDelays, { '2026-11-01': { 'i-b': '2026-11-15' } });
  assert.ok(problems.some((p) => p.includes('2 uang masuk di jadwal tidak valid')));
  assert.ok(problems.some((p) => p.includes('uang bulanan disamakan')));
  assert.ok(problems.some((p) => p.includes('2 pemasukan khusus periode tidak valid')));
  assert.ok(problems.some((p) => p.includes('1 penundaan uang masuk tidak valid')));
});

test('a valid plan is kept exactly; broken plans are dropped or repaired with a message', () => {
  const v2 = { ...normalizeData(v1Data()).data, plans: { active: PLAN, history: HISTORY } };
  const kept = normalizeData(v2);
  assert.deepEqual(kept.problems, []);
  assert.deepEqual(kept.data.plans.active, PLAN);
  assert.deepEqual(kept.data.plans.history, HISTORY);

  const brokenPlan = normalizeData({ ...v2, plans: { active: { ...PLAN, endDate: '2026-11-01' }, history: HISTORY } });
  assert.equal(brokenPlan.data.plans.active, null);
  assert.ok(brokenPlan.problems.some((p) => p.includes('Rencana Cukup yang aktif rusak')));

  const badParts = normalizeData({
    ...v2,
    plans: { active: { ...PLAN, obligations: [...PLAN.obligations, { name: 'X', amount: 0, date: 'x' }], pattern: '??' }, history: [...HISTORY, { id: 'h' }] },
  });
  assert.equal(badParts.data.plans.active.obligations.length, 1);
  assert.equal(badParts.data.plans.active.pattern, 'even');
  assert.equal(badParts.data.plans.history.length, 1);
  assert.ok(badParts.problems.some((p) => p.includes('1 kewajiban')));
  assert.ok(badParts.problems.some((p) => p.includes('1 riwayat')));
});

test('old backup files (version 1, 2 and 3) all import correctly', () => {
  const v1 = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 1, appVersion: '1.0.0', exportedAt: '2026-11-01 20:15', data: v1Data() }));
  assert.equal(v1.ok, true);
  assert.deepEqual(v1.problems, []);
  assert.equal(v1.data.schemaVersion, 3);
  assert.equal(v1.data.expenses.length, 3);
  assert.deepEqual(v1.data.settings.incomeSchedule, [{ id: 'i-1', day: 25, amount: 3_000_000 }]);
  assert.equal(v1.exportedAt, '2026-11-01 20:15');

  const v2 = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 2, appVersion: '2.0.0', exportedAt: '2026-11-20 08:00', data: v2Data() }));
  assert.equal(v2.ok, true);
  assert.deepEqual(v2.problems, []);
  assert.deepEqual(v2.data, normalizeData(v2Data()).data);

  const v3 = readBackup(JSON.stringify(makeBackup(v3Data(), '3.0.0', '2026-11-21 09:30')));
  assert.equal(v3.ok, true);
  assert.deepEqual(v3.problems, []);
  assert.deepEqual(v3.data, v3Data());
});

test('backups from a newer app version are refused, corrupted files explained', () => {
  const newer = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 4, data: {} }));
  assert.match(newer.error, /lebih baru/);
  const newerInside = readBackup(JSON.stringify({ app: 'uang-bulanan', schemaVersion: 3, data: { schemaVersion: 4 } }));
  assert.match(newerInside.error, /lebih baru/);
  assert.match(readBackup('{"app": "uang-bul').error, /tidak bisa dibaca/);
  assert.match(readBackup('null').error, /bukan cadangan/);
});
