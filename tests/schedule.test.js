// Tests for money that arrives in installments ("Uang Masuk Bertahap"):
// the rules in js/logic.js (periods, received money, the two "Cara hitung",
// cash on hand, the cash-flow chart) and the editing helpers in js/schedule.js.
// Run with:  npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPeriod,
  incomeSchedule,
  periodStartDay,
  periodInstallments,
  incomeStatus,
  incomeForPeriod,
  nextIncomeEnd,
  billDueDate,
  cashOnHand,
  dailyBudget,
  cashFlow,
  periodSummary,
  simulatePurchase,
  freezePastIncome,
  remapPeriodKeys,
  calcMode,
} from '../js/logic.js';
import {
  splitEvenly,
  rescale,
  presetSchedule,
  checkSchedule,
  checkPeriodIncome,
  checkDelay,
  canDelay,
  earliestDelayDate,
  unallocatedText,
  sumOf,
  MAX_INSTALLMENTS,
} from '../js/schedule.js';
import { planEndDate } from '../js/planner.js';

/* ----------------------------- test helpers ----------------------------- */

const BUCKETS = [
  { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
  { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
  { id: 'tabungan', name: 'Tabungan/Investasi', percent: 15, spendable: false },
  { id: 'cadangan', name: 'Dana Cadangan', percent: 5, spendable: false },
];

// Rp 3.000.000 a month in three parts: the 1st, the 12th and the 22nd.
const THREE = [
  { id: 'a', day: 1, amount: 1_000_000 },
  { id: 'b', day: 12, amount: 1_000_000 },
  { id: 'c', day: 22, amount: 1_000_000 },
];

let nextId = 1;
const spend = (date, amount, bucketId = 'kebutuhan') => ({ id: `e${nextId++}`, date, amount, bucketId, walletId: 'tunai', note: '', createdAt: 0 });
const bill = (amount, dueDay = null, extra = {}) => ({ id: `r${nextId++}`, name: 'Tagihan', amount, bucketId: 'kebutuhan', walletId: 'tunai', startDate: '2000-01-01', endDate: null, dueDay, ...extra });

function makeData({ schedule = THREE, mode = 'hati-hati', expenses = [], recurring = [], overrides = {}, delays = {}, buckets = BUCKETS } = {}) {
  return {
    schemaVersion: 3,
    setupDone: true,
    settings: {
      monthlyIncome: schedule.reduce((s, i) => s + i.amount, 0),
      incomeDay: Math.min(...schedule.map((i) => i.day)),
      incomeSchedule: schedule,
      calcMode: mode,
    },
    buckets,
    wallets: [{ id: 'tunai', name: 'Tunai' }],
    expenses,
    recurring,
    incomeOverrides: overrides,
    incomeDelays: delays,
    savings: [],
    plans: { active: null, history: [] },
  };
}

/* ------------------------------- periods ------------------------------- */

describe('periods with installments', () => {
  test('the earliest installment day starts the period; installments fall inside it', () => {
    const data = makeData();
    assert.equal(periodStartDay(data), 1);
    const period = getPeriod('2026-11-15', 1);
    assert.deepEqual([period.start, period.end], ['2026-11-01', '2026-11-30']);
    assert.deepEqual(
      periodInstallments(data, period).map((i) => [i.id, i.date, i.amount]),
      [['a', '2026-11-01', 1_000_000], ['b', '2026-11-12', 1_000_000], ['c', '2026-11-22', 1_000_000]],
    );
    assert.equal(incomeForPeriod(data, period.start), 3_000_000);
  });

  test('the schedule is sorted by day, whatever order it was typed in', () => {
    const data = makeData({ schedule: [{ id: 'z', day: 20, amount: 1 }, { id: 'y', day: 5, amount: 2 }] });
    assert.deepEqual(incomeSchedule(data).map((i) => i.day), [5, 20]);
    assert.equal(periodStartDay(data), 5);
    assert.deepEqual(getPeriod('2026-11-04', 5), { start: '2026-10-05', end: '2026-11-04', nextStart: '2026-11-05', length: 31 });
  });

  test('February: days that do not exist use the last day, and may share a date', () => {
    const data = makeData({ schedule: [{ id: 'a', day: 1, amount: 100 }, { id: 'b', day: 15, amount: 100 }, { id: 'c', day: 30, amount: 100 }, { id: 'd', day: 31, amount: 100 }] });
    const feb2027 = getPeriod('2027-02-10', 1);
    assert.deepEqual(periodInstallments(data, feb2027).map((i) => i.date), ['2027-02-01', '2027-02-15', '2027-02-28', '2027-02-28']);
    const feb2028 = getPeriod('2028-02-10', 1); // leap year
    assert.deepEqual(periodInstallments(data, feb2028).map((i) => i.date), ['2028-02-01', '2028-02-15', '2028-02-29', '2028-02-29']);
    // On 28 Feb 2027 both late installments arrive together.
    const status = incomeStatus(data, '2027-02-28');
    assert.equal(status.arrivedToday.length, 2);
    assert.equal(status.received, 400);
    assert.equal(status.next, null);
  });

  test('a period that starts on the 30th/31st: clamped days stay inside the period', () => {
    const data = makeData({ schedule: [{ id: 'a', day: 30, amount: 600 }, { id: 'b', day: 31, amount: 400 }] });
    const period = getPeriod('2027-03-10', periodStartDay(data)); // 28 Feb 2027 – 29 Mar 2027
    assert.deepEqual([period.start, period.end], ['2027-02-28', '2027-03-29']);
    assert.deepEqual(periodInstallments(data, period).map((i) => i.date), ['2027-02-28', '2027-02-28']);
    const april = getPeriod('2027-04-30', 30); // 30 Apr – 29 May
    assert.deepEqual(periodInstallments(data, april).map((i) => i.date), ['2027-04-30', '2027-04-30']);
    const may = getPeriod('2027-05-31', 30); // 30 May – 29 Jun: the 31st exists in May
    assert.deepEqual(periodInstallments(data, may).map((i) => i.date), ['2027-05-30', '2027-05-31']);
  });

  test('"Sekaligus" (one installment) works exactly like one income day', () => {
    const data = makeData({ schedule: [{ id: 'a', day: 25, amount: 3_000_000 }] });
    const status = incomeStatus(data, '2026-11-10');
    assert.equal(status.period.start, '2026-10-25');
    assert.equal(status.received, 3_000_000);
    assert.equal(status.next, null);
    assert.equal(status.horizonEnd, '2026-11-24');
  });
});

/* ------------------------- received and horizon ------------------------- */

describe('received money and the horizon', () => {
  test('an installment counts as received from its own date (the money arrives that morning)', () => {
    const data = makeData();
    const before = incomeStatus(data, '2026-11-11');
    assert.equal(before.received, 1_000_000);
    assert.equal(before.next.id, 'b');
    assert.equal(before.horizonEnd, '2026-11-11'); // 1-day horizon
    const onTheDay = incomeStatus(data, '2026-11-12');
    assert.equal(onTheDay.received, 2_000_000);
    assert.deepEqual(onTheDay.arrivedToday.map((i) => i.id), ['b']);
    assert.equal(onTheDay.installments.find((i) => i.id === 'b').state, 'hari-ini');
    assert.equal(onTheDay.horizonEnd, '2026-11-21');
  });

  test('states and countdown: SUDAH MASUK / HARI INI / H-n / TERTUNDA', () => {
    const data = makeData({ delays: { '2026-11-01': { c: '2026-11-25' } } });
    const status = incomeStatus(data, '2026-11-17');
    assert.deepEqual(
      status.installments.map((i) => [i.id, i.state, i.daysUntil]),
      [['a', 'masuk', -16], ['b', 'masuk', -5], ['c', 'tertunda', 8]],
    );
  });

  test('the last installment: horizon is the end of the period; all received', () => {
    const status = incomeStatus(makeData(), '2026-11-25');
    assert.equal(status.received, 3_000_000);
    assert.equal(status.receivedCount, 3);
    assert.equal(status.next, null);
    assert.equal(status.horizonEnd, '2026-11-30');
  });

  test('two installments on the same date', () => {
    const data = makeData({ schedule: [{ id: 'a', day: 1, amount: 1_000_000 }, { id: 'b', day: 15, amount: 500_000 }, { id: 'c', day: 15, amount: 700_000 }] });
    const dayBefore = incomeStatus(data, '2026-11-14');
    assert.equal(dayBefore.horizonEnd, '2026-11-14');
    assert.equal(dailyBudget(data, '2026-11-14').daysLeft, 1);
    const onTheDay = incomeStatus(data, '2026-11-15');
    assert.equal(onTheDay.received, 2_200_000);
    assert.equal(onTheDay.arrivedToday.length, 2);
    assert.equal(onTheDay.horizonEnd, '2026-11-30');
  });

  test('"Sampai uang masuk berikutnya" = the next installment − 1 day, or the period end', () => {
    const data = makeData();
    assert.equal(nextIncomeEnd(data, '2026-11-05'), '2026-11-11');
    assert.equal(nextIncomeEnd(data, '2026-11-12'), '2026-11-21'); // today's installment is already here
    assert.equal(nextIncomeEnd(data, '2026-11-25'), '2026-11-30');
    assert.equal(planEndDate('income', '2026-11-05', 1, null, nextIncomeEnd(data, '2026-11-05')), '2026-11-11');
    // One installment: same as before (end of the period).
    const once = makeData({ schedule: [{ id: 'a', day: 25, amount: 3_000_000 }] });
    assert.equal(nextIncomeEnd(once, '2026-11-02'), planEndDate('income', '2026-11-02', 25));
    assert.equal(nextIncomeEnd(once, '2026-11-25'), '2026-12-24');
  });
});

/* -------------------------------- delays -------------------------------- */

describe('"Belum masuk, geser tanggal" (a late installment)', () => {
  const period = getPeriod('2026-11-12', 1);

  test('until the new date it counts as not received', () => {
    const data = makeData({ delays: { '2026-11-01': { b: '2026-11-15' } } });
    const status = incomeStatus(data, '2026-11-12');
    const b = status.installments.find((i) => i.id === 'b');
    assert.deepEqual([b.plannedDate, b.date, b.delayed, b.state], ['2026-11-12', '2026-11-15', true, 'tertunda']);
    assert.equal(status.received, 1_000_000);
    assert.equal(status.arrivedToday.length, 0);
    assert.equal(status.horizonEnd, '2026-11-14');
    const budget = dailyBudget(data, '2026-11-12');
    assert.equal(budget.daysLeft, 3);
    assert.equal(budget.amanHariIni, Math.floor(800_000 / 3));
    // On the new date it has arrived.
    const later = incomeStatus(data, '2026-11-15');
    assert.equal(later.received, 2_000_000);
    assert.deepEqual(later.arrivedToday.map((i) => i.id), ['b']);
  });

  test('checks: later than today and the planned date, but not past the period end (rejected)', () => {
    const b = { id: 'b', plannedDate: '2026-11-12', date: '2026-11-12', amount: 1_000_000 };
    assert.equal(checkDelay(b, '2026-11-15', period, '2026-11-12'), '');
    assert.match(checkDelay(b, '2026-12-01', period, '2026-11-12'), /Paling lambat 30 November 2026/);
    assert.match(checkDelay(b, '2026-11-12', period, '2026-11-12'), /setelah hari ini/);
    assert.match(checkDelay(b, '2026-11-10', period, '2026-11-08'), /setelah 12 November 2026/);
    assert.match(checkDelay(b, '2026-02-30', period, '2026-11-12'), /tidak valid/);
    assert.equal(earliestDelayDate(b, '2026-11-12'), '2026-11-13');
    assert.equal(earliestDelayDate(b, '2026-11-05'), '2026-11-13');
    assert.equal(canDelay(b, period, '2026-11-29'), true);
    assert.equal(canDelay(b, period, '2026-11-30'), false); // the last day: no later date left
  });

  test('a delay past the period end, or not after the planned date, is ignored by the math', () => {
    const tooLate = makeData({ delays: { '2026-11-01': { b: '2026-12-03' } } });
    assert.equal(periodInstallments(tooLate, period).find((i) => i.id === 'b').date, '2026-11-12');
    const earlier = makeData({ delays: { '2026-11-01': { b: '2026-11-10' } } });
    assert.equal(periodInstallments(earlier, period).find((i) => i.id === 'b').delayed, false);
  });
});

/* -------------------- "Hati-hati" (only money that arrived) -------------------- */

describe('"aman hari ini": Hati-hati (default)', () => {
  test('is the default mode', () => {
    assert.equal(calcMode({ settings: {} }), 'hati-hati');
    assert.equal(calcMode(makeData({ mode: 'total' })), 'total');
  });

  test('only received money, spread until the day before the next installment', () => {
    const r = dailyBudget(makeData(), '2026-11-05');
    assert.equal(r.mode, 'hati-hati');
    assert.equal(r.horizonEnd, '2026-11-11');
    assert.equal(r.daysLeft, 7);
    assert.equal(r.spendableAllocation, 800_000); // 80% of the first Rp 1.000.000
    assert.equal(r.spendablePool, 800_000);
    assert.equal(r.amanHariIni, 114_285); // 800.000 / 7, rounded down
    assert.equal(r.sisaHariIni, 114_285);
    assert.equal(r.cashOnHand, 1_000_000);
    assert.equal(r.shortfall, null);
  });

  test('installment dated today: the daily number jumps up, the pool carries over', () => {
    const expenses = [spend('2026-11-03', 300_000), spend('2026-11-08', 300_000, 'keinginan')];
    const dayBefore = dailyBudget(makeData({ expenses }), '2026-11-11');
    assert.equal(dayBefore.daysLeft, 1);
    assert.equal(dayBefore.amanHariIni, 200_000); // 800.000 − 600.000, all for the last day
    const r = dailyBudget(makeData({ expenses }), '2026-11-12');
    assert.equal(r.horizonEnd, '2026-11-21');
    assert.equal(r.daysLeft, 10);
    assert.equal(r.spendableAllocation, 1_600_000);
    assert.equal(r.spendablePool, 1_000_000); // unspent 200.000 + the new 800.000
    assert.equal(r.amanHariIni, 100_000);
    assert.ok(r.amanHariIni < dailyBudget(makeData(), '2026-11-12').amanHariIni);
    assert.deepEqual(r.incomeStatus.arrivedToday.map((i) => i.id), ['b']);
  });

  test('after the last installment the horizon is the period end', () => {
    const r = dailyBudget(makeData(), '2026-11-22');
    assert.equal(r.horizonEnd, '2026-11-30');
    assert.equal(r.daysLeft, 9);
    assert.equal(r.amanHariIni, Math.floor(2_400_000 / 9));
  });

  test('1-day horizon: the whole pool is for today', () => {
    const r = dailyBudget(makeData({ expenses: [spend('2026-11-02', 500_000)] }), '2026-11-21');
    assert.equal(r.daysLeft, 1);
    assert.equal(r.amanHariIni, 1_600_000 - 500_000);
  });

  test("today's expenses do not change today's allowance, only what is left", () => {
    const r = dailyBudget(makeData({ expenses: [spend('2026-11-05', 40_000)] }), '2026-11-05');
    assert.equal(r.amanHariIni, 114_285);
    assert.equal(r.sisaHariIni, 74_285);
    assert.equal(r.cashOnHand, 960_000);
  });

  test('recurring bills are reserved once their due date is inside the horizon', () => {
    const recurring = [bill(600_000, 15), bill(100_000)]; // kos due on the 15th; pulsa without a due day
    const early = dailyBudget(makeData({ recurring }), '2026-11-05');
    assert.equal(early.spendableRecurring, 100_000); // kos is due after the next installment
    assert.equal(early.amanHariIni, 100_000); // (800.000 − 100.000) / 7
    const later = dailyBudget(makeData({ recurring }), '2026-11-12');
    assert.equal(later.spendableRecurring, 700_000);
    assert.equal(later.amanHariIni, 90_000); // (1.600.000 − 700.000) / 10
    assert.equal(dailyBudget(makeData({ recurring, mode: 'total' }), '2026-11-05').spendableRecurring, 700_000);
  });

  test('planned expenses after the next installment are counted once it has arrived', () => {
    const expenses = [spend('2026-11-15', 200_000)];
    assert.equal(dailyBudget(makeData({ expenses }), '2026-11-05').spendablePool, 800_000);
    assert.equal(dailyBudget(makeData({ expenses }), '2026-11-12').spendablePool, 1_400_000);
  });

  test('overspending gives negative numbers ("Melebihi anggaran"), never silently 0', () => {
    const r = dailyBudget(makeData({ expenses: [spend('2026-11-02', 900_000)] }), '2026-11-05');
    assert.equal(r.spendablePool, -100_000);
    assert.equal(r.amanHariIni, -14_286); // rounded down
    assert.ok(r.sisaHariIni < 0);
    assert.equal(r.cashOnHand, 100_000);
  });

  test('cash on hand can be negative', () => {
    const r = dailyBudget(makeData({ expenses: [spend('2026-11-02', 1_200_000)] }), '2026-11-05');
    assert.equal(r.cashOnHand, -200_000);
    assert.equal(r.amanHariIni, -57_143);
  });

  test('buckets get their share of each installment when it arrives', () => {
    const r = dailyBudget(makeData({ expenses: [spend('2026-11-02', 100_000)] }), '2026-11-05');
    const kebutuhan = r.buckets.find((b) => b.id === 'kebutuhan');
    assert.equal(kebutuhan.allocation, 1_500_000); // the whole month
    assert.equal(kebutuhan.allocationNow, 500_000); // what has arrived
    assert.equal(kebutuhan.remainingNow, 400_000);
    const tabungan = r.buckets.find((b) => b.id === 'tabungan');
    assert.equal(tabungan.allocationNow, 150_000);
  });
});

/* -------------------- "Total bulan" (the version 2 formula) -------------------- */

describe('"aman hari ini": Total bulan', () => {
  test('the whole month, spread until the period end', () => {
    const r = dailyBudget(makeData({ mode: 'total' }), '2026-11-05');
    assert.equal(r.mode, 'total');
    assert.equal(r.horizonEnd, '2026-11-30');
    assert.equal(r.daysLeft, 26);
    assert.equal(r.spendableAllocation, 2_400_000);
    assert.equal(r.amanHariIni, 92_307);
    assert.equal(r.shortfall, null); // 7 days × 92.307 fits in the Rp 1.000.000 in hand
  });

  test('warning when the plan until the next installment is more than the money in hand', () => {
    const r = dailyBudget(makeData({ mode: 'total', expenses: [spend('2026-11-02', 500_000)] }), '2026-11-05');
    assert.equal(r.amanHariIni, 73_076);
    assert.equal(r.cashOnHand, 500_000);
    assert.deepEqual(r.shortfall, { need: 73_076 * 7, have: 500_000, until: '2026-11-11' });
    // After the last installment there is nothing to wait for: no warning.
    assert.equal(dailyBudget(makeData({ mode: 'total', expenses: [spend('2026-11-02', 2_000_000)] }), '2026-11-25').shortfall, null);
  });

  test('bills and planned expenses before the next installment count in the warning', () => {
    const recurring = [bill(600_000, 10)]; // due on the 10th: still in hand on the 5th, but needed before the 12th
    const r = dailyBudget(makeData({ mode: 'total', recurring }), '2026-11-05');
    assert.equal(r.amanHariIni, 69_230); // (2.400.000 − 600.000) / 26
    assert.equal(r.cashOnHand, 1_000_000);
    assert.deepEqual(r.shortfall, { need: 69_230 * 7 + 600_000, have: 1_000_000, until: '2026-11-11' });
    const planned = dailyBudget(makeData({ mode: 'total', expenses: [spend('2026-11-09', 600_000)] }), '2026-11-05');
    assert.equal(planned.shortfall.need, planned.amanHariIni * 7 + 600_000);
  });

  test('both modes agree once every installment has arrived', () => {
    const careful = dailyBudget(makeData(), '2026-11-25');
    const total = dailyBudget(makeData({ mode: 'total' }), '2026-11-25');
    assert.equal(careful.amanHariIni, total.amanHariIni);
    assert.equal(careful.sisaHariIni, total.sisaHariIni);
  });
});

/* --------------------------- period override --------------------------- */

describe('special income for one period', () => {
  const overrides = {
    '2026-11-01': { installments: [{ id: 'x', date: '2026-11-01', amount: 2_000_000 }, { id: 'y', date: '2026-11-20', amount: 500_000 }] },
  };

  test('changes only that period; the template stays', () => {
    const data = makeData({ overrides });
    assert.equal(incomeForPeriod(data, '2026-11-01'), 2_500_000);
    assert.equal(incomeForPeriod(data, '2026-12-01'), 3_000_000);
    const r = dailyBudget(data, '2026-11-05');
    assert.equal(r.incomeIsOverride, true);
    assert.equal(r.horizonEnd, '2026-11-19');
    assert.equal(r.daysLeft, 15);
    assert.equal(r.amanHariIni, 106_666); // 1.600.000 / 15
    assert.equal(dailyBudget(data, '2026-12-05').incomeIsOverride, false);
  });

  test('an empty list means no money in that period', () => {
    const data = makeData({ overrides: { '2026-11-01': { installments: [] } } });
    assert.equal(incomeForPeriod(data, '2026-11-01'), 0);
    assert.equal(dailyBudget(data, '2026-11-05').amanHariIni, 0);
  });

  test('checks: the sum must equal the total, dates inside the period', () => {
    const period = getPeriod('2026-11-05', 1);
    const ok = { total: 2_500_000, installments: [{ date: '2026-11-01', amount: 2_000_000 }, { date: '2026-11-20', amount: 500_000 }] };
    assert.equal(checkPeriodIncome(ok, period), null);
    assert.match(checkPeriodIncome({ ...ok, total: 3_000_000 }, period).message, /Belum dialokasikan: Rp 500\.000/);
    assert.match(checkPeriodIncome({ ...ok, installments: [{ date: '2026-12-01', amount: 2_500_000 }] }, period).message, /di periode ini/);
    assert.equal(checkPeriodIncome({ total: 0, installments: [] }, period), null);
    assert.match(checkPeriodIncome({ total: 5, installments: [] }, period).message, /minimal satu/);
  });
});

/* ------------------------------ cash on hand ------------------------------ */

describe('cash on hand ("uang di tangan")', () => {
  test('received − expenses so far − bills already due (planned expenses not yet)', () => {
    const data = makeData({ recurring: [bill(600_000, 15), bill(100_000)], expenses: [spend('2026-11-03', 50_000, 'tabungan'), spend('2026-11-20', 70_000)] });
    assert.equal(cashOnHand(data, '2026-11-05'), 1_000_000 - 100_000 - 50_000);
    assert.equal(cashOnHand(data, '2026-11-16'), 2_000_000 - 700_000 - 50_000);
    assert.equal(cashOnHand(data, '2026-11-30'), 3_000_000 - 700_000 - 120_000);
  });

  test('due dates of recurring bills inside a period', () => {
    const p25 = getPeriod('2026-11-10', 25); // 25 Oct – 24 Nov
    assert.equal(billDueDate(bill(1), p25), '2026-10-25'); // no due day: the first day
    assert.equal(billDueDate(bill(1, 28), p25), '2026-10-28');
    assert.equal(billDueDate(bill(1, 5), p25), '2026-11-05');
    assert.equal(billDueDate(bill(1, 25), p25), '2026-10-25');
    const p31 = getPeriod('2027-02-10', 31); // 31 Jan – 27 Feb 2027
    assert.equal(billDueDate(bill(1, 30), p31), '2027-02-27'); // stays inside the period
    assert.equal(billDueDate(bill(1, 31), getPeriod('2027-02-10', 1)), '2027-02-28');
  });
});

/* ------------------------------ cash-flow chart ------------------------------ */

describe('cash-flow chart ("ARUS KAS")', () => {
  test('steps up on installment days, projection follows the daily allowance', () => {
    const flow = cashFlow(makeData(), '2026-11-01');
    assert.equal(flow.days.length, 30);
    assert.equal(flow.todayIndex, 0);
    const day = (date) => flow.days.find((d) => d.date === date);
    assert.equal(day('2026-11-01').start, 1_000_000);
    assert.equal(day('2026-11-11').end, 200_000); // the first 800.000 is used up; the savings part stays
    assert.equal(day('2026-11-12').start, 1_200_000);
    assert.equal(day('2026-11-12').arrived, 1_000_000);
    assert.equal(day('2026-11-21').end, 400_000);
    assert.equal(day('2026-11-30').end, 600_000); // everything spendable used, savings left
    assert.ok(flow.days.every((d) => d.projected));
  });

  test('"Total bulan" projection: the same allowance every day', () => {
    const flow = cashFlow(makeData({ mode: 'total' }), '2026-11-01');
    assert.equal(flow.days[10].end, 1_000_000 - 11 * 80_000);
    assert.equal(flow.days[29].end, 600_000);
  });

  test('real expenses before today, projection from today; bills step down when due', () => {
    const data = makeData({ recurring: [bill(100_000, 3)], expenses: [spend('2026-11-02', 50_000)] });
    const flow = cashFlow(data, '2026-11-05');
    assert.equal(flow.todayIndex, 4);
    assert.equal(flow.days[1].end, 950_000);
    assert.equal(flow.days[2].due, 100_000);
    assert.equal(flow.days[2].start, 850_000);
    assert.equal(flow.days[3].end, cashOnHand(data, '2026-11-04'));
    assert.deepEqual(flow.days.map((d) => d.projected).indexOf(true), 4);
  });
});

/* ------------------------------ summaries ------------------------------ */

describe('Ringkasan: installments, total vs received', () => {
  test('received so far in the current period; past periods fully received', () => {
    const data = makeData({ delays: { '2026-11-01': { b: '2026-11-14' } } });
    const s = periodSummary(data, getPeriod('2026-11-13', 1), '2026-11-13');
    assert.equal(s.income, 3_000_000);
    assert.equal(s.received, 1_000_000);
    assert.deepEqual(s.installments.map((i) => [i.date, i.state]), [['2026-11-01', 'masuk'], ['2026-11-14', 'tertunda'], ['2026-11-22', 'akan']]);
    const past = periodSummary(data, getPeriod('2026-10-13', 1), '2026-11-13');
    assert.equal(past.received, 3_000_000);
  });

  test('"kalau beli ini" in Hati-hati mode uses the money that has arrived', () => {
    const sim = simulatePurchase(makeData(), '2026-11-05', 50_000, 'keinginan');
    assert.equal(sim.before.amanHariIni, 114_285);
    assert.equal(sim.after.sisaHariIni, 64_285);
    assert.equal(sim.before.bucketRemaining, 300_000); // 30% of the Rp 1.000.000 that arrived
    assert.equal(sim.after.bucketRemaining, 250_000);
  });
});

/* -------------------------- changing the schedule -------------------------- */

describe('changing the schedule keeps history', () => {
  test('past periods with expenses keep their old installments (and the real dates)', () => {
    const data = makeData({ expenses: [spend('2026-10-05', 1), spend('2026-11-03', 1)], delays: { '2026-10-01': { b: '2026-10-14' } } });
    const frozen = freezePastIncome(data, '2026-11-10');
    assert.deepEqual(Object.keys(frozen), ['2026-10-01']);
    assert.deepEqual(frozen['2026-10-01'].installments.map((i) => [i.id, i.date, i.amount]), [['a', '2026-10-01', 1_000_000], ['b', '2026-10-14', 1_000_000], ['c', '2026-10-22', 1_000_000]]);
  });

  test('a new start day moves special incomes and late installments into the new periods', () => {
    const data = makeData({
      overrides: { '2026-11-01': { installments: [{ id: 'x', date: '2026-11-01', amount: 100 }, { id: 'y', date: '2026-11-28', amount: 50 }] } },
      delays: { '2026-11-01': { b: '2026-11-14' } },
    });
    const moved = remapPeriodKeys(data, 10); // periods now run from the 10th
    assert.deepEqual(Object.keys(moved.incomeOverrides), ['2026-10-10']);
    assert.deepEqual(moved.incomeOverrides['2026-10-10'].installments.map((i) => i.date), ['2026-11-01', '2026-11-09']);
    assert.deepEqual(moved.incomeDelays, {}); // 14 Nov is outside 10 Oct – 9 Nov
  });
});

/* ------------------------------ editor helpers ------------------------------ */

describe('editor helpers ("Bagi rata", presets, proportional)', () => {
  test('"Bagi rata": equal parts, leftover Rupiah to the first installments', () => {
    assert.deepEqual(splitEvenly(3_000_000, 3), [1_000_000, 1_000_000, 1_000_000]);
    assert.deepEqual(splitEvenly(1_000_001, 3), [333_334, 333_334, 333_333]);
    assert.deepEqual(splitEvenly(10, 4), [3, 3, 2, 2]);
    for (const [total, count] of [[1, 8], [999_999_999, 7], [2_500_000, 4]]) {
      assert.equal(splitEvenly(total, count).reduce((s, x) => s + x, 0), total);
    }
  });

  test('presets: Sekaligus keeps the start day; 2×, 3×, 4× mingguan split evenly', () => {
    assert.deepEqual(presetSchedule('sekaligus', 3_000_000, 25), [{ day: 25, amount: 3_000_000 }]);
    assert.deepEqual(presetSchedule('2x', 3_000_001, 25), [{ day: 1, amount: 1_500_001 }, { day: 15, amount: 1_500_000 }]);
    assert.deepEqual(presetSchedule('3x', 3_000_000).map((i) => i.day), [1, 11, 21]);
    assert.deepEqual(presetSchedule('4x', 3_000_000).map((i) => [i.day, i.amount]), [[1, 750_000], [8, 750_000], [15, 750_000], [22, 750_000]]);
    assert.deepEqual(presetSchedule('2x', null), [{ day: 1, amount: null }, { day: 15, amount: null }]);
  });

  test('"Bagi ulang proporsional" when the total changes', () => {
    assert.deepEqual(rescale([1_000_000, 1_000_000, 1_000_000], 3_600_000), [1_200_000, 1_200_000, 1_200_000]);
    assert.deepEqual(rescale([2_000_000, 1_000_000], 1_000_000), [666_667, 333_333]);
    assert.deepEqual(rescale([null, null], 5), [3, 2]); // nothing filled in: split evenly
    assert.equal(rescale([999_999_999, 1, 7], 1_000_000_000).reduce((s, x) => s + x, 0), 1_000_000_000);
  });

  test('saving is blocked unless the installments add up to the total', () => {
    const ok = { total: 3_000_000, installments: THREE };
    assert.equal(checkSchedule(ok), null);
    assert.match(checkSchedule({ ...ok, total: 3_500_000 }).message, /Belum dialokasikan: Rp 500\.000/);
    assert.match(checkSchedule({ ...ok, total: 2_000_000 }).message, /Kelebihan Rp 1\.000\.000/);
    assert.equal(checkSchedule({ ...ok, total: 0 }).field, 'total');
    assert.match(checkSchedule({ total: 1, installments: [] }).message, /Minimal/);
    const nine = Array.from({ length: MAX_INSTALLMENTS + 1 }, (_, i) => ({ day: i + 1, amount: 1 }));
    assert.match(checkSchedule({ total: 9, installments: nine }).message, /Maksimal 8/);
    assert.equal(checkSchedule({ total: 8, installments: nine.slice(0, 8) }), null);
    assert.equal(checkSchedule({ total: 2, installments: [{ day: 0, amount: 1 }, { day: 5, amount: 1 }] }).index, 0);
    assert.match(checkSchedule({ total: 2, installments: [{ day: 3, amount: 1 }, { day: 5, amount: 0 }] }).message, /ke-2/);
    assert.equal(sumOf([{ amount: 5 }, { amount: null }]), 5);
    assert.equal(unallocatedText(1), 'Belum dialokasikan: Rp 1.');
  });
});
