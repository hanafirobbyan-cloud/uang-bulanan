// -----------------------------------------------------------------------------
// clock.js — "today" as a 'YYYY-MM-DD' date in Indonesia (Asia/Jakarta),
// no matter what time zone the phone or laptop is set to.
// This is the only place that reads the real clock.
// -----------------------------------------------------------------------------

import { toDateStr } from './logic.js';

export const TIME_ZONE = 'Asia/Jakarta';

let formatter = null;
try {
  formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
} catch {
  formatter = null; // very old browser without time zone support: fall back to the device clock
}

function nowParts(now = new Date()) {
  if (formatter) {
    const parts = {};
    for (const part of formatter.formatToParts(now)) parts[part.type] = part.value;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
}

/** Today's date in Jakarta, e.g. '2026-10-25'. */
export function todayStr(now) {
  const p = nowParts(now);
  return toDateStr(p.year, p.month, p.day);
}

/** Current date and time in Jakarta, e.g. '2026-10-25 14:30' (used in backup files). */
export function nowStamp(now) {
  const p = nowParts(now);
  return `${toDateStr(p.year, p.month, p.day)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** The time in Jakarta with seconds, e.g. '14:30:05' (the clock in the status bar). */
export function nowTime(now) {
  const p = nowParts(now);
  return [p.hour, p.minute, p.second].map((n) => String(n).padStart(2, '0')).join(':');
}
