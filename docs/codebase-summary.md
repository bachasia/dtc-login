# DTC Browser — Codebase Summary

**Project:** Antidetect browser for Vietnamese market  
**Phase:** 03 (Camoufox Browser Launcher) — COMPLETE  
**Tech Stack:** Electron 29 + React 18 + TypeScript 5 + electron-vite 2 + electron-builder 24

## Project Structure

```
dtc-login/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── index.ts            # BrowserWindow lifecycle, app entry (Phase 03: before-quit cleanup)
│   │   ├── ipc-handlers.ts      # IPC handler registry (Phase 02-03 implementations)
│   │   ├── utils/
│   │   │   ├── port-finder.ts   # Find free TCP port for debug protocol
│   │   │   └── camoufox-path.ts # Platform-specific binary path resolver
│   │   └── services/
│   │       ├── profile-service.ts
│   │       ├── browser-service.ts   # Camoufox spawn/stop/track (Phase 03)
│   │       ├── fingerprint-service.ts # Fingerprint generation (Phase 03)
│   │       └── proxy-service.ts
│   ├── preload/                 # Context bridge (runs in sandboxed process)
│   │   └── index.ts            # Exposes electronAPI to renderer
│   ├── renderer/                # React app (runs in BrowserWindow)
│   │   ├── src/
│   │   │   ├── App.tsx         # Root React component
│   │   │   ├── main.tsx        # React entry point
│   │   │   ├── index.css       # Base styling
│   │   │   └── env.d.ts        # Type declarations for Vite
│   │   └── index.html          # HTML template
│   └── shared/                  # Shared types (no Node/browser APIs)
│       └── types.ts            # Domain models: Profile, Group, Proxy, Session
├── resources/
│   └── camoufox/               # Browser binary placeholder (Phase 03)
├── electron.vite.config.ts      # Build config (main/preload/renderer separation)
├── electron-builder.yml         # Packaging config (Windows/macOS/Linux)
├── tsconfig.json                # TypeScript strict mode
├── .eslintrc.cjs                # ESLint (ts, react presets)
├── .prettierrc.yaml             # Code formatting
└── package.json                 # Dependencies: electron, react, vite
```

## Key Architectural Decisions (Phase 01)

### 1. Security Model
- **contextIsolation: true** — Preload runs in isolated context, can't access renderer window
- **nodeIntegration: false** — Renderer has no direct Node access (prevents RCE)
- **sandbox: false** — Preload needs Node APIs (child_process for Camoufox spawn in Phase 03)
  - Trade-off documented; revisit after Phase 03 requirements finalized

### 2. IPC Architecture
- **contextBridge pattern** — Renderer calls `window.electronAPI.{feature}()`, preload relays to main
- **Async handlers** — All IPC methods return Promises (ipcRenderer.invoke)
- **Grouped API surface** — Organized by domain (profiles, groups, proxies, browser)
- **Valid channels whitelist** — Event subscriptions (on/off) restricted to known channels

### 3. Type Safety
- **Shared types** — Domain models in `src/shared/types.ts` for cross-process consistency
- **Input types** — CreateProfileInput, UpdateProfileInput exclude server-generated fields (IDOR prevention)
- **TypeScript strict mode** — Enforced in tsconfig.json

### 4. Build Pipeline
- **electron-vite** — Handles main/preload/renderer bundle separation automatically
- **Vite HMR** — Hot reload for renderer during development (no full app restart)
- **electron-builder** — Cross-platform packaging (extraResources for camoufox binaries)

### 5. Browser Launcher (Phase 03)
- **Camoufox** — C++-patched Firefox 142.0.1 from coryking/camoufox fork
- **Fingerprint injection** — Via CAMOUFOX_FINGERPRINT env var at spawn time
- **Process tracking** — Map<profileId → ChildProcess>, cleanup on app exit
- **CDP endpoint** — Exposes ws://127.0.0.1:{debugPort}/devtools/browser/... for Playwright/Selenium
- **Session persistence** — SQLite sessions table tracks PID, debug port, WebSocket URL

## API Surface (electronAPI)

Exposed to renderer via contextBridge:

