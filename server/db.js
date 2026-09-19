import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const file = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'salon.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    reference  TEXT    NOT NULL UNIQUE,
    date       TEXT    NOT NULL,
    time       TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    phone      TEXT    NOT NULL,
    note       TEXT    NOT NULL DEFAULT '',
    price      TEXT    NOT NULL,
    currency   TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'confirmed',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- One chair: a confirmed booking owns its slot outright. Cancelled rows stay
  -- for the owner's history, so the guard only covers live ones.
  CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_taken
    ON bookings (date, time) WHERE status = 'confirmed';

  CREATE INDEX IF NOT EXISTS bookings_by_date ON bookings (date);
  CREATE INDEX IF NOT EXISTS bookings_by_phone ON bookings (phone);
`);

export const SLOT_TAKEN = 'SQLITE_CONSTRAINT_UNIQUE';
