# Code Review: Phase 02 — SQLite Core

**Date:** 2026-04-01
**Scope:** database.ts, profile-service.ts, group-service.ts, proxy-service.ts, ipc-handlers.ts
**LOC reviewed:** ~250

---

## Overall Assessment

Solid foundation. Parameterized queries throughout eliminates SQL injection risk. Schema design is correct with appropriate FK constraints and CHECK on proxy type. Two blocking issues need fixing before Phase 03 depends on this code; several lower-priority items below.

---

## Critical Issues (Blocking)

### C1 — `getDb()` is not thread-safe under Electron multi-window scenarios

**File:** `src/main/db/database.ts:5-73`

`db` is a module-level singleton initialized lazily with no lock. In an Electron app that opens multiple `BrowserWindow` instances (e.g., `app.on('activate')` creates a new window while one already exists), `registerIpcHandlers()` runs once but if any code path calls `getDb()` before the first call returns (async interleaving during `app.whenReady()`), two `new Database(dbPath)` calls could race.

Concrete scenario: `registerIpcHandlers()` is called synchronously in `app.whenReady().then()`. This is safe today because `createWindow()` is also synchronous. But if Phase 03 introduces any `async` IPC registration, the window opens, renderer invokes an IPC handler before `db` is set, and a second `getDb()` call starts initialization mid-flight.

**Fix:** Initialize `db` eagerly and synchronously before `registerIpcHandlers()`:

```ts
// In main/index.ts, before registerIpcHandlers():
import { getDb } from './db/database'
getDb() // warm up synchronously — safe because better-sqlite3 constructor is sync
```

This ensures the singleton is set before any IPC can fire.

---

### C2 — `profileService.update()` non-atomic read-after-write

**File:** `src/main/services/profile-service.ts:47-65`

`update()` runs `UPDATE ... WHERE id = ?` then immediately calls `this.getById(id)!` (a second `SELECT`). Because better-sqlite3 is synchronous and there is no concurrent writer in the main process today, this is safe — but the pattern is fragile:

1. If the `UPDATE` affects 0 rows (profile was deleted between the check at line 59 and the update), `getById` returns `null` and the `!` non-null assertion throws an uncaught `TypeError` at the IPC boundary. Electron surfaces this as an unhandled promise rejection with no useful message to the renderer.
2. Same issue in `profileService.create()` line 44 and `groupService.update()` line 40.

**Fix:** Check the return value of `getById` before asserting:

```ts
const updated = this.getById(id)
if (!updated) throw new Error(`Profile ${id} not found after update`)
return updated
```

Or use `RETURNING *` (SQLite 3.35+, which better-sqlite3 supports) to collapse update+fetch into one statement.

---

## High Priority

### H1 — IPC input arrives as `unknown` but is passed directly to services with no validation

**File:** `src/main/ipc-handlers.ts:11-14, 18-19, 23`

```ts
ipcMain.handle('profiles:create', (_e, input) => profileService.create(input))
```

`input` is typed `any` by ipcMain. The renderer calls this via `contextBridge` with `data: unknown`. TypeScript trusts `CreateProfileInput` at compile time, but at runtime the renderer can pass anything — wrong field types, missing `name`, extra prototype-polluting keys, objects with `__proto__` overrides, or `fingerprint` containing deeply nested JSON that blows up `JSON.stringify`.

Specific exploitable gaps:

- `input.name` is never checked to be a non-empty string; SQLite will accept `name = null` and `NOT NULL` will throw a DB error with a full stack trace returned to renderer.
- `input.port` (proxy) is never validated as a number in range 1–65535; passing a string or negative number inserts invalid data silently.
- `input.fingerprint` could be a circular reference, causing `JSON.stringify` to throw an uncaught `TypeError`.
- `ids` in `bulkDelete` is never validated as an array; passing a non-array crashes `list.forEach`.

**Recommended minimum:** Add a thin Zod schema (already likely in package.json given the project stack) or manual guard at the IPC boundary layer:

