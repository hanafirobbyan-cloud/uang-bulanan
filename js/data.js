// -----------------------------------------------------------------------------
// data.js — the shape of the saved data, the default values, input checks,
// and functions that repair data coming from storage or from a backup file.
// No DOM here, so it can be tested (see tests/data.test.js).
//
// Every check function returns an Indonesian error message, or '' when the
// value is fine.
//
// Data versions ("schemaVersion"):
//   1 – the first app version (old data may not have the number at all)
//   2 – adds "Rencana Cukup" plans (data.plans) and an optional due day on
//       recurring bills (recurring[].dueDay)
//   3 – money can arrive in installments ("Uang Masuk Bertahap"):
//       settings.incomeSchedule [{ id, day, amount }] (its sum = monthlyIncome),
//       settings.calcMode ('hati-hati' | 'total'), special incomes per period as
//       installments (incomeOverrides[start] = { installments: [{ id, date, amount }] })
//       and moved installments (incomeDelays[start] = { installmentId: date }).
//       settings.incomeDay is kept as a copy of the earliest installment day.
// When the shape changes again: bump SCHEMA_VERSION, add a step to migrate(),
// and add tests to tests/migration.test.js.
// -----------------------------------------------------------------------------

import { isValidDateStr, percentTotal, daysBetween, getPeriod, CALC_MODES, MAX_INSTALLMENTS } from './logic.js';
import { formatRupiah } from './format.js';

export const APP_ID = 'uang-bulanan';
export const SCHEMA_VERSION = 3; // bump this (and add a step to migrate()) if the data shape changes
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
      monthlyIncome: 0, // the monthly total = the sum of incomeSchedule
      incomeDay: 1, // copy of the earliest installment day (the day every period starts)
      incomeSchedule: [], // [{ id, day, amount }]: when the money arrives each month
      calcMode: 'hati-hati', // "Cara hitung": 'hati-hati' (only money that arrived) or 'total'
      setupDate: null, // 'YYYY-MM-DD' when setup was finished
      lastBackupDate: null, // 'YYYY-MM-DD' of the last export
      lastBucketId: null, // remembered for faster entry
      lastWalletId: null,
    },
    buckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
    wallets: DEFAULT_WALLETS.map((w) => ({ ...w })),
    expenses: [],
    recurring: [],
    incomeOverrides: {}, // special income for one period: { start: { installments: [{ id, date, amount }] } }
    incomeDelays: {}, // installments that came late: { start: { installmentId: 'YYYY-MM-DD' } }
    savings: [],
    plans: { active: null, history: [] }, // "Rencana Cukup": one active plan + finished ones
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

/* ------------------------------- versions ------------------------------- */

/** Which version of the data shape this is. Old data without a number is version 1. */
export function dataVersion(input) {
  return isObject(input) && Number.isInteger(input.schemaVersion) && input.schemaVersion > 0 ? input.schemaVersion : 1;
}

/**
 * Upgrade saved data (or the data inside a backup file) from an older shape to
 * the current one, one version at a time. It never changes the object it gets;
 * it returns a new one. Anything else that is wrong is fixed by normalizeData().
 */
