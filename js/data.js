// -----------------------------------------------------------------------------
// data.js — the shape of the saved data, the default values, input checks,
// and functions that repair data coming from storage or from a backup file.
// No DOM here, so it can be tested (see tests/data.test.js).
//
// Every check function returns an Indonesian error message, or '' when the
// value is fine.
// -----------------------------------------------------------------------------

import { isValidDateStr, percentTotal } from './logic.js';

export const APP_ID = 'uang-bulanan';
export const SCHEMA_VERSION = 1; // bump this (and add a migration below) if the data shape changes
export const MAX_AMOUNT = 1_000_000_000; // Rp 1 miliar: the biggest amount accepted anywhere
export const MAX_NAME_LENGTH = 30;
export const MAX_NOTE_LENGTH = 100;
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export const DEFAULT_BUCKETS = [
  { id: 'kebutuhan', name: 'Kebutuhan', percent: 50, spendable: true },
  { id: 'keinginan', name: 'Keinginan', percent: 30, spendable: true },
  { id: 'tabungan', name: 'Tabungan/Investasi', percent: 15, spendable: false },
  { id: 'cadangan', name: 'Dana Cadangan', percent: 5, spendable: false },
];

export const DEFAULT_WALLETS = [
  { id: 'tunai', name: 'Tunai' },
  { id: 'bank', name: 'Bank' },
  { id: 'gopay', name: 'GoPay' },
  { id: 'dana', name: 'Dana' },
  { id: 'shopeepay', name: 'ShopeePay' },
];

/** A brand-new, empty data object (before the first-run setup). */
export function createEmptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    setupDone: false,
    settings: {
      monthlyIncome: 0,
      incomeDay: 1,
      setupDate: null, // 'YYYY-MM-DD' when setup was finished
      lastBackupDate: null, // 'YYYY-MM-DD' of the last export
      lastBucketId: null, // remembered for faster entry
      lastWalletId: null,
    },
    buckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
    wallets: DEFAULT_WALLETS.map((w) => ({ ...w })),
    expenses: [],
    recurring: [],
    incomeOverrides: {},
    savings: [],
  };
}

/* ------------------------------- cleaning ------------------------------- */

/** Trim a name and collapse double spaces. */
export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim();
}

/** Trim a note and cut it to the maximum length. */
export function cleanNote(note) {
  return String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH);
}

/* -------------------------------- checks -------------------------------- */

export function checkAmount(value, { allowZero = false, label = 'Jumlah' } = {}) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) return `${label} wajib diisi.`;
  if (typeof value !== 'number' || !Number.isInteger(value)) return `${label} harus berupa angka bulat.`;
  if (value < 0) return `${label} tidak boleh negatif.`;
  if (value === 0 && !allowZero) return `${label} harus lebih dari Rp 0.`;
  if (value > MAX_AMOUNT) return `${label} terlalu besar. Maksimal Rp 1.000.000.000.`;
  return '';
}

export function checkName(name, otherNames = []) {
  const clean = cleanName(name);
  if (!clean) return 'Nama wajib diisi.';
  if (clean.length > MAX_NAME_LENGTH) return `Nama terlalu panjang (maksimal ${MAX_NAME_LENGTH} huruf).`;
  const lower = clean.toLowerCase();
  if (otherNames.some((other) => cleanName(other).toLowerCase() === lower)) return `Nama "${clean}" sudah dipakai.`;
  return '';
}

export function checkDate(dateStr) {
  if (!dateStr) return 'Tanggal wajib diisi.';
  if (!isValidDateStr(dateStr)) return 'Tanggal tidak valid.';
  const year = Number(dateStr.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return `Tahun harus antara ${MIN_YEAR} dan ${MAX_YEAR}.`;
  return '';
}

export function checkPercent(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    return 'Persen harus angka bulat dari 0 sampai 100.';
  }
  return '';
}

export function checkIncomeDay(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) return 'Pilih tanggal 1 sampai 31.';
  return '';
}

