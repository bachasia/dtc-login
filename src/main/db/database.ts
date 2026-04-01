import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

// SQL inlined to avoid file-copy complexity with electron-vite bundling
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001-init',
    sql: `
CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS proxies (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name       TEXT,
  type       TEXT NOT NULL CHECK(type IN ('http','https','socks4','socks5')),
  host       TEXT NOT NULL,
  port       INTEGER NOT NULL,
  username   TEXT,
  password   TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  group_id    TEXT REFERENCES groups(id) ON DELETE SET NULL,
  proxy_id    TEXT REFERENCES proxies(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL DEFAULT '{}',
  notes       TEXT,
  tags        TEXT DEFAULT '[]',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  profile_id  TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  pid         INTEGER,
  debug_port  INTEGER,
  ws_endpoint TEXT,
  started_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('api_enabled', 'false'),
  ('api_key', ''),
  ('api_port', '50325'),
  ('theme', 'dark'),
  ('language', 'vi');
    `.trim(),
  },
]

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'dtc-browser.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

function runMigrations(database: Database.Database): void {
  database.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    ran_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  for (const m of MIGRATIONS) {
    const already = database.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(m.name)
    if (!already) {
      // Wrap each migration in a transaction so partial failures leave no inconsistent state
      database.transaction(() => {
        database.exec(m.sql)
        database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(m.name)
      })()
    }
  }
}