```ts
ipcMain.handle('profiles:create', (_e, input) => {
  if (!input || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Invalid input: name required')
  }
  return profileService.create(input)
})
```

---

### H2 — `proxy.test()` connects to attacker-controlled host/port

**File:** `src/main/services/proxy-service.ts:47`

`socket.connect(proxy.port, proxy.host, ...)` uses data stored in the DB (originated from renderer input). If an attacker can write a proxy record with `host = '169.254.169.254'` or `host = 'localhost'` and `port = 5432`, the main process will make outbound TCP connections to SSRF targets (cloud metadata endpoints, local services). This is especially relevant for Electron apps that might be extended with a REST API (the schema already has `api_enabled`).

Since proxy data comes from the local user, severity is lower than a web app, but is still a concern if the app accepts proxy records from any external source (config import, REST API in Phase 03).

**Fix:** At minimum, validate that `host` is a valid FQDN or IP (not loopback/link-local) before calling `socket.connect`, and that port is in range 1–65535.

---

### H3 — `groupService.create()` uses `last_insert_rowid()` without wrapping in a transaction

**File:** `src/main/services/group-service.ts:23`

```ts
db.prepare('INSERT INTO groups (name, color) VALUES (?, ?)').run(...)
const row = db.prepare('SELECT * FROM groups WHERE rowid = last_insert_rowid()').get() as Group
```

`last_insert_rowid()` returns the rowid from the **last insert on this connection**. Since better-sqlite3 uses a single connection and synchronous execution, this is currently safe — no other insert can interleave between the two statements. However, if the codebase evolves to run multiple prepared statements on the same connection in parallel (e.g., a future API layer), this becomes a TOCTOU race returning the wrong row.

The same pattern exists in `proxyService.create()` (line 29).

**Fix:** Wrap in a `db.transaction()` or, preferably, generate the ID in JS (as `profileService.create` already does with `uuidv4()`) and use `SELECT * FROM groups WHERE id = ?` for the read-back. This also eliminates the inconsistency between services — profiles use `uuidv4()` while groups/proxies rely on SQLite's `randomblob` default.

---

## Medium Priority

### M1 — Migration system lacks atomicity; failed migration leaves DB in partial state

**File:** `src/main/db/database.ts:76-89`

`database.exec(m.sql)` executes the entire migration as a single `exec` call. If the migration SQL contains multiple statements (as `001-init` does — 5 CREATE TABLE + 1 INSERT OR IGNORE), and one statement fails mid-way, the migration record is never written to `_migrations`, but some tables may already exist. On next startup, the migration re-runs, hitting `CREATE TABLE IF NOT EXISTS` on already-created tables (benign) but potentially re-inserting settings that were already modified by the user.

**Fix:** Wrap each migration in a transaction:

```ts
const runMigration = db.transaction(() => {
  db.exec(m.sql)
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(m.name)
})
runMigration()
```

---

### M2 — `deserialize()` uses `JSON.parse` with no error handling; corrupted DB rows crash the process

**File:** `src/main/services/profile-service.ts:7-13`

If `fingerprint` or `tags` columns contain non-JSON strings (direct DB edit, migration bug, import), `JSON.parse` throws. Since this runs synchronously in the IPC handler, it will propagate as an unhandled rejection and crash the renderer's pending call with no user-friendly message.

**Fix:**

```ts
function safeParse(val: string, fallback: unknown): unknown {
  try {
    return JSON.parse(val)
  } catch {
    return fallback
  }
}
```

---

### M3 — `updated_at = unixepoch()` field construction in `profileService.update()` is unsafe if field list is empty

**File:** `src/main/services/profile-service.ts:61`

`updated_at = unixepoch()` is pushed into `fields` unconditionally after the early-return guard. If `fields` is empty (no fields to update), the early return at line 59 fires before this — so the logic is correct today. But it's a latent trap: if the early-return guard is ever removed or reordered, `fields` would contain only `updated_at = unixepoch()` with no user-supplied fields, and `values` would have only `id` — producing a valid but semantically odd "touch" update. Low risk but worth a comment.

