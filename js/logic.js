// -----------------------------------------------------------------------------
// logic.js — all the money and date math for "Uang Bulanan".
//
// Rules for this file (please keep them when changing it):
//   * No DOM, no localStorage, no clock. Everything a function needs comes in
//     as arguments, so the same input always gives the same output. That makes
//     the math easy to test: see tests/logic.test.js (run with `npm test`).
//   * Money is always a whole number of Rupiah (no decimals).
//   * Dates are always plain 'YYYY-MM-DD' text: a calendar day in Indonesia
//     (Asia/Jakarta). We never use timestamps or time zones here, so a date can
//     never "shift" by one day.
//
// The "data" object used below looks like this (see data.js for details):
//   {
//     settings: { monthlyIncome, incomeDay },
//     buckets:  [{ id, name, percent, spendable }],       // "pos" anggaran
//     wallets:  [{ id, name }],                           // "dompet"
//     expenses: [{ id, amount, bucketId, walletId, date, note }],
//     recurring:[{ id, name, amount, bucketId, walletId, startDate, endDate }],
//     incomeOverrides: { 'YYYY-MM-DD' (period start): amount },
//     savings:  [{ id, periodStart, amount, date }],      // "Pindahkan sisa ke Tabungan"
//   }
// -----------------------------------------------------------------------------

/* ============================== Calendar ============================== */

