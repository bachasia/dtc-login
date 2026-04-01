# Code Standards — DTC Browser

## Language & Tooling

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js (main), Chromium (renderer)
- **Linter:** ESLint (electron-toolkit presets)
- **Formatter:** Prettier (80-char line length)
- **Type Checking:** `tsc --noEmit` before commit

```bash
npm run lint      # Check all .ts, .tsx, .js, .jsx
npm run format    # Auto-fix formatting
npx tsc --noEmit  # Type check
```

---

## File Structure & Naming

### Naming Conventions

| File Type            | Pattern                        | Example                                            |
| -------------------- | ------------------------------ | -------------------------------------------------- |
| **Service class**    | kebab-case.ts                  | `profile-service.ts`, `browser-service.ts`         |
| **Utility function** | kebab-case.ts                  | `format-fingerprint.ts`, `validate-proxy.ts`       |
| **Constants**        | CONSTANT_CASE                  | `const MAX_RETRIES = 3`                            |
| **React component**  | PascalCase.tsx                 | `ProfileCard.tsx`, `ProxyForm.tsx`                 |
| **Hook**             | camelCase.ts with `use` prefix | `useProfileList.ts`, `useBrowserStatus.ts`         |
| **Type**             | PascalCase                     | `interface Profile {}`, `type BrowserStatus = ...` |

### Directory Structure Rules

```
src/
├── main/
│   ├── index.ts                     # App entry, BrowserWindow setup
│   ├── ipc-handlers.ts              # IPC handler registration
│   ├── services/                    # Business logic
│   │   ├── profile-service.ts
│   │   ├── group-service.ts
│   │   ├── proxy-service.ts
│   │   └── browser-service.ts
│   └── db/                          # Database layer
│       ├── index.ts                 # SQLite connection & migration runner
│       └── migrations/              # SQL schema files
│
├── preload/
│   └── index.ts                     # contextBridge API definitions
│
├── renderer/
│   └── src/
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Root component
│       ├── pages/                   # Route-level components (Phase 04)
│       ├── components/              # Profile/Proxy UI components
│       ├── hooks/                   # Custom renderer hooks (use-ipc wrappers)
│       ├── stores/                  # Zustand stores managing selection/session
│       ├── types.ts                 # Renderer-specific types
│       └── index.css                # Global styles
│
└── shared/
    └── types.ts                     # Domain models (SSOT)
```

**Maximum file size:** 200 LOC before splitting (except config, type defs)

---

## TypeScript Standards

### Strict Mode (Required)

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true
  }
}
```

### Type Patterns

#### ✓ Good: Explicit types, avoid `any`

```typescript
// ✓ Shared domain type
import { Profile, CreateProfileInput } from '@shared/types'

export class ProfileService {
  create(input: CreateProfileInput): Promise<Profile> {
    // ...
  }
}
```

#### ✗ Avoid: Implicit `any`

```typescript
// ✗ Avoid
function createProfile(data: any): any {
  // ...
}

// ✗ Avoid
export const data = { ... }  // Type inferred, use explicit
```

#### ✓ Good: Union types for controlled variance

```typescript
type ProxyType = 'http' | 'https' | 'socks4' | 'socks5'

interface Proxy {
  type: ProxyType
}
```

#### ✓ Good: Omit/Pick for input types

```typescript
// Prevent IDOR: CreateInput excludes server-generated fields
type CreateProfileInput = Partial<
  Omit<Profile, 'id' | 'created_at' | 'updated_at'>
> & { name: string }

// Renderer cannot accidentally overwrite created_at
const profile: CreateProfileInput = {
  name: 'My Profile',
  // ✗ created_at: 123  ← TypeScript error
}
```

---

## Module Patterns

### Service Class Pattern

Services encapsulate business logic, called from IPC handlers.

```typescript
// src/main/services/profile-service.ts
import { Database } from 'better-sqlite3'
import { Profile, CreateProfileInput, UpdateProfileInput } from '@shared/types'

export class ProfileService {
  constructor(private db: Database) {}

