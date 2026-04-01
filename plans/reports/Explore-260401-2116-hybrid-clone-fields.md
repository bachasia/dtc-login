# Exploration: Hybrid Clone Fields for Profile Creation/Update

**DateTime:** 2026-04-01 21:16 ICT  
**Branch:** main  
**Status:** Complete  
**Scope:** Backend profile/fingerprint schema, IPC handlers, database write paths

---

## Executive Summary

The DTC Browser backend is ready for Hybrid clone functionality. Profile cloning (copy with selective field override) requires:

1. **No schema migration** — all necessary columns exist
2. **Minimal IPC changes** — add `profiles:clone` handler with validation
3. **Service layer addition** — `profileService.clone(sourceId, overrides)` method
4. **Backward compatibility** — fully preserved (additive only)

---

## 1. Relevant Files & Line References

### Core Profile Schema & Types

| File | Lines | Purpose |
|------|-------|---------|
| `src/shared/types.ts` | 3-26 | Profile, Fingerprint interfaces (shared types) |
| `src/shared/types.ts` | 62-65 | CreateProfileInput, UpdateProfileInput types |
| `src/main/db/database.ts` | 30-40 | profiles table schema (SQLite) |
| `src/main/db/database.ts` | 8-63 | Migration system (001-init) |

### Profile Service & IPC

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/services/profile-service.ts` | 27-124 | Profile CRUD operations |
| `src/main/services/profile-service.ts` | 47-67 | create() method (insert path) |
| `src/main/services/profile-service.ts` | 69-110 | update() method (write path) |
| `src/main/ipc-handlers.ts` | 66-74 | assertCreateProfile() validation |
| `src/main/ipc-handlers.ts` | 145-167 | profiles:* IPC handlers |

### Fingerprint Service

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/services/fingerprint-service.ts` | 10-41 | generateFingerprint() function |
| `src/main/ipc-handlers.ts` | 106-140 | assertFingerprintGenerateInput() validation |
| `src/main/ipc-handlers.ts` | 231-233 | fingerprints:generate IPC handler |

---

## 2. Current Schema Analysis

### profiles Table (SQLite)

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  group_id    TEXT REFERENCES groups(id),
  proxy_id    TEXT REFERENCES proxies(id),
  fingerprint TEXT NOT NULL DEFAULT '{}',
  notes       TEXT,
  tags        TEXT DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

**Stored Columns:** 9 total
- **Immutable (server-generated):** id, created_at
- **Cloneable:** name, group_id, proxy_id, fingerprint, notes, tags
- **Updated on write:** updated_at (auto via `unixepoch()`)

### Fingerprint Type (Shared)

```typescript
interface Fingerprint {
  os?: 'windows' | 'macos' | 'linux'
  osVersion?: string
  browser?: 'firefox'
  browserVersion?: string
  screenWidth?: number
  screenHeight?: number
  timezone?: string
  locale?: string
  userAgent?: string
  raw?: Record<string, unknown>
}
```

**Storage:** JSON string in `fingerprint` column (no separate table)

---

## 3. IPC Handler Validation Boundaries

### Current Validation Flow

```
Renderer (untrusted input)
  ↓
ipcMain.handle('profiles:create', (e, input) => {
  assertCreateProfile(input)  ← Validates: object, name required
  ↓
  profileService.create(input)  ← Accepts: Partial<Profile> + name
    ↓
    JSON.stringify(input.fingerprint ?? {})  ← Serializes to TEXT
    ↓
    INSERT INTO profiles (...)
})
```

### Validation Boundaries (ipc-handlers.ts)

| Handler | Input Validator | Validates | Rejects |
|---------|-----------------|-----------|---------|
| `profiles:create` | assertCreateProfile() | object, name non-empty | missing name, non-string |
| `profiles:update` | inline check | object type | non-object input |
| `fingerprints:generate` | assertFingerprintGenerateInput() | os array, locale string | invalid os values, locale >32 chars |

**Gap:** No validation of fingerprint object structure in create/update handlers — accepts any JSON-serializable object.

---

## 4. Profile Service Write Path

### create() Method (lines 47-67)

