import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { config, DAY_NAMES } from './config.js';
import { db } from './db.js';
import { calendar, dayAvailability, isBookable, isWithinHorizon } from './slots.js';
import { rateLimit } from './rate-limit.js';
import { addDays, isoWithOffset, isValidDate, isValidTime, to12Hour, todayISO, weekday } from './time.js';
import { cleanName, cleanNote, makeReference, normalizePhone } from './validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.set('trust proxy', 1); // Railway terminates TLS in front of us
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ---------------------------------------------------------------- queries */

const insertBooking = db.prepare(`
  INSERT INTO bookings (reference, date, time, name, phone, note, price, currency)
  VALUES (@reference, @date, @time, @name, @phone, @note, @price, @currency)
`);
const findByReference = db.prepare(`SELECT * FROM bookings WHERE reference = ?`);
const cancelByReference = db.prepare(
  `UPDATE bookings SET status = 'cancelled' WHERE reference = ? AND status = 'confirmed'`
);
const countUpcomingForPhone = db.prepare(`
  SELECT COUNT(*) AS total FROM bookings
  WHERE phone = ? AND status = 'confirmed' AND date >= ?
`);
const listUpcoming = db.prepare(`
  SELECT * FROM bookings
  WHERE date >= ? AND status = 'confirmed'
  ORDER BY date ASC, time ASC
`);

const publicView = (row) => ({
  reference: row.reference,
  date: row.date,
  day: DAY_NAMES[weekday(row.date)],
  time: row.time,
  timeLabel: to12Hour(row.time),
  startsAt: isoWithOffset(row.date, row.time),
  endsAt: isoWithOffset(row.date, row.time, config.booking.slotMinutes),
  name: row.name,
  phone: row.phone,
  note: row.note,
  price: row.price,
  currency: row.currency,
  status: row.status
});

/* -------------------------------------------------------------- public API */

app.get('/api/config', (req, res) => {
  res.json({
    shop: config.shop,
    price: config.price,
    timezone: config.timezone,
    slotMinutes: config.booking.slotMinutes,
    horizonDays: config.booking.horizonDays,
    today: todayISO(),
    hours: DAY_NAMES.map((day, index) => ({
      day,
      ...(config.hours[index] ? config.hours[index] : { closed: true })
    }))
  });
});

app.get('/api/calendar', (req, res) => {
  res.json({ today: todayISO(), days: calendar() });
});

app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Use a date shaped like YYYY-MM-DD.' });
  if (!isWithinHorizon(date)) {
    return res.status(400).json({
      error: `Bookings open from today up to ${addDays(todayISO(), config.booking.horizonDays - 1)}.`
    });
  }
  return res.json(dayAvailability(date));
});

app.get('/api/products', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ products: Array.isArray(parsed.products) ? parsed.products : [] });
  } catch {
    res.json({ products: [] });
  }
});

app.post('/api/bookings', rateLimit({ windowMs: 10 * 60 * 1000, max: 12 }), (req, res) => {
  const { date, time } = req.body || {};
  const name = cleanName(req.body?.name);
  const phone = normalizePhone(req.body?.phone);
  const note = cleanNote(req.body?.note);

  if (!isValidDate(date) || !isValidTime(time)) {
    return res.status(400).json({ error: 'Pick a day and a time first.' });
  }
  if (!name) return res.status(400).json({ error: 'Tell us the name for the chair.' });
  if (!phone) return res.status(400).json({ error: 'That phone number does not look right. Example: 07723163869' });

  const problem = isBookable(date, time);
  if (problem) return res.status(400).json({ error: problem });

  const { total } = countUpcomingForPhone.get(phone, todayISO());
  if (total >= config.booking.maxPerPhone) {
    return res.status(409).json({
      error: `This number already holds ${total} upcoming appointments. Cancel one first, or call the shop.`
    });
  }

  const booking = {
    reference: makeReference(),
    date,
    time,
    name,
    phone,
    note,
    price: String(config.price.amount),
    currency: config.price.currency
  };

  try {
    insertBooking.run(booking);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      // Two people tapped the same slot within the same second.
      return res.status(409).json({
        error: 'That slot was taken a moment ago. Choose another time.',
        availability: dayAvailability(date)
      });
    }
    throw error;
  }

  return res.status(201).json({ booking: publicView(findByReference.get(booking.reference)) });
});

app.get('/api/bookings/:reference', (req, res) => {
  const row = findByReference.get(String(req.params.reference).toUpperCase());
  if (!row) return res.status(404).json({ error: 'No booking with that reference.' });
  return res.json({ booking: publicView(row) });
});

app.delete('/api/bookings/:reference', rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), (req, res) => {
  const reference = String(req.params.reference).toUpperCase();
  const row = findByReference.get(reference);
  if (!row) return res.status(404).json({ error: 'No booking with that reference.' });
  if (row.status !== 'confirmed') return res.status(409).json({ error: 'That booking is already cancelled.' });

  cancelByReference.run(reference);
  return res.json({ booking: publicView(findByReference.get(reference)) });
});

/* --------------------------------------------------------- owner dashboard */

function requireAdmin(req, res, next) {
  if (!config.adminKey) {
    return res.status(503).json({ error: 'The dashboard is off. Set ADMIN_KEY to switch it on.' });
  }
  const provided = req.get('x-admin-key') || req.query.key || '';
  if (provided !== config.adminKey) return res.status(401).json({ error: 'Wrong key.' });
  return next();
}

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const from = isValidDate(req.query.from) ? req.query.from : todayISO();
  res.json({ from, bookings: listUpcoming.all(from).map(publicView) });
});

app.post('/api/admin/bookings/:reference/cancel', requireAdmin, (req, res) => {
  const reference = String(req.params.reference).toUpperCase();
  const result = cancelByReference.run(reference);
  if (!result.changes) return res.status(404).json({ error: 'Nothing to cancel.' });
  res.json({ booking: publicView(findByReference.get(reference)) });
});

/* ------------------------------------------------------------------ static */

app.get('/healthz', (req, res) => res.json({ ok: true, today: todayISO() }));

app.use(express.static(path.join(root, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
  setHeaders(res, filePath) {
    // Pages must never be stale; the assets beside them can sit in the cache.
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  }
}));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Unknown endpoint.' });
  return res.status(404).sendFile(path.join(root, 'public', '404.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Something broke on our side. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`${config.shop.name} running on :${port} (${config.timezone})`);
});
