# System Architecture — DTC Browser

## Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Application                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────┐                                │
│  │ Main Process           │ (Node.js, Electron APIs)      │
│  │ src/main/index.ts      │                                │
│  │                        │                                │
│  │ • BrowserWindow mgmt   │                                │
│  │ • App lifecycle        │                                │
│  │ • IPC handlers         │                                │
│  │ • Services (Phase 02+) │                                │
│  │   - DB layer           │                                │
│  │   - Camoufox spawn     │                                │
│  │   - Profile CRUD       │                                │
│  └────────────┬───────────┘                                │
│               │ IPC                                         │
│               │                                             │
│  ┌────────────▼───────────────────────────────────────┐   │
│  │ Preload (Sandboxed)                                │   │
│  │ src/preload/index.ts                               │   │
│  │ • contextBridge.exposeInMainWorld('electronAPI')   │   │
│  │ • Safe IPC relay                                   │   │
│  │ • Event listener wrapping                          │   │
│  └────────────┬───────────────────────────────────────┘   │
│               │ contextBridge / ipcRenderer.invoke()      │
│               │                                             │
│  ┌────────────▼───────────────────────────────────────┐   │
│  │ Renderer (Chromium, no Node access)                │   │
│  │ src/renderer/src/                                  │   │
│  │ • React App (App.tsx → main.tsx)                   │   │
│  │ • window.electronAPI.<feature>() calls             │   │
│  │ • UI state, user interaction                       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Process Roles

| Process | Runtime | Privileges | Responsibilities |
|---------|---------|-----------|------------------|
| **Main** | Node.js | Full OS | App lifecycle, services, IPC dispatch, database |
| **Preload** | V8 (isolated) | ipcRenderer only | API gateway, IPC marshalling, listener cleanup |
| **Renderer** | Chromium | Limited (no Node) | UI rendering, user input, state management |

---

## Data Flow: Profile CRUD Sequence

Example: Create a new profile from UI

```
Renderer (React)
  │
  ├─> user clicks "Create Profile"
  │
  ├─> calls: window.electronAPI.profiles.create(profileData)
  │
  └─> returns Promise
       │
       ├─ Preload (ipcRenderer)
       │  ├─> validates channel (profiles:create ✓)
       │  ├─> calls: ipcRenderer.invoke('profiles:create', data)
       │  └─> returns Promise
       │      │
       │      └─ Main (IPC Handler)
       │         ├─> event handler: ipcMain.handle('profiles:create', async (event, data) => {...})
       │         ├─> calls: profileService.create(data)
       │         │   ├─> validates input
       │         │   ├─> inserts to SQLite (Phase 02)
       │         │   └─> returns Profile object
       │         ├─> casts to Profile type
       │         └─> returns Promise<Profile>
       │
       └─ Renderer
          ├─> receives Profile object
          ├─> updates local state (React)
          └─> re-renders UI
```

---

## Module Dependencies (Phase 01 → 02)

### Phase 01: Stubs Only
```
src/main/ipc-handlers.ts
├─ imports (none yet)
└─ exports registerIpcHandlers()
   └─ All handlers return placeholder: [], {}, void
```

### Phase 02: Database & Services
```
src/main/ipc-handlers.ts
├─ imports:
│  ├─ profileService from ./services/profile-service.ts
│  ├─ groupService from ./services/group-service.ts
│  ├─ proxyService from ./services/proxy-service.ts
│  └─ db from ./db/index.ts
├─ ipcMain.handle('profiles:*', profileService.*)
├─ ipcMain.handle('groups:*', groupService.*)
└─ ipcMain.handle('proxies:*', proxyService.*)

src/main/db/index.ts (new)
├─ imports: better-sqlite3
├─ db.open() → initialized SQLite connection
├─ db.migrate() → run schema from ./migrations/
└─ exports: db singleton

src/main/services/ (new)
├─ profile-service.ts
│  ├─ ProfileService class
│  ├─ CRUD methods: list, get, create, update, delete, bulkDelete
│  └─ depends: db
├─ group-service.ts
│  ├─ GroupService class
│  ├─ CRUD methods: list, create, update, delete
│  └─ depends: db
└─ proxy-service.ts
   ├─ ProxyService class
   ├─ CRUD + test methods
   └─ depends: db
```

### Phase 03: Camoufox Integration
```
src/main/ipc-handlers.ts
├─ imports: browserService from ./services/browser-service.ts

src/main/services/browser-service.ts (new)
├─ BrowserService class
├─ Methods: start(profileId), stop(profileId), status(profileId)
├─ Spawns camoufox child process
├─ Manages WebSocket connection (debug protocol)
└─ emits: browser:status-changed events to renderer
```

