// -----------------------------------------------------------------------------
// planner.js — all the math for "Rencana Cukup" (make my money last).
//
// Same rules as logic.js: no DOM, no storage, no clock. Everything comes in as
// arguments, so it is easy to test (see tests/planner.test.js).
// Money is whole Rupiah; dates are 'YYYY-MM-DD' text.
//
// A plan looks like this (it is stored in data.plans.active):
//   {
//     id, startDate, endDate,           // the plan covers startDate..endDate (both included)
//     endMode: 'income' | 'month' | 'custom',
//     money,                             // "Uang yang kupunya sekarang" when the plan started
//     obligations: [{ id, name, amount, date, paid, fromRecurringId }],
//     emergency,                         // "dana darurat": money I refuse to touch
//     minDaily,                          // "minimal belanja per hari" (0 = not set)
//     pattern: 'even' | 'weekend',       // weekend = Saturday/Sunday get more
//     weekendWeight,                     // e.g. 150 = weekend days get 1.5× a weekday
//     baselineIds,                       // expenses already logged when the plan was made
//     createdOn,
//   }
// -----------------------------------------------------------------------------

import { addDays, daysBetween, weekday, parseDateStr, toDateStr, daysInMonth, getPeriod } from './logic.js';
import { checkAmount, checkName, checkDate, cleanName } from './data.js';

export const WEEKEND_WEIGHT_DEFAULT = 150;
export const WEEKEND_WEIGHT_MIN = 100;
export const WEEKEND_WEIGHT_MAX = 300;
export const WEEKEND_WEIGHT_STEP = 25;
export const MAX_PLAN_DAYS = 366;
export const MAX_OBLIGATIONS = 30;

const WEEKDAY_WEIGHT = 100;
const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

/* ------------------------------- dates ------------------------------- */

/** True for Saturday and Sunday. */
export function isWeekend(date) {
  const day = weekday(date);
  return day === 0 || day === 6;
}

/**
 * The last day of a plan for each "Sampai kapan?" choice:
 *   'month'  – the last day of the start date's calendar month
 *   'income' – the day before the next income day (end of the budget period)
 *   'custom' – the date the user picked
 */
export function planEndDate(mode, startDate, incomeDay, customDate = null) {
  if (mode === 'month') {
    const { year, month } = parseDateStr(startDate);
    return toDateStr(year, month, daysInMonth(year, month));
  }
  if (mode === 'income') return getPeriod(startDate, incomeDay).end;
  return customDate;
}

/** The first date on or after `fromDate` that falls on day `dueDay` of a month (short months use their last day). */
export function nextDueDate(fromDate, dueDay) {
  const { year, month } = parseDateStr(fromDate);
  const inMonth = (y, m) => toDateStr(y, m, Math.min(dueDay, daysInMonth(y, m)));
  const thisMonth = inMonth(year, month);
  if (thisMonth >= fromDate) return thisMonth;
  return month === 12 ? inMonth(year + 1, 1) : inMonth(year, month + 1);
}

