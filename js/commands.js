// -----------------------------------------------------------------------------
// commands.js — the short codes for the command line ("> BER" + Enter) and the
// function keys (F1–F8). No DOM here, so it can be tested
// (see tests/commands.test.js).
// -----------------------------------------------------------------------------

/**
 * Every command:
 *   code   – what you type (3–4 letters)
 *   name   – what it opens, in Indonesian
 *   route  – the screen it opens (#/route), or
 *   action – something it does: 'menu' (all screens), 'catat' (new expense), 'cadangan' (export a backup)
 *   key    – its function key, if it has one
 */
export const COMMANDS = [
  { code: 'BER', name: 'Beranda', route: 'beranda', key: 'F1' },
  { code: 'KLR', name: 'Pengeluaran', route: 'pengeluaran', key: 'F2' },
  { code: 'RNC', name: 'Rencana Cukup', route: 'rencana', key: 'F3' },
  { code: 'MSK', name: 'Jadwal Uang Masuk', route: 'masuk', key: 'F4' },
  { code: 'LAIN', name: 'Semua menu', action: 'menu', key: 'F5' },
  { code: 'SIM', name: 'Simulasi', route: 'simulasi', key: 'F6' },
  { code: 'RGK', name: 'Ringkasan', route: 'ringkasan', key: 'F7' },
  { code: 'ATR', name: 'Pengaturan', route: 'pengaturan', key: 'F8' },
  { code: 'RTN', name: 'Pengeluaran rutin', route: 'rutin' },
  { code: 'DMP', name: 'Dompet', route: 'dompet' },
  { code: 'POS', name: 'Pos anggaran', route: 'pos' },
  { code: 'CTT', name: 'Catat pengeluaran', action: 'catat' },
  { code: 'CAD', name: 'Ekspor cadangan', action: 'cadangan' },
];

const clean = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** The command for exactly what was typed (code or full name, any case), or null. */
export function findCommand(text) {
  const typed = clean(text).replace(/^>\s*/, '').replace(/\s*<?GO>?$/, '');
  if (!typed) return null;
  return COMMANDS.find((c) => c.code === typed || c.name.toUpperCase() === typed) || null;
}

/**
 * Suggestions while typing: codes that start with the text first, then (from
 * two letters on, or when no code matches) names with a word that starts with
 * it, e.g. "ma" → Jadwal Uang MAsuk. Empty text shows every command.
 */
export function suggestCommands(text) {
  const typed = clean(text).replace(/^>\s*/, '');
  if (!typed) return [...COMMANDS];
  const byCode = COMMANDS.filter((c) => c.code.startsWith(typed));
  if (typed.length < 2 && byCode.length) return byCode;
  const byName = COMMANDS.filter((c) => !byCode.includes(c) && c.name.toUpperCase().split(/\s+/).some((word) => word.startsWith(typed)));
  return [...byCode, ...byName];
}

/** The command of a function key ('F1'…'F8'), or null. */
export function commandForKey(key) {
  return COMMANDS.find((c) => c.key === key) || null;
}

/** The command that opens a screen, or null. */
export function commandForRoute(route) {
  return COMMANDS.find((c) => c.route === route) || null;
}