---

## Type Flow

**Shared Types** (`src/shared/types.ts`) — authoritative source:

```typescript
// Domain entities (single source of truth)
Profile, Group, Proxy, Session, Fingerprint, BrowserStatus

// Input types (prevent IDOR attacks)
CreateProfileInput    // Omits: id, created_at, updated_at
UpdateProfileInput    // Omits: id, created_at
CreateGroupInput      // name, color?
UpdateGroupInput      // name?, color? (all optional)
CreateProxyInput      // Omits: id, created_at
```

**Usage:**
- **Main process:** Uses shared types + adds DB-specific fields if needed
- **Renderer:** Uses shared types for API responses, CreateInput types for form data
- **Preload:** Passes types through unchanged (no transformation)

---

## Security Layers

| Layer | Mechanism | Prevents |
|-------|-----------|----------|
| **contextIsolation** | Preload in isolated context | Renderer accessing Node APIs directly |
| **nodeIntegration: false** | Disable require() in renderer | RCE via malicious JS injection |
| **ipcRenderer validation** | Whitelist valid channels | Renderer invoking arbitrary IPC handlers |
| **Input validation** | Service layer type checking | SQL injection, XSS, malformed data |
| **Type omission** | CreateInput excludes id/timestamps | IDOR (modifying created_at, assuming IDs) |

**Phase 01 Trade-off:**
- `sandbox: false` — Preload needs Node APIs (child_process) for Camoufox spawn
  - Acceptable: preload code is trusted (not user-provided)
  - Revisit after Phase 03 architecture finalized

---

## Build Output Structure

```
dtc-login/
├── out/                          # (npm run build output)
│   ├── main/
│   │   └── index.js              # Main process bundle (2.52kB)
│   ├── preload/
│   │   └── index.js              # Preload bundle (1.77kB)
│   └── renderer/
│       └── ...                   # React app bundle (214.79kB) + assets
│
├── dist/                         # (npm run package output)
│   └── DTC Browser Setup 0.1.0.exe | .dmg | .AppImage
```

---

## Deployment Architecture

### Windows
- **Installer:** NSIS (electron-builder)
- **Auto-update:** electron-updater checks release endpoint
- **Resources:** `\camoufox\win32\` bundled in installer

### macOS
- **Installer:** DMG
- **Code signing:** Requires identity (Phase 07)
- **Notarization:** Deferred (Phase 07)
- **Resources:** `camoufox/darwin/` in app bundle

### Linux
- **Installer:** AppImage (single self-contained binary)
- **Resources:** `camoufox/linux/` in AppImage

---

## Development Workflow

1. **Run dev server:** `npm run dev`
   - Launches Electron app
   - Connects to Vite HMR server
   - Hot reload on renderer/main/preload changes

2. **Build production:** `npm run build`
   - Runs electron-vite build (bundles main/preload/renderer)
   - Output → `./out/`

3. **Package:** `npm run package`
   - Runs build
   - Runs electron-builder
   - Creates installer → `./dist/`

---

## Known Issues & Tech Debt

### npm audit (14 vulnerabilities)
- Source: electron-builder, eslint v8 (transitive deps)
- Impact: Development only (not runtime)
- Mitigation: Address before Phase 07 (production packaging)

### Camoufox Resource Bundling (Phase 03)
- Path: `resources/camoufox/{os}/{arch}/camoufox-binary`
- Must test on each platform early (Phase 03)
- electron-builder extraResources filtering may need adjustment

### Sandbox Mode Trade-off
- Current: `sandbox: false` for preload Node access
- Issue: Preload has elevated privileges
- Mitigation: Only trusted code in preload; revisit after Phase 03

---

## Next Architecture Changes

**Phase 02:** Add SQLite layer
- New: `src/main/db/` (schema, migrations, queries)
- New: `src/main/services/` (Profile, Group, Proxy services)
- Modified: `src/main/ipc-handlers.ts` (replace stubs)

**Phase 03:** Camoufox integration
- New: `src/main/services/browser-service.ts` (process management)
- New: Event system: main → renderer (`browser:status-changed`)
- Modified: `src/preload/index.ts` (add browser event listeners)

**Phase 04:** React UI
- New: `src/renderer/src/pages/`, `components/`, `hooks/`
- Modified: `src/renderer/src/App.tsx` (real UI)