  list(groupId?: string): Profile[] {
    const query = 'SELECT * FROM profiles WHERE group_id IS NULL'
    const stmt = groupId
      ? this.db.prepare('SELECT * FROM profiles WHERE group_id = ?')
      : this.db.prepare(query)
    return stmt.all(groupId) as Profile[]
  }

  get(id: string): Profile {
    const stmt = this.db.prepare('SELECT * FROM profiles WHERE id = ?')
    const profile = stmt.get(id) as Profile | undefined
    if (!profile) throw new Error(`Profile not found: ${id}`)
    return profile
  }

  create(input: CreateProfileInput): Profile {
    // Validate input
    if (!input.name?.trim()) throw new Error('Profile name required')

    const id = crypto.randomUUID()
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO profiles (id, name, group_id, proxy_id, fingerprint, notes, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.group_id ?? null,
      input.proxy_id ?? null,
      JSON.stringify(input.fingerprint ?? {}),
      input.notes ?? null,
      JSON.stringify(input.tags ?? []),
      now,
      now
    )

    return this.get(id)
  }

  update(id: string, input: UpdateProfileInput): Profile {
    const existing = this.get(id)
    const merged = {
      ...existing,
      ...input,
      id: existing.id,
      created_at: existing.created_at,
    }

    const stmt = this.db.prepare(`
      UPDATE profiles SET name = ?, group_id = ?, proxy_id = ?, fingerprint = ?, notes = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `)

    stmt.run(
      merged.name,
      merged.group_id,
      merged.proxy_id,
      JSON.stringify(merged.fingerprint),
      JSON.stringify(merged.tags),
      Date.now(),
      id
    )

    return this.get(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  }

  bulkDelete(ids: string[]): void {
    const placeholders = ids.map(() => '?').join(',')
    this.db
      .prepare(`DELETE FROM profiles WHERE id IN (${placeholders})`)
      .run(...ids)
  }
}
```

### IPC Handler Pattern

Handlers dispatch to services, keep logic thin.

```typescript
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron'
import { createProfileService } from './services/profile-service'
import { db } from './db'

const profileService = createProfileService(db)

export function registerIpcHandlers(): void {
  ipcMain.handle('profiles:list', async (_event, groupId?: string) => {
    try {
      return profileService.list(groupId)
    } catch (error) {
      console.error('[profiles:list]', error)
      throw error
    }
  })

  ipcMain.handle('profiles:create', async (_event, data) => {
    try {
      return profileService.create(data)
    } catch (error) {
      console.error('[profiles:create]', error)
      throw error
    }
  })

  // ... other handlers
}
```

### Preload Bridge Pattern

Preload validates channels, relays to ipcRenderer.

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const validChannels = {
  invoke: [
    'profiles:list',
    'profiles:get',
    'profiles:create',
    'profiles:update',
    'profiles:delete',
    'profiles:bulk-delete',
    'groups:list',
    'groups:create',
    'groups:update',
    'groups:delete',
    'proxies:list',
    'proxies:create',
    'proxies:test',
    'proxies:delete',
    'browser:start',
    'browser:stop',
    'browser:status',
  ],
  on: ['browser:status-changed', 'app:update-available'],
}

contextBridge.exposeInMainWorld('electronAPI', {
  profiles: {
    list: (groupId?: string) => ipcRenderer.invoke('profiles:list', groupId),
    get: (id: string) => ipcRenderer.invoke('profiles:get', id),
    create: (data: unknown) => ipcRenderer.invoke('profiles:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('profiles:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    bulkDelete: (ids: string[]) =>
      ipcRenderer.invoke('profiles:bulk-delete', ids),
  },
  // ... other API groups
  on: (channel: string, cb: (...args: unknown[]) => void): (() => void) => {
    if (!validChannels.on.includes(channel)) return () => void 0
    const listener = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ): void => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
```

---

## Error Handling

### Main Process

```typescript
// ✓ Async/await with try-catch
async function handleCreateProfile(data: unknown): Promise<Profile> {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid input: expected object')
    }
    return profileService.create(data as CreateProfileInput)
  } catch (error) {
    console.error('[profiles:create]', error)
    // Re-throw to send error to renderer
    throw error
  }
}

// ✓ Service validation before DB write
export class ProfileService {
  create(input: CreateProfileInput): Profile {
    // Validate first
    if (!input.name?.trim()) {
      throw new Error('Profile name is required')
    }
    if (input.name.length > 255) {
      throw new Error('Profile name too long (max 255 chars)')
    }
    // Then persist
    const stmt = this.db.prepare(/* ... */)
    stmt.run(/* ... */)
    return this.get(id)
  }
}
```

### Renderer

```typescript
// ✓ Handle IPC promise rejection
async function createProfile(data: CreateProfileInput): Promise<void> {
  try {
    const profile = await window.electronAPI.profiles.create(data)
    setProfiles([...profiles, profile])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    setError(`Failed to create profile: ${message}`)
  }
}
```

---

## Code Review Checklist

Before committing:

- [ ] TypeScript strict mode: `npx tsc --noEmit` passes
- [ ] ESLint: `npm run lint` passes (no errors)
- [ ] Prettier: `npm run format` applied
- [ ] No `any` types (except necessary escapes, document why)
- [ ] IPC handlers validate input
- [ ] Service methods have clear error messages
- [ ] Shared types reflect actual DB schema / API responses
- [ ] No hardcoded secrets, API keys, file paths
- [ ] File under 200 LOC (split if larger)
- [ ] Type-safe Omit/Pick for input types (no IDOR)
- [ ] Preload validates all IPC channels

---

## Common Patterns

### Creating a New Feature (Phase 02 example)

1. **Define types** → `src/shared/types.ts`

