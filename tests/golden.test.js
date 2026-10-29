// Golden regression tests: after the upgrade to data version 3 ("Uang Masuk
// Bertahap"), every number must come out EXACTLY the same as in version 2 for
// existing data (one monthly amount on one income day).
//
// tests/golden/v2/ holds an untouched copy of version 2's logic.js, planner.js
// and data.js (taken from the git tag v2.0.0). These tests run that old code on
// version 2 data, run the new code on the same data after the migration, and
// compare the results — for hundreds of random data sets and many dates — in
// both "Cara hitung" modes. A few hand-checked numbers are pinned as well.
//
// The one intended difference: "Isi dari sisa anggaran" in Rencana Cukup now
// fills in the money in hand (cashOnHand) instead of the rest of the spendable
// budget. That button only pre-fills a field, so it is not compared here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v2 from './golden/v2/logic.js';
import * as v2planner from './golden/v2/planner.js';
import { normalizeData as v2normalize } from './golden/v2/data.js';
import * as v3 from '../js/logic.js';
import * as v3planner from '../js/planner.js';
import { normalizeData } from '../js/data.js';

/* ------------------------------- random data ------------------------------- */

let seed = 20261029;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[int(0, list.length - 1)];
const chance = (p) => random() < p;

function randomDate(from = '2026-01-01', days = 1100) {
  return v2.addDays(from, int(0, days));
}