### Profiles API
```typescript
profiles.list(groupId?: string) → Promise<Profile[]>
profiles.get(id: string) → Promise<Profile>
profiles.create(data: CreateProfileInput) → Promise<Profile>
profiles.update(id: string, data: UpdateProfileInput) → Promise<Profile>
profiles.delete(id: string) → Promise<void>
profiles.bulkDelete(ids: string[]) → Promise<void>
```

### Groups API
```typescript
groups.list() → Promise<Group[]>
groups.create(data: CreateGroupInput) → Promise<Group>
groups.update(id: string, data: UpdateGroupInput) → Promise<Group>
groups.delete(id: string) → Promise<void>
```

### Proxies API
```typescript
proxies.list() → Promise<Proxy[]>
proxies.create(data: CreateProxyInput) → Promise<Proxy>
proxies.test(id: string) → Promise<boolean>
proxies.delete(id: string) → Promise<void>
```

### Browser Control API (Phase 03)
```typescript
browser.start(profileId: string) → Promise<{ success: boolean, session?: Session, error?: string }>
browser.stop(profileId: string) → Promise<{ success: boolean }>
browser.status(profileId: string) → Promise<{ running: boolean, session?: Session }>
```

### Event Subscriptions
```typescript
on(channel: string, cb: (...args: unknown[]) => void) → () => void
// Valid channels: 'browser:status-changed', 'app:update-available'
```

## Domain Models

See `src/shared/types.ts` for complete interface definitions.

**Core Entities:**
- **Profile** — Browser session config (fingerprint, proxy, group assignment)
- **Group** — Profile organization (color-coded, for UI grouping)
- **Proxy** — HTTP/HTTPS/SOCKS proxy endpoint
- **Session** — Runtime browser process state (PID, debug port, WebSocket endpoint)
- **BrowserStatus** — Current running state of a profile's browser instance

**Fingerprint Model:**
- OS, browser, version, screen dimensions, timezone, locale, user agent
- Supports raw JSON for custom fingerprint data (Phase 03+)

## Phase 01-03 Completeness

### Phase 01: Electron Foundation ✓
✓ Electron app scaffold with security defaults  
✓ IPC handler registry (stubs)  
✓ Shared type definitions  
✓ Build pipeline (npm run dev, npm run build)  
✓ TypeScript strict mode, ESLint + Prettier  

### Phase 02: Profile Manager & SQLite ✓
✓ SQLite database layer (better-sqlite3)
✓ Profile/Group/Proxy CRUD services
✓ IPC handler implementations
✓ Database schema and migrations

### Phase 03: Camoufox Browser Launcher ✓
✓ Port finder utility (net.Server-based)
✓ Camoufox binary path resolver (dev + prod)
✓ Fingerprint generator (@apify/fingerprint-generator)
✓ Browser service (start/stop/stopAll/getSession/isRunning)
✓ Browser IPC handlers (browser:start/stop/status)
✓ App lifecycle cleanup (before-quit handler)
✓ Camoufox binary download script (scripts/download-camoufox.ts)

### Known Issues
- 14 npm audit vulnerabilities (transitive from electron-builder, eslint v8)
  - Not blocking for development
  - Address before production packaging (Phase 07)

### Next Phase (04)
Phase 04 implements:
- React UI (pages, components, forms)
- Profile list view, detail editor, create form
- Browser launcher UI (start/stop buttons)
- Group and proxy management UI

## Scripts

```bash
npm run dev        # Start electron-vite dev server + app
npm run build      # Build main/preload/renderer bundles (→ ./out/)
npm run package    # Build + create OS-specific installer
npm run lint       # Run ESLint + check TypeScript
npm run format     # Apply Prettier formatting
```

## Environment

- **Node.js:** v18+ (electron-vite requirement)
- **Platform:** Windows x64, macOS (arm64/x64), Linux x64
- **TypeScript:** strict mode enabled
- **Browser:** Chromium (via Electron 29)

## Related Documentation

- `./system-architecture.md` — Component interactions and data flow
- `./code-standards.md` — Coding conventions and module patterns
- `./project-overview-pdr.md` — Product requirements and roadmap
