// Every text color must be easy to read on every background (WCAG 4.5 : 1).
// The same check runs on its own with:  npm run contrast
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContrast, contrast, readTokens } from '../tools/check-contrast.mjs';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'css', 'app.css'), 'utf8');

test('the contrast formula is right (known values)', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
  assert.equal(contrast('#ff9a1f', '#ff9a1f'), 1);
});

test('the theme is dark: black page, amber text, white key figures', () => {
  const tokens = readTokens(css);
  assert.equal(tokens['--bg'], '#000000');
  assert.equal(tokens['--amber'], '#ff9a1f');
  assert.equal(tokens['--white'], '#ffffff');
  assert.ok(!/prefers-color-scheme:\s*light/.test(css), 'no light mode');
});

test('every text/background pair reaches at least 4.5 : 1', () => {
  const results = checkContrast(css);
  assert.ok(results.length >= 30);
  for (const r of results) assert.ok(r.ok, `${r.text} on ${r.background}: ${r.ratio.toFixed(2)} : 1`);
});
