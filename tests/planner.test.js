// Unit tests for js/planner.js ("Rencana Cukup"). Run with:  npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distribute,
  planDates,
  planEndDate,
  nextDueDate,
  planBase,
  planReport,
  reverseCalc,
  planPurchase,
  savingTips,
  wantBucketIds,
  checkPlan,
  planSummary,
  isWeekend,
} from '../js/planner.js';

// 2026-11-02 is a Monday. The default test plan runs Mon 2 Nov – Wed 11 Nov (10 days).
function makePlan(overrides = {}) {
  return {
    id: 'p1',
    startDate: '2026-11-02',
    endDate: '2026-11-11',
    endMode: 'custom',
    money: 1_000_000,
    obligations: [],
    emergency: 0,
    minDaily: 0,
    pattern: 'even',
    weekendWeight: 150,
    baselineIds: [],
    createdOn: '2026-11-02',
    ...overrides,
  };
}

let nextId = 1;
const spend = (date, amount, bucketId = 'kebutuhan', note = '') => ({ id: `e${nextId++}`, date, amount, bucketId, walletId: 'tunai', note, createdAt: 0 });
const obligation = (name, amount, date, extra = {}) => ({ id: `o${nextId++}`, name, amount, date, paid: false, fromRecurringId: null, ...extra });
const total = (list) => list.reduce((s, x) => s + x, 0);

describe('splitting money over days', () => {
  test('rounding: parts are whole Rupiah and always add up exactly', () => {
    assert.deepEqual(distribute(1_000_001, Array(7).fill(100)), [142_858, 142_858, 142_857, 142_857, 142_857, 142_857, 142_857]);
    assert.deepEqual(distribute(1000, [100, 150, 100]), [286, 429, 285]);
    assert.deepEqual(distribute(-10, [100, 100, 100]), [-3, -3, -4]);
    assert.deepEqual(distribute(0, [100, 100]), [0, 0]);
    for (const amount of [1, 7, 99_999, 1_234_567, 1_000_000_000]) {
      const weights = [100, 175, 175, 100, 100, 100, 100, 175, 175, 100, 100];
      assert.equal(total(distribute(amount, weights)), amount);
    }
  });

  test('the whole plan adds up exactly to the spendable money', () => {
    const plan = makePlan({ money: 1_234_567, pattern: 'weekend', weekendWeight: 175 });
    const report = planReport(plan, [], '2026-11-02');
    assert.equal(total(report.days.map((d) => d.planned)), 1_234_567);
  });
});

describe('patterns', () => {
  test('even pattern: same amount every day', () => {
    const report = planReport(makePlan(), [], '2026-11-02');
    assert.equal(report.totalDays, 10);
    assert.equal(report.daysLeft, 10);
    assert.equal(report.spendable, 1_000_000);
    assert.equal(report.allowanceToday, 100_000);
    assert.equal(report.sisaHariIni, 100_000);
    assert.equal(report.perWeek, 700_000);
    assert.ok(report.days.every((d) => d.planned === 100_000));
    assert.equal(report.days[0].state, 'today');
    assert.equal(report.days[1].state, 'future');
    assert.equal(report.status, 'aman');
  });

  test('weekend pattern: Saturday and Sunday get more', () => {
    assert.equal(isWeekend('2026-11-07'), true);
    assert.equal(isWeekend('2026-11-06'), false);
    const plan = makePlan({ endDate: '2026-11-08', money: 800_000, pattern: 'weekend', weekendWeight: 150 });
    const report = planReport(plan, [], '2026-11-02');
    assert.deepEqual(report.days.map((d) => d.planned), [100_000, 100_000, 100_000, 100_000, 100_000, 150_000, 150_000]);
    assert.equal(report.perWeekday, 100_000);
    assert.equal(report.perWeekendDay, 150_000);
    assert.equal(report.perWeek, 800_000);
    // The weight is adjustable: 2× for the weekend.
    const double = planReport({ ...plan, money: 900_000, weekendWeight: 200 }, [], '2026-11-02');
    assert.equal(double.perWeekday, 100_000);
    assert.equal(double.perWeekendDay, 200_000);
  });
});

