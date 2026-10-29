// -----------------------------------------------------------------------------
// store.js — the app's data while it is running, and every function that
// changes it.
//
// Each change function: 1) checks the input (throws a UserError with an
// Indonesian message if something is wrong), 2) changes a copy of the data,
// 3) saves it through storage.js, 4) tells the screen to redraw.
// If saving fails, nothing is changed.
// -----------------------------------------------------------------------------

import * as storage from './storage.js';
import {
  SCHEMA_VERSION,
  createEmptyData,
  normalizeData,
  dataVersion,
  checkAmount,
  checkName,
  checkDate,
  checkBuckets,
  cleanName,
  cleanNote,
} from './data.js';
import {
  freezePastIncome,
  remapPeriodKeys,
  getPeriod,
  incomeSchedule,
  periodStartDay,
  periodInstallments,
  installmentDate,
  CALC_MODES,
} from './logic.js';
import { checkSchedule, checkPeriodIncome, checkDelay } from './schedule.js';
import { checkPlan, planSummary } from './planner.js';

const DATA_KEY = 'data';
const PRE_UPDATE_KEY = 'sebelum-update'; // untouched copy of the data from before the last upgrade
const listeners = new Set();

let data = createEmptyData();
let storageAvailable = true;
let loadMessages = [];
let upgradedFrom = null;

/**
 * An error whose message can be shown to the user as-is (in Indonesian).
 * `field` (optional) names the input it is about, so the form can shake that input.
 */
export class UserError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'UserError';
    this.field = field;
  }
}

function fail(message, field = null) {
  throw new UserError(message, field);
}

function failIf(message, field = null) {
  if (message) fail(message, field);
}

const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

let idCounter = 0;
/** A new unique id like 'e-lq2x7k-1ab3'. */
export function makeId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------- loading ------------------------------- */

/**
 * Load the saved data at startup. Never throws: broken data is repaired or
 * replaced, a copy of the broken data is kept, and a message is prepared.
 * `stamp` is today's date, used to name the copy.
 */
export function load(stamp) {
  loadMessages = [];
  upgradedFrom = null;
  storageAvailable = storage.isAvailable();
  if (!storageAvailable) {
    data = createEmptyData();
    loadMessages.push('Penyimpanan di perangkat ini tidak bisa dipakai (mungkin mode penjelajahan pribadi). Aplikasi tetap jalan, tetapi data TIDAK akan tersimpan setelah ditutup.');
    return;
  }

  const saved = storage.read(DATA_KEY);
  if (saved.error) {
    if (saved.raw) storage.writeText(`rusak-${stamp}`, saved.raw);
    data = createEmptyData();
    loadMessages.push('Data yang tersimpan rusak dan tidak bisa dibaca, jadi aplikasi dimulai dari awal. Salinan data lama tetap disimpan di perangkat. Kalau kamu punya file cadangan, pakai "Pulihkan dari file cadangan".');
    return;
  }
  if (saved.value === null) {
    data = createEmptyData(); // first time the app is opened
    return;
  }

  // Data from an older app version: keep an untouched copy first, then upgrade it.
  const version = dataVersion(saved.value);
  const upgrading = version < SCHEMA_VERSION;
  if (upgrading) {
    const copied = storage.write(PRE_UPDATE_KEY, { fromVersion: version, toVersion: SCHEMA_VERSION, savedOn: stamp, data: saved.value });
    if (!copied) loadMessages.push('Salinan otomatis data lama tidak bisa disimpan (penyimpanan penuh). Sebaiknya ekspor cadangan sekarang.');
  }

  const { data: repaired, problems } = normalizeData(saved.value); // also upgrades older data
  data = repaired;
  if (problems.length) {
    storage.write(`sebelum-perbaikan-${stamp}`, saved.value);
    loadMessages.push('Sebagian data tersimpan bermasalah dan sudah diperbaiki otomatis:', ...problems);
  }
  if (upgrading || problems.length) storage.write(DATA_KEY, data);
  if (upgrading) upgradedFrom = version;
}

/** The data version that was upgraded at startup (e.g. 1), or null if nothing was upgraded. */
export function takeUpgradeInfo() {
  const from = upgradedFrom;
  upgradedFrom = null;
  return from;
}

/** Is there a copy of the data from before the last upgrade? Returns { savedOn, fromVersion } or null. */
export function preUpdateInfo() {
  if (!storageAvailable) return null;
  const saved = storage.read(PRE_UPDATE_KEY);
  const copy = saved.value;
  if (saved.error || !copy || typeof copy !== 'object' || !copy.data) return null;
  return { savedOn: typeof copy.savedOn === 'string' ? copy.savedOn : null, fromVersion: copy.fromVersion };
}

