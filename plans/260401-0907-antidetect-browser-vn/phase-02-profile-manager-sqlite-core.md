# Phase 02: Profile Manager & SQLite Core

## Overview
- **Priority:** P1 (Critical)
- **Status:** complete
- **Depends on:** Phase 01
- **Timeline:** Month 1, Week 3-4 (~25h)

## Goal
Implement SQLite-based profile storage với better-sqlite3. CRUD profiles, groups, proxies. Expose qua IPC đến renderer.

---

## Key Insights

- `better-sqlite3` là synchronous — không cần async/await, simpler code trong main process
- Mỗi profile cần `id` (UUID) để làm tên thư mục Firefox profile data — không dùng auto-increment int
- `fingerprint` column lưu JSON string — parse khi đọc, stringify khi ghi
- Migrations pattern từ đầu — dù chỉ có 1 migration bây giờ, cần pattern để thêm sau
- Group/proxy là optional per profile — nullable foreign keys

---

## Database Schema

```sql
-- migrations/001-init.sql

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
  password   TEXT,  -- TODO Phase 07: encrypt at rest
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  group_id    TEXT REFERENCES groups(id) ON DELETE SET NULL,
  proxy_id    TEXT REFERENCES proxies(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL DEFAULT '{}',  -- JSON: OS, browser, screen, timezone, locale
  notes       TEXT,
  tags        TEXT DEFAULT '[]',           -- JSON array of strings
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  profile_id  TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  pid         INTEGER,          -- Camoufox process PID
  debug_port  INTEGER,          -- CDP debug port
  ws_endpoint TEXT,             -- ws://127.0.0.1:PORT/devtools/browser/...
  started_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('api_enabled', 'false'),
  ('api_key', ''),
  ('api_port', '50325'),
  ('theme', 'dark'),
  ('language', 'vi');
```

---

## Implementation Steps

### 1. Install dependencies

```bash
npm install better-sqlite3 uuid
npm install -D @types/better-sqlite3 @types/uuid
```

### 2. `src/main/db/database.ts`

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'dtc-browser.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')  // Better concurrent read performance
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    ran_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)

  const migrations = [
    { name: '001-init', file: join(__dirname, 'migrations/001-init.sql') },
  ]

  for (const m of migrations) {
    const already = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(m.name)
    if (!already) {
      const sql = readFileSync(m.file, 'utf8')
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(m.name)
    }
  }
}
```

### 3. `src/main/services/profile-service.ts`

```typescript
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import type { Profile, CreateProfileInput, UpdateProfileInput } from '../../shared/types'