const BUCKET_SETS = [
  [
    { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
    { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
    { id: 'tabungan', name: 'Tabungan/Investasi', percent: 15, spendable: false },
    { id: 'cadangan', name: 'Dana Cadangan', percent: 5, spendable: false },
  ],
  [
    { id: 'makan', name: 'Makan', percent: 45, spendable: true },
    { id: 'kos', name: 'Kos', percent: 35, spendable: true },
    { id: 'nabung', name: 'Nabung', percent: 20, spendable: false },
  ],
  [
    { id: 'semua', name: 'Semua', percent: 100, spendable: true },
  ],
  [
    { id: 'p1', name: 'Pos satu', percent: 33, spendable: true },
    { id: 'p2', name: 'Pos dua', percent: 33, spendable: false },
    { id: 'p3', name: 'Pos tiga', percent: 33, spendable: true }, // 99%: a warning, but must still match
  ],
];
const WALLETS = [
  { id: 'tunai', name: 'Tunai' },
  { id: 'bank', name: 'Bank' },
  { id: 'gopay', name: 'GoPay' },
];

/** A random but valid data set, exactly as version 2 of the app would save it. */
function randomV2Data() {
  const buckets = pick(BUCKET_SETS).map((b) => ({ ...b }));
  const incomeDay = chance(0.3) ? pick([1, 28, 29, 30, 31]) : int(1, 31);
  const monthlyIncome = chance(0.05) ? 0 : int(5, 1500) * 10_000 + (chance(0.3) ? int(1, 9_999) : 0);
  const around = randomDate('2026-01-01', 1000);
  const expenses = Array.from({ length: int(0, 70) }, (_, i) => ({
    id: `e-${i}`,
    amount: chance(0.1) ? int(500_000, 4_000_000) : int(1, 300) * 1_000 + (chance(0.2) ? int(1, 999) : 0),
    bucketId: pick(buckets).id,
    walletId: pick(WALLETS).id,
    date: v2.addDays(around, int(-70, 70)),
    note: chance(0.5) ? pick(['Makan', 'Kopi', 'Nonton', 'Bensin', '']) : '',
    createdAt: i,
  }));
  const recurring = Array.from({ length: int(0, 4) }, (_, i) => {
    const startDate = v2.addDays(around, int(-150, 40));
    return {
      id: `r-${i}`,
      name: `Tagihan ${i + 1}`,
      amount: int(10, 1500) * 1_000,
      bucketId: pick(buckets).id,
      walletId: pick(WALLETS).id,
      startDate,
      endDate: chance(0.3) ? v2.addDays(startDate, int(0, 120)) : null,
      dueDay: chance(0.5) ? int(1, 31) : null,
    };
  });
  const incomeOverrides = {};
  for (let i = int(0, 3); i > 0; i--) {
    const start = v2.getPeriod(v2.addDays(around, int(-90, 60)), incomeDay).start;
    incomeOverrides[start] = chance(0.15) ? 0 : int(1, 2000) * 1_000;
  }
  const savings = [];
  if (chance(0.3)) {
    const periodStart = v2.getPeriod(v2.addDays(around, -40), incomeDay).start;
    savings.push({ id: 's-1', periodStart, amount: int(1, 500) * 1_000, date: v2.addDays(periodStart, 35) });
  }
  let active = null;
  if (chance(0.4)) {
    const startDate = v2.addDays(around, int(-20, 5));
    active = {
      id: 'p-1',
      startDate,
      endDate: v2.addDays(startDate, int(0, 40)),
      endMode: pick(['income', 'month', 'custom']),
      money: int(0, 3000) * 1_000,
      obligations: chance(0.5) ? [{ id: 'o-1', name: 'Kos', amount: int(1, 900) * 1_000, date: v2.addDays(startDate, int(-3, 30)), paid: chance(0.3), fromRecurringId: null }] : [],
      emergency: chance(0.3) ? int(1, 300) * 1_000 : 0,
      minDaily: chance(0.4) ? int(1, 80) * 1_000 : 0,
      pattern: pick(['even', 'weekend']),
      weekendWeight: pick([100, 125, 150, 200, 300]),
      baselineIds: expenses.filter((e) => e.date === startDate).map((e) => e.id),
      createdOn: startDate,
    };
  }
  return {
    data: {
      schemaVersion: 2,
      setupDone: true,
      settings: { monthlyIncome, incomeDay, setupDate: v2.addDays(around, -100), lastBackupDate: null, lastBucketId: null, lastWalletId: null },
      buckets,
      wallets: WALLETS.map((w) => ({ ...w })),
      expenses,
      recurring,
      incomeOverrides,
      savings,
      plans: { active, history: [] },
    },
    around,
  };
}

/** Interesting days to check: around period edges, month ends and leap days. */
function datesToCheck(data, around) {
  const day = data.settings.incomeDay;
  const period = v2.getPeriod(around, day);
  return [
    around,
    period.start,
    period.end,
    v2.addDays(period.start, 1),
    v2.addDays(period.end, -1),
    period.nextStart,
    randomDate('2026-01-01', 1000),
    pick(['2028-02-28', '2028-02-29', '2027-02-28', '2028-03-01', '2026-12-31', '2027-01-01']),
  ];
}

const pickKeys = (object, keys) => Object.fromEntries(keys.map((k) => [k, object[k]]));
const V2_BUCKET_KEYS = ['id', 'name', 'percent', 'spendable', 'allocation', 'recurring', 'spent', 'used', 'remaining'];
const V2_BUDGET_KEYS = [
  'today', 'period', 'daysLeft', 'income', 'incomeIsOverride', 'spendableAllocation', 'spendableRecurring',
  'spentOtherDays', 'spentToday', 'spendablePool', 'amanHariIni', 'sisaHariIni', 'remainingInPeriod',
  'hasSpendableBucket', 'percentTotal',
];
const V2_SUMMARY_KEYS = ['period', 'income', 'incomeIsOverride', 'expenseCount', 'recordedTotal', 'recurringTotal', 'totalSpent', 'leftover', 'wallets', 'savings', 'savedAmount'];

function compareBudget(oldData, newData, today, label) {
  const before = v2.dailyBudget(oldData, today);
  for (const mode of ['hati-hati', 'total']) {
    const data = { ...newData, settings: { ...newData.settings, calcMode: mode } };
    const after = v3.dailyBudget(data, today);
    assert.deepEqual(pickKeys(after, V2_BUDGET_KEYS), pickKeys(before, V2_BUDGET_KEYS), `${label} ${mode}: daily numbers`);
    assert.deepEqual(after.buckets.map((b) => pickKeys(b, V2_BUCKET_KEYS)), before.buckets, `${label} ${mode}: buckets`);
    assert.deepEqual(after.buckets.map((b) => b.remainingNow), before.buckets.map((b) => b.remaining), `${label} ${mode}: bucket money in hand`);
  }
}

/* ---------------------------------- tests ---------------------------------- */

test('random version 2 data: every number is exactly the same after the upgrade (both modes)', () => {
  let checks = 0;
  for (let n = 0; n < 300; n++) {
    const { data: oldData, around } = randomV2Data();
    assert.deepEqual(v2normalize(structuredClone(oldData)).problems, [], `data set ${n} is valid version 2 data`);
    const { data: newData, problems } = normalizeData(structuredClone(oldData));
    assert.deepEqual(problems, [], `data set ${n} upgrades without problems`);
    assert.equal(newData.schemaVersion, 3);
    assert.equal(v3.periodStartDay(newData), oldData.settings.incomeDay);

    for (const today of datesToCheck(oldData, around)) {
      const label = `data set ${n}, ${today}`;
      compareBudget(oldData, newData, today, label);

      // Ringkasan: this period, the one before and the one after.
      const period = v2.getPeriod(today, oldData.settings.incomeDay);
      for (const p of [period, v2.previousPeriod(period, oldData.settings.incomeDay), v2.nextPeriod(period, oldData.settings.incomeDay)]) {
        const before = v2.periodSummary(oldData, p);
        const after = v3.periodSummary(newData, p, today);
        assert.deepEqual(pickKeys(after, V2_SUMMARY_KEYS), pickKeys(before, V2_SUMMARY_KEYS), `${label}: summary ${p.start}`);
        assert.deepEqual(after.buckets.map((b) => pickKeys(b, V2_BUCKET_KEYS)), before.buckets, `${label}: summary buckets ${p.start}`);
        assert.equal(v3.leftoverMoveStatus(after, today, newData.settings.setupDate), v2.leftoverMoveStatus(before, today, oldData.settings.setupDate));
      }

      // Simulasi "kalau beli ini".
      const bucketId = pick(oldData.buckets).id;
      const amount = int(1, 500) * 1_000;
      assert.deepEqual(v3.simulatePurchase(newData, today, amount, bucketId), v2.simulatePurchase(oldData, today, amount, bucketId), `${label}: simulation`);

      // Rencana Cukup: "Sampai uang masuk berikutnya", the plan numbers and the saving tips.
      assert.equal(
        v3planner.planEndDate('income', today, v3.periodStartDay(newData), null, v3.nextIncomeEnd(newData, today)),
        v2planner.planEndDate('income', today, oldData.settings.incomeDay),
        `${label}: plan end date`,
      );
      const plan = newData.plans.active;
      if (plan) {
        const oldReport = v2planner.planReport(oldData.plans.active, oldData.expenses, today);
        const newReport = v3planner.planReport(plan, newData.expenses, today);
        assert.deepEqual(newReport, oldReport, `${label}: plan report`);
        assert.deepEqual(v3planner.savingTips(newReport, newData, today), v2planner.savingTips(oldReport, oldData, today), `${label}: saving tips`);
        assert.deepEqual(v3planner.planSummary(plan, newData.expenses, today), v2planner.planSummary(oldData.plans.active, oldData.expenses, today));
      }
      checks++;
    }
  }
  assert.ok(checks >= 2400);
});

test('every day of a whole year gives the same numbers (realistic data, both modes)', () => {
  const oldData = {
    schemaVersion: 2,
    setupDone: true,
    settings: { monthlyIncome: 3_000_000, incomeDay: 25, setupDate: '2026-09-01', lastBackupDate: null, lastBucketId: null, lastWalletId: null },
    buckets: BUCKET_SETS[0],
    wallets: WALLETS,
    expenses: [],
    recurring: [
      { id: 'r-kos', name: 'Kos', amount: 1_000_000, bucketId: 'kebutuhan', walletId: 'bank', startDate: '2026-09-01', endDate: null, dueDay: 5 },
      { id: 'r-pulsa', name: 'Pulsa', amount: 50_000, bucketId: 'keinginan', walletId: 'gopay', startDate: '2026-09-01', endDate: null, dueDay: null },
    ],
    incomeOverrides: { '2026-12-25': 4_500_000, '2027-03-25': 0 },
    savings: [],
    plans: { active: null, history: [] },
  };
  for (let i = 0, date = '2026-09-01'; i < 420; i++, date = v2.addDays(date, 1)) {
    if (i % 2 === 0) oldData.expenses.push({ id: `e-${i}`, amount: 20_000 + (i % 7) * 13_500, bucketId: i % 3 ? 'kebutuhan' : 'keinginan', walletId: 'tunai', date, note: '', createdAt: i });
  }
  const newData = normalizeData(structuredClone(oldData)).data;
  for (let i = 0, today = '2026-09-01'; i < 400; i++, today = v2.addDays(today, 1)) compareBudget(oldData, newData, today, today);
});

test('pinned golden values (version 2 numbers, after the upgrade)', () => {
  // Rp 3.000.000 on the 25th, Kebutuhan 50 / Keinginan 30 / Tabungan 15 / Cadangan 5,
  // kos Rp 1.000.000 (due on the 5th) and a few expenses. Numbers worked out with version 2.
  const oldData = {
    schemaVersion: 2,
    setupDone: true,
    settings: { monthlyIncome: 3_000_000, incomeDay: 25, setupDate: '2026-10-01', lastBackupDate: null, lastBucketId: null, lastWalletId: null },
    buckets: BUCKET_SETS[0],
    wallets: WALLETS,
    expenses: [
      { id: 'e1', amount: 100_000, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-10-30', note: '', createdAt: 1 },
      { id: 'e2', amount: 200_000, bucketId: 'keinginan', walletId: 'gopay', date: '2026-11-05', note: '', createdAt: 2 },
      { id: 'e3', amount: 30_000, bucketId: 'kebutuhan', walletId: 'tunai', date: '2026-11-10', note: '', createdAt: 3 },
      { id: 'e4', amount: 45_000, bucketId: 'tabungan', walletId: 'bank', date: '2026-11-08', note: '', createdAt: 4 },
    ],
    recurring: [{ id: 'r1', name: 'Kos', amount: 1_000_000, bucketId: 'kebutuhan', walletId: 'bank', startDate: '2026-10-01', endDate: null, dueDay: 5 }],
    incomeOverrides: {},
    savings: [],
    plans: { active: null, history: [] },
  };
  const data = normalizeData(oldData).data;
  assert.deepEqual(data.settings.incomeSchedule, [{ id: 'i-1', day: 25, amount: 3_000_000 }]);
  for (const mode of ['hati-hati', 'total']) {
    const r = v3.dailyBudget({ ...data, settings: { ...data.settings, calcMode: mode } }, '2026-11-10');
    assert.equal(r.daysLeft, 15);
    assert.equal(r.spendableAllocation, 2_400_000);
    assert.equal(r.spendableRecurring, 1_000_000);
    assert.equal(r.spendablePool, 1_100_000); // 2.400.000 − 1.000.000 − 300.000
    assert.equal(r.amanHariIni, 73_333); // 1.100.000 / 15
    assert.equal(r.sisaHariIni, 43_333);
    assert.equal(r.remainingInPeriod, 1_070_000);
    assert.deepEqual(r.buckets.map((b) => b.remaining), [1_500_000 - 1_000_000 - 130_000, 900_000 - 200_000, 450_000 - 45_000, 150_000]);
  }
  const summary = v3.periodSummary(data, v3.getPeriod('2026-11-10', 25), '2026-11-10');
  assert.deepEqual([summary.income, summary.totalSpent, summary.leftover], [3_000_000, 1_375_000, 1_625_000]);
  assert.equal(v3planner.planEndDate('income', '2026-11-10', 25, null, v3.nextIncomeEnd(data, '2026-11-10')), '2026-11-24');
});