/** Check a whole list of buckets: names, percents, and a total of exactly 100%. */
export function checkBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) return 'Minimal harus ada satu pos.';
  for (let i = 0; i < buckets.length; i++) {
    const others = buckets.filter((_, j) => j !== i).map((b) => b.name);
    const nameError = checkName(buckets[i].name, others);
    if (nameError) return `Pos ke-${i + 1}: ${nameError}`;
    const percentError = checkPercent(buckets[i].percent);
    if (percentError) return `Pos "${cleanName(buckets[i].name)}": ${percentError}`;
  }
  const total = percentTotal(buckets);
  if (total !== 100) return `Total persen harus tepat 100% (sekarang ${total}%).`;
  return '';
}

/* ------------------------------- repairing ------------------------------- */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWhole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const asList = (value) => (Array.isArray(value) ? value : []);
const validDateOrNull = (value) => (typeof value === 'string' && !checkDate(value) ? value : null);

/**
 * Check data from storage or a backup file and repair what is broken.
 * Never throws. Returns { data, problems }, where `problems` is a list of
 * Indonesian sentences describing what was repaired (empty if all was fine).
 */
export function normalizeData(input) {
  const problems = [];
  const data = createEmptyData();
  if (!isObject(input)) {
    problems.push('Data tidak dikenali, jadi aplikasi dimulai dari awal.');
    return { data, problems };
  }

  // Future data versions would be converted here, e.g.:
  // if (input.schemaVersion === 1) input = migrateV1toV2(input);

  data.setupDone = input.setupDone === true;

  // --- settings ---
  const settings = isObject(input.settings) ? input.settings : {};
  if (!isObject(input.settings)) problems.push('Pengaturan tidak ditemukan, jadi memakai pengaturan awal.');
  if (isWhole(settings.monthlyIncome, 0, MAX_AMOUNT)) data.settings.monthlyIncome = settings.monthlyIncome;
  else if (isObject(input.settings)) problems.push('Uang bulanan tidak valid, jadi diatur ke Rp 0. Periksa di Pengaturan.');
  if (isWhole(settings.incomeDay, 1, 31)) data.settings.incomeDay = settings.incomeDay;
  else if (isObject(input.settings)) problems.push('Tanggal uang masuk tidak valid, jadi diatur ke tanggal 1. Periksa di Pengaturan.');
  data.settings.setupDate = validDateOrNull(settings.setupDate);
  data.settings.lastBackupDate = validDateOrNull(settings.lastBackupDate);

  // --- buckets ("pos") ---
  const buckets = [];
  let badBuckets = 0;
  for (const b of asList(input.buckets)) {
    const ok = isObject(b) && typeof b.id === 'string' && b.id && !buckets.some((x) => x.id === b.id)
      && !checkName(b.name) && !checkPercent(b.percent);
    if (!ok) {
      badBuckets++;
      continue;
    }
    buckets.push({ id: b.id, name: cleanName(b.name), percent: b.percent, spendable: b.spendable === true });
  }
  if (buckets.length === 0) {
    if (data.setupDone || asList(input.buckets).length > 0) problems.push('Pos anggaran tidak ditemukan, jadi memakai pos bawaan.');
  } else {
    data.buckets = buckets;
    if (badBuckets) problems.push(`${badBuckets} pos anggaran tidak valid dilewati.`);
  }

  // --- wallets ("dompet") ---
  const wallets = [];
  let badWallets = 0;
  for (const w of asList(input.wallets)) {
    const ok = isObject(w) && typeof w.id === 'string' && w.id && !wallets.some((x) => x.id === w.id) && !checkName(w.name);
    if (!ok) {
      badWallets++;
      continue;
    }
    wallets.push({ id: w.id, name: cleanName(w.name) });
  }
  if (wallets.length === 0) {
    if (data.setupDone || asList(input.wallets).length > 0) problems.push('Dompet tidak ditemukan, jadi memakai dompet bawaan.');
  } else {
    data.wallets = wallets;
    if (badWallets) problems.push(`${badWallets} dompet tidak valid dilewati.`);
  }

  const bucketIds = new Set(data.buckets.map((b) => b.id));
  const walletIds = new Set(data.wallets.map((w) => w.id));
  const usedIds = new Set();
  const uniqueId = (id, prefix) => {
    let result = typeof id === 'string' && id && !usedIds.has(id) ? id : '';
    for (let n = usedIds.size + 1; !result; n++) {
      if (!usedIds.has(`${prefix}-fix-${n}`)) result = `${prefix}-fix-${n}`;
    }
    usedIds.add(result);
    return result;
  };
  let movedRefs = 0;
  const fixBucket = (id) => (bucketIds.has(id) ? id : (movedRefs++, data.buckets[0].id));
  const fixWallet = (id) => (walletIds.has(id) ? id : (movedRefs++, data.wallets[0].id));

  // --- expenses ---
  let badExpenses = 0;
  for (const e of asList(input.expenses)) {
    if (!isObject(e) || checkAmount(e.amount) || checkDate(e.date)) {
      badExpenses++;
      continue;
    }
    data.expenses.push({
      id: uniqueId(e.id, 'e'),
      amount: e.amount,
      bucketId: fixBucket(e.bucketId),
      walletId: fixWallet(e.walletId),
      date: e.date,
      note: cleanNote(e.note),
      createdAt: Number.isFinite(e.createdAt) ? e.createdAt : 0, // only used to sort entries of the same day
    });
  }
  if (badExpenses) problems.push(`${badExpenses} pengeluaran tidak valid dilewati.`);

  // --- recurring bills ---
  let badRecurring = 0;
  for (const r of asList(input.recurring)) {
    if (!isObject(r) || checkName(r.name) || checkAmount(r.amount)) {
      badRecurring++;
      continue;
    }
    data.recurring.push({
      id: uniqueId(r.id, 'r'),
      name: cleanName(r.name),
      amount: r.amount,
      bucketId: fixBucket(r.bucketId),
      walletId: fixWallet(r.walletId),
      startDate: validDateOrNull(r.startDate) || `${MIN_YEAR}-01-01`,
      endDate: validDateOrNull(r.endDate),
    });
  }
  if (badRecurring) problems.push(`${badRecurring} pengeluaran rutin tidak valid dilewati.`);
  if (movedRefs) problems.push(`${movedRefs} catatan menunjuk ke pos/dompet yang tidak ada, jadi dipindahkan ke "${data.buckets[0].name}"/"${data.wallets[0].name}".`);

  // --- special income per period ---
  let badOverrides = 0;
  if (isObject(input.incomeOverrides)) {
    for (const [start, amount] of Object.entries(input.incomeOverrides)) {
      if (!checkDate(start) && isWhole(amount, 0, MAX_AMOUNT)) data.incomeOverrides[start] = amount;
      else badOverrides++;
    }
  }
  if (badOverrides) problems.push(`${badOverrides} pemasukan khusus periode tidak valid dilewati.`);

  // --- savings entries ("Pindahkan sisa ke Tabungan") ---
  let badSavings = 0;
  for (const s of asList(input.savings)) {
    if (!isObject(s) || checkDate(s.periodStart) || checkDate(s.date) || checkAmount(s.amount)) {
      badSavings++;
      continue;
    }
    data.savings.push({ id: uniqueId(s.id, 's'), periodStart: s.periodStart, amount: s.amount, date: s.date });
  }
  if (badSavings) problems.push(`${badSavings} catatan tabungan tidak valid dilewati.`);

  // --- remembered choices (only if they still exist) ---
  data.settings.lastBucketId = bucketIds.has(settings.lastBucketId) ? settings.lastBucketId : null;
  data.settings.lastWalletId = walletIds.has(settings.lastWalletId) ? settings.lastWalletId : null;

  return { data, problems };
}

/* -------------------------------- backups -------------------------------- */

/** Wrap the data in a backup object (this is what gets saved as the .json file). */
export function makeBackup(data, appVersion, exportedAt) {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, appVersion, exportedAt, data };
}

/**
 * Read the text of a backup file.
 * Returns { ok: true, data, problems, exportedAt } or { ok: false, error }.
 */
export function readBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'File kosong.' };
  if (text.length > 20_000_000) return { ok: false, error: 'File terlalu besar untuk sebuah cadangan.' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File tidak bisa dibaca. Pilih file cadangan (.json) yang dibuat oleh Uang Bulanan.' };
  }
  if (!isObject(parsed) || parsed.app !== APP_ID || !isObject(parsed.data)) {
    return { ok: false, error: 'File ini bukan cadangan Uang Bulanan.' };
  }
  if (Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Cadangan ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi dulu, lalu coba lagi.' };
  }
  const { data, problems } = normalizeData(parsed.data);
  return { ok: true, data, problems, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '' };
}