export const profileService = {
  list(groupId?: string): Profile[] {
    const db = getDb()
    const sql = groupId
      ? 'SELECT * FROM profiles WHERE group_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM profiles ORDER BY created_at DESC'
    const rows = groupId
      ? db.prepare(sql).all(groupId)
      : db.prepare(sql).all()
    return rows.map(deserialize)
  },

  getById(id: string): Profile | null {
    const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id)
    return row ? deserialize(row) : null
  },

  create(input: CreateProfileInput): Profile {
    const db = getDb()
    const id = input.id ?? uuidv4()
    db.prepare(`
      INSERT INTO profiles (id, name, group_id, proxy_id, fingerprint, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.group_id ?? null,
      input.proxy_id ?? null,
      JSON.stringify(input.fingerprint ?? {}),
      input.notes ?? null,
      JSON.stringify(input.tags ?? []),
    )
    return this.getById(id)!
  },

  update(id: string, input: UpdateProfileInput): Profile {
    const db = getDb()
    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name) }
    if (input.group_id !== undefined) { fields.push('group_id = ?'); values.push(input.group_id) }
    if (input.proxy_id !== undefined) { fields.push('proxy_id = ?'); values.push(input.proxy_id) }
    if (input.fingerprint !== undefined) { fields.push('fingerprint = ?'); values.push(JSON.stringify(input.fingerprint)) }
    if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes) }
    if (input.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(input.tags)) }

    if (fields.length === 0) return this.getById(id)!

    fields.push('updated_at = unixepoch()')
    values.push(id)

    db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.getById(id)!
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id)
  },

  bulkDelete(ids: string[]): void {
    const db = getDb()
    const del = db.prepare('DELETE FROM profiles WHERE id = ?')
    const txn = db.transaction((ids: string[]) => ids.forEach(id => del.run(id)))
    txn(ids)
  },
}

function deserialize(row: Record<string, unknown>): Profile {
  return {
    ...row,
    fingerprint: JSON.parse(row.fingerprint as string ?? '{}'),
    tags: JSON.parse(row.tags as string ?? '[]'),
  } as Profile
}
```

### 4. `src/shared/types.ts`

```typescript
// Core domain types shared between main and renderer

export interface Fingerprint {
  os?: 'windows' | 'macos' | 'linux'
  osVersion?: string
  browser?: 'firefox'
  browserVersion?: string
  screenWidth?: number
  screenHeight?: number
  timezone?: string
  locale?: string
  userAgent?: string
  // Raw fingerprint data from @apify/fingerprint-generator
  raw?: Record<string, unknown>
}

export interface Profile {
  id: string
  name: string
  group_id: string | null
  proxy_id: string | null
  fingerprint: Fingerprint
  notes: string | null
  tags: string[]
  created_at: number
  updated_at: number
}

export interface Group {
  id: string
  name: string
  color: string
  created_at: number
}

export interface Proxy {
  id: string
  name: string | null
  type: 'http' | 'https' | 'socks4' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
  created_at: number
}

export interface Session {
  profile_id: string
  pid: number | null
  debug_port: number | null
  ws_endpoint: string | null
  started_at: number
}

export type CreateProfileInput = Partial<Profile> & { name: string }
export type UpdateProfileInput = Partial<Omit<Profile, 'id' | 'created_at'>>
```

### 5. IPC Handlers — register in `ipc-handlers.ts`

```typescript
import { ipcMain } from 'electron'
import { profileService } from './services/profile-service'
import { groupService } from './services/group-service'
import { proxyService } from './services/proxy-service'

export function registerIpcHandlers(): void {
  // --- Profiles ---
  ipcMain.handle('profiles:list', (_e, groupId?: string) =>
    profileService.list(groupId))

  ipcMain.handle('profiles:get', (_e, id: string) =>
    profileService.getById(id))

  ipcMain.handle('profiles:create', (_e, input) =>
    profileService.create(input))

  ipcMain.handle('profiles:update', (_e, id: string, input) =>
    profileService.update(id, input))

  ipcMain.handle('profiles:delete', (_e, id: string) =>
    profileService.delete(id))

  ipcMain.handle('profiles:bulk-delete', (_e, ids: string[]) =>
    profileService.bulkDelete(ids))

  // --- Groups ---
  ipcMain.handle('groups:list', () => groupService.list())
  ipcMain.handle('groups:create', (_e, input) => groupService.create(input))
  ipcMain.handle('groups:update', (_e, id, input) => groupService.update(id, input))
  ipcMain.handle('groups:delete', (_e, id) => groupService.delete(id))

  // --- Proxies ---
  ipcMain.handle('proxies:list', () => proxyService.list())
  ipcMain.handle('proxies:create', (_e, input) => proxyService.create(input))
  ipcMain.handle('proxies:test', (_e, id: string) => proxyService.test(id))
  ipcMain.handle('proxies:delete', (_e, id) => proxyService.delete(id))
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/db/database.ts` | create | DB init, migrations runner |
| `src/main/db/migrations/001-init.sql` | create | Schema DDL |
| `src/main/services/profile-service.ts` | create | Profile CRUD |
| `src/main/services/group-service.ts` | create | Group CRUD |
| `src/main/services/proxy-service.ts` | create | Proxy CRUD + test |
| `src/main/ipc-handlers.ts` | modify | Register handlers |
| `src/shared/types.ts` | modify | Add Profile/Group/Proxy/Session types |
| `src/preload/index.ts` | modify | Add groups/proxies to contextBridge |

---

## Todo

- [ ] `npm install better-sqlite3 uuid`
- [ ] Tạo `database.ts` với migrations runner
- [ ] Tạo `001-init.sql` với full schema
- [ ] Implement `profile-service.ts` (CRUD + deserialize)
- [ ] Implement `group-service.ts` (simpler CRUD)
- [ ] Implement `proxy-service.ts` (CRUD + test connection)
- [ ] Register tất cả IPC handlers trong `ipc-handlers.ts`
- [ ] Update `contextBridge` trong preload để expose groups, proxies
- [ ] Manual test: create/read/delete profile qua IPC

---

## Success Criteria

- Tạo profile → persist qua app restart
- Delete profile → cascade xóa session record
- List profiles → return đúng deserialized JSON fields
- SQLite file tạo tại `app.getPath('userData')/dtc-browser.db`
- No TypeScript errors

---

## Next Steps

→ Phase 03: Camoufox Browser Launcher