/**
 * "Pulihkan data sebelum update": replace the current data with the copy saved
 * before the last upgrade (upgraded again, so the new app can use it).
 */
export function restorePreUpdate() {
  const saved = storage.read(PRE_UPDATE_KEY);
  if (saved.error || !saved.value || !saved.value.data) fail('Data sebelum update tidak ditemukan.');
  replaceAllData(normalizeData(saved.value.data).data);
}

/** True if a "storage" event from another tab means our data changed there. */
export function changedElsewhere(eventKey) {
  return storageAvailable && storage.isEventFor(eventKey, DATA_KEY);
}

/**
 * Read the data again after another tab changed it. This never writes
 * anything (writing would make the other tab reload too, back and forth).
 */
export function reload() {
  const saved = storage.read(DATA_KEY);
  if (saved.error) return; // broken text: keep what we have; the next start repairs it
  data = saved.value === null ? createEmptyData() : normalizeData(saved.value).data;
  notify();
}

/** Messages from loading (shown once at startup). */
export function takeLoadMessages() {
  const messages = loadMessages;
  loadMessages = [];
  return messages;
}

export function isStorageAvailable() {
  return storageAvailable;
}

/** The current data. Treat it as read-only; change it only through the functions below. */
export function getData() {
  return data;
}

/** Call `listener` after every change. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** Apply `change` to a copy of the data, save it, then make it the current data. */
function commit(change) {
  const draft = clone(data);
  const result = change(draft);
  if (storageAvailable && !storage.write(DATA_KEY, draft)) {
    fail('Gagal menyimpan. Penyimpanan perangkat mungkin penuh.');
  }
  data = draft;
  notify();
  return result;
}

/* -------------------------------- setup -------------------------------- */

const cleanBucket = (b) => ({ id: b.id, name: cleanName(b.name), percent: b.percent, spendable: b.spendable === true });

/** Check a monthly schedule from a form and give it ids and a fixed order. Throws a UserError if it is wrong. */
function checkedSchedule({ total, installments }) {
  const problem = checkSchedule({ total, installments });
  if (problem) fail(problem.message, problem.field);
  return installments
    .map((i) => ({ id: i.id || makeId('i'), day: i.day, amount: i.amount }))
    .sort((a, b) => a.day - b.day);
}

/** Put a checked schedule into the settings (and the copies that depend on it). */
function applySchedule(settings, schedule) {
  settings.incomeSchedule = schedule;
  settings.monthlyIncome = schedule.reduce((sum, i) => sum + i.amount, 0);
  settings.incomeDay = schedule[0].day;
}

/**
 * Finish the first-run setup. `income` is { total, installments: [{ day, amount }] }.
 * `currentRemaining` (optional) is the money still left right now when the app
 * is started in the middle of a period. It replaces this period's installments
 * that already came; the ones still to come this period stay. That way the
 * first daily numbers are realistic.
 */
export function completeSetup({ income, buckets, currentRemaining = null }, today) {
  const schedule = checkedSchedule(income);
  if (currentRemaining !== null) failIf(checkAmount(currentRemaining, { allowZero: true, label: 'Sisa uang periode ini' }), 'remaining');
  failIf(checkBuckets(buckets), 'buckets');
  commit((d) => {
    applySchedule(d.settings, schedule);
    d.settings.setupDate = today;
    d.buckets = buckets.map(cleanBucket);
    d.incomeOverrides = {};
    d.incomeDelays = {};
    if (currentRemaining !== null) {
      const period = getPeriod(today, schedule[0].day);
      const comingLater = schedule
        .map((i) => ({ id: i.id, date: installmentDate(period, i.day), amount: i.amount }))
        .filter((i) => i.date > today);
      const now = currentRemaining > 0 ? [{ id: makeId('k'), date: period.start, amount: currentRemaining }] : [];
      d.incomeOverrides[period.start] = { installments: [...now, ...comingLater] };
    }
    d.setupDone = true;
  });
}

/* ------------------------------- expenses ------------------------------- */

function checkedExpense({ amount, bucketId, walletId, date, note }) {
  failIf(checkAmount(amount), 'amount');
  if (!data.buckets.some((b) => b.id === bucketId)) fail('Pilih pos anggaran.', 'bucket');
  if (!data.wallets.some((w) => w.id === walletId)) fail('Pilih dompet.', 'wallet');
  failIf(checkDate(date), 'date');
  return { amount, bucketId, walletId, date, note: cleanNote(note) };
}

