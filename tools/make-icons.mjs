// -----------------------------------------------------------------------------
// make-icons.mjs — draws the app icons and saves them as PNG files in /icons.
// Pure Node.js, no extra packages. Run it with:  npm run icons
//
// Design: a teal rounded square with a white "Rp" drawn with smooth lines.
// The shapes are described with "distance functions", which gives clean,
// anti-aliased edges at every size.
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

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance to an arc of a circle between two angles (radians, y pointing down). */
function distanceToArc(px, py, cx, cy, r, from, to) {
  const angle = Math.atan2(py - cy, px - cx);
  if (angle >= from && angle <= to) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  const d1 = Math.hypot(px - (cx + r * Math.cos(from)), py - (cy + r * Math.sin(from)));
  const d2 = Math.hypot(px - (cx + r * Math.cos(to)), py - (cy + r * Math.sin(to)));
  return Math.min(d1, d2);
}

/** Signed distance to a rounded square covering the whole 0..100 grid. */
function roundedSquare(px, py, radius) {
  const qx = Math.abs(px - 50) - (50 - radius);
  const qy = Math.abs(py - 50) - (50 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Signed distance to the white "Rp" mark (centerlines + stroke). */
function rpMark(px, py, stroke) {
  const x = px + 1.5; // small shift so the mark looks centered
  const y = py + 3;
  const lines = [
    distanceToSegment(x, y, 24, 30, 24, 70), // R: stem
    distanceToSegment(x, y, 24, 30, 35, 30), // R: top of bowl
    distanceToArc(x, y, 35, 40, 10, -Math.PI / 2, Math.PI / 2), // R: bowl
    distanceToSegment(x, y, 35, 50, 24, 50), // R: bottom of bowl
    distanceToSegment(x, y, 33, 50, 45, 70), // R: leg
    distanceToSegment(x, y, 55, 46, 55, 84), // p: stem
    Math.abs(Math.hypot(x - 67, y - 58) - 12), // p: bowl
  ];
  return Math.min(...lines) - stroke / 2;
}

/* -------------------------------- drawing -------------------------------- */

const TOP_LEFT = [22, 166, 150];
const BOTTOM_RIGHT = [11, 94, 87];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * size       – pixels
 * rounded    – true: transparent rounded corners; false: full square (iPhone / maskable)
 * markScale  – how big the "Rp" is (maskable icons need extra margin)
 * stroke     – line thickness on the 0..100 grid
 */
function drawIcon({ size, rounded, markScale, stroke }) {
  const pixels = new Uint8Array(size * size * 4);
  const unit = 100 / size; // one pixel, measured on the 0..100 grid
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const gx = ((i + 0.5) / size) * 100;
      const gy = ((j + 0.5) / size) * 100;
      const background = rounded ? clamp01(0.5 - roundedSquare(gx, gy, 22) / unit) : 1;
      // The mark is drawn on a grid scaled around the center.
      const mx = 50 + (gx - 50) / markScale;
      const my = 50 + (gy - 50) / markScale;
      const mark = clamp01(0.5 - rpMark(mx, my, stroke) / (unit / markScale));
      const t = clamp01((gx + gy) / 200);
      const k = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) {
        const base = TOP_LEFT[c] + (BOTTOM_RIGHT[c] - TOP_LEFT[c]) * t;
        pixels[k + c] = Math.round(base + (255 - base) * mark);
      }
      pixels[k + 3] = Math.round(255 * background);
    }
  }
  return pixels;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, markScale: 1, stroke: 9, alpha: true },
  { file: 'icon-512.png', size: 512, rounded: true, markScale: 1, stroke: 9, alpha: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, markScale: 0.78, stroke: 9, alpha: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, markScale: 0.92, stroke: 9, alpha: false },
  { file: 'favicon-32.png', size: 32, rounded: true, markScale: 1.05, stroke: 11, alpha: true },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const icon of ICONS) {
  const pixels = drawIcon(icon);
  writeFileSync(join(OUT_DIR, icon.file), encodePng(icon.size, icon.size, pixels, icon.alpha));
  console.log(`icons/${icon.file}  ${icon.size}×${icon.size}`);
}