export function migrate(input) {
  if (!isObject(input)) return input;
  const data = { ...input };
  let version = dataVersion(input);
  if (version < 2) {
    // Version 1 -> 2: add "Rencana Cukup" plans, and an empty due day on recurring bills.
    data.plans = { active: null, history: [] };
    data.recurring = asList(input.recurring).map((bill) => (isObject(bill) ? { ...bill, dueDay: null } : bill));
    version = 2;
  }
  if (version < 3) {
    // Version 2 -> 3: the one monthly amount becomes a schedule with a single
    // installment ("Sekaligus") on the same income day, so every number stays the
    // same. A special income for one period becomes one installment on that
    // period's first day. Recurring bills keep their due day (empty = the period's
    // first day, which is how version 2 counted them).
    if (isObject(input.settings)) {
      const settings = { ...input.settings };
      const day = isWhole(settings.incomeDay, 1, 31) ? settings.incomeDay : 1;
      settings.incomeSchedule = isWhole(settings.monthlyIncome, 1, MAX_AMOUNT) ? [{ id: 'i-1', day, amount: settings.monthlyIncome }] : [];
      settings.calcMode = 'hati-hati';
      data.settings = settings;
    }
    if (isObject(input.incomeOverrides)) {
      data.incomeOverrides = {};
      for (const [start, amount] of Object.entries(input.incomeOverrides)) {
        data.incomeOverrides[start] = isWhole(amount, 0, MAX_AMOUNT) ? { installments: amount > 0 ? [{ id: 'k-1', date: start, amount }] : [] } : amount;
      }
    }
    data.incomeDelays = {};
    version = 3;
  }
  // A future version 4 would continue here: if (version < 4) { ...; version = 4; }
  data.schemaVersion = version;
  return data;
}

const PLAN_PATTERNS = ['even', 'weekend'];
const PLAN_END_MODES = ['income', 'month', 'custom'];

/** Repair one stored plan. Returns { plan, droppedObligations } or null if it can't be used. */
function normalizePlan(p) {
  if (!isObject(p) || typeof p.id !== 'string' || !p.id) return null;
  if (checkDate(p.startDate) || checkDate(p.endDate) || p.endDate < p.startDate) return null;
  if (daysBetween(p.startDate, p.endDate) >= 366) return null; // longer than a year
  if (!isWhole(p.money, 0, MAX_AMOUNT)) return null;
  let droppedObligations = 0;
  const obligations = [];
  const ids = new Set();
  for (const o of asList(p.obligations)) {
    if (!isObject(o) || checkName(o.name) || checkAmount(o.amount) || checkDate(o.date)) {
      droppedObligations++;
      continue;
    }
    let id = typeof o.id === 'string' && o.id && !ids.has(o.id) ? o.id : '';
    for (let n = ids.size + 1; !id; n++) if (!ids.has(`o-fix-${n}`)) id = `o-fix-${n}`;
    ids.add(id);
    obligations.push({
      id,
      name: cleanName(o.name),
      amount: o.amount,
      date: o.date,
      paid: o.paid === true,
      fromRecurringId: typeof o.fromRecurringId === 'string' && o.fromRecurringId ? o.fromRecurringId : null,
    });
  }
  const plan = {
    id: p.id,
    startDate: p.startDate,
    endDate: p.endDate,
    endMode: PLAN_END_MODES.includes(p.endMode) ? p.endMode : 'custom',
    money: p.money,
    obligations,
    emergency: isWhole(p.emergency, 0, MAX_AMOUNT) ? p.emergency : 0,
    minDaily: isWhole(p.minDaily, 0, MAX_AMOUNT) ? p.minDaily : 0,
    pattern: PLAN_PATTERNS.includes(p.pattern) ? p.pattern : 'even',
    weekendWeight: isWhole(p.weekendWeight, 100, 300) && p.weekendWeight % 25 === 0 ? p.weekendWeight : 150,
    baselineIds: asList(p.baselineIds).filter((id) => typeof id === 'string'),
    createdOn: validDateOrNull(p.createdOn) || p.startDate,
  };
  return { plan, droppedObligations };
}

/** Repair one finished plan in the history. Returns the entry or null. */
function normalizePlanHistory(e) {
  if (!isObject(e) || typeof e.id !== 'string' || !e.id) return null;
  if (checkDate(e.startDate) || checkDate(e.endDate) || checkDate(e.endedOn)) return null;
  const numbers = ['days', 'money', 'obligationsTotal', 'emergency', 'spendable', 'spent', 'leftover'];
  if (!numbers.every((key) => Number.isSafeInteger(e[key]))) return null;
  return {
    id: e.id,
    startDate: e.startDate,
    endDate: e.endDate,
    endedOn: e.endedOn,
    endedEarly: e.endedEarly === true,
    days: e.days,
    money: e.money,
    obligationsTotal: e.obligationsTotal,
    emergency: e.emergency,
    spendable: e.spendable,
    spent: e.spent,
    leftover: e.leftover,
  };
}

