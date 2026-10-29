// Tests for js/commands.js (the command line "> BER" and the function keys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, findCommand, suggestCommands, commandForKey, commandForRoute } from '../js/commands.js';

test('every requested command exists and opens the right screen or action', () => {
  const expected = {
    BER: 'beranda',
    KLR: 'pengeluaran',
    RTN: 'rutin',
    SIM: 'simulasi',
    RNC: 'rencana',
    RGK: 'ringkasan',
    MSK: 'masuk',
    ATR: 'pengaturan',
  };
  for (const [code, route] of Object.entries(expected)) assert.equal(findCommand(code).route, route, code);
  assert.equal(findCommand('CAD').action, 'cadangan');
  assert.equal(findCommand('LAIN').action, 'menu');
});

test('typing is forgiving: any case, spaces, a leading ">" or a trailing GO', () => {
  assert.equal(findCommand(' ber ').code, 'BER');
  assert.equal(findCommand('> klr').code, 'KLR');
  assert.equal(findCommand('msk <GO>').code, 'MSK');
  assert.equal(findCommand('rencana cukup').code, 'RNC');
});

test('unknown commands give null ("Perintah tidak dikenal")', () => {
  for (const text of ['', '   ', 'XYZ', 'BE', 'beranda!']) assert.equal(findCommand(text), null, text);
});

test('suggestions while typing: matching codes first, then names', () => {
  assert.deepEqual(suggestCommands('r').map((c) => c.code), ['RNC', 'RGK', 'RTN']); // one letter: codes only
  assert.deepEqual(suggestCommands('ma').map((c) => c.code), ['MSK']); // "Jadwal Uang MAsuk"
  assert.deepEqual(suggestCommands('peng').map((c) => c.code), ['KLR', 'ATR', 'RTN', 'CTT']); // words that start with "peng"
  assert.equal(suggestCommands('').length, COMMANDS.length);
  assert.deepEqual(suggestCommands('zzz'), []);
});

test('function keys F1–F8 and codes are unique', () => {
  assert.deepEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].map((k) => commandForKey(k).code), ['BER', 'KLR', 'RNC', 'MSK', 'LAIN', 'SIM', 'RGK', 'ATR']);
  assert.equal(commandForKey('F9'), null);
  assert.equal(new Set(COMMANDS.map((c) => c.code)).size, COMMANDS.length);
  assert.equal(commandForRoute('dompet').code, 'DMP');
});