/** Every date from startDate to endDate (both included). */
export function planDates(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate && dates.length < MAX_PLAN_DAYS; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** How much a day "weighs": weekdays 100, weekend days `weekendWeight` with the weekend pattern. */
export function dayWeight(date, plan) {
  return plan.pattern === 'weekend' && isWeekend(date) ? plan.weekendWeight : WEEKDAY_WEIGHT;
}

/* ------------------------------ splitting ------------------------------ */

/**
 * Split `total` Rupiah over days in proportion to `weights`, as whole Rupiah.
 * Each part is rounded down; the few leftover Rupiah go to the first days,
 * so the parts always add up to exactly `total`.
 */
export function distribute(total, weights) {
  if (weights.length === 0) return [];
  const weightSum = sum(weights, (w) => w);
  const parts = weights.map((w) => Math.floor((total * w) / weightSum));
  let leftover = total - sum(parts, (p) => p);
  for (let i = 0; leftover > 0; i = (i + 1) % parts.length) {
    parts[i] += 1;
    leftover -= 1;
  }
  return parts;
}

/* ------------------------------ the plan ------------------------------ */

/** Obligations that count: dated on or before the end date (later ones are ignored). */
export function countedObligations(plan) {
  return plan.obligations.filter((o) => o.date <= plan.endDate);
}

/** The fixed numbers of a plan: money that is really free to spend, and how many days. */
export function planBase(plan) {
  const obligations = countedObligations(plan);
  const obligationsTotal = sum(obligations, (o) => o.amount);
  return {
    obligations,
    ignoredObligations: plan.obligations.filter((o) => o.date > plan.endDate),
    obligationsTotal,
    spendable: plan.money - obligationsTotal - plan.emergency,
    totalDays: daysBetween(plan.startDate, plan.endDate) + 1,
  };
}

/**
 * Expenses that count against the plan: dated inside the plan, and not
 * already logged when the plan was made (that money was already gone).
 */
export function planExpenses(plan, expenses) {
  const baseline = new Set(plan.baselineIds || []);
  return expenses.filter((e) => e.date >= plan.startDate && e.date <= plan.endDate && !baseline.has(e.id));
}

/**
 * Is the plan healthy? Returns { status, reason }:
 *   status: 'aman' | 'waspada' | 'tidak-cukup'
 *   reason: 'aman' | 'kewajiban' | 'habis' | 'minimum' | 'mepet' | 'turun' | 'hari-ini'
 */
export function planHealth({ spendable, poolToday, daysLeft, totalDays, minDaily, sisaHariIni }) {
  if (spendable < 0) return { status: 'tidak-cukup', reason: 'kewajiban' };
  if (poolToday <= 0) return { status: 'tidak-cukup', reason: 'habis' };
  if (minDaily > 0 && poolToday < minDaily * daysLeft) return { status: 'tidak-cukup', reason: 'minimum' };
  // Less than 20% above the minimum: tight.
  if (minDaily > 0 && poolToday * 5 < minDaily * daysLeft * 6) return { status: 'waspada', reason: 'mepet' };
  // No minimum set: warn when the daily amount fell below 80% of the original plan.
  if (minDaily === 0 && poolToday * totalDays * 5 < spendable * daysLeft * 4) return { status: 'waspada', reason: 'turun' };
  if (sisaHariIni < 0) return { status: 'waspada', reason: 'hari-ini' };
  return { status: 'aman', reason: 'aman' };
}

/**
 * Everything the "Rencana Cukup" screen shows, recalculated for `today`.
 *
 * Adaptive rule (like the home screen): every day, the money that is left is
 * spread again over the days that are left.
 *   poolToday      = spendable − expenses on other days of the plan (past, and planned later)
 *   allowanceToday = today's share of poolToday (by weight)
 *   sisaHariIni    = allowanceToday − today's expenses
 * Overspend yesterday → less today; underspend → more today.
 * Future days are a projection that assumes today's allowance is fully used.
 */
export function planReport(plan, expenses, today) {
  const base = planBase(plan);
  const dates = planDates(plan.startDate, plan.endDate);
  const weights = dates.map((date) => dayWeight(date, plan));

  const counted = planExpenses(plan, expenses);
  const spentOn = new Map();
  for (const e of counted) spentOn.set(e.date, (spentOn.get(e.date) || 0) + e.amount);
  const spentTotal = sum(counted, (e) => e.amount);

  let phase = 'active';
  if (today < plan.startDate) phase = 'upcoming';
  else if (today > plan.endDate) phase = 'ended';
  const currentDate = phase === 'upcoming' ? plan.startDate : phase === 'ended' ? plan.endDate : today;
  const current = dates.indexOf(currentDate);

  let spentBefore = 0;
  let spentLater = 0;
  for (const [date, amount] of spentOn) {
    if (date < currentDate) spentBefore += amount;
    else if (date > currentDate) spentLater += amount;
  }
  const spentToday = spentOn.get(currentDate) || 0;
  const poolToday = base.spendable - spentBefore - spentLater;
  const remainingWeights = weights.slice(current);
  const allowanceToday = distribute(poolToday, remainingWeights)[0];
  const sisaHariIni = allowanceToday - spentToday;
  const daysLeft = dates.length - current;

  // Day by day: past days show what their allowance was on that day.
  const days = [];
  let spentSoFar = 0;
  for (let i = 0; i < dates.length; i++) {
    const spent = spentOn.get(dates[i]) || 0;
    let planned = 0;
    if (i < current) planned = distribute(base.spendable - spentSoFar, weights.slice(i))[0];
    else if (i === current) planned = allowanceToday;
    let state = 'future';
    if (i < current || phase === 'ended') state = 'past';
    else if (i === current && phase === 'active') state = 'today';
    days.push({ date: dates[i], weight: weights[i], planned, spent, state });
    spentSoFar += spent;
  }
  const afterToday = poolToday - Math.max(allowanceToday, spentToday);
  const projected = distribute(afterToday, weights.slice(current + 1));
  for (let i = current + 1; i < dates.length; i++) days[i].planned = projected[i - current - 1];

  // Current rates for a weekday and a weekend day, and for a full week.
  const weightSum = sum(remainingWeights, (w) => w);
  const weekendWeight = plan.pattern === 'weekend' ? plan.weekendWeight : WEEKDAY_WEIGHT;
  const perWeekday = Math.floor((poolToday * WEEKDAY_WEIGHT) / weightSum);
  const perWeekendDay = Math.floor((poolToday * weekendWeight) / weightSum);

  // At the minimum daily spending: how long does the money last, and how much is missing?
  const minDaily = plan.minDaily;
  const shortfall = minDaily > 0 ? Math.max(0, minDaily * daysLeft - poolToday) : Math.max(0, -poolToday);
  let coverDays;
  if (minDaily > 0) coverDays = Math.max(0, Math.min(daysLeft, Math.floor(poolToday / minDaily)));
  else coverDays = poolToday > 0 ? daysLeft : 0;

  const health =
    phase === 'ended'
      ? { status: base.spendable - spentTotal >= 0 ? 'aman' : 'tidak-cukup', reason: 'selesai' }
      : planHealth({ spendable: base.spendable, poolToday, daysLeft, totalDays: base.totalDays, minDaily, sisaHariIni });

  return {
    phase,
    currentDate,
    startDate: plan.startDate,
    endDate: plan.endDate,
    totalDays: base.totalDays,
    daysLeft,
    money: plan.money,
    emergency: plan.emergency,
    minDaily,
    obligations: base.obligations,
    ignoredObligations: base.ignoredObligations,
    obligationsTotal: base.obligationsTotal,
    spendable: base.spendable,
    spentTotal,
    spentToday,
    remaining: base.spendable - spentTotal,
    poolToday,
    allowanceToday,
    sisaHariIni,
    averagePerDay: Math.floor(poolToday / daysLeft),
    perWeekday,
    perWeekendDay,
    perWeek: 5 * perWeekday + 2 * perWeekendDay,
    shortfall,
    coverDays,
    lastCoveredDay: coverDays > 0 ? addDays(currentDate, coverDays - 1) : null,
    runsOutOn: coverDays < daysLeft ? addDays(currentDate, coverDays) : null,
    status: health.status,
    reason: health.reason,
    days,
  };
}

/* ----------------------------- what-if tools ----------------------------- */

/**
 * "Kalau aku belanja Rp X per hari…": how long does the money last from today?
 * Returns { enough, days, leftover } or { enough: false, days, lastDay, runsOutOn, shortfall }.
 */
export function reverseCalc(report, perDay) {
  if (!Number.isInteger(perDay) || perDay <= 0) return null;
  const available = report.poolToday;
  const lasts = available > 0 ? Math.floor(available / perDay) : 0;
  if (lasts >= report.daysLeft) {
    return { enough: true, days: report.daysLeft, leftover: available - perDay * report.daysLeft, until: report.endDate };
  }
  return {
    enough: false,
    days: lasts,
    lastDay: lasts > 0 ? addDays(report.currentDate, lasts - 1) : null,
    runsOutOn: addDays(report.currentDate, lasts),
    shortfall: perDay * report.daysLeft - available,
  };
}

/** The average per day from tomorrow on, if today's allowance is used up (null on the last day). */
function perDayFromTomorrow(report) {
  if (report.daysLeft <= 1) return null;
  return Math.floor((report.poolToday - Math.max(report.allowanceToday, report.spentToday)) / (report.daysLeft - 1));
}

/** "Kalau beli ini" for the plan: today's leftover and the daily amount from tomorrow, before vs after. */
export function planPurchase(plan, expenses, today, amount) {
  const before = planReport(plan, expenses, today);
  const pretend = { id: '__simulasi__', amount, date: before.currentDate, bucketId: '', walletId: '', note: '' };
  const after = planReport(plan, [...expenses, pretend], today);
  return {
    hasTomorrow: before.daysLeft > 1,
    before: { sisaHariIni: before.sisaHariIni, perDayFromTomorrow: perDayFromTomorrow(before), status: before.status },
    after: { sisaHariIni: after.sisaHariIni, perDayFromTomorrow: perDayFromTomorrow(after), status: after.status },
  };
}

/** Buckets that count as "wants" (Keinginan-like) for saving tips. */
export function wantBucketIds(buckets) {
  const spendable = buckets.filter((b) => b.spendable);
  const named = spendable.filter((b) => /ingin|hiburan|jajan|hobi|want/i.test(b.name));
  const chosen = named.length ? named : spendable.slice(1);
  return new Set((chosen.length ? chosen : spendable).map((b) => b.id));
}

/**
 * Simple, rule-based saving tips ("Saran penghematan") from the user's own data.
 * Returns {
 *   maxPerDay      – spend at most this per day to make it to the end
 *   typicalPerDay  – average daily spending of the last 7 days (null if no data yet)
 *   cutPerDay      – how much less to spend per day
 *   obligations    – biggest unpaid obligations, and how much each would free per day
 *   habits         – biggest "wants" spending this period, and the saving if halved
 * }
 */
export function savingTips(report, data, today) {
  const maxPerDay = Math.max(0, report.averagePerDay);

  const spendableIds = new Set(data.buckets.filter((b) => b.spendable).map((b) => b.id));
  const weekAgo = addDays(today, -7);
  const from = data.settings.setupDate && data.settings.setupDate > weekAgo ? data.settings.setupDate : weekAgo;
  const dayCount = daysBetween(from, today);
  let typicalPerDay = null;
  if (dayCount > 0) {
    const recent = data.expenses.filter((e) => spendableIds.has(e.bucketId) && e.date >= from && e.date < today);
    if (recent.length) typicalPerDay = Math.round(sum(recent, (e) => e.amount) / dayCount);
  }
  let cutPerDay = 0;
  if (typicalPerDay !== null) cutPerDay = Math.max(0, typicalPerDay - maxPerDay);
  else if (report.minDaily > maxPerDay) cutPerDay = report.minDaily - maxPerDay;

  const daysLeft = Math.max(1, report.daysLeft);
  const obligations = report.obligations
    .filter((o) => !o.paid)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((o) => ({ name: o.name, amount: o.amount, perDayGain: Math.floor(o.amount / daysLeft) }));

  const period = getPeriod(today, data.settings.incomeDay);
  const wants = wantBucketIds(data.buckets);
  const bucketName = new Map(data.buckets.map((b) => [b.id, b.name]));
  const groups = new Map();
  for (const e of data.expenses) {
    if (!wants.has(e.bucketId) || e.date < period.start || e.date > today) continue;
    const label = cleanName(e.note).slice(0, 30) || bucketName.get(e.bucketId) || 'Lainnya';
    const key = label.toLowerCase();
    const group = groups.get(key) || { label, total: 0, count: 0 };
    group.total += e.amount;
    group.count += 1;
    groups.set(key, group);
  }
  const elapsed = daysBetween(period.start, today) + 1;
  const habits = [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((g) => ({ ...g, perDay: Math.round(g.total / elapsed), halfSaving: Math.round(g.total / elapsed / 2) }));

  return { maxPerDay, typicalPerDay, cutPerDay, obligations, habits };
}

/* ------------------------- checking and ending ------------------------- */

/** Check a plan before saving. Returns null if fine, or { message, field } in Indonesian. */
export function checkPlan(plan) {
  const problem = (message, field) => ({ message, field });
  const moneyError = checkAmount(plan.money, { allowZero: true, label: 'Uang yang kamu punya' });
  if (moneyError) return problem(moneyError, 'money');
  if (checkDate(plan.startDate)) return problem('Tanggal mulai tidak valid.', 'endDate');
  if (!plan.endDate) return problem('Pilih sampai tanggal berapa rencana ini.', 'endDate');
  const endError = checkDate(plan.endDate);
  if (endError) return problem(endError, 'endDate');
  if (plan.endDate < plan.startDate) return problem('Tanggal akhir tidak boleh sebelum tanggal mulai rencana.', 'endDate');
  if (daysBetween(plan.startDate, plan.endDate) + 1 > MAX_PLAN_DAYS) return problem('Rencana paling lama 1 tahun.', 'endDate');
  if (plan.obligations.length > MAX_OBLIGATIONS) return problem(`Maksimal ${MAX_OBLIGATIONS} kewajiban.`, 'obligations');
  for (let i = 0; i < plan.obligations.length; i++) {
    const o = plan.obligations[i];
    const error = checkName(o.name) || checkAmount(o.amount) || checkDate(o.date);
    if (error) return problem(`Kewajiban ke-${i + 1}: ${error}`, 'obligations');
  }
  const emergencyError = checkAmount(plan.emergency, { allowZero: true, label: 'Dana darurat' });
  if (emergencyError) return problem(emergencyError, 'emergency');
  const minError = checkAmount(plan.minDaily, { allowZero: true, label: 'Minimal belanja per hari' });
  if (minError) return problem(minError, 'minDaily');
  if (plan.pattern !== 'even' && plan.pattern !== 'weekend') return problem('Pilih pola pembagian.', 'pattern');
  const w = plan.weekendWeight;
  if (!Number.isInteger(w) || w < WEEKEND_WEIGHT_MIN || w > WEEKEND_WEIGHT_MAX || w % WEEKEND_WEIGHT_STEP !== 0) {
    return problem('Bobot akhir pekan harus antara 1× dan 3×.', 'pattern');
  }
  return null;
}

/** A short summary for the history when a plan ends ("Akhiri rencana"). */
export function planSummary(plan, expenses, endedOn) {
  const base = planBase(plan);
  const lastDay = endedOn < plan.endDate ? endedOn : plan.endDate;
  const spent = sum(planExpenses(plan, expenses).filter((e) => e.date <= lastDay), (e) => e.amount);
  return {
    id: plan.id,
    startDate: plan.startDate,
    endDate: plan.endDate,
    endedOn,
    endedEarly: endedOn < plan.endDate,
    days: base.totalDays,
    money: plan.money,
    obligationsTotal: base.obligationsTotal,
    emergency: plan.emergency,
    spendable: base.spendable,
    spent,
    leftover: base.spendable - spent,
  };
}