/**
 * Repair the monthly income schedule into `settings` (which already holds a
 * checked monthlyIncome and incomeDay). Afterwards: 0–8 valid installments
 * sorted by day, monthlyIncome = their sum, incomeDay = the earliest day.
 */
function normalizeSchedule(raw, settings, problems) {
  const schedule = [];
  if (Array.isArray(raw)) {
    const ids = new Set();
    let bad = 0;
    for (const i of raw) {
      if (!isObject(i) || !isWhole(i.day, 1, 31) || !isWhole(i.amount, 1, MAX_AMOUNT) || schedule.length >= MAX_INSTALLMENTS) {
        bad++;
        continue;
      }
      let id = typeof i.id === 'string' && i.id && !ids.has(i.id) ? i.id : '';
      for (let n = ids.size + 1; !id; n++) if (!ids.has(`i-fix-${n}`)) id = `i-fix-${n}`;
      ids.add(id);
      schedule.push({ id, day: i.day, amount: i.amount });
    }
    if (bad) problems.push(`${bad} uang masuk di jadwal tidak valid dilewati. Periksa Jadwal Uang Masuk di Pengaturan.`);
  }
  if (!schedule.length && settings.monthlyIncome > 0) {
    // No (usable) schedule: everything arrives at once on the income day.
    schedule.push({ id: 'i-1', day: settings.incomeDay, amount: settings.monthlyIncome });
  }
  schedule.sort((a, b) => a.day - b.day);
  const total = schedule.reduce((sum, i) => sum + i.amount, 0);
  if (schedule.length && total !== settings.monthlyIncome) {
    if (total > MAX_AMOUNT) {
      problems.push('Jadwal uang masuk terlalu besar, jadi diganti satu kali uang masuk. Periksa di Pengaturan.');
      schedule.length = 0;
      if (settings.monthlyIncome > 0) schedule.push({ id: 'i-1', day: settings.incomeDay, amount: settings.monthlyIncome });
    } else {
      problems.push(`Total jadwal uang masuk tidak sama dengan uang bulanan, jadi uang bulanan disamakan menjadi ${formatRupiah(total)}. Periksa di Pengaturan.`);
      settings.monthlyIncome = total;
    }
  }
  settings.incomeSchedule = schedule;
  if (schedule.length) settings.incomeDay = schedule[0].day;
}

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

  input = migrate(input); // older data shapes are upgraded first

  data.setupDone = input.setupDone === true;

  // --- settings ---
  const settings = isObject(input.settings) ? input.settings : {};
  if (!isObject(input.settings)) problems.push('Pengaturan tidak ditemukan, jadi memakai pengaturan awal.');
  if (isWhole(settings.monthlyIncome, 0, MAX_AMOUNT)) data.settings.monthlyIncome = settings.monthlyIncome;
  else if (isObject(input.settings)) problems.push('Uang bulanan tidak valid, jadi diatur ke Rp 0. Periksa di Pengaturan.');
  const dayOk = isWhole(settings.incomeDay, 1, 31);
  if (dayOk) data.settings.incomeDay = settings.incomeDay;
  normalizeSchedule(settings.incomeSchedule, data.settings, problems); // also sets incomeDay to the earliest installment day
  if (!dayOk && isObject(input.settings)) problems.push(`Tanggal uang masuk tidak valid, jadi diatur ke tanggal ${data.settings.incomeDay}. Periksa di Pengaturan.`);
  data.settings.calcMode = CALC_MODES.includes(settings.calcMode) ? settings.calcMode : 'hati-hati';
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
      dueDay: isWhole(r.dueDay, 1, 31) ? r.dueDay : null, // optional: day of the month the bill is due
    });
  }
  if (badRecurring) problems.push(`${badRecurring} pengeluaran rutin tidak valid dilewati.`);
  if (movedRefs) problems.push(`${movedRefs} catatan menunjuk ke pos/dompet yang tidak ada, jadi dipindahkan ke "${data.buckets[0].name}"/"${data.wallets[0].name}".`);

  // --- special income per period (installments with dates inside that period) ---
  const startDay = data.settings.incomeDay;
  let badOverrides = 0;
  if (isObject(input.incomeOverrides)) {
    for (const [start, value] of Object.entries(input.incomeOverrides)) {
      const list = isObject(value) && Array.isArray(value.installments) ? value.installments : null;
      if (checkDate(start) || !list) {
        badOverrides++;
        continue;
      }
      const period = getPeriod(start, startDay);
      const ids = new Set();
      const installments = [];
      for (const i of list) {
        const ok = isObject(i) && !checkDate(i.date) && i.date >= period.start && i.date <= period.end && isWhole(i.amount, 1, MAX_AMOUNT);
        if (!ok || installments.length >= MAX_INSTALLMENTS) {
          badOverrides++;
          continue;
        }
        let id = typeof i.id === 'string' && i.id && !ids.has(i.id) ? i.id : '';
        for (let n = ids.size + 1; !id; n++) if (!ids.has(`k-fix-${n}`)) id = `k-fix-${n}`;
        ids.add(id);
        installments.push({ id, date: i.date, amount: i.amount });
      }
      // An empty list on purpose means "no money this period"; if every entry was broken, use the normal schedule.
      if (installments.length || list.length === 0) data.incomeOverrides[start] = { installments: installments.sort((a, b) => a.date.localeCompare(b.date)) };
    }
  }
  if (badOverrides) problems.push(`${badOverrides} pemasukan khusus periode tidak valid dilewati.`);

  // --- installments that came late ("Belum masuk, geser tanggal") ---
  let badDelays = 0;
  if (isObject(input.incomeDelays)) {
    for (const [start, delays] of Object.entries(input.incomeDelays)) {
      if (checkDate(start) || !isObject(delays)) {
        badDelays++;
        continue;
      }
      const kept = {};
      for (const [id, to] of Object.entries(delays)) {
        if (id && !checkDate(to)) kept[id] = to;
        else badDelays++;
      }
      if (Object.keys(kept).length) data.incomeDelays[start] = kept;
    }
  }
  if (badDelays) problems.push(`${badDelays} penundaan uang masuk tidak valid dilewati.`);

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

  // --- "Rencana Cukup" plans ---
  const plans = isObject(input.plans) ? input.plans : {};
  if (plans.active !== null && plans.active !== undefined) {
    const repaired = normalizePlan(plans.active);
    if (repaired) {
      data.plans.active = repaired.plan;
      if (repaired.droppedObligations) problems.push(`${repaired.droppedObligations} kewajiban di Rencana Cukup tidak valid dilewati.`);
    } else {
      problems.push('Rencana Cukup yang aktif rusak, jadi dihapus. Buat rencana baru kalau perlu.');
    }
  }
  let badHistory = 0;
  for (const entry of asList(plans.history)) {
    const repaired = normalizePlanHistory(entry);
    if (repaired) data.plans.history.push(repaired);
    else badHistory++;
  }
  if (badHistory) problems.push(`${badHistory} riwayat Rencana Cukup tidak valid dilewati.`);

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
  if ((Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) || dataVersion(parsed.data) > SCHEMA_VERSION) {
    return { ok: false, error: 'Cadangan ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi dulu, lalu coba lagi.' };
  }
  // Older backups (version 1) are upgraded automatically by normalizeData() -> migrate().
  const { data, problems } = normalizeData(parsed.data);
  return { ok: true, data, problems, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '' };
}