/** True if `year` is a leap year (February has 29 days). */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in a month. `month` is 1 (January) to 12 (December). */
export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Build a 'YYYY-MM-DD' text from numbers, e.g. (2026, 3, 7) -> '2026-03-07'. */
export function toDateStr(year, month, day) {
  const pad = (n, size) => String(n).padStart(size, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Split 'YYYY-MM-DD' into numbers. Returns null if it is not a real date. */
export function parseDateStr(text) {
  const match = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** True if `text` is a real date like '2026-02-28' (but not '2026-02-30'). */
export function isValidDateStr(text) {
  return parseDateStr(text) !== null;
}

function mustParse(text) {
  const parts = parseDateStr(text);
  if (!parts) throw new Error(`Invalid date: ${text}`);
  return parts;
}

/**
 * Turn a date into a plain day count, so two dates can be subtracted.
 * It counts the days since a fixed starting point; only differences matter.
 */
export function dayNumber(dateStr) {
  const { year, month, day } = mustParse(dateStr);
  const y = year - 1; // whole years before this year
  let days = y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days + day;
}

/** Days from `fromDate` to `toDate`. Negative if `toDate` is earlier. */
export function daysBetween(fromDate, toDate) {
  return dayNumber(toDate) - dayNumber(fromDate);
}

/** Move a date forward (positive amount) or backward (negative amount) by whole days. */
export function addDays(dateStr, amount) {
  let { year, month, day } = mustParse(dateStr);
  day += amount;
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(year, month);
  }
  return toDateStr(year, month, day);
}

/** Day of the week: 0 = Minggu (Sunday), 1 = Senin (Monday), ... 6 = Sabtu (Saturday). */
export function weekday(dateStr) {
  // Day number 1 is 0001-01-01, which was a Monday, so "remainder of 7" gives the weekday.
  return dayNumber(dateStr) % 7;
}

/* =============================== Periods =============================== */
// A period runs from the income day of one month to the day before the income
// day of the next month. If a month is too short for the income day (e.g. 31 in
// April), that month's last day is used instead.

/** Make sure the income day is a whole number from 1 to 31. */
export function clampIncomeDay(incomeDay) {
  const n = Math.round(Number(incomeDay));
  if (!Number.isFinite(n)) return 1;
  return Math.min(31, Math.max(1, n));
}

/** The income date inside one month, e.g. (2026, 4, 31) -> '2026-04-30'. */
export function incomeDateInMonth(year, month, incomeDay) {
  const day = Math.min(clampIncomeDay(incomeDay), daysInMonth(year, month));
  return toDateStr(year, month, day);
}

/** Move a (year, month) pair by `delta` months, e.g. (2026, 12) + 1 -> (2027, 1). */
function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(index / 12);
  return { year: newYear, month: index - newYear * 12 + 1 };
}

/**
 * The budget period that contains `dateStr`.
 * Returns { start, end, nextStart, length }:
 *   start     – first day (the income day)
 *   end       – last day (the day before the next income day)
 *   nextStart – the next income day (first day of the next period)
 *   length    – number of days in the period
 */
export function getPeriod(dateStr, incomeDay) {
  const { year, month } = mustParse(dateStr);
  let startMonth = { year, month };
  if (dateStr < incomeDateInMonth(year, month, incomeDay)) {
    // This month's income day has not come yet, so the period started last month.
    startMonth = shiftMonth(year, month, -1);
  }
  const start = incomeDateInMonth(startMonth.year, startMonth.month, incomeDay);
  const following = shiftMonth(startMonth.year, startMonth.month, 1);
  const nextStart = incomeDateInMonth(following.year, following.month, incomeDay);
  return { start, end: addDays(nextStart, -1), nextStart, length: daysBetween(start, nextStart) };
}

/** The period just before `period`. */
export function previousPeriod(period, incomeDay) {
  return getPeriod(addDays(period.start, -1), incomeDay);
}

/** The period just after `period`. */
export function nextPeriod(period, incomeDay) {
  return getPeriod(period.nextStart, incomeDay);
}

/** True if `dateStr` falls inside `period` (start and end included). */
export function isInPeriod(dateStr, period) {
  return dateStr >= period.start && dateStr <= period.end;
}

/** Days from today up to the day before the next income day. Today counts. Never less than 1. */
export function daysLeftInPeriod(today, incomeDay) {
  return Math.max(1, daysBetween(today, getPeriod(today, incomeDay).nextStart));
}

/* ================================ Budget ================================ */

const sumAmounts = (items) => items.reduce((total, item) => total + item.amount, 0);

/** Sum of all bucket percents. Should be 100; the app shows a warning otherwise. */
export function percentTotal(buckets) {
  return buckets.reduce((total, bucket) => total + bucket.percent, 0);
}

/** How much money one bucket gets: income × percent, rounded down to whole Rupiah. */
export function bucketAllocation(income, percent) {
  return Math.floor((income * percent) / 100);
}

/** True if the user typed a special income amount for this period. */
export function hasIncomeOverride(data, periodStart) {
  const overrides = data.incomeOverrides || {};
  return Object.prototype.hasOwnProperty.call(overrides, periodStart) && Number.isInteger(overrides[periodStart]);
}

/** Income for a period: the special amount for that period if set, otherwise the normal monthly amount. */
export function incomeForPeriod(data, periodStart) {
  return hasIncomeOverride(data, periodStart) ? data.incomeOverrides[periodStart] : data.settings.monthlyIncome;
}

/**
 * Does a recurring bill count in this period?
 * - It counts from the period in which it was added (startDate) onwards.
 * - When it is deactivated (endDate set), it stops counting from the period
 *   that contains endDate. Older periods keep counting it, so history stays right.
 */
export function isRecurringActiveInPeriod(bill, period) {
  const started = !bill.startDate || bill.startDate <= period.end;
  const notStopped = !bill.endDate || bill.endDate > period.end;
  return started && notStopped;
}

/** All recurring bills that count in `period`. */
export function recurringForPeriod(recurring, period) {
  return recurring.filter((bill) => isRecurringActiveInPeriod(bill, period));
}

/** All expenses whose date falls inside `period`. */
export function expensesForPeriod(expenses, period) {
  return expenses.filter((expense) => isInPeriod(expense.date, period));
}

/**
 * Status of every bucket in a period:
 *   allocation – money this bucket gets (income × percent)
 *   recurring  – recurring bills in this bucket
 *   spent      – recorded expenses in this bucket (any day of the period)
 *   used       – recurring + spent
 *   remaining  – allocation − used (negative means over budget)
 */
export function bucketReport(data, period) {
  const income = incomeForPeriod(data, period.start);
  const bills = recurringForPeriod(data.recurring, period);
  const expenses = expensesForPeriod(data.expenses, period);
  return data.buckets.map((bucket) => {
    const allocation = bucketAllocation(income, bucket.percent);
    const recurring = sumAmounts(bills.filter((bill) => bill.bucketId === bucket.id));
    const spent = sumAmounts(expenses.filter((expense) => expense.bucketId === bucket.id));
    const used = recurring + spent;
    return {
      id: bucket.id,
      name: bucket.name,
      percent: bucket.percent,
      spendable: bucket.spendable,
      allocation,
      recurring,
      spent,
      used,
      remaining: allocation - used,
    };
  });
}

/**
 * The home screen numbers ("Aman dipakai hari ini").
 *
 *   spendablePool = money of all spendable buckets
 *                   − recurring bills in spendable buckets
 *                   − expenses in spendable buckets this period, EXCEPT today's
 *   daysLeft      = days from today through the day before the next income day (min. 1)
 *   amanHariIni   = spendablePool / daysLeft, rounded down    (today's allowance)
 *   sisaHariIni   = amanHariIni − today's spendable expenses  (the big number)
 *
 * Today's expenses are left out of the pool on purpose: that keeps today's
 * allowance fixed for the whole day, while the big number goes down as you spend.
 * Expenses dated later in this period (planned ones) are treated as already
 * committed, so they also reduce the pool.
 * Buckets that are not spendable (e.g. Tabungan) never change these numbers.
 */
export function dailyBudget(data, today) {
  const incomeDay = clampIncomeDay(data.settings.incomeDay);
  const period = getPeriod(today, incomeDay);
  const buckets = bucketReport(data, period);
  const spendable = buckets.filter((bucket) => bucket.spendable);
  const spendableIds = new Set(spendable.map((bucket) => bucket.id));

  let spentToday = 0;
  let spentOtherDays = 0;
  for (const expense of expensesForPeriod(data.expenses, period)) {
    if (!spendableIds.has(expense.bucketId)) continue;
    if (expense.date === today) spentToday += expense.amount;
    else spentOtherDays += expense.amount;
  }

  const spendableAllocation = spendable.reduce((total, bucket) => total + bucket.allocation, 0);
  const spendableRecurring = spendable.reduce((total, bucket) => total + bucket.recurring, 0);
  const spendablePool = spendableAllocation - spendableRecurring - spentOtherDays;
  const daysLeft = Math.max(1, daysBetween(today, period.nextStart));
  const amanHariIni = Math.floor(spendablePool / daysLeft);
  const sisaHariIni = amanHariIni - spentToday;

  return {
    today,
    period,
    daysLeft,
    income: incomeForPeriod(data, period.start),
    incomeIsOverride: hasIncomeOverride(data, period.start),
    spendableAllocation,
    spendableRecurring,
    spentOtherDays,
    spentToday,
    spendablePool,
    amanHariIni,
    sisaHariIni,
    remainingInPeriod: spendablePool - spentToday, // what is left for today and the rest of the period
    hasSpendableBucket: spendable.length > 0,
    buckets,
    percentTotal: percentTotal(data.buckets),
  };
}

/**
 * "Kalau beli ini": what would happen if `amount` were spent today in `bucketId`.
 * Saves nothing; it only calculates.
 * Returns before/after numbers for today, for tomorrow's allowance (if tomorrow
 * is still in this period) and for the chosen bucket.
 */
export function simulatePurchase(data, today, amount, bucketId) {
  const pretend = {
    ...data,
    expenses: [...data.expenses, { id: 'simulasi', amount, bucketId, walletId: '', date: today, note: '' }],
  };
  const before = dailyBudget(data, today);
  const after = dailyBudget(pretend, today);
  const tomorrow = addDays(today, 1);
  const hasTomorrow = tomorrow < before.period.nextStart;
  const bucketBefore = before.buckets.find((bucket) => bucket.id === bucketId) || null;
  const bucketAfter = after.buckets.find((bucket) => bucket.id === bucketId) || null;

  const snapshot = (result, source, bucket) => ({
    sisaHariIni: result.sisaHariIni,
    amanHariIni: result.amanHariIni,
    remainingInPeriod: result.remainingInPeriod,
    amanBesok: hasTomorrow ? dailyBudget(source, tomorrow).amanHariIni : null,
    bucketRemaining: bucket ? bucket.remaining : null,
  });

  return {
    amount,
    bucketId,
    affectsDaily: Boolean(bucketBefore && bucketBefore.spendable),
    hasTomorrow,
    before: snapshot(before, data, bucketBefore),
    after: snapshot(after, pretend, bucketAfter),
  };
}

/**
 * Everything the "Ringkasan" (summary) screen needs for one period.
 * leftover = income − (recorded expenses in all buckets + recurring bills).
 */
export function periodSummary(data, period) {
  const income = incomeForPeriod(data, period.start);
  const expenses = expensesForPeriod(data.expenses, period);
  const bills = recurringForPeriod(data.recurring, period);
  const recordedTotal = sumAmounts(expenses);
  const recurringTotal = sumAmounts(bills);
  const totalSpent = recordedTotal + recurringTotal;

  const wallets = data.wallets.map((wallet) => {
    const walletExpenses = expenses.filter((expense) => expense.walletId === wallet.id);
    const recorded = sumAmounts(walletExpenses);
    const recurring = sumAmounts(bills.filter((bill) => bill.walletId === wallet.id));
    return { id: wallet.id, name: wallet.name, recorded, recurring, total: recorded + recurring, count: walletExpenses.length };
  });

  const savings = (data.savings || []).filter((entry) => entry.periodStart === period.start);

  return {
    period,
    income,
    incomeIsOverride: hasIncomeOverride(data, period.start),
    expenseCount: expenses.length,
    recordedTotal,
    recurringTotal,
    totalSpent,
    leftover: income - totalSpent,
    buckets: bucketReport(data, period),
    wallets,
    savings,
    savedAmount: sumAmounts(savings),
  };
}

/**
 * Can "Pindahkan sisa ke Tabungan" be used for this period summary?
 * Returns 'ok', 'done' (already moved), 'not-ended' (period still running),
 * 'no-data' (period from before the app was used, with no records) or 'no-leftover'.
 * It is only allowed once per period, after the period has ended.
 */
export function leftoverMoveStatus(summary, today, setupDate = null) {
  if (summary.savings.length > 0) return 'done';
  if (today <= summary.period.end) return 'not-ended';
  if (summary.expenseCount === 0 && (!setupDate || summary.period.end < setupDate)) return 'no-data';
  if (summary.leftover <= 0) return 'no-leftover';
  return 'ok';
}

/**
 * When the income day changes, periods start on different dates. This moves
 * period-based records (special income amounts and savings entries) to the new
 * period that contains their old start date.
 * Returns { incomeOverrides, savings } (new objects; the input is not changed).
 */
export function remapPeriodKeys(data, newIncomeDay) {
  const incomeOverrides = {};
  for (const [start, amount] of Object.entries(data.incomeOverrides || {})) {
    if (isValidDateStr(start)) incomeOverrides[getPeriod(start, newIncomeDay).start] = amount;
  }
  const savings = (data.savings || []).map((entry) => ({
    ...entry,
    periodStart: getPeriod(entry.periodStart, newIncomeDay).start,
  }));
  return { incomeOverrides, savings };
}

/**
 * When the monthly amount changes, past periods that already have expenses keep
 * the old amount (saved as a special amount for those periods), so their
 * summaries don't change. Returns a new incomeOverrides object.
 */
export function freezePastIncome(data, today, oldIncome) {
  const incomeDay = clampIncomeDay(data.settings.incomeDay);
  const current = getPeriod(today, incomeDay);
  const result = { ...(data.incomeOverrides || {}) };
  for (const expense of data.expenses) {
    if (expense.date >= current.start) continue;
    const start = getPeriod(expense.date, incomeDay).start;
    if (!Object.prototype.hasOwnProperty.call(result, start)) result[start] = oldIncome;
  }
  return result;
}