```typescript
create(input: CreateProfileInput): Profile {
  const db = getDb()
  const id = uuidv4()
  db.prepare(`
    INSERT INTO profiles (id, name, group_id, proxy_id, fingerprint, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.group_id ?? null,
    input.proxy_id ?? null,
    JSON.stringify(input.fingerprint ?? {}),  ← Serializes fingerprint
    input.notes ?? null,
    JSON.stringify(input.tags ?? [])
  )
  const created = this.getById(id)
  if (!created) throw new Error(`Profile ${id} not found after insert`)
  return created
}
```

**Key behaviors:**
- Generates new UUID for id
- Defaults: fingerprint={}, tags=[], notes=null, group_id=null, proxy_id=null
- Serializes fingerprint & tags to JSON strings
- Fetches & returns deserialized Profile object

### update() Method (lines 69-110)

```typescript
update(id: string, input: UpdateProfileInput): Profile {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  // Conditionally build SET clause for each field
  if (input.fingerprint !== undefined) {
    fields.push('fingerprint = ?')
    values.push(JSON.stringify(input.fingerprint))  ← Serializes
  }
  if (input.tags !== undefined) {
    fields.push('tags = ?')
    values.push(JSON.stringify(input.tags))
  }
  // ... other fields ...

  fields.push('updated_at = unixepoch()')  ← Auto-updates timestamp
  values.push(id)

  db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = this.getById(id)
  if (!updated) throw new Error(`Profile ${id} not found after update`)
  return updated
}
```

**Key behaviors:**
- Only updates fields present in input (partial update)
- Auto-sets updated_at to current Unix timestamp
- Serializes fingerprint & tags to JSON
- Fetches & returns deserialized Profile object

### deserialize() Helper (lines 19-25)

```typescript
function deserialize(row: ProfileRow): Profile {
  return {
    ...row,
    fingerprint: safeJsonParse(row.fingerprint, {}),  ← Parses JSON
    tags: safeJsonParse(row.tags, []),
  } as Profile
}
```

**Handles:** Malformed JSON gracefully (fallback to {} or [])

---

## 5. Which Fields Can Be Added Without Migration

**Answer: All new fields can be added as optional columns without migration.**

### Strategy for New Hybrid Clone Fields

If adding clone-related metadata (e.g., `cloned_from_id`, `clone_template`):

```sql
-- Option A: Add as nullable columns (no migration needed for existing rows)
ALTER TABLE profiles ADD COLUMN cloned_from_id TEXT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN clone_template TEXT;  -- e.g., 'facebook-vn', 'tiktok-shop'

