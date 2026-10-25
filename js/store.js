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
  createEmptyData,
  normalizeData,
  checkAmount,
  checkName,
  checkDate,
  checkIncomeDay,
  checkBuckets,
  cleanName,
  cleanNote,
} from './data.js';
import { freezePastIncome, remapPeriodKeys, getPeriod } from './logic.js';

const DATA_KEY = 'data';
const listeners = new Set();

let data = createEmptyData();
let storageAvailable = true;
let loadMessages = [];

/** An error whose message can be shown to the user as-is (in Indonesian). */
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

function fail(message) {
  throw new UserError(message);
}

function failIf(message) {
  if (message) fail(message);
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

  const { data: repaired, problems } = normalizeData(saved.value);
  data = repaired;
  if (problems.length) {
    storage.write(`sebelum-perbaikan-${stamp}`, saved.value);
    storage.write(DATA_KEY, data);
    loadMessages.push('Sebagian data tersimpan bermasalah dan sudah diperbaiki otomatis:', ...problems);
  }
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

/**
 * Finish the first-run setup. `currentRemaining` (optional) is the money still
 * left right now when the app is started in the middle of a period; it becomes
 * the income of the current period, so the first daily numbers are realistic.
 */
export function completeSetup({ monthlyIncome, incomeDay, buckets, currentRemaining = null }, today) {
  failIf(checkAmount(monthlyIncome, { label: 'Uang bulanan' }));
  failIf(checkIncomeDay(incomeDay));
  if (currentRemaining !== null) failIf(checkAmount(currentRemaining, { allowZero: true, label: 'Sisa uang periode ini' }));
  failIf(checkBuckets(buckets));
  commit((d) => {
    d.settings.monthlyIncome = monthlyIncome;
    d.settings.incomeDay = incomeDay;
    d.settings.setupDate = today;
    d.buckets = buckets.map(cleanBucket);
    d.incomeOverrides = {};
    if (currentRemaining !== null) d.incomeOverrides[getPeriod(today, incomeDay).start] = currentRemaining;
    d.setupDone = true;
  });
}

/* ------------------------------- expenses ------------------------------- */

function checkedExpense({ amount, bucketId, walletId, date, note }) {
  failIf(checkAmount(amount));
  if (!data.buckets.some((b) => b.id === bucketId)) fail('Pilih pos anggaran.');
  if (!data.wallets.some((w) => w.id === walletId)) fail('Pilih dompet.');
  failIf(checkDate(date));
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

export function deleteExpense(id) {
  commit((d) => {
    d.expenses = d.expenses.filter((e) => e.id !== id);
  });
}

/* ------------------------------- settings ------------------------------- */

/**
 * Change the monthly amount and/or the income day.
 * Returns a list of short notes about side effects (to show the user).
 */
export function updateIncomeSettings({ monthlyIncome, incomeDay }, today) {
  failIf(checkAmount(monthlyIncome, { label: 'Uang bulanan' }));
  failIf(checkIncomeDay(incomeDay));
  return commit((d) => {
    const notes = [];
    if (monthlyIncome !== d.settings.monthlyIncome) {
      const before = Object.keys(d.incomeOverrides).length;
      d.incomeOverrides = freezePastIncome(d, today, d.settings.monthlyIncome); // uses the OLD income day
      if (Object.keys(d.incomeOverrides).length > before) notes.push('Periode sebelumnya tetap memakai jumlah lama.');
      d.settings.monthlyIncome = monthlyIncome;
    }
    if (incomeDay !== d.settings.incomeDay) {
      Object.assign(d, remapPeriodKeys(d, incomeDay));
      d.settings.incomeDay = incomeDay;
      notes.push('Periode disusun ulang mengikuti tanggal baru.');
    }
    return notes;
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
  failIf(checkName(name, data.wallets.map((w) => w.name)));
  return commit((d) => {
    const wallet = { id: makeId('w'), name: cleanName(name) };
    d.wallets.push(wallet);
    return wallet;
  });
}

export function renameWallet(id, name) {
  failIf(checkName(name, data.wallets.filter((w) => w.id !== id).map((w) => w.name)));
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

function checkedRecurring({ name, amount, bucketId, walletId }) {
  failIf(checkName(name));
  failIf(checkAmount(amount));
  if (!data.buckets.some((b) => b.id === bucketId)) fail('Pilih pos anggaran.');
  if (!data.wallets.some((w) => w.id === walletId)) fail('Pilih dompet.');
  return { name: cleanName(name), amount, bucketId, walletId };
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

/* ------------------------- income and savings ------------------------- */

/** Set a special income for one period, or remove it with amount = null. */
export function setIncomeOverride(periodStart, amount) {
  failIf(checkDate(periodStart));
  if (amount !== null) failIf(checkAmount(amount, { allowZero: true, label: 'Pemasukan' }));
  commit((d) => {
    if (amount === null) delete d.incomeOverrides[periodStart];
    else d.incomeOverrides[periodStart] = amount;
  });
}

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
