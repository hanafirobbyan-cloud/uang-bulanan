// -----------------------------------------------------------------------------
// chart.js — the "ARUS KAS" chart: money in hand across the days of the
// period, drawn as a step line (steps up on installment days, down when a bill
// is due, and slopes down with spending). Solid up to today, dashed for the
// projection. Plain inline SVG, no library. The numbers come from
// cashFlow() in logic.js.
// -----------------------------------------------------------------------------

import { h } from './ui.js';
import { card, keyed, money } from './components.js';
import { cashFlow } from './logic.js';
import { formatCompact, formatDateShort, formatRupiah } from './format.js';
import { play, reducedMotion } from './motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 340; // drawing size in SVG units; the chart scales to the panel width
const H = 150;
const PAD = { top: 16, right: 6, bottom: 20, left: 40 }; // the left gutter holds the amounts

function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== null) el.textContent = text;
  return el;
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * The chart panel. `animate`: draw the line in once (when the screen opens).
 */
export function cashFlowChart(data, today, { animate = false } = {}) {
  const flow = cashFlow(data, today);
  const days = flow.days;
  const n = days.length;
  const values = days.flatMap((d) => [d.start, d.end]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i) => round(PAD.left + (i / n) * plotW);
  const y = (v) => round(PAD.top + ((max - v) / (max - min)) * plotH);
  const t = Math.min(n, Math.max(0, flow.todayIndex));

  // The step line as points: before the period 0, then per day a step at its start and a slope to its end.
  const points = [[x(0), y(0)]];
  days.forEach((d, i) => {
    points.push([x(i), y(d.start)], [x(i + 1), y(d.end)]);
  });
  const split = 2 + 2 * t; // up to and including the step at the start of today
  const solid = points.slice(0, split);
  const dashed = points.slice(split - 1);
  const path = (list) => list.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ');

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
  const last = days[n - 1];
  const now = t < n ? days[t] : last;
  chart.setAttribute(
    'aria-label',
    `Arus kas periode ini. Uang di tangan sekarang ${formatRupiah(now.end)} (perkiraan akhir hari ini). Perkiraan akhir periode ${formatRupiah(last.end)}.`,
  );

  // Grid: the zero line and the top value, with their amounts in the left gutter.
  const gutter = (value, className = '') => svg('text', { class: `chart-label${className}`, x: PAD.left - 4, y: y(value) + 3, 'text-anchor': 'end' }, formatCompact(value));
  chart.append(svg('line', { class: `chart-zero${min < 0 ? ' is-negative' : ''}`, x1: PAD.left, x2: W - PAD.right, y1: y(0), y2: y(0) }));
  chart.append(svg('line', { class: 'chart-grid', x1: PAD.left, x2: W - PAD.right, y1: y(max), y2: y(max) }));
  chart.append(gutter(max));
  if (y(0) - y(max) > 12) chart.append(gutter(0));
  if (min < 0 && y(min) - y(0) > 12) chart.append(gutter(min, ' is-negative'));

  // Installment days: a small ▲ on the bottom edge.
  days.forEach((d, i) => {
    if (d.arrived <= 0) return;
    const px = x(i);
    const base = H - PAD.bottom + 3;
    chart.append(svg('path', { class: 'chart-mark', d: `M${px} ${base} L${round(px + 4)} ${base + 7} L${round(px - 4)} ${base + 7} Z` }));
  });

  // Today.
  if (t < n) {
    chart.append(svg('line', { class: 'chart-today', x1: x(t), x2: x(t), y1: PAD.top - 6, y2: H - PAD.bottom }));
    const leftSide = t > n * 0.6;
    chart.append(svg('text', { class: 'chart-label is-today', x: leftSide ? x(t) - 3 : x(t) + 3, y: PAD.top - 6, 'text-anchor': leftSide ? 'end' : 'start' }, 'HARI INI'));
  }

  // The line itself.
  if (solid.length > 1) chart.append(svg('path', { class: 'chart-actual', d: path(solid) }));
  if (dashed.length > 1) chart.append(svg('path', { class: 'chart-proj', d: path(dashed) }));

  // Dates under the chart.
  chart.append(svg('text', { class: 'chart-label', x: PAD.left, y: H - 2, 'text-anchor': 'middle' }, formatDateShort(flow.period.start).toUpperCase()));
  chart.append(svg('text', { class: 'chart-label', x: W - PAD.right, y: H - 2, 'text-anchor': 'end' }, formatDateShort(flow.period.end).toUpperCase()));

  const wrap = h('div', { class: 'chart-wrap' }, chart);
  if (animate && !reducedMotion()) {
    // A cover that shrinks away to the right: the line seems to draw itself (transform only).
    const cover = h('div', { class: 'chart-cover', 'aria-hidden': 'true' });
    wrap.append(cover);
    play(cover, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 500, easing: 'linear', fill: 'forwards', channel: 'draw' }).then(() => cover.remove());
  }

  return keyed(
    card(
      'Arus kas',
      wrap,
      h(
        'div',
        { class: 'chart-legend', 'aria-hidden': 'true' },
        h('span', { class: 'legend-solid' }, 'Sudah terjadi'),
        h('span', { class: 'legend-dash' }, 'Perkiraan'),
        h('span', { class: 'legend-mark' }, '▲ Uang masuk'),
      ),
      h(
        'dl',
        { class: 'chart-stats' },
        h('div', null, h('dt', null, 'Akhir periode (perkiraan)'), h('dd', null, money(last.end))),
        h('div', null, h('dt', null, 'Titik terendah'), h('dd', null, money(Math.min(...days.map((d) => d.end))))),
      ),
      h('p', { class: 'hint' }, 'Perkiraan: kalau setiap hari kamu belanja sesuai jatah harian.'),
    ),
    'card:chart',
  );
}