export function addExpense(fields) {
  const clean = checkedExpense(fields);
  return commit((d) => {
    const expense = { id: makeId('e'), ...clean, createdAt: Date.now() };
    d.expenses.push(expense);
    d.settings.lastBucketId = clean.bucketId; // remembered for the next entry
    d.settings.lastWalletId = clean.walletId;
    return expense;
  });
}

export function updateExpense(id, fields) {
  const clean = checkedExpense(fields);
  if (!data.expenses.some((e) => e.id === id)) fail('Pengeluaran ini sudah tidak ada.');
  commit((d) => {
    Object.assign(d.expenses.find((e) => e.id === id), clean);
  });
}

/** Put back an expense that was just deleted ("Urungkan"), with its original id. */
export function restoreExpense(expense) {
  if (data.expenses.some((e) => e.id === expense.id)) return;
  const clean = checkedExpense(expense);
  commit((d) => {
    d.expenses.push({ id: expense.id, ...clean, createdAt: expense.createdAt || 0 });
  });
}

export function deleteExpense(id) {
  commit((d) => {
    d.expenses = d.expenses.filter((e) => e.id !== id);
  });
}

/* ---------------------------- income schedule ---------------------------- */

const sameSchedule = (a, b) => a.length === b.length && a.every((x, i) => x.day === b[i].day && x.amount === b[i].amount);

/**
 * "Jadwal Uang Masuk": save a new monthly schedule { total, installments: [{ id?, day, amount }] }.
 * Past periods that already have expenses keep their old installments, so their
 * summaries don't change. Returns a list of short notes about side effects.
 */
export function updateIncomeSchedule(income, today) {
  const schedule = checkedSchedule(income);
  return commit((d) => {
    const notes = [];
    const oldStartDay = periodStartDay(d);
    if (!sameSchedule(incomeSchedule(d), schedule)) {
      const before = new Set(Object.keys(d.incomeOverrides));
      d.incomeOverrides = freezePastIncome(d, today); // uses the OLD schedule
      const frozen = Object.keys(d.incomeOverrides).filter((key) => !before.has(key));
      for (const key of frozen) delete d.incomeDelays[key]; // their real dates are now saved in the period itself
      if (frozen.length) notes.push('Periode sebelumnya tetap memakai jadwal lama.');
    }
    applySchedule(d.settings, schedule);
    if (schedule[0].day !== oldStartDay) {
      Object.assign(d, remapPeriodKeys(d, schedule[0].day));
      notes.push('Periode disusun ulang mengikuti tanggal awal yang baru.');
    }
    return notes;
  });
}

/** "Cara hitung": 'hati-hati' (only money that has arrived) or 'total' (the whole month). */
export function setCalcMode(mode) {
  if (!CALC_MODES.includes(mode)) fail('Pilih cara hitung.');
  commit((d) => {
    d.settings.calcMode = mode;
  });
}

/**
 * The special income of one period ("Ubah uang masuk periode ini"):
 * { total, installments: [{ id?, date, amount }] } with dates inside that period,
 * or null to use the normal schedule again. Late installments of that period are forgotten.
 */
