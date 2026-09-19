import { config, DAY_NAMES } from './config.js';
import { db } from './db.js';
import { addDays, nowMinutes, toClock, toMinutes, to12Hour, todayISO, weekday } from './time.js';

const takenOnDate = db.prepare(
  `SELECT time FROM bookings WHERE date = ? AND status = 'confirmed'`
);
const takenInRange = db.prepare(
  `SELECT date, COUNT(*) AS taken FROM bookings
   WHERE status = 'confirmed' AND date BETWEEN ? AND ? GROUP BY date`
);

export function hoursFor(dateISO) {
  if (config.closedDates.includes(dateISO)) return null;
  return config.hours[weekday(dateISO)] || null;
}

/** Every slot the shop could sell on this date, open or not. */
export function slotTimes(dateISO) {
  const hours = hoursFor(dateISO);
  if (!hours) return [];
  const step = config.booking.slotMinutes;
  const times = [];
  for (let m = toMinutes(hours.open); m + step <= toMinutes(hours.close); m += step) {
    times.push(toClock(m));
  }
  return times;
}

export function isWithinHorizon(dateISO) {
  const first = todayISO();
  const last = addDays(first, config.booking.horizonDays - 1);
  return dateISO >= first && dateISO <= last;
}

/** A slot on today's date closes once it is too near to walk in for. */
function isTooLate(dateISO, time) {
  if (dateISO !== todayISO()) return false;
  return toMinutes(time) - nowMinutes() < config.booking.leadMinutes;
}

export function dayAvailability(dateISO) {
  const hours = hoursFor(dateISO);
  const day = DAY_NAMES[weekday(dateISO)];

  if (!hours) {
    return { date: dateISO, day, closed: true, hours: null, slots: [], openCount: 0 };
  }

  const taken = new Set(takenOnDate.all(dateISO).map((row) => row.time));
  const slots = slotTimes(dateISO).map((time) => ({
    time,
    label: to12Hour(time),
    available: !taken.has(time) && !isTooLate(dateISO, time)
  }));

  return {
    date: dateISO,
    day,
    closed: false,
    hours,
    slots,
    openCount: slots.filter((slot) => slot.available).length
  };
}

/** Lightweight summary used by the date rail, so it is one query for 14 days. */
export function calendar(days = config.booking.horizonDays) {
  const first = todayISO();
  const last = addDays(first, days - 1);
  const takenByDate = new Map(takenInRange.all(first, last).map((row) => [row.date, row.taken]));

  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(first, offset);
    const times = slotTimes(date);
    const closed = times.length === 0;
    const sellable = times.filter((time) => !isTooLate(date, time)).length;
    const openCount = Math.max(0, sellable - (takenByDate.get(date) || 0));

    return {
      date,
      day: DAY_NAMES[weekday(date)],
      dayShort: DAY_NAMES[weekday(date)].slice(0, 3),
      dayOfMonth: Number(date.slice(8, 10)),
      month: date.slice(5, 7),
      closed,
      openCount,
      isToday: offset === 0
    };
  });
}

export function isBookable(dateISO, time) {
  if (!isWithinHorizon(dateISO)) return 'That date is outside the booking window.';
  if (!slotTimes(dateISO).includes(time)) return 'The shop is closed at that time.';
  if (isTooLate(dateISO, time)) return 'That time has already passed. Pick a later slot.';
  return null;
}
