// Small timezone helpers. The shop runs on Baghdad time no matter where the
// server is, so every "today" and "is this in the past" question goes through
// here rather than through the host clock.

import { config } from './config.js';

const TZ = config.timezone;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function zonedParts(instant = new Date()) {
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) {
    if (type !== 'literal') parts[type] = value;
  }
  return parts;
}

/** Today in the shop's timezone, as YYYY-MM-DD. */
export function todayISO(instant = new Date()) {
  const { year, month, day } = zonedParts(instant);
  return `${year}-${month}-${day}`;
}

/** The current wall-clock time in the shop's timezone, in minutes from midnight. */
export function nowMinutes(instant = new Date()) {
  const { hour, minute } = zonedParts(instant);
  return Number(hour) * 60 + Number(minute);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/** Day of week for a YYYY-MM-DD string: 0 = Sunday. */
export function weekday(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateISO, count) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + count));
  return shifted.toISOString().slice(0, 10);
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toClock(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** 14:30 -> "2:30 PM". Kept server-side so e-mails and the UI never disagree. */
export function to12Hour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Minutes east of UTC at that local moment (Baghdad has sat on +03:00 since 2015). */
export function offsetMinutes(dateISO, hhmm = '12:00') {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  const p = zonedParts(new Date(guess));
  const back = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return (back - guess) / 60000;
}

/**
 * A full timestamp for a slot, e.g. "2026-09-20T14:30:00+03:00", so the browser
 * and the calendar file agree on the instant without shipping a timezone table.
 */
export function isoWithOffset(dateISO, hhmm, addMinutes = 0) {
  const offset = offsetMinutes(dateISO, hhmm);
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mi] = hhmm.split(':').map(Number);
  const wall = new Date(Date.UTC(y, m - 1, d, hh, mi + addMinutes));
  const pad = (n) => String(n).padStart(2, '0');
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${wall.toISOString().slice(0, 19)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