   ```typescript
   export interface MyEntity {
     /* ... */
   }
   export type CreateMyEntityInput = Omit<MyEntity, 'id' | 'created_at'>
   ```

2. **Create service** → `src/main/services/my-service.ts`

   ```typescript
   export class MyService {
     list(): MyEntity[] {
       /* ... */
     }
     create(input: CreateMyEntityInput): MyEntity {
       /* ... */
     }
   }
   ```

3. **Register IPC handlers** → `src/main/ipc-handlers.ts`

   ```typescript
   ipcMain.handle('my-entity:list', async () => myService.list())
   ipcMain.handle('my-entity:create', async (_event, data) =>
     myService.create(data)
   )
   ```

4. **Expose via preload** → `src/preload/index.ts`

   ```typescript
   contextBridge.exposeInMainWorld('electronAPI', {
     myEntity: {
       list: () => ipcRenderer.invoke('my-entity:list'),
       create: (data: unknown) => ipcRenderer.invoke('my-entity:create', data),
     },
   })
   ```

5. **Use in renderer** → `src/renderer/src/App.tsx` or component
   ```typescript
   const entities = await window.electronAPI.myEntity.list()
   ```

---

## Database Patterns (Phase 02+)

### Schema Definition

```sql
-- src/main/db/migrations/001-init.sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT,
  proxy_id TEXT,
  fingerprint TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL,
  FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL
);
```

### Query Patterns

```typescript
// ✓ Parameterized queries (prevents SQL injection)
const stmt = this.db.prepare('SELECT * FROM profiles WHERE id = ?')
const profile = stmt.get(id)

// ✗ Avoid string concatenation
const profile = this.db.exec(`SELECT * FROM profiles WHERE id = '${id}'`)
```

---

## Logging Standards

Use `console.log/error` for now (Phase 06+ may add logging service).

```typescript
// Main process
console.error('[profiles:create]', error) // Service level
console.log('[ipc:ready]', 'handlers registered') // App level

// Renderer
console.warn('[ProfileCard]', 'render failed', error)
```

---

## Security Standards

1. **Input validation:** All IPC inputs validated before use
2. **Type safety:** No `any` in security-critical paths
3. **IDOR prevention:** CreateInput/UpdateInput exclude server-generated fields
4. **SQL injection:** Always parameterized queries, never string concat
5. **XSS prevention:** React escapes by default; no `dangerouslySetInnerHTML`

---

## Related Docs

- `./system-architecture.md` — Data flow, process interactions
- `./codebase-summary.md` — Project structure overview
- `./project-overview-pdr.md` — Product requirements
