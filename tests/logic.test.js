// Unit tests for js/logic.js. Run them with:  npm test   (or: node --test)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLeapYear,
  daysInMonth,
  parseDateStr,
  isValidDateStr,
  daysBetween,
  addDays,
  weekday,
  clampIncomeDay,
  incomeDateInMonth,
  getPeriod,
  previousPeriod,
  nextPeriod,
  daysLeftInPeriod,
  percentTotal,
  bucketAllocation,
  incomeForPeriod,
  isRecurringActiveInPeriod,
  bucketReport,
  dailyBudget,
  simulatePurchase,
  periodSummary,
  leftoverMoveStatus,
  remapPeriodKeys,
  freezePastIncome,
} from '../js/logic.js';

/* ----------------------------- test helpers ----------------------------- */

const DEFAULT_BUCKETS = [
  { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
  { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
  { id: 'tabungan', name: 'Tabungan/Investasi', percent: 15, spendable: false },
  { id: 'cadangan', name: 'Dana Cadangan', percent: 5, spendable: false },
];

const WALLETS = [
  { id: 'tunai', name: 'Tunai' },
  { id: 'gopay', name: 'GoPay' },
];

let nextId = 1;
function expense(date, amount, bucketId = 'kebutuhan', walletId = 'tunai') {
  return { id: `e${nextId++}`, date, amount, bucketId, walletId, note: '' };
}

function bill(amount, bucketId, extra = {}) {
  return { id: `r${nextId++}`, name: 'Tagihan', amount, bucketId, walletId: 'tunai', startDate: '2000-01-01', endDate: null, ...extra };
}

function makeData({
  income = 3_000_000,
  incomeDay = 25,
  buckets = DEFAULT_BUCKETS,
  expenses = [],
  recurring = [],
  incomeOverrides = {},
  savings = [],
} = {}) {
  return {
    settings: { monthlyIncome: income, incomeDay },
    buckets,
    wallets: WALLETS,
    expenses,
    recurring,
    incomeOverrides,
    savings,
  };
}

/** A test-only "second opinion" for day counting, using the built-in Date. */
function oracleDaysBetween(a, b) {
  const toUtc = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/* ------------------------------- calendar ------------------------------- */

describe('calendar helpers', () => {
  test('leap years and month lengths', () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(2028), true);
    assert.equal(isLeapYear(1900), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 12), 31);
  });

  test('date validation', () => {
    assert.deepEqual(parseDateStr('2026-10-25'), { year: 2026, month: 10, day: 25 });
    assert.equal(isValidDateStr('2028-02-29'), true);
    assert.equal(isValidDateStr('2026-02-29'), false);
    assert.equal(isValidDateStr('2026-13-01'), false);
    assert.equal(isValidDateStr('2026-1-1'), false);
    assert.equal(isValidDateStr(''), false);
    assert.equal(isValidDateStr(null), false);
  });

  test('day counting matches the built-in Date for many dates', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const randomDate = () => {
      const year = 1950 + Math.floor(random() * 200);
      const month = 1 + Math.floor(random() * 12);
      const day = 1 + Math.floor(random() * daysInMonth(year, month));
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    for (let i = 0; i < 2000; i++) {
      const a = randomDate();
      const b = randomDate();
      assert.equal(daysBetween(a, b), oracleDaysBetween(a, b), `${a} -> ${b}`);
      const n = Math.floor(random() * 1000) - 500;
      assert.equal(addDays(addDays(a, n), -n), a);
      assert.equal(daysBetween(a, addDays(a, n)), n);
    }
  });

  test('addDays across month, year and leap-day boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  });

  test('weekday (0 = Minggu)', () => {
    assert.equal(weekday('2026-10-25'), 0); // Sunday
    assert.equal(weekday('2026-10-26'), 1); // Monday
    assert.equal(weekday('2000-01-01'), 6); // Saturday
    assert.equal(weekday('2028-02-29'), 2); // Tuesday
  });
});

/* -------------------------------- periods -------------------------------- */

describe('periods', () => {
  test('normal month: income day 25', () => {
    assert.deepEqual(getPeriod('2026-11-10', 25), {
      start: '2026-10-25',
      end: '2026-11-24',
      nextStart: '2026-11-25',
      length: 31,
    });
    assert.equal(daysLeftInPeriod('2026-11-10', 25), 15);
  });

  test('income day itself starts a new period', () => {
    const period = getPeriod('2026-11-25', 25);
    assert.equal(period.start, '2026-11-25');
    assert.equal(period.end, '2026-12-24');
    assert.equal(daysLeftInPeriod('2026-11-25', 25), 30); // the whole period, today included
  });

  test('last day before income: daysLeft = 1', () => {
    assert.equal(getPeriod('2026-11-24', 25).start, '2026-10-25');
    assert.equal(daysLeftInPeriod('2026-11-24', 25), 1);
    assert.equal(daysLeftInPeriod('2026-10-31', 1), 1);
  });

  test('income day 1 = calendar month', () => {
    assert.deepEqual(getPeriod('2026-10-25', 1), { start: '2026-10-01', end: '2026-10-31', nextStart: '2026-11-01', length: 31 });
  });

  test('periods across the new year', () => {
    assert.deepEqual(getPeriod('2027-01-05', 25), { start: '2026-12-25', end: '2027-01-24', nextStart: '2027-01-25', length: 31 });
  });

  test('income day 31 in short months uses the last day of the month', () => {
    assert.equal(incomeDateInMonth(2026, 4, 31), '2026-04-30');
    assert.equal(incomeDateInMonth(2026, 2, 31), '2026-02-28');
    assert.deepEqual(getPeriod('2026-04-15', 31), { start: '2026-03-31', end: '2026-04-29', nextStart: '2026-04-30', length: 30 });
    assert.deepEqual(getPeriod('2026-04-30', 31), { start: '2026-04-30', end: '2026-05-30', nextStart: '2026-05-31', length: 31 });
    assert.deepEqual(getPeriod('2026-02-27', 31), { start: '2026-01-31', end: '2026-02-27', nextStart: '2026-02-28', length: 28 });
    assert.deepEqual(getPeriod('2026-02-28', 31), { start: '2026-02-28', end: '2026-03-30', nextStart: '2026-03-31', length: 31 });
    assert.equal(getPeriod('2026-03-30', 31).start, '2026-02-28');
    assert.equal(daysLeftInPeriod('2026-04-29', 31), 1);
  });

  test('February in leap and non-leap years', () => {
    // Income day 30 in a leap year: February 29 is used.
    assert.deepEqual(getPeriod('2028-02-29', 30), { start: '2028-02-29', end: '2028-03-29', nextStart: '2028-03-30', length: 30 });
    assert.deepEqual(getPeriod('2028-02-28', 30), { start: '2028-01-30', end: '2028-02-28', nextStart: '2028-02-29', length: 30 });
    // Income day 29: exists in Feb 2028, not in Feb 2027.
    assert.deepEqual(getPeriod('2028-02-28', 29), { start: '2028-01-29', end: '2028-02-28', nextStart: '2028-02-29', length: 31 });
    assert.deepEqual(getPeriod('2027-02-28', 29), { start: '2027-02-28', end: '2027-03-28', nextStart: '2027-03-29', length: 29 });
    // Income day 1: February is 29 or 28 days long.
    assert.equal(getPeriod('2028-02-10', 1).length, 29);
    assert.equal(getPeriod('2027-02-10', 1).length, 28);
  });

  test('periods never overlap or leave gaps (every income day, 3 years)', () => {
    for (let incomeDay = 1; incomeDay <= 31; incomeDay++) {
      let date = '2026-12-01';
      let previous = null;
      for (let i = 0; i < 365 * 3 + 40; i++) {
        const period = getPeriod(date, incomeDay);
        assert.ok(period.start <= date && date <= period.end, `${date} day ${incomeDay}`);
        assert.equal(addDays(period.end, 1), period.nextStart);
        if (previous && previous.start !== period.start) {
          assert.equal(previous.nextStart, period.start, `gap/overlap at ${date} day ${incomeDay}`);
        }
        previous = period;
        date = addDays(date, 1);
      }
      const p = getPeriod('2027-06-15', incomeDay);
      assert.deepEqual(previousPeriod(nextPeriod(p, incomeDay), incomeDay), p);
    }
  });

  test('income day is clamped to 1..31', () => {
    assert.equal(clampIncomeDay(0), 1);
    assert.equal(clampIncomeDay(45), 31);
    assert.equal(clampIncomeDay('abc'), 1);
    assert.equal(clampIncomeDay(12), 12);
  });
});

/* ---------------------------- daily budget ---------------------------- */

describe('daily budget ("Aman dipakai hari ini")', () => {
  test('normal month', () => {
    const data = makeData({
      expenses: [
        expense('2026-10-20', 500_000), // previous period: ignored
        expense('2026-10-30', 100_000, 'kebutuhan'),
        expense('2026-11-05', 200_000, 'keinginan'),
        expense('2026-11-10', 30_000, 'kebutuhan'), // today
        expense('2026-11-25', 999, 'kebutuhan'), // next period: ignored
      ],
    });
    const result = dailyBudget(data, '2026-11-10');
    assert.equal(result.period.start, '2026-10-25');
    assert.equal(result.daysLeft, 15);
    assert.equal(result.spendableAllocation, 2_400_000); // 80% of 3.000.000
    assert.equal(result.spendablePool, 2_100_000); // 2.400.000 - 300.000 (today excluded)
    assert.equal(result.amanHariIni, 140_000); // 2.100.000 / 15
    assert.equal(result.spentToday, 30_000);
    assert.equal(result.sisaHariIni, 110_000);
    assert.equal(result.remainingInPeriod, 2_070_000);
    assert.equal(result.percentTotal, 100);
  });

  test("today's expenses do not change today's allowance, only what is left", () => {
    const empty = dailyBudget(makeData(), '2026-11-10');
    const withSpending = dailyBudget(makeData({ expenses: [expense('2026-11-10', 50_000)] }), '2026-11-10');
    assert.equal(withSpending.amanHariIni, empty.amanHariIni);
    assert.equal(withSpending.sisaHariIni, empty.sisaHariIni - 50_000);
  });

  test('underspend yesterday raises today; overspend lowers it', () => {
    const base = { incomeDay: 1 }; // November: 30 days, 2.400.000 spendable
    assert.equal(dailyBudget(makeData(base), '2026-11-01').amanHariIni, 80_000);
    const under = dailyBudget(makeData({ ...base, expenses: [expense('2026-11-01', 50_000)] }), '2026-11-02');
    const over = dailyBudget(makeData({ ...base, expenses: [expense('2026-11-01', 110_000)] }), '2026-11-02');
    assert.equal(under.amanHariIni, 81_034); // 2.350.000 / 29, rounded down
    assert.equal(over.amanHariIni, 78_965); // 2.290.000 / 29, rounded down
  });

  test('income day itself: full period, old expenses not counted', () => {
    const data = makeData({ expenses: [expense('2026-11-24', 400_000)] });
    const result = dailyBudget(data, '2026-11-25');
    assert.equal(result.daysLeft, 30);
    assert.equal(result.spendablePool, 2_400_000);
    assert.equal(result.amanHariIni, 80_000);
  });

  test('last day before income (daysLeft = 1): allowance is the whole pool', () => {
    const data = makeData({
      expenses: [expense('2026-11-01', 2_350_000), expense('2026-11-24', 20_000)],
    });
    const result = dailyBudget(data, '2026-11-24');
    assert.equal(result.daysLeft, 1);
    assert.equal(result.amanHariIni, 50_000);
    assert.equal(result.sisaHariIni, 30_000);
  });

  test('overspending gives negative numbers (never silently 0)', () => {
    const data = makeData({
      expenses: [expense('2026-11-01', 2_500_000), expense('2026-11-20', 10_000)],
    });
    const result = dailyBudget(data, '2026-11-20'); // 5 days left
    assert.equal(result.daysLeft, 5);
    assert.equal(result.spendablePool, -100_000);
    assert.equal(result.amanHariIni, -20_000);
    assert.equal(result.sisaHariIni, -30_000);

    // Positive allowance, but a big purchase today makes the rest negative.
    const bigToday = makeData({
      expenses: [expense('2026-11-01', 1_900_000), expense('2026-11-20', 150_000)],
    });
    const r2 = dailyBudget(bigToday, '2026-11-20');
    assert.equal(r2.amanHariIni, 100_000);
    assert.equal(r2.sisaHariIni, -50_000);

    // Rounding down also applies to negative numbers.
    const odd = makeData({ expenses: [expense('2026-11-01', 2_500_001)] });
    assert.equal(dailyBudget(odd, '2026-11-20').amanHariIni, -20_001);
  });

  test('zero income', () => {
    const none = dailyBudget(makeData({ income: 0 }), '2026-11-10');
    assert.equal(none.spendablePool, 0);
    assert.equal(none.amanHariIni, 0);
    assert.equal(none.sisaHariIni, 0);

    const spentToday = dailyBudget(makeData({ income: 0, expenses: [expense('2026-11-10', 5_000)] }), '2026-11-10');
    assert.equal(spentToday.sisaHariIni, -5_000);

    const spentBefore = dailyBudget(makeData({ income: 0, expenses: [expense('2026-11-09', 30_000)] }), '2026-11-10');
    assert.equal(spentBefore.amanHariIni, -2_000); // -30.000 / 15 days
  });

  test('bucket percents that do not total 100 are reported, and used as given', () => {
    const over = [
      { id: 'kebutuhan', name: 'Kebutuhan', percent: 60, spendable: true },
      { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
      { id: 'tabungan', name: 'Tabungan', percent: 15, spendable: false },
      { id: 'cadangan', name: 'Cadangan', percent: 5, spendable: false },
    ];
    assert.equal(percentTotal(over), 110);
    const result = dailyBudget(makeData({ buckets: over, incomeDay: 1 }), '2026-11-01');
    assert.equal(result.percentTotal, 110);
    assert.equal(result.spendableAllocation, 2_700_000); // 90% of 3.000.000
    assert.equal(result.amanHariIni, 90_000);

    const under = DEFAULT_BUCKETS.map((b) => (b.id === 'keinginan' ? { ...b, percent: 20 } : b));
    assert.equal(percentTotal(under), 90);
    assert.equal(dailyBudget(makeData({ buckets: under }), '2026-11-10').percentTotal, 90);
  });

  test('no spendable buckets: daily number is 0, nothing crashes', () => {
    const buckets = DEFAULT_BUCKETS.map((b) => ({ ...b, spendable: false }));
    const result = dailyBudget(makeData({ buckets, expenses: [expense('2026-11-10', 10_000)] }), '2026-11-10');
    assert.equal(result.hasSpendableBucket, false);
    assert.equal(result.amanHariIni, 0);
    assert.equal(result.sisaHariIni, 0);
  });

  test('recurring bills are committed every period and reduce their bucket', () => {
    const data = makeData({
      recurring: [
        bill(1_000_000, 'kebutuhan'), // kos
        bill(55_000, 'keinginan'), // langganan
        bill(200_000, 'tabungan'), // investasi rutin (not spendable)
      ],
      expenses: [expense('2026-11-01', 100_000, 'kebutuhan')],
    });
    const result = dailyBudget(data, '2026-11-10');
    assert.equal(result.spendableRecurring, 1_055_000);
    assert.equal(result.spendablePool, 2_400_000 - 1_055_000 - 100_000);
    assert.equal(result.amanHariIni, Math.floor(1_245_000 / 15));
    const kebutuhan = result.buckets.find((b) => b.id === 'kebutuhan');
    assert.equal(kebutuhan.recurring, 1_000_000);
    assert.equal(kebutuhan.used, 1_100_000);
    assert.equal(kebutuhan.remaining, 400_000);
    const tabungan = result.buckets.find((b) => b.id === 'tabungan');
    assert.equal(tabungan.remaining, 250_000);
    // The same bills count again in the next period, without any expense being stored.
    assert.equal(dailyBudget(data, '2026-12-10').spendableRecurring, 1_055_000);
    assert.equal(data.expenses.length, 1);
  });

  test('recurring bills start and stop at the right period', () => {
    const period = getPeriod('2026-11-10', 25); // 2026-10-25 .. 2026-11-24
    const previous = previousPeriod(period, 25);
    const addedThisPeriod = bill(100, 'kebutuhan', { startDate: '2026-11-03' });
    assert.equal(isRecurringActiveInPeriod(addedThisPeriod, period), true);
    assert.equal(isRecurringActiveInPeriod(addedThisPeriod, previous), false);
    const stoppedThisPeriod = bill(100, 'kebutuhan', { startDate: '2026-01-01', endDate: '2026-11-03' });
    assert.equal(isRecurringActiveInPeriod(stoppedThisPeriod, period), false);
    assert.equal(isRecurringActiveInPeriod(stoppedThisPeriod, previous), true);
  });

  test('expenses in non-spendable buckets only reduce that bucket', () => {
    const without = dailyBudget(makeData(), '2026-11-10');
    const data = makeData({
      expenses: [expense('2026-11-10', 300_000, 'tabungan'), expense('2026-11-01', 20_000, 'cadangan')],
    });
    const result = dailyBudget(data, '2026-11-10');
    assert.equal(result.amanHariIni, without.amanHariIni);
    assert.equal(result.sisaHariIni, without.sisaHariIni);
    assert.equal(result.spentToday, 0);
    assert.equal(result.buckets.find((b) => b.id === 'tabungan').remaining, 450_000 - 300_000);
    assert.equal(result.buckets.find((b) => b.id === 'cadangan').remaining, 150_000 - 20_000);
  });

  test('planned expenses later in the period are treated as committed', () => {
    const data = makeData({ expenses: [expense('2026-11-20', 150_000)] });
    const result = dailyBudget(data, '2026-11-10');
    assert.equal(result.spendablePool, 2_250_000);
    assert.equal(result.spentToday, 0);
  });

  test('a special income for one period is used only in that period', () => {
    const data = makeData({ incomeOverrides: { '2026-10-25': 4_000_000 } });
    assert.equal(incomeForPeriod(data, '2026-10-25'), 4_000_000);
    assert.equal(incomeForPeriod(data, '2026-11-25'), 3_000_000);
    const result = dailyBudget(data, '2026-11-10');
    assert.equal(result.income, 4_000_000);
    assert.equal(result.incomeIsOverride, true);
    assert.equal(result.spendableAllocation, 3_200_000);
    assert.equal(dailyBudget(data, '2026-12-10').incomeIsOverride, false);
  });

  test('allocation rounds down to whole Rupiah', () => {
    assert.equal(bucketAllocation(1_000_001, 50), 500_000);
    assert.equal(bucketAllocation(999, 15), 149);
    const report = bucketReport(makeData({ income: 1_000_001 }), getPeriod('2026-11-10', 25));
    for (const b of report) assert.ok(Number.isInteger(b.allocation));
  });
});

/* ------------------------------ simulation ------------------------------ */

describe('simulation ("kalau beli ini")', () => {
  test('spendable purchase lowers today and tomorrow', () => {
    const data = makeData({ incomeDay: 1 }); // 2026-11-01: 80.000 per day for 30 days
    const sim = simulatePurchase(data, '2026-11-01', 50_000, 'keinginan');
    assert.equal(sim.affectsDaily, true);
    assert.equal(sim.before.sisaHariIni, 80_000);
    assert.equal(sim.after.sisaHariIni, 30_000);
    assert.equal(sim.before.amanHariIni, 80_000);
    assert.equal(sim.after.amanHariIni, 80_000); // today's allowance stays the same
    assert.equal(sim.before.amanBesok, Math.floor(2_400_000 / 29));
    assert.equal(sim.after.amanBesok, Math.floor(2_350_000 / 29));
    assert.equal(sim.before.bucketRemaining, 900_000);
    assert.equal(sim.after.bucketRemaining, 850_000);
    assert.equal(data.expenses.length, 0); // nothing saved
  });

  test('going negative is visible', () => {
    const sim = simulatePurchase(makeData({ incomeDay: 1 }), '2026-11-01', 100_000, 'kebutuhan');
    assert.equal(sim.after.sisaHariIni, -20_000);
  });

  test('non-spendable purchase does not change daily numbers', () => {
    const sim = simulatePurchase(makeData(), '2026-11-10', 100_000, 'tabungan');
    assert.equal(sim.affectsDaily, false);
    assert.equal(sim.after.sisaHariIni, sim.before.sisaHariIni);
    assert.equal(sim.after.bucketRemaining, sim.before.bucketRemaining - 100_000);
  });

  test('on the last day there is no "tomorrow" in this period', () => {
    const sim = simulatePurchase(makeData(), '2026-11-24', 10_000, 'kebutuhan');
    assert.equal(sim.hasTomorrow, false);
    assert.equal(sim.after.amanBesok, null);
  });
});

/* ------------------------------- summary ------------------------------- */

describe('period summary', () => {
  const data = makeData({
    expenses: [
      expense('2026-10-26', 100_000, 'kebutuhan', 'tunai'),
      expense('2026-11-02', 50_000, 'keinginan', 'gopay'),
      expense('2026-11-03', 25_000, 'tabungan', 'gopay'),
      expense('2026-11-30', 7_000, 'kebutuhan', 'tunai'), // next period
    ],
    recurring: [bill(500_000, 'kebutuhan', { walletId: 'gopay' })],
  });
  const period = getPeriod('2026-11-10', 25);

  test('totals, leftover and per wallet', () => {
    const summary = periodSummary(data, period);
    assert.equal(summary.income, 3_000_000);
    assert.equal(summary.expenseCount, 3);
    assert.equal(summary.recordedTotal, 175_000);
    assert.equal(summary.recurringTotal, 500_000);
    assert.equal(summary.totalSpent, 675_000);
    assert.equal(summary.leftover, 2_325_000);
    const gopay = summary.wallets.find((w) => w.id === 'gopay');
    assert.deepEqual([gopay.recorded, gopay.recurring, gopay.total, gopay.count], [75_000, 500_000, 575_000, 2]);
    const kebutuhan = summary.buckets.find((b) => b.id === 'kebutuhan');
    assert.equal(kebutuhan.used, 600_000);
  });

  test('"Pindahkan sisa ke Tabungan" only once, only after the period ends', () => {
    const summary = periodSummary(data, period);
    assert.equal(leftoverMoveStatus(summary, '2026-11-24'), 'not-ended');
    assert.equal(leftoverMoveStatus(summary, '2026-11-25'), 'ok');
    const moved = periodSummary({ ...data, savings: [{ id: 's1', periodStart: period.start, amount: 2_325_000, date: '2026-11-25' }] }, period);
    assert.equal(moved.savedAmount, 2_325_000);
    assert.equal(leftoverMoveStatus(moved, '2026-11-25'), 'done');
    const broke = periodSummary(makeData({ income: 0, expenses: [expense('2026-11-01', 1)] }), period);
    assert.equal(leftoverMoveStatus(broke, '2026-12-01'), 'no-leftover');
  });

  test('periods from before the app was used have nothing to move', () => {
    const empty = periodSummary(makeData(), period); // no expenses in this period
    assert.equal(leftoverMoveStatus(empty, '2026-12-01', '2026-12-01'), 'no-data'); // set up after it ended
    assert.equal(leftoverMoveStatus(empty, '2026-12-01', '2026-11-01'), 'ok'); // app was in use, nothing spent
    assert.equal(leftoverMoveStatus(periodSummary(data, period), '2026-12-01', '2026-12-01'), 'ok'); // has records
  });
});

/* ------------------------- settings changes ------------------------- */

describe('changing settings keeps history sensible', () => {
  test('changing the income day moves period-based records', () => {
    const data = makeData({
      incomeOverrides: { '2026-10-25': 4_000_000 },
      savings: [{ id: 's1', periodStart: '2026-09-25', amount: 100, date: '2026-10-25' }],
    });
    const { incomeOverrides, savings } = remapPeriodKeys(data, 1);
    assert.deepEqual(incomeOverrides, { '2026-10-01': 4_000_000 });
    assert.equal(savings[0].periodStart, '2026-09-01');
    assert.equal(data.savings[0].periodStart, '2026-09-25'); // input unchanged
  });

  test('changing the monthly amount freezes past periods that have expenses', () => {
    const data = makeData({
      expenses: [expense('2026-09-30', 1_000), expense('2026-10-30', 1_000)],
      incomeOverrides: { '2026-08-25': 123 },
    });
    const result = freezePastIncome(data, '2026-11-10', 3_000_000);
    assert.deepEqual(result, { '2026-08-25': 123, '2026-09-25': 3_000_000 });
  });
});