-- Option B: Store in fingerprint.raw (no schema change)
fingerprint: {
  os: 'windows',
  ...,
  raw: {
    cloneSource: 'profile-uuid',
    cloneTemplate: 'facebook-vn'
  }
}
```

**Recommendation:** Option B (store in fingerprint.raw) — avoids schema migration, keeps clone metadata with fingerprint context.

---

## 6. Backward Compatibility & Minimal Strategy

### Current State (Phase 05)

- **Profiles table:** 9 columns, no clone-related fields
- **IPC handlers:** 6 profile handlers (list, get, create, update, delete, bulk-delete)
- **Service layer:** No clone method
- **Type system:** No clone input types

### Minimal Clone Implementation (Additive Only)

#### Step 1: Add Type (src/shared/types.ts)

```typescript
export type CloneProfileInput = {
  sourceId: string
  name: string
  overrides?: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
}
```

**Impact:** Zero — new type, no existing code affected.

#### Step 2: Add Service Method (src/main/services/profile-service.ts)

```typescript
clone(sourceId: string, input: CloneProfileInput): Profile {
  const source = this.getById(sourceId)
  if (!source) throw new Error(`Source profile ${sourceId} not found`)
  
  const merged = {
    name: input.name,
    group_id: input.overrides?.group_id ?? source.group_id,
    proxy_id: input.overrides?.proxy_id ?? source.proxy_id,
    fingerprint: input.overrides?.fingerprint ?? source.fingerprint,
    notes: input.overrides?.notes ?? source.notes,
    tags: input.overrides?.tags ?? source.tags,
  }
  
  return this.create(merged)
}
```

**Impact:** Zero — new method, no existing code affected.

#### Step 3: Add IPC Handler (src/main/ipc-handlers.ts)

```typescript
ipcMain.handle('profiles:clone', (_e, sourceId: unknown, input: unknown) => {
  const id = assertString(sourceId, 'sourceId')
  if (!input || typeof input !== 'object')
    throw new Error('clone input must be an object')
  const o = input as Record<string, unknown>
  assertString(o['name'], 'name')
  return profileService.clone(id, {
    sourceId: id,
    name: o['name'] as string,
    overrides: o['overrides'] as Record<string, unknown> | undefined,
  })
})
```

**Impact:** Zero — new handler, no existing handlers modified.

### Backward Compatibility Guarantees

| Aspect | Status | Reason |
|--------|--------|--------|
| **Existing profiles** | ✓ Unaffected | No schema changes, no column deletions |
| **Existing IPC handlers** | ✓ Unaffected | New handler only, no modifications |
| **Database queries** | ✓ Unaffected | SELECT * still works, new columns optional |
| **Type system** | ✓ Unaffected | New types only, existing types unchanged |
| **Serialization** | ✓ Unaffected | JSON.stringify() handles new fields transparently |
| **Deserialization** | ✓ Unaffected | safeJsonParse() gracefully handles missing fields |

---

## 7. Risks & Mitigation

### Risk 1: Fingerprint Validation Gap

**Issue:** IPC handlers accept any JSON-serializable object as fingerprint, no schema validation.

**Current behavior:**
```typescript
// This is accepted (no validation):
ipcMain.handle('profiles:create', (_e, input) => {
  profileService.create({
    name: 'test',
    fingerprint: { invalid: 'field', foo: 123 }  ← No validation
  })
})
```

**Mitigation:**
- Add optional fingerprint validator in ipc-handlers.ts
- Or: Accept as-is (fingerprint.raw already allows arbitrary fields)
- **Recommendation:** Accept as-is — fingerprint.raw is designed for extensibility

### Risk 2: Clone Circular References

**Issue:** If clone allows `overrides.fingerprint` to reference source profile, could create circular dependency.

**Mitigation:**
- Clone method fetches source, merges overrides, creates new profile
- No circular reference possible (new profile has new id)
- **Status:** Safe by design

### Risk 3: Concurrent Clone Requests

**Issue:** Multiple clone requests for same source could race.

**Mitigation:**
- Each clone generates new UUID independently
- SQLite transactions (via better-sqlite3) ensure atomicity
- **Status:** Safe by design

### Risk 4: Large Fingerprint.raw Objects

**Issue:** fingerprint.raw can grow unbounded, SQLite TEXT column has no size limit.

**Mitigation:**
- Document max fingerprint size (e.g., 1MB)
- Or: Add validation in assertCreateProfile()
- **Recommendation:** Document, defer validation to Phase 07

---

## 8. Implementation Checklist for Hybrid Clone

### Phase 06 (VN Features & Polish) — Recommended

- [ ] Add `CloneProfileInput` type to src/shared/types.ts
- [ ] Add `profileService.clone()` method to src/main/services/profile-service.ts
- [ ] Add `profiles:clone` IPC handler to src/main/ipc-handlers.ts
- [ ] Add validation for clone input (sourceId exists, name non-empty)
- [ ] Add `useCloneProfile()` hook to src/renderer/src/hooks/use-ipc.ts
- [ ] Add "Clone Profile" context menu item to ProfileTable
- [ ] Add CloneProfileDialog component (name input + override picker)
- [ ] Test: Clone profile with default fingerprint
- [ ] Test: Clone profile with custom fingerprint override
- [ ] Test: Clone profile with partial overrides (name + proxy only)

### No Migration Required

- ✓ profiles table schema unchanged
- ✓ Existing profiles unaffected
- ✓ Existing IPC handlers unaffected

---

## 9. Unresolved Questions

1. **Clone UI/UX:** Should clone dialog show fingerprint diff vs source? (Defer to Phase 06 design)
2. **Clone templates:** Should clone support template presets (e.g., "Facebook VN")? (Covered in Phase 06 profile templates)
3. **Bulk clone:** Should support cloning multiple profiles at once? (Defer to Phase 06 bulk operations)
4. **Clone history:** Should track clone lineage (cloned_from_id)? (Defer to Phase 07 analytics)

---

## Summary

**Schema:** Ready — no migration needed  
**IPC:** Ready — add one handler  
**Service:** Ready — add one method  
**Backward compatibility:** 100% preserved  
**Risk level:** Low (additive only)  
**Effort:** ~2-3 hours (implementation + testing)

