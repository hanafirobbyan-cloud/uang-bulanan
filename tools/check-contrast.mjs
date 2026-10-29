// -----------------------------------------------------------------------------
// check-contrast.mjs — checks that every text color is easy to read on every
// background color of the app (WCAG contrast ratio of at least 4.5 : 1).
// It reads the color variables straight from css/app.css.
//
// Run it with:  npm run contrast    (it also runs as part of `npm test`)
// It prints a table and stops with an error if any pair is below 4.5.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

export const MIN_RATIO = 4.5;

/** Text colors × background colors that appear together in the app. */
export const TEXT_TOKENS = ['--amber', '--amber-bright', '--amber-dim', '--white', '--green', '--red', '--yellow', '--cyan'];
export const BACKGROUND_TOKENS = ['--bg', '--panel', '--raised'];
/** Black text on solid color blocks: primary keys, GO, delete, tags, the selected row. */
export const SOLID_BLOCKS = ['--amber', '--amber-bright', '--green', '--red', '--yellow', '--cyan'];

/** The color variables of the first :root { … } block, e.g. { '--amber': '#ff9a1f' }. */
export function readTokens(css) {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (!block) throw new Error('No :root block found in the CSS.');
  const tokens = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) tokens[name] = value.toLowerCase();
  return tokens;
}

/** Relative luminance of a #rrggbb color (WCAG 2). */
export function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio between two colors, from 1 (same) to 21 (black on white). */
export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every pair with its ratio: [{ text, background, ratio, ok }]. */
export function checkContrast(css) {
  const tokens = readTokens(css);
  const need = (name) => {
    if (!tokens[name]) throw new Error(`Color ${name} is missing in :root.`);
    return tokens[name];
  };
  const pairs = [];
  for (const text of TEXT_TOKENS) for (const background of BACKGROUND_TOKENS) pairs.push([text, background]);
  for (const block of SOLID_BLOCKS) pairs.push(['--on-color', block]);
  return pairs.map(([text, background]) => {
    const ratio = contrast(need(text), need(background));
    return { text, background, ratio, ok: ratio >= MIN_RATIO };
  });
}

// When run directly (not imported by a test): print the table and set the exit code.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'css', 'app.css'), 'utf8');
  const results = checkContrast(css);
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.ratio.toFixed(2).padStart(5)} : 1   ${r.text.padEnd(15)} on ${r.background}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} pair(s) below ${MIN_RATIO}:1` : `\nAll ${results.length} pairs reach at least ${MIN_RATIO}:1.`);
  process.exitCode = failed.length ? 1 : 0;
}
