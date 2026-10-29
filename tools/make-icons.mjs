// -----------------------------------------------------------------------------
// make-icons.mjs — draws the app icons and saves them as PNG files in /icons.
// Pure Node.js, no extra packages. Run it with:  npm run icons
//
// Design: a black square with an amber monospace "Rp_" (like a terminal
// prompt with a cursor). The shapes are described with "distance functions",
// which gives clean, anti-aliased edges at every size. No transparency, so
// iPhone and Android show it as it is.
// -----------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ------------------------------- PNG writer ------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** pixels: Uint8Array of RGBA values. withAlpha=false writes an RGB file (no transparency). */
function encodePng(width, height, pixels, withAlpha) {
  const channels = withAlpha ? 4 : 3;
  const raw = Buffer.alloc((width * channels + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = pixels[i];
      raw[o++] = pixels[i + 1];
      raw[o++] = pixels[i + 2];
      if (withAlpha) raw[o++] = pixels[i + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = withAlpha ? 6 : 2; // RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------- shapes (0..100 grid) --------------------------- */

/** Signed distance to an axis-aligned box (negative inside): square corners, like a terminal font. */
function box(px, py, x0, y0, x1, y1) {
  const qx = Math.max(x0 - px, px - x1);
  const qy = Math.max(y0 - py, py - y1);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** Distance to a straight line segment (for the diagonal leg of the R). */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed distance to the "Rp_" mark. `s` is the stroke thickness. */
function rpMark(px, py, s) {
  const x = px + 3; // small shift so the mark looks centered
  const y = py + 6;
  const h = s / 2;
  const parts = [
    // R
    box(x, y, 14, 28, 14 + s, 72), // stem
    box(x, y, 14, 28, 38, 28 + s), // top
    box(x, y, 38 - s, 28, 38, 50), // right side of the bowl
    box(x, y, 14, 50 - s, 38, 50), // middle
    Math.max(distanceToSegment(x, y, 26, 44, 40, 76) - h, y - 72, 50 - s - y), // leg, cut flat at top and bottom
    // p
    box(x, y, 46, 44, 46 + s, 86), // stem
    box(x, y, 46, 44, 68, 44 + s), // top of the bowl
    box(x, y, 68 - s, 44, 68, 70), // right of the bowl
    box(x, y, 46, 70 - s, 68, 70), // bottom of the bowl
    // _ (the cursor)
    box(x, y, 74, 64, 90, 72),
  ];
  return Math.min(...parts);
}

/* -------------------------------- drawing -------------------------------- */

const BACKGROUND = [0, 0, 0]; // #000000
const AMBER = [255, 154, 31]; // #FF9A1F
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * size       – pixels
 * markScale  – how big the mark is (maskable icons need extra margin)
 * stroke     – line thickness on the 0..100 grid
 */
function drawIcon({ size, markScale, stroke }) {
  const pixels = new Uint8Array(size * size * 4);
  const unit = 100 / size; // one pixel, measured on the 0..100 grid
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const gx = ((i + 0.5) / size) * 100;
      const gy = ((j + 0.5) / size) * 100;
      // The mark is drawn on a grid scaled around the center.
      const mx = 50 + (gx - 50) / markScale;
      const my = 50 + (gy - 50) / markScale;
      const mark = clamp01(0.5 - rpMark(mx, my, stroke) / (unit / markScale));
      const k = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) pixels[k + c] = Math.round(BACKGROUND[c] + (AMBER[c] - BACKGROUND[c]) * mark);
      pixels[k + 3] = 255;
    }
  }
  return pixels;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, markScale: 0.86, stroke: 7 },
  { file: 'icon-512.png', size: 512, markScale: 0.86, stroke: 7 },
  { file: 'icon-maskable-512.png', size: 512, markScale: 0.66, stroke: 7 },
  { file: 'apple-touch-icon.png', size: 180, markScale: 0.8, stroke: 7 },
  { file: 'favicon-32.png', size: 32, markScale: 1, stroke: 9 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const icon of ICONS) {
  const pixels = drawIcon(icon);
  writeFileSync(join(OUT_DIR, icon.file), encodePng(icon.size, icon.size, pixels, false));
  console.log(`icons/${icon.file}  ${icon.size}×${icon.size}`);
}
