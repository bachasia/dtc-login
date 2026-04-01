# Phase 01: Project Setup & Electron Foundation

## Overview

- **Priority:** P1 (Critical — blocks all other phases)
- **Status:** complete
- **Timeline:** Month 1, Week 1-2 (~20h)
- **Effort:** ~20h

## Goal

Bootstrap Electron + React + TypeScript project với electron-vite, đảm bảo security defaults đúng, build pipeline hoạt động, dev tooling sẵn sàng.

---

## Key Insights

- Dùng **electron-vite** (không phải CRA/Vite standalone) — handles main/preload/renderer build separation tự động
- `contextIsolation: true` + `nodeIntegration: false` là bắt buộc từ đầu — không patch sau
- electron-builder cần config đúng từ đầu để bundle Camoufox binaries (resources/ dir)
- TypeScript strict mode từ đầu — tránh tech debt về type safety

---

## Requirements

### Functional

- Electron app mở window, load React renderer
- IPC bridge qua `contextBridge` hoạt động (preload → renderer)
- Devtools mở trong development mode
- Hot reload cho renderer (Vite HMR)

### Non-functional

- Build cho: Windows x64, macOS arm64/x64, Linux x64
- App name, icons, auto-update config sẵn trong electron-builder.yml
- TypeScript strict mode, ESLint + Prettier setup

---

## Implementation Steps

### 1. Khởi tạo project

```bash
npm create @quick-start/electron@latest dtc-login -- --template react-ts
cd dtc-login
npm install
```

Hoặc manual setup với `electron-vite`:

```bash
mkdir dtc-login && cd dtc-login
npm init -y
npm install electron electron-vite vite react react-dom typescript
npm install -D @types/react @types/react-dom @types/node
```

### 2. Cấu trúc thư mục

```
dtc-login/
├── src/
│   ├── main/
│   │   ├── index.ts              # BrowserWindow setup, app lifecycle
│   │   └── ipc-handlers.ts       # Register all IPC handlers
│   ├── preload/
│   │   └── index.ts              # contextBridge definitions
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx          # React entry point
│   │   └── index.html
│   └── shared/
│       └── types.ts              # Shared interfaces (no Node/browser APIs)
├── resources/
│   └── camoufox/                 # Placeholder, filled in Phase 03
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
└── package.json
```

### 3. `src/main/index.ts` — BrowserWindow config

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security: contextIsolation bắt buộc
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // false để preload có thể dùng Node APIs
    },
    titleBarStyle: 'hidden', // Custom title bar cho đẹp
    trafficLightPosition: { x: 16, y: 16 }, // macOS
  })

  // Dev: load Vite dev server
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### 4. `src/preload/index.ts` — contextBridge skeleton

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to renderer (expand in each phase)
contextBridge.exposeInMainWorld('electronAPI', {
  // Phase 02: profiles
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (data: unknown) => ipcRenderer.invoke('profiles:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('profiles:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
  },
  // Phase 03: browser control
  browser: {
    start: (profileId: string) =>
      ipcRenderer.invoke('browser:start', profileId),
    stop: (profileId: string) => ipcRenderer.invoke('browser:stop', profileId),
    status: (profileId: string) =>
      ipcRenderer.invoke('browser:status', profileId),
  },
  // Events: main → renderer
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const validChannels = ['browser:status-changed', 'app:update-available']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => cb(...args))
    }
  },
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
})
```

### 5. `electron-builder.yml`

```yaml
appId: com.dtcbrowser.app
productName: DTC Browser
copyright: Copyright © 2026

directories:
  output: dist
  buildResources: build

files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'

# Bundle Camoufox binaries
extraResources:
  - from: resources/camoufox
    to: camoufox
    filter:
      - '${os}/**' # Platform-specific: win32/, darwin/, linux/

win:
  executableName: dtc-browser
  target:
    - target: nsis
      arch: [x64]

mac:
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSCameraUsageDescription: Application requests access to camera
    - NSMicrophoneUsageDescription: Application requests access to microphone
  target:
    - target: dmg
      arch: [x64, arm64]

linux:
  target:
    - target: AppImage
      arch: [x64]

nsis:
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
```

### 6. `electron.vite.config.ts`

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
  },
})
```

### 7. `src/main/ipc-handlers.ts` — IPC registry pattern

```typescript
import { ipcMain } from 'electron'
// Import services when implemented (Phase 02+)
// import { profileService } from './services/profile-service'

export function registerIpcHandlers(): void {
  // Placeholder — services registered here as phases complete
  ipcMain.handle('profiles:list', async () => {
    return [] // Phase 02 implements this
  })
  // ... etc
}
```

### 8. Install dependencies

```bash
# Core
npm install electron-vite @vitejs/plugin-react

# UI (Phase 04 will use these, install now)
npm install react react-dom
npm install -D @types/react @types/react-dom

# Build
npm install -D electron-builder

# Linting
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

---

## Files to Create

| File                          | Action | Description                        |
| ----------------------------- | ------ | ---------------------------------- |
| `package.json`                | create | Project deps, scripts              |
| `electron.vite.config.ts`     | create | Build config                       |
| `electron-builder.yml`        | create | Distribution config                |
| `tsconfig.json`               | create | TypeScript config                  |
| `src/main/index.ts`           | create | BrowserWindow setup                |
| `src/main/ipc-handlers.ts`    | create | IPC handler registry               |
| `src/preload/index.ts`        | create | contextBridge API                  |
| `src/renderer/src/App.tsx`    | create | Root React component (placeholder) |
| `src/renderer/src/main.tsx`   | create | React entry                        |
| `src/renderer/index.html`     | create | HTML template                      |
| `src/shared/types.ts`         | create | Shared TS types                    |
| `resources/camoufox/.gitkeep` | create | Placeholder for binaries           |

---

## Todo

- [x] `npm create @quick-start/electron@latest` hoặc manual scaffold
- [x] Configure `electron.vite.config.ts`
- [x] Setup `electron-builder.yml` với extraResources cho camoufox/
- [x] Implement BrowserWindow với security settings
- [x] Implement contextBridge skeleton (preload)
- [x] Implement IPC handler registry pattern
- [x] Setup ESLint + Prettier
- [x] Verify: `npm run dev` mở app, `npm run build` tạo installer
- [x] Verify: preload → renderer IPC round-trip hoạt động

---

## Success Criteria

- `npm run dev` → Electron app mở, React renders "Hello DTC Browser"
- `npm run build` → dist/ có installer cho platform hiện tại
- `window.electronAPI` available trong renderer devtools console
- No TypeScript errors với `strict: true`
- Renderer window có no node access (verify `typeof require === 'undefined'`)

---

## Risk Assessment

| Risk                            | Mitigation                                        |
| ------------------------------- | ------------------------------------------------- |
| electron-vite version conflicts | Pin version, check electron-vite@latest changelog |
| macOS notarization phức tạp     | Defer notarization đến Phase 07 (Licensing)       |
| Resources bundling path sai     | Test extraResources trên mỗi platform sớm         |

---

## Next Steps

→ Phase 02: Profile Manager & SQLite Core