describe('dates', () => {
  test('1-day plan and a plan that ends today', () => {
    const oneDay = planReport(makePlan({ startDate: '2026-11-05', endDate: '2026-11-05', money: 50_000 }), [], '2026-11-05');
    assert.equal(oneDay.totalDays, 1);
    assert.equal(oneDay.daysLeft, 1);
    assert.equal(oneDay.allowanceToday, 50_000);
    assert.equal(planEndDate('custom', '2026-11-05', 25, '2026-11-05'), '2026-11-05');
    assert.equal(checkPlan(makePlan({ startDate: '2026-11-05', endDate: '2026-11-05' })), null);

    const lastDay = planReport(makePlan(), [], '2026-11-11'); // end date = today
    assert.equal(lastDay.daysLeft, 1);
    assert.equal(lastDay.allowanceToday, 1_000_000);
  });

  test('an end date before the start is rejected', () => {
    const problem = checkPlan(makePlan({ endDate: '2026-11-01' }));
    assert.equal(problem.field, 'endDate');
    assert.match(problem.message, /tidak boleh sebelum/);
    assert.equal(checkPlan(makePlan({ endDate: '2027-12-31' })).field, 'endDate'); // longer than a year
  });

  test('"Sampai kapan?" choices', () => {
    assert.equal(planEndDate('month', '2026-11-02', 25), '2026-11-30');
    assert.equal(planEndDate('income', '2026-11-02', 25), '2026-11-24'); // day before the next income day
    assert.equal(planEndDate('income', '2026-11-25', 25), '2026-12-24');
    assert.equal(planEndDate('custom', '2026-11-02', 25, '2026-11-15'), '2026-11-15');
  });

  test('leap-year February', () => {
    assert.deepEqual(planDates('2028-02-27', '2028-03-01'), ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
    assert.equal(planDates('2027-02-27', '2027-03-01').length, 3);
    assert.equal(planEndDate('month', '2028-02-10', 1), '2028-02-29');
    assert.equal(planEndDate('month', '2027-02-10', 1), '2027-02-28');
    const report = planReport(makePlan({ startDate: '2028-02-27', endDate: '2028-03-01', money: 400_000 }), [], '2028-02-27');
    assert.deepEqual(report.days.map((d) => d.planned), [100_000, 100_000, 100_000, 100_000]);
  });

  test('next due date of a recurring bill', () => {
    assert.equal(nextDueDate('2026-11-10', 15), '2026-11-15');
    assert.equal(nextDueDate('2026-11-10', 5), '2026-12-05');
    assert.equal(nextDueDate('2026-11-10', 10), '2026-11-10');
    assert.equal(nextDueDate('2026-02-01', 31), '2026-02-28');
    assert.equal(nextDueDate('2026-12-20', 5), '2027-01-05');
  });
});

describe('money that is not enough', () => {
  test('money = 0', () => {
    const report = planReport(makePlan({ money: 0 }), [], '2026-11-02');
    assert.equal(report.spendable, 0);
    assert.equal(report.allowanceToday, 0);
    assert.ok(report.days.every((d) => d.planned === 0));
    assert.equal(report.status, 'tidak-cukup');
  });

  test('obligations larger than the money: shortfall', () => {
    const plan = makePlan({ money: 500_000, obligations: [obligation('Kos', 800_000, '2026-11-05')] });
    const report = planReport(plan, [], '2026-11-02');
    assert.equal(report.obligationsTotal, 800_000);
    assert.equal(report.spendable, -300_000);
    assert.equal(report.status, 'tidak-cukup');
    assert.equal(report.reason, 'kewajiban');
    assert.equal(report.shortfall, 300_000);
    assert.equal(planReport({ ...plan, minDaily: 20_000 }, [], '2026-11-02').shortfall, 500_000); // + 10 days × 20.000
  });

  test('obligations after the end date are ignored; overdue ones count', () => {
    const plan = makePlan({ obligations: [obligation('Iuran', 100_000, '2026-11-20'), obligation('Pulsa', 50_000, '2026-10-30')] });
    const base = planBase(plan);
    assert.equal(base.obligationsTotal, 50_000);
    assert.equal(base.ignoredObligations.length, 1);
    assert.equal(base.spendable, 950_000);
  });

  test('dana darurat larger than the money', () => {
    const report = planReport(makePlan({ money: 100_000, emergency: 150_000 }), [], '2026-11-02');
    assert.equal(report.spendable, -50_000);
    assert.equal(report.status, 'tidak-cukup');
    assert.equal(report.reason, 'kewajiban');
  });

  test('minimum daily spending: how many days it covers and when it runs out', () => {
    const report = planReport(makePlan({ money: 300_000, minDaily: 50_000 }), [], '2026-11-02');
    assert.equal(report.status, 'tidak-cukup');
    assert.equal(report.reason, 'minimum');
    assert.equal(report.coverDays, 6);
    assert.equal(report.lastCoveredDay, '2026-11-07');
    assert.equal(report.runsOutOn, '2026-11-08');
    assert.equal(report.shortfall, 200_000);
    assert.equal(planReport(makePlan({ money: 550_000, minDaily: 50_000 }), [], '2026-11-02').status, 'waspada');
    assert.equal(planReport(makePlan({ money: 700_000, minDaily: 50_000 }), [], '2026-11-02').status, 'aman');
  });
});

describe('adaptive recalculation every day', () => {
  test('overspending yesterday lowers today; underspending raises it', () => {
    const over = planReport(makePlan(), [spend('2026-11-02', 150_000)], '2026-11-03');
    assert.equal(over.daysLeft, 9);
    assert.equal(over.poolToday, 850_000);
    assert.equal(over.allowanceToday, 94_445); // 850.000 / 9, leftover Rupiah go to the first days
    assert.equal(over.days[0].planned, 100_000);
    assert.equal(over.days[0].spent, 150_000);
    assert.equal(over.days[0].state, 'past');

    const under = planReport(makePlan(), [spend('2026-11-02', 50_000)], '2026-11-03');
    assert.equal(under.allowanceToday, 105_556); // 950.000 / 9
  });

  test("today's spending lowers what is left today, not today's allowance", () => {
    const report = planReport(makePlan(), [spend('2026-11-02', 30_000)], '2026-11-02');
    assert.equal(report.allowanceToday, 100_000);
    assert.equal(report.sisaHariIni, 70_000);
    assert.equal(report.remaining, 970_000);
  });

  test('a big drop in the daily amount gives a warning', () => {
    const report = planReport(makePlan(), [spend('2026-11-02', 400_000)], '2026-11-03');
    assert.equal(report.status, 'waspada');
    assert.equal(report.reason, 'turun');
  });

  test('which expenses count', () => {
    const plan = makePlan({ baselineIds: ['already'] });
    const expenses = [
      { ...spend('2026-11-02', 40_000), id: 'already' }, // logged before the plan was made
      spend('2026-11-01', 10_000), // before the plan
      spend('2026-11-12', 10_000), // after the plan
      spend('2026-11-08', 100_000), // planned later in the plan: already committed
    ];
    const report = planReport(plan, expenses, '2026-11-02');
    assert.equal(report.spentTotal, 100_000);
    assert.equal(report.poolToday, 900_000);
    assert.equal(report.allowanceToday, 90_000);
  });

  test('before and after the plan', () => {
    const ended = planReport(makePlan(), [spend('2026-11-03', 200_000)], '2026-11-20');
    assert.equal(ended.phase, 'ended');
    assert.ok(ended.days.every((d) => d.state === 'past'));
    assert.equal(ended.remaining, 800_000);
    assert.equal(planReport(makePlan(), [], '2026-11-01').phase, 'upcoming');
  });
});

describe('what-if tools', () => {
  test('reverse calculator: "Kalau aku belanja Rp X per hari…"', () => {
    const report = planReport(makePlan(), [], '2026-11-02');
    assert.deepEqual(reverseCalc(report, 120_000), { enough: false, days: 8, lastDay: '2026-11-09', runsOutOn: '2026-11-10', shortfall: 200_000 });
    assert.deepEqual(reverseCalc(report, 80_000), { enough: true, days: 10, leftover: 200_000, until: '2026-11-11' });
    assert.equal(reverseCalc(report, 0), null);
    const broke = planReport(makePlan({ money: 0 }), [], '2026-11-02');
    assert.equal(reverseCalc(broke, 10_000).days, 0);
  });

  test('"kalau beli ini": today and the daily amount from tomorrow, before vs after', () => {
    const big = planPurchase(makePlan(), [], '2026-11-02', 200_000);
    assert.deepEqual(big.before, { sisaHariIni: 100_000, perDayFromTomorrow: 100_000, status: 'aman' });
    assert.deepEqual(big.after, { sisaHariIni: -100_000, perDayFromTomorrow: 88_888, status: 'waspada' });
    const small = planPurchase(makePlan(), [], '2026-11-02', 50_000);
    assert.equal(small.after.sisaHariIni, 50_000);
    assert.equal(small.after.perDayFromTomorrow, 100_000); // fits in today's allowance: tomorrow unchanged
    const lastDay = planPurchase(makePlan(), [], '2026-11-11', 10_000);
    assert.equal(lastDay.hasTomorrow, false);
    assert.equal(lastDay.after.perDayFromTomorrow, null);
  });
});

describe('saving tips', () => {
  const buckets = [
    { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
    { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
    { id: 'tabungan', name: 'Tabungan', percent: 20, spendable: false },
  ];

  test('"wants" buckets are found by name, or fall back to the other spendable buckets', () => {
    assert.deepEqual([...wantBucketIds(buckets)], ['keinginan']);
    const renamed = buckets.map((b) => (b.id === 'keinginan' ? { ...b, name: 'Lain-lain' } : b));
    assert.deepEqual([...wantBucketIds(renamed)], ['keinginan']);
  });

  test('tips use my own data', () => {
    const data = {
      settings: { incomeDay: 25, setupDate: '2026-10-01' },
      buckets,
      expenses: [
        spend('2026-11-01', 30_000, 'keinginan', 'Kopi'),
        spend('2026-11-02', 30_000, 'keinginan', 'kopi'),
        spend('2026-11-03', 30_000, 'keinginan', 'Kopi '),
        spend('2026-11-03', 60_000, 'keinginan', 'Nonton'),
        spend('2026-11-03', 500_000, 'kebutuhan', 'Belanja bulanan'),
      ],
    };
    const plan = makePlan({ money: 300_000, minDaily: 50_000, obligations: [obligation('Kos', 100_000, '2026-11-05'), obligation('Pulsa', 50_000, '2026-11-06', { paid: true })] });
    const report = planReport(plan, data.expenses, '2026-11-04');
    const tips = savingTips(report, data, '2026-11-04');
    assert.equal(report.status, 'tidak-cukup');
    assert.equal(tips.maxPerDay, 0); // already overspent: nothing left per day (never negative)
    assert.equal(tips.typicalPerDay, Math.round(650_000 / 7)); // last 7 days, needs + wants
    assert.ok(tips.typicalPerDay > tips.maxPerDay);
    assert.equal(tips.cutPerDay, tips.typicalPerDay - tips.maxPerDay);
    assert.deepEqual(tips.obligations.map((o) => o.name), ['Kos']); // paid ones are not suggested
    assert.equal(tips.obligations[0].perDayGain, Math.floor(100_000 / report.daysLeft));
    assert.equal(tips.habits[0].label, 'Kopi');
    assert.equal(tips.habits[0].total, 90_000);
    assert.equal(tips.habits[0].count, 3);
    assert.equal(tips.habits.length, 2); // Kebutuhan spending is not a "want"
  });
});

describe('checking and ending a plan', () => {
  test('valid and invalid plans', () => {
    assert.equal(checkPlan(makePlan()), null);
    assert.equal(checkPlan(makePlan({ money: -1 })).field, 'money');
    assert.equal(checkPlan(makePlan({ obligations: [obligation('', 1000, '2026-11-03')] })).field, 'obligations');
    assert.equal(checkPlan(makePlan({ obligations: [obligation('Kos', 0, '2026-11-03')] })).field, 'obligations');
    assert.equal(checkPlan(makePlan({ emergency: 1.5 })).field, 'emergency');
    assert.equal(checkPlan(makePlan({ weekendWeight: 130 })).field, 'pattern');
    assert.equal(checkPlan(makePlan({ pattern: 'random' })).field, 'pattern');
  });

  test('summary when a plan ends (early or on time)', () => {
    const expenses = [spend('2026-11-02', 100_000), spend('2026-11-06', 50_000)];
    const early = planSummary(makePlan(), expenses, '2026-11-04');
    assert.equal(early.endedEarly, true);
    assert.equal(early.spent, 100_000);
    assert.equal(early.leftover, 900_000);
    const onTime = planSummary(makePlan({ obligations: [obligation('Kos', 1_000_000, '2026-11-03')] }), expenses, '2026-11-12');
    assert.equal(onTime.endedEarly, false);
    assert.equal(onTime.spent, 150_000);
    assert.equal(onTime.spendable, 0);
    assert.equal(onTime.leftover, -150_000);
  });
});
