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
//     settings: { monthlyIncome, incomeSchedule: [{ id, day, amount }], calcMode },
//     buckets:  [{ id, name, percent, spendable }],       // "pos" anggaran
//     wallets:  [{ id, name }],                           // "dompet"
//     expenses: [{ id, amount, bucketId, walletId, date, note }],
//     recurring:[{ id, name, amount, bucketId, walletId, startDate, endDate, dueDay }],
//     incomeOverrides: { 'YYYY-MM-DD' (period start): { installments: [{ id, date, amount }] } },
//     incomeDelays:    { 'YYYY-MM-DD' (period start): { installmentId: 'YYYY-MM-DD' } },
//     savings:  [{ id, periodStart, amount, date }],      // "Pindahkan sisa ke Tabungan"
//   }
// Older data shapes are still understood (version 2 had one monthlyIncome on one
// incomeDay, and a plain amount per period in incomeOverrides), so the version 2
// tests in tests/logic.test.js keep running unchanged.
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

/* ============================ Income schedule ============================ */
// The money of a period can arrive in 1 to 8 installments ("uang masuk
// bertahap"), e.g. Rp 1.000.000 on the 1st, the 12th and the 22nd. The earliest
// installment day starts the period. An installment counts as received from
// its date on (the money arrives that morning). Each installment's money is
// split over the buckets by percent when it arrives.

const sumAmounts = (items) => items.reduce((total, item) => total + item.amount, 0);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** The two ways to calculate "aman hari ini" ("Cara hitung"). */
export const CALC_MODES = ['hati-hati', 'total'];

/** At most this many installments per month (and per period). */
export const MAX_INSTALLMENTS = 8;

/** 'hati-hati' (only money that has arrived; the default) or 'total' (the whole month, like version 2). */
export function calcMode(data) {
  const mode = data.settings && data.settings.calcMode;
  return CALC_MODES.includes(mode) ? mode : 'hati-hati';
}

/**
 * The monthly schedule: [{ id, day, amount }], sorted by day.
 * Older data has one amount on one day (monthlyIncome + incomeDay); that
 * becomes a schedule with a single installment.
 */
export function incomeSchedule(data) {
  const settings = data.settings || {};
  if (Array.isArray(settings.incomeSchedule) && settings.incomeSchedule.length) return [...settings.incomeSchedule].sort((a, b) => a.day - b.day);
  const amount = Number.isInteger(settings.monthlyIncome) ? settings.monthlyIncome : 0;
  return amount > 0 ? [{ id: 'i-1', day: clampIncomeDay(settings.incomeDay), amount }] : [];
}

/** The day of the month that starts every period: the earliest installment day. */
export function periodStartDay(data) {
  const schedule = incomeSchedule(data);
  if (schedule.length) return clampIncomeDay(schedule[0].day);
  return clampIncomeDay(data.settings && data.settings.incomeDay);
}

/** The budget period that contains `dateStr`, for this data. */
export function periodFor(data, dateStr) {
  return getPeriod(dateStr, periodStartDay(data));
}

/** The date of installment day `day` inside `period` (in its first month; short months use their last day). */
export function installmentDate(period, day) {
  const { year, month } = mustParse(period.start);
  return incomeDateInMonth(year, month, day);
}

/**
 * The special income of one period ("khusus periode ini") as installments
 * [{ id, date, amount }], or null if the period uses the normal schedule.
 * An empty list means: no income at all in that period.
 */
export function periodOverride(data, periodStart) {
  const overrides = data.incomeOverrides || {};
  if (!hasOwn(overrides, periodStart)) return null;
  const value = overrides[periodStart];
  if (Number.isInteger(value)) return value > 0 ? [{ id: 'khusus', date: periodStart, amount: value }] : []; // older data: one amount
  if (value && Array.isArray(value.installments)) return value.installments;
  return null;
}

/** True if the period has its own income instead of the normal schedule. */
export function hasIncomeOverride(data, periodStart) {
  return periodOverride(data, periodStart) !== null;
}