export function setPeriodIncome(periodStart, income) {
  failIf(checkDate(periodStart));
  const period = getPeriod(periodStart, periodStartDay(data));
  if (period.start !== periodStart) fail('Periode ini tidak ditemukan.');
  let installments = null;
  if (income !== null) {
    const problem = checkPeriodIncome(income, period);
    if (problem) fail(problem.message, problem.field);
    installments = income.installments
      .map((i) => ({ id: i.id || makeId('k'), date: i.date, amount: i.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  commit((d) => {
    if (installments === null) delete d.incomeOverrides[periodStart];
    else d.incomeOverrides[periodStart] = { installments };
    delete d.incomeDelays[periodStart];
  });
}

/**
 * "Belum masuk, geser tanggal": an installment of the current period has not
 * arrived; it counts as not received until `newDate` (later, inside the period).
 */
export function delayInstallment(periodStart, installmentId, newDate, today) {
  const period = getPeriod(periodStart, periodStartDay(data));
  const installment = periodInstallments(data, period).find((i) => i.id === installmentId);
  if (period.start !== periodStart || !installment) fail('Uang masuk ini tidak ditemukan.');
  failIf(checkDelay(installment, newDate, period, today), 'date');
  commit((d) => {
    d.incomeDelays[periodStart] = { ...(d.incomeDelays[periodStart] || {}), [installmentId]: newDate };
  });
}

/** Undo "geser tanggal": the installment is due on its planned date again. */
export function undoDelay(periodStart, installmentId) {
  commit((d) => {
    const delays = d.incomeDelays[periodStart];
    if (!delays) return;
    delete delays[installmentId];
    if (!Object.keys(delays).length) delete d.incomeDelays[periodStart];
  });
}

/* ------------------------------ buckets (pos) ------------------------------ */

/** How many expenses and recurring bills use a bucket. */
export function bucketUsage(bucketId) {
  return {
    expenses: data.expenses.filter((e) => e.bucketId === bucketId).length,
    recurring: data.recurring.filter((r) => r.bucketId === bucketId).length,
  };
}

/**
 * Save the edited bucket list. `reassign` maps a deleted bucket id to the
 * bucket that takes over its expenses and recurring bills.
 */
export function saveBuckets(buckets, reassign = {}) {
  failIf(checkBuckets(buckets));
  const keep = new Set(buckets.map((b) => b.id));
  const targetFor = (id) => {
    let target = id;
    for (let guard = 0; !keep.has(target) && reassign[target] && guard < 50; guard++) target = reassign[target];
    return keep.has(target) ? target : buckets[0].id;
  };
  commit((d) => {
    for (const e of d.expenses) if (!keep.has(e.bucketId)) e.bucketId = targetFor(e.bucketId);
    for (const r of d.recurring) if (!keep.has(r.bucketId)) r.bucketId = targetFor(r.bucketId);
    if (!keep.has(d.settings.lastBucketId)) d.settings.lastBucketId = null;
    d.buckets = buckets.map(cleanBucket);
  });
}

/* ----------------------------- wallets (dompet) ----------------------------- */

/** How many expenses and recurring bills use a wallet. */
export function walletUsage(walletId) {
  return {
    expenses: data.expenses.filter((e) => e.walletId === walletId).length,
    recurring: data.recurring.filter((r) => r.walletId === walletId).length,
  };
}

export function addWallet(name) {
  failIf(checkName(name, data.wallets.map((w) => w.name)), 'name');
  return commit((d) => {
    const wallet = { id: makeId('w'), name: cleanName(name) };
    d.wallets.push(wallet);
    return wallet;
  });
}

export function renameWallet(id, name) {
  failIf(checkName(name, data.wallets.filter((w) => w.id !== id).map((w) => w.name)), 'name');
  if (!data.wallets.some((w) => w.id === id)) fail('Dompet ini sudah tidak ada.');
  commit((d) => {
    d.wallets.find((w) => w.id === id).name = cleanName(name);
  });
}

/** Delete a wallet. If it is in use, everything is moved to `moveToId` first. */
export function deleteWallet(id, moveToId = null) {
  if (data.wallets.length <= 1) fail('Minimal harus ada satu dompet.');
  const usage = walletUsage(id);
  const inUse = usage.expenses + usage.recurring > 0;
  if (inUse && (!moveToId || moveToId === id || !data.wallets.some((w) => w.id === moveToId))) {
    fail('Pilih dompet tujuan untuk memindahkan catatannya.');
  }
  commit((d) => {
    if (inUse) {
      for (const e of d.expenses) if (e.walletId === id) e.walletId = moveToId;
      for (const r of d.recurring) if (r.walletId === id) r.walletId = moveToId;
    }
    d.wallets = d.wallets.filter((w) => w.id !== id);
    if (d.settings.lastWalletId === id) d.settings.lastWalletId = null;
  });
}

/* ------------------------ recurring bills (rutin) ------------------------ */

function checkedRecurring({ name, amount, bucketId, walletId, dueDay = null }) {
  failIf(checkName(name), 'name');
  failIf(checkAmount(amount), 'amount');
  if (!data.buckets.some((b) => b.id === bucketId)) fail('Pilih pos anggaran.', 'bucket');
  if (!data.wallets.some((w) => w.id === walletId)) fail('Pilih dompet.', 'wallet');
  if (dueDay !== null && !(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31)) fail('Tanggal jatuh tempo harus 1 sampai 31.', 'dueDay');
  return { name: cleanName(name), amount, bucketId, walletId, dueDay };
}

/**
 * Add a recurring bill. It counts in every period that ends on or after
 * `startDate`: pass today to start this period, or the next income day to
 * start next period (e.g. when this period's bill is already paid).
 */
export function addRecurring(fields, startDate) {
  const clean = checkedRecurring(fields);
  failIf(checkDate(startDate));
  return commit((d) => {
    const bill = { id: makeId('r'), ...clean, startDate, endDate: null };
    d.recurring.push(bill);
    return bill;
  });
}

export function updateRecurring(id, fields) {
  const clean = checkedRecurring(fields);
  if (!data.recurring.some((r) => r.id === id)) fail('Pengeluaran rutin ini sudah tidak ada.');
  commit((d) => {
    Object.assign(d.recurring.find((r) => r.id === id), clean);
  });
}

/** Deactivate (stops counting from the current period) or activate again. */
export function setRecurringActive(id, active, today) {
  commit((d) => {
    const bill = d.recurring.find((r) => r.id === id);
    if (bill) bill.endDate = active ? null : today;
  });
}

export function deleteRecurring(id) {
  commit((d) => {
    d.recurring = d.recurring.filter((r) => r.id !== id);
  });
}

/* -------------------------------- savings -------------------------------- */

/** "Pindahkan sisa ke Tabungan": record the leftover of a finished period (once). */
export function moveLeftoverToSavings(period, amount, today) {
  if (data.savings.some((s) => s.periodStart === period.start)) fail('Sisa periode ini sudah pernah dipindahkan.');
  if (today <= period.end) fail('Periode ini belum selesai.');
  failIf(checkAmount(amount, { label: 'Sisa' }));
  commit((d) => {
    d.savings.push({ id: makeId('s'), periodStart: period.start, amount, date: today });
  });
}

export function undoSavings(id) {
  commit((d) => {
    d.savings = d.savings.filter((s) => s.id !== id);
  });
}

/* ------------------------- Rencana Cukup (plans) ------------------------- */

/** Build a checked plan from the form input; `base` holds what never changes (id, start date…). */
function checkedPlan(input, base) {
  const plan = {
    id: base.id,
    startDate: base.startDate,
    endDate: input.endDate,
    endMode: input.endMode,
    money: input.money,
    obligations: (input.obligations || []).map((o) => ({
      id: o.id || makeId('o'),
      name: cleanName(o.name),
      amount: o.amount,
      date: o.date,
      paid: o.paid === true,
      fromRecurringId: o.fromRecurringId || null,
    })),
    emergency: input.emergency ?? 0,
    minDaily: input.minDaily ?? 0,
    pattern: input.pattern,
    weekendWeight: input.weekendWeight,
    baselineIds: base.baselineIds,
    createdOn: base.createdOn,
  };
  const problem = checkPlan(plan);
  if (problem) fail(problem.message, problem.field);
  return plan;
}

/** "Buat rencana": start a new plan today. Only one plan can be active at a time. */
export function createPlan(input, today) {
  if (data.plans.active) fail('Masih ada rencana yang aktif. Akhiri dulu rencana itu.');
  const plan = checkedPlan(input, {
    id: makeId('p'),
    startDate: today,
    // Expenses already logged today are part of "the money I have now", so they don't count twice.
    baselineIds: data.expenses.filter((e) => e.date === today).map((e) => e.id),
    createdOn: today,
  });
  return commit((d) => {
    d.plans.active = plan;
    return plan;
  });
}

/** "Ubah rencana": change the active plan. It keeps its start date. */
export function updatePlan(input) {
  const current = data.plans.active;
  if (!current) fail('Tidak ada rencana yang aktif.');
  const plan = checkedPlan(input, current);
  commit((d) => {
    d.plans.active = plan;
  });
}

/** Tick an obligation as paid ("Lunas"). The money stays reserved either way. */
export function setObligationPaid(obligationId, paid) {
  commit((d) => {
    const obligation = d.plans.active && d.plans.active.obligations.find((o) => o.id === obligationId);
    if (obligation) obligation.paid = paid;
  });
}

/** "Akhiri rencana": move the active plan to the history with a short summary. Returns the summary. */
export function endPlan(today) {
  const plan = data.plans.active;
  if (!plan) fail('Tidak ada rencana yang aktif.');
  const summary = planSummary(plan, data.expenses, today);
  return commit((d) => {
    d.plans.active = null;
    d.plans.history = [summary, ...d.plans.history].slice(0, 50);
    return summary;
  });
}

/* ------------------------------- backups ------------------------------- */

export function markBackupDone(today) {
  commit((d) => {
    d.settings.lastBackupDate = today;
  });
}

/** Replace everything with data from a backup (already checked by readBackup). */
export function replaceAllData(newData) {
  const next = clone(newData);
  if (storageAvailable && !storage.write(DATA_KEY, next)) {
    fail('Gagal menyimpan data dari cadangan. Penyimpanan perangkat mungkin penuh.');
  }
  data = next;
  notify();
}

/** "Hapus semua data": remove everything this app saved on this device. */
export function resetAll() {
  if (storageAvailable) storage.removeAll();
  data = createEmptyData();
  notify();
}