---

### M4 — `sandbox: false` in BrowserWindow with no documented mitigation

**File:** `src/main/index.ts:17`

`sandbox: false` is a significant security downgrade in Electron. The comment says "revisit after Phase 03 architecture is confirmed." This is acceptable for development but must be resolved before any distribution. Note this as a hard blocker for production packaging — if `child_process` access can be moved to the main process entirely (spawn Camoufox from main, communicate via IPC), sandbox can remain enabled.

---

## Low Priority

### L1 — `bulkDelete` uses per-row DELETEs inside a transaction instead of `WHERE id IN (?)`

**File:** `src/main/services/profile-service.ts:72-77`

Functionally correct, but for large arrays it generates N round-trips to the SQLite engine. For typical use (tens of profiles) this is negligible. If batch sizes can grow (bulk import), consider `DELETE FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`. The parameterized form is still injection-safe.

---

### L2 — `groupService.getById()` double-cast via `unknown` is fragile

**File:** `src/main/services/group-service.ts:12`

```ts
return (getDb()...get(id) as GroupRow | undefined) as Group | null
```

Two successive `as` casts with no runtime check. If the DB schema diverges from the `Group` type (e.g., a future migration adds/removes a column), this silently returns an incorrectly shaped object. Same pattern in `proxyService.getById()`. The `profileService` handles this better by going through `deserialize()`. Consider a lightweight row-to-domain mapper for groups and proxies too.

---

### L3 — No index on `profiles.group_id` for `list(groupId)` filter

**File:** `src/main/db/database.ts` schema

`SELECT * FROM profiles WHERE group_id = ?` will full-scan the `profiles` table. With a few hundred profiles this is unnoticeable. Add an index in the migration when profile count is expected to grow:

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
```

---

## Positive Observations

- All user-supplied values go through `?` placeholders — no string interpolation in query values, no SQL injection risk.
- `foreign_keys = ON` and `journal_mode = WAL` pragmas set correctly.
- `ON DELETE CASCADE` for sessions and `ON DELETE SET NULL` for profile FK refs are semantically appropriate.
- `contextIsolation: true` + `nodeIntegration: false` correctly hardened in preload.
- Channel allowlist in `preload/index.ts` `on()` is a good practice — prevents renderer from subscribing to arbitrary IPC events.
- `CreateProfileInput` comment about preventing IDOR is a good design note.
- `proxyService.test()` correctly destroys socket on all exit paths (connect, error, timeout) — no socket leak.

---

## Recommended Actions (Priority Order)

1. **[C2]** Replace `!` non-null assertions after `getById` in all three services with explicit error throws.
2. **[C1]** Eagerly initialize `getDb()` in `main/index.ts` before `registerIpcHandlers()`.
3. **[H1]** Add minimum input validation at IPC boundary — at least type-check `name`, `port`, and `ids` array.
4. **[M1]** Wrap each migration execution in a `db.transaction()` that also records the migration row.
5. **[H3]** Generate IDs in JS for groups/proxies (unify with profile pattern) to eliminate `last_insert_rowid()` dependency.
6. **[M2]** Wrap `JSON.parse` calls in `deserialize()` with try/catch.
7. **[H2]** Validate proxy `host`/`port` before TCP connect — block loopback and link-local ranges.
8. **[M4]** Track `sandbox: false` as a hard blocker for distribution packaging — document in Phase 03 task.

---

## Unresolved Questions

- Will the REST API (api_enabled setting) in a future phase accept proxy records from external callers? If yes, H2 severity upgrades to Critical.
- Is there a plan for DB backup/export? The `WAL` mode leaves a `-wal` file that must be checkpointed before backup — needs documentation.
- `CreateProxyInput` allows `updated_at` to be missing (proxies have no `updated_at` column) but the type is an `Omit` of `Proxy` — is there a plan to add `updated_at` to proxies in a later phase? If so, schema migration should be planned now.