/** Income of a period: the sum of its installments. */
export function incomeForPeriod(data, periodStart) {
  return sumAmounts(periodOverride(data, periodStart) || incomeSchedule(data));
}

/**
 * The installments of `period`, sorted by the day the money (really) arrives:
 *   [{ id, plannedDate, date, amount, delayed }]
 * `date` is the planned date, or the later date it was moved to with
 * "Belum masuk, geser tanggal" (only a later date inside the same period counts).
 */
export function periodInstallments(data, period) {
  const override = periodOverride(data, period.start);
  const planned = override
    ? override.map((o) => ({ id: o.id, plannedDate: o.date, amount: o.amount }))
    : incomeSchedule(data).map((i) => ({ id: i.id, plannedDate: installmentDate(period, i.day), amount: i.amount }));
  const delays = (data.incomeDelays && data.incomeDelays[period.start]) || {};
  return planned
    .map((i) => {
      const to = hasOwn(delays, i.id) ? delays[i.id] : null;
      const delayed = isValidDateStr(to) && to > i.plannedDate && to <= period.end;
      return { ...i, date: delayed ? to : i.plannedDate, delayed };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.plannedDate.localeCompare(b.plannedDate));
}

/**
 * The money coming in during `period` (by default the one that contains `today`):
 *   installments – each with: received (true from its date on), daysUntil, and
 *                  state: 'masuk' (arrived), 'hari-ini', 'akan' (coming) or
 *                  'tertunda' (moved to a later date and not here yet)
 *   total, received, receivedCount
 *   next         – the first installment that has not arrived yet, or null
 *   horizonEnd   – the day before `next` arrives, or the period's last day
 *   arrivedToday – the installments that arrive today
 */
export function incomeStatus(data, today, period = periodFor(data, today)) {
  const installments = periodInstallments(data, period).map((i) => {
    let state = 'akan';
    if (i.date < today) state = 'masuk';
    else if (i.date === today) state = 'hari-ini';
    else if (i.delayed) state = 'tertunda';
    return { ...i, received: i.date <= today, state, daysUntil: daysBetween(today, i.date) };
  });
  const arrived = installments.filter((i) => i.received);
  const next = installments.find((i) => !i.received) || null;
  return {
    period,
    installments,
    total: sumAmounts(installments),
    received: sumAmounts(arrived),
    receivedCount: arrived.length,
    next,
    horizonEnd: next ? addDays(next.date, -1) : period.end,
    arrivedToday: installments.filter((i) => i.date === today),
  };
}

/** "Sampai uang masuk berikutnya": the day before the next installment after `fromDate`, or the end of its period. */
export function nextIncomeEnd(data, fromDate) {
  const period = periodFor(data, fromDate);
  const next = periodInstallments(data, period).find((i) => i.date > fromDate);
  return next ? addDays(next.date, -1) : period.end;
}

/* ================================ Budget ================================ */

/** Sum of all bucket percents. Should be 100; the app shows a warning otherwise. */
export function percentTotal(buckets) {
  return buckets.reduce((total, bucket) => total + bucket.percent, 0);
}

/** How much money one bucket gets: income × percent, rounded down to whole Rupiah. */
export function bucketAllocation(income, percent) {
  return Math.floor((income * percent) / 100);
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

/**
 * The date a recurring bill is due inside `period` ("tanggal jatuh tempo").
 * Without a due day it is due on the period's first day (that is how version 2
 * counted every bill). Short months use their last day; the date always stays
 * inside the period, so a bill is due exactly once per period.
 */
export function billDueDate(bill, period) {
  const day = bill.dueDay;
  if (!Number.isInteger(day) || day < 1 || day > 31) return period.start;
  const { year, month } = mustParse(period.start);
  const inFirstMonth = incomeDateInMonth(year, month, day);
  if (inFirstMonth >= period.start) return inFirstMonth;
  const following = shiftMonth(year, month, 1);
  const inSecondMonth = incomeDateInMonth(following.year, following.month, day);
  return inSecondMonth <= period.end ? inSecondMonth : period.end;
}

/** All expenses whose date falls inside `period`. */
export function expensesForPeriod(expenses, period) {
  return expenses.filter((expense) => isInPeriod(expense.date, period));
}

/**
 * "Uang di tangan" at the end of `date` (for today: so far):
 *   installments that have arrived − expenses so far − recurring bills already due.
 * Expenses planned for later dates are not taken off yet. Can be negative.
 */
export function cashOnHand(data, date, period = periodFor(data, date)) {
  const received = sumAmounts(periodInstallments(data, period).filter((i) => i.date <= date));
  const spent = sumAmounts(data.expenses.filter((e) => e.date >= period.start && e.date <= date));
  const due = sumAmounts(recurringForPeriod(data.recurring, period).filter((bill) => billDueDate(bill, period) <= date));
  return received - spent - due;
}

/**
 * Status of every bucket in a period:
 *   allocation    – money this bucket gets from the whole period's income (income × percent)
 *   allocationNow – the same, from only the money that has arrived (`receivedIncome`;
 *                   equals allocation when receivedIncome is not given)
 *   recurring     – recurring bills in this bucket
 *   spent         – recorded expenses in this bucket (any day of the period)
 *   used          – recurring + spent
 *   remaining     – allocation − used (negative means over budget)
 *   remainingNow  – allocationNow − used
 */
export function bucketReport(data, period, receivedIncome = null) {
  const income = incomeForPeriod(data, period.start);
  const arrived = receivedIncome === null ? income : receivedIncome;
  const bills = recurringForPeriod(data.recurring, period);
  const expenses = expensesForPeriod(data.expenses, period);
  return data.buckets.map((bucket) => {
    const allocation = bucketAllocation(income, bucket.percent);
    const allocationNow = bucketAllocation(arrived, bucket.percent);
    const recurring = sumAmounts(bills.filter((bill) => bill.bucketId === bucket.id));
    const spent = sumAmounts(expenses.filter((expense) => expense.bucketId === bucket.id));
    const used = recurring + spent;
    return {
      id: bucket.id,
      name: bucket.name,
      percent: bucket.percent,
      spendable: bucket.spendable,
      allocation,
      allocationNow,
      recurring,
      spent,
      used,
      remaining: allocation - used,
      remainingNow: allocationNow - used,
    };
  });
}

/**
 * The home screen numbers ("Aman dipakai hari ini"), in one of two ways ("Cara hitung"):
 *
 * 'hati-hati' (the default) — only money that has already arrived:
 *   horizonEnd    = the day before the next installment that has not arrived yet,
 *                   or the period's last day if there is none
 *   spendablePool = arrived money × the spendable buckets' percents
 *                   − recurring bills in spendable buckets that are due by horizonEnd
 *                   − spendable expenses this period up to horizonEnd, EXCEPT today's
 *   The pool adds up, so unspent money carries over to the next installment, and
 *   the daily number jumps up on the day new money arrives.
 *
 * 'total' — the whole period's money spread to the period's last day (version 2):
 *   horizonEnd    = the period's last day
 *   spendablePool = the period's income × the spendable percents
 *                   − all recurring bills in spendable buckets
 *                   − spendable expenses this period, EXCEPT today's
 *   Because that money may not all be here yet, `shortfall` is set when the
 *   money planned until the next installment is more than the money in hand.
 *
 * Both ways:
 *   daysLeft      = days from today through horizonEnd (today counts, min. 1)
 *   amanHariIni   = spendablePool / daysLeft, rounded down    (today's allowance)
 *   sisaHariIni   = amanHariIni − today's spendable expenses  (the big number)
 * With one installment on the period's first day, both ways give exactly the
 * numbers of version 2.
 *
 * Today's expenses are left out of the pool on purpose: that keeps today's
 * allowance fixed for the whole day, while the big number goes down as you spend.
 * Expenses dated later (planned ones) are treated as already committed when they
 * fall inside the horizon, so they also reduce the pool.
 * Buckets that are not spendable (e.g. Tabungan) never change these numbers.
 */
export function dailyBudget(data, today) {
  const period = periodFor(data, today);
  const mode = calcMode(data);
  const careful = mode === 'hati-hati';
  const income = incomeStatus(data, today, period);
  const horizonEnd = careful ? income.horizonEnd : period.end;
  const buckets = bucketReport(data, period, careful ? income.received : null);
  const spendable = buckets.filter((bucket) => bucket.spendable);
  const spendableIds = new Set(spendable.map((bucket) => bucket.id));

  let spentToday = 0;
  let spentOtherDays = 0;
  for (const expense of expensesForPeriod(data.expenses, period)) {
    if (!spendableIds.has(expense.bucketId)) continue;
    if (expense.date === today) spentToday += expense.amount;
    else if (expense.date <= horizonEnd) spentOtherDays += expense.amount;
    // Planned after horizonEnd ('hati-hati' only): counted once the next installment has arrived.
  }

  const bills = recurringForPeriod(data.recurring, period).filter((bill) => spendableIds.has(bill.bucketId));
  const dueBills = careful ? bills.filter((bill) => billDueDate(bill, period) <= horizonEnd) : bills;
  const spendableAllocation = spendable.reduce((total, bucket) => total + bucket.allocationNow, 0);
  const spendableRecurring = sumAmounts(dueBills);
  const spendablePool = spendableAllocation - spendableRecurring - spentOtherDays;
  const daysLeft = Math.max(1, daysBetween(today, horizonEnd) + 1);
  const amanHariIni = Math.floor(spendablePool / daysLeft);
  const sisaHariIni = amanHariIni - spentToday;
  const cash = cashOnHand(data, today, period);

  // 'total' only: is the money planned until the next installment more than the money in hand?
  let shortfall = null;
  if (!careful && income.next) {
    const until = income.horizonEnd;
    const days = daysBetween(today, until) + 1;
    const laterBills = sumAmounts(
      recurringForPeriod(data.recurring, period).filter((bill) => {
        const due = billDueDate(bill, period);
        return due > today && due <= until;
      }),
    );
    const planned = sumAmounts(data.expenses.filter((e) => e.date > today && e.date <= until));
    const need = Math.max(0, sisaHariIni) + Math.max(0, amanHariIni) * (days - 1) + laterBills + planned;
    if (need > cash) shortfall = { need, have: cash, until };
  }

  return {
    today,
    period,
    mode,
    horizonEnd,
    daysLeft,
    income: income.total,
    incomeIsOverride: hasIncomeOverride(data, period.start),
    incomeStatus: income,
    spendableAllocation,
    spendableRecurring,
    spentOtherDays,
    spentToday,
    spendablePool,
    amanHariIni,
    sisaHariIni,
    remainingInPeriod: spendablePool - spentToday, // what is left for today and the rest of the horizon
    cashOnHand: cash,
    shortfall,
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
    bucketRemaining: bucket ? bucket.remainingNow : null,
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
 * Day-by-day money in hand for the chart ("ARUS KAS"), for the period that contains `today`.
 * Returns { period, todayIndex, days: [{ date, start, end, arrived, due, projected }] }:
 *   start – money at the start of the day (after money arrives and bills fall due)
 *   end   – money at the end of the day
 * Days before today use what really happened. Today and later are a projection:
 * every day you spend exactly the daily allowance the app would show that day
 * (or what is already recorded, if that is more).
 */
export function cashFlow(data, today) {
  const period = periodFor(data, today);
  const spendBucket = data.buckets.find((bucket) => bucket.spendable);
  const installments = periodInstallments(data, period);
  const bills = recurringForPeriod(data.recurring, period);
  let pretend = data;
  let previousEnd = 0;
  const days = [];
  for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
    if (date >= today && spendBucket) {
      const extra = Math.max(0, dailyBudget(pretend, date).sisaHariIni);
      if (extra > 0) {
        const planned = { id: `proyeksi-${date}`, amount: extra, bucketId: spendBucket.id, walletId: '', date, note: '' };
        pretend = { ...pretend, expenses: [...pretend.expenses, planned] };
      }
    }
    const arrived = sumAmounts(installments.filter((i) => i.date === date));
    const due = sumAmounts(bills.filter((bill) => billDueDate(bill, period) === date));
    const end = cashOnHand(pretend, date, period);
    days.push({ date, start: previousEnd + arrived - due, end, arrived, due, projected: date >= today });
    previousEnd = end;
  }
  return { period, todayIndex: daysBetween(period.start, today), days };
}

/**
 * Everything the "Ringkasan" (summary) screen needs for one period.
 * leftover = income − (recorded expenses in all buckets + recurring bills).
 * With `today`, the installments also say which ones have arrived (received).
 */
export function periodSummary(data, period, today = null) {
  const income = incomeForPeriod(data, period.start);
  const expenses = expensesForPeriod(data.expenses, period);
  const bills = recurringForPeriod(data.recurring, period);
  const recordedTotal = sumAmounts(expenses);
  const recurringTotal = sumAmounts(bills);
  const totalSpent = recordedTotal + recurringTotal;
  const status = today ? incomeStatus(data, today, period) : null;

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
    installments: status ? status.installments : periodInstallments(data, period),
    received: status ? status.received : income,
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

/** Keep a date inside a period (move it to the first or last day if it is outside). */
function clampToPeriod(dateStr, period) {
  if (dateStr < period.start) return period.start;
  return dateStr > period.end ? period.end : dateStr;
}

/**
 * When the start day of the periods changes, periods start on different dates.
 * This moves period-based records (special incomes, moved installments and
 * savings entries) to the new period that contains their old start date.
 * Dates of special installments are kept inside their new period.
 * Returns { incomeOverrides, incomeDelays, savings } (new objects; the input is not changed).
 */
export function remapPeriodKeys(data, newIncomeDay) {
  const incomeOverrides = {};
  for (const [start, value] of Object.entries(data.incomeOverrides || {})) {
    if (!isValidDateStr(start)) continue;
    const period = getPeriod(start, newIncomeDay);
    incomeOverrides[period.start] =
      value && Array.isArray(value.installments)
        ? { installments: value.installments.map((i) => ({ ...i, date: clampToPeriod(i.date, period) })) }
        : value;
  }
  const incomeDelays = {};
  for (const [start, delays] of Object.entries(data.incomeDelays || {})) {
    if (!isValidDateStr(start) || !delays) continue;
    const period = getPeriod(start, newIncomeDay);
    const kept = Object.entries(delays).filter(([, to]) => isValidDateStr(to) && isInPeriod(to, period));
    if (kept.length) incomeDelays[period.start] = Object.fromEntries(kept);
  }
  const savings = (data.savings || []).map((entry) => ({
    ...entry,
    periodStart: getPeriod(entry.periodStart, newIncomeDay).start,
  }));
  return { incomeOverrides, incomeDelays, savings };
}

/**
 * When the income schedule changes, past periods that already have expenses keep
 * their old income (saved as that period's own installments, with the dates the
 * money really arrived), so their summaries don't change.
 * Call it BEFORE changing the schedule. Returns a new incomeOverrides object.
 * (`oldIncome` is only for older data that stored one plain amount per period.)
 */
export function freezePastIncome(data, today, oldIncome = null) {
  const startDay = periodStartDay(data);
  const current = getPeriod(today, startDay);
  const result = { ...(data.incomeOverrides || {}) };
  for (const expense of data.expenses) {
    if (expense.date >= current.start) continue;
    const period = getPeriod(expense.date, startDay);
    if (hasOwn(result, period.start)) continue;
    result[period.start] = Number.isInteger(oldIncome)
      ? oldIncome
      : { installments: periodInstallments(data, period).map((i) => ({ id: i.id, date: i.date, amount: i.amount })) };
  }
  return result;
}
