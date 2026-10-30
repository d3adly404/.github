/**
 * SQLite access layer built on Node's zero-dependency `node:sqlite` module.
 *
 * The database file is created and seeded on first boot, so a fresh clone
 * runs with no setup beyond `npm install && npm run dev`.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, unknown>;

type RunResult = { changes: number; lastInsertRowid: number };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS regions (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  capital TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facilities (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  region_id      TEXT NOT NULL REFERENCES regions(id),
  district       TEXT NOT NULL,
  town           TEXT NOT NULL,
  type           TEXT NOT NULL,
  ownership      TEXT NOT NULL,
  lat            REAL NOT NULL,
  lon            REAL NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL,
  last_report_at INTEGER NOT NULL,
  reported_by    TEXT
);

CREATE TABLE IF NOT EXISTS wards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 0,
  occupied    INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);
CREATE INDEX IF NOT EXISTS wards_facility_idx ON wards(facility_id);

CREATE TABLE IF NOT EXISTS ward_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_id  INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  occupied INTEGER NOT NULL,
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ward_history_idx ON ward_history(ward_id, ts);

CREATE TABLE IF NOT EXISTS facility_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL,
  capacity    INTEGER NOT NULL,
  occupied    INTEGER NOT NULL,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS facility_history_idx ON facility_history(facility_id, ts);

CREATE TABLE IF NOT EXISTS subscriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  token            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  channel          TEXT NOT NULL,
  contact          TEXT NOT NULL,
  facility_id      TEXT,
  region_id        TEXT,
  ward_category    TEXT,
  notify_on        TEXT NOT NULL DEFAULT 'bed_freed,facility_full',
  threshold        INTEGER NOT NULL DEFAULT 90,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  active           INTEGER NOT NULL DEFAULT 1,
  verified         INTEGER NOT NULL DEFAULT 0,
  push_subscription TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_facility_idx ON subscriptions(facility_id);

CREATE TABLE IF NOT EXISTS notification_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER,
  channel         TEXT NOT NULL,
  provider        TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'info',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  facility_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  error           TEXT,
  meta            TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_created_idx ON notification_log(created_at DESC);

CREATE TABLE IF NOT EXISTS alert_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL,
  ward_id     INTEGER,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  notified    INTEGER NOT NULL DEFAULT 0,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_events_idx ON alert_events(ts DESC);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL,
  facility_id   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  detail TEXT NOT NULL,
  ts     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __ghanabedDb?: DatabaseSync };

function dbFile(): string {
  const raw = process.env.DB_PATH ?? "./data/bedtracker.sqlite";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function getDb(): DatabaseSync {
  if (g.__ghanabedDb) return g.__ghanabedDb;
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  g.__ghanabedDb = db;

  const force = (process.env.DB_SEED ?? "true").toLowerCase() === "force";
  if (force) {
    // Wipe runtime tables so the demo restarts from a known state.
    db.exec(`DELETE FROM ward_history; DELETE FROM facility_history;
             DELETE FROM notification_log; DELETE FROM alert_events;
             DELETE FROM audit_log; DELETE FROM sessions; DELETE FROM wards;
             DELETE FROM facilities; DELETE FROM regions; DELETE FROM users;`);
  }

  const rows = db.prepare("SELECT COUNT(*) AS n FROM facilities").get() as { n: number };
  if (Number(rows.n) === 0) {
    // Lazy import keeps the (large) seed dataset out of the request path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("./seed").seedDatabase(db);
  }
  return db;
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): RunResult {
  const res = getDb().prepare(sql).run(...(params as never[])) as unknown as {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function setState(key: string, value: string): void {
  run(
    `INSERT INTO app_state(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export function getState(key: string): string | undefined {
  const row = get<{ value: string }>("SELECT value FROM app_state WHERE key = ?", [key]);
  return row?.value;
}

export function logAudit(actor: string, action: string, entity: string, detail: string): void {
  run("INSERT INTO audit_log(actor, action, entity, detail, ts) VALUES(?,?,?,?,?)", [
    actor,
    action,
    entity,
    detail,
    Date.now(),
  ]);
}
