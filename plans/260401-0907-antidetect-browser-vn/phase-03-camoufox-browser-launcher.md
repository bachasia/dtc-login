# Phase 03: Camoufox Browser Launcher

## Overview
- **Priority:** P1 (Critical — core product value)
- **Status:** complete
- **Depends on:** Phase 01, Phase 02
- **Timeline:** Month 2 (~35h — most complex phase) ✓ COMPLETED 2026-04-01

## Goal
Download + bundle Camoufox binary, implement browser launcher service để start/stop/track Firefox profiles với custom fingerprints và per-profile proxy.

---

## Key Insights

- **Camoufox vs original:** Maintainer (@daijro) hospitalized March 2025 → dùng fork [coryking/camoufox](https://github.com/coryking/camoufox) (Firefox 142.0.1, actively maintained)
- **Fingerprint injection:** Camoufox nhận fingerprint qua env var `CAMOUFOX_FINGERPRINT` hoặc JSON config file — không cần CDP injection, nó tự apply ở C++ level
- **Profile isolation:** Mỗi profile = `--profile {path}` riêng biệt → cookies, localStorage, extensions hoàn toàn isolated
- **Port management:** Cần find free port cho mỗi browser instance trước khi launch
- **CDP access:** Sau khi launch, Camoufox expose `ws://127.0.0.1:{PORT}/devtools/browser/{id}` → Playwright/Selenium kết nối vào đây
- **Process cleanup:** Khi app đóng, phải kill tất cả Camoufox processes con

---

## Camoufox Binary Setup

### Download Strategy
- Platform binaries: `win32-x64`, `darwin-x64`, `darwin-arm64`, `linux-x64`
- Lưu vào `resources/camoufox/{platform}/` — bundle với app via `electron-builder.yml` `extraResources`
- Version file: `resources/camoufox/version.txt`

### Download Script (`scripts/download-camoufox.ts`)
```typescript
// Run: npx ts-node scripts/download-camoufox.ts
import { execSync } from 'child_process'
import { mkdirSync } from 'fs'

// Use camoufox Python package to download binaries
// pip install camoufox
// python -c "from camoufox.sync_api import Camoufox; Camoufox.install()"
// OR download from GitHub releases directly

const CAMOUFOX_VERSION = '0.4.2'  // latest coryking/camoufox
const platforms = [
  { platform: 'win32', arch: 'x64', asset: 'camoufox-win32-x64.zip' },
  { platform: 'darwin', arch: 'x64', asset: 'camoufox-darwin-x64.tar.gz' },
  { platform: 'darwin', arch: 'arm64', asset: 'camoufox-darwin-arm64.tar.gz' },
  { platform: 'linux', arch: 'x64', asset: 'camoufox-linux-x64.tar.gz' },
]

// Download from: https://github.com/coryking/camoufox/releases
```

---

## Implementation Steps

### 1. `src/main/utils/port-finder.ts`

```typescript
import * as net from 'net'

/**
 * Find a free TCP port starting from basePort.
 * Used to assign unique debug ports to each Camoufox instance.
 */
export function findFreePort(basePort = 9222): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(basePort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', () => {
      // Port in use, try next
      findFreePort(basePort + 1).then(resolve).catch(reject)
    })
  })
}
```

### 2. `src/main/utils/camoufox-path.ts`

```typescript
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Returns path to bundled Camoufox binary for current platform.
 * In dev: looks in resources/camoufox/
 * In prod: uses app.getPath('exe') + extraResources path
 */
export function getCamoufoxBinaryPath(): string {
  const platform = process.platform  // 'win32' | 'darwin' | 'linux'
  const arch = process.arch           // 'x64' | 'arm64'

  const binaryName = platform === 'win32' ? 'firefox.exe' : 'firefox'
  const platformDir = `${platform}-${arch}`

  // Development: relative to project root
  const devPath = join(process.cwd(), 'resources', 'camoufox', platformDir, binaryName)
  if (existsSync(devPath)) return devPath

  // Production: extraResources are at {app.getPath('exe')}/../Resources/camoufox
  const prodPath = join(
    process.platform === 'darwin'
      ? join(app.getPath('exe'), '..', '..', 'Resources')
      : join(app.getPath('exe'), '..'),
    'camoufox', platformDir, binaryName
  )
  if (existsSync(prodPath)) return prodPath

  throw new Error(`Camoufox binary not found for ${platformDir}. Run: npm run download-camoufox`)
}
```

### 3. `src/main/services/fingerprint-service.ts`

```typescript
import { FingerprintGenerator } from '@apify/fingerprint-generator'
import type { Fingerprint } from '../../shared/types'

const generator = new FingerprintGenerator()

/**
 * Generate a realistic browser fingerprint.
 * Uses Apify's Bayesian network trained on real-world browser data.
 */
export function generateFingerprint(options?: {
  os?: ('windows' | 'macos' | 'linux')[]
  locale?: string
}): Fingerprint {
  const fp = generator.getFingerprint({
    devices: ['desktop'],
    operatingSystems: options?.os ?? ['windows', 'macos'],
    browsers: ['firefox'],  // Camoufox is Firefox-based
    locales: options?.locale ? [options.locale] : ['vi-VN', 'en-US'],
  })

  return {
    os: fp.fingerprint.navigator.platform?.toLowerCase().includes('win')
      ? 'windows' : fp.fingerprint.navigator.platform?.toLowerCase().includes('mac')
      ? 'macos' : 'linux',
    screenWidth: fp.fingerprint.screen.width,
    screenHeight: fp.fingerprint.screen.height,
    timezone: fp.fingerprint.navigator.languages?.[0] === 'vi-VN' ? 'Asia/Ho_Chi_Minh' : 'America/New_York',
    locale: options?.locale ?? 'vi-VN',
    userAgent: fp.fingerprint.userAgent,
    raw: fp.fingerprint,  // Full raw data for Camoufox
  }
}
```

### 4. `src/main/services/browser-service.ts` (core)

```typescript
import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { join, resolve } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { getCamoufoxBinaryPath } from '../utils/camoufox-path'
import { findFreePort } from '../utils/port-finder'
import { profileService } from './profile-service'
import { proxyService } from './proxy-service'
import { getDb } from '../db/database'
import type { Session } from '../../shared/types'

// Track running browsers: profileId → ChildProcess
const runningProcesses = new Map<string, ChildProcess>()

export const browserService = {
  async start(profileId: string): Promise<Session> {
    // Already running?
    if (runningProcesses.has(profileId)) {
      return this.getSession(profileId)!
    }

    const profile = profileService.getById(profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)

    // 1. Prepare profile data directory
    const profileDir = join(app.getPath('userData'), 'profiles', profileId)
    mkdirSync(profileDir, { recursive: true })

    // 2. Find free debug port
    const debugPort = await findFreePort(9222)

    // 3. Build proxy arg
    let proxyArg: string | undefined
    if (profile.proxy_id) {
      const proxy = proxyService.getById(profile.proxy_id)
      if (proxy) {
        const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : ''
        proxyArg = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
      }
    }

    // 4. Build Camoufox launch args
    const args = [
      '--remote-debugging-port', String(debugPort),
      '--profile', profileDir,
      '--no-first-run',
      '--no-default-browser-check',
    ]
    if (proxyArg) args.push('--proxy-server', proxyArg)

    // 5. Inject fingerprint via env var (Camoufox reads this at startup)
    const camoufoxEnv: NodeJS.ProcessEnv = {
      ...process.env,
    }
    if (profile.fingerprint.raw) {
      camoufoxEnv['CAMOUFOX_FINGERPRINT'] = JSON.stringify(profile.fingerprint.raw)
    }

    // 6. Spawn Camoufox
    const binaryPath = getCamoufoxBinaryPath()
    const proc = spawn(binaryPath, args, {
      env: camoufoxEnv,
      detached: false,
    })

    runningProcesses.set(profileId, proc)

    // 7. Wait for browser to be ready (poll CDP endpoint)
    const wsEndpoint = await waitForBrowserReady(debugPort)

    // 8. Persist session to DB
    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO sessions (profile_id, pid, debug_port, ws_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(profileId, proc.pid, debugPort, wsEndpoint)

    // 9. Handle unexpected exit
    proc.on('exit', () => {
      runningProcesses.delete(profileId)
      db.prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId)
      notifyStatusChange(profileId, 'stopped')
    })

    notifyStatusChange(profileId, 'running')
    return this.getSession(profileId)!
  },

  stop(profileId: string): void {
    const proc = runningProcesses.get(profileId)
    if (proc) {
      proc.kill('SIGTERM')
      runningProcesses.delete(profileId)
    }
    getDb().prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId)
    notifyStatusChange(profileId, 'stopped')
  },

  stopAll(): void {
    for (const [profileId] of runningProcesses) {
      this.stop(profileId)
    }
  },

  getSession(profileId: string): Session | null {
    const row = getDb().prepare('SELECT * FROM sessions WHERE profile_id = ?').get(profileId)
    return row as Session | null
  },

  isRunning(profileId: string): boolean {
    return runningProcesses.has(profileId)
  },
}

/**
 * Poll CDP endpoint until browser is ready (max 10s).
 */
async function waitForBrowserReady(port: number, timeoutMs = 10_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (resp.ok) {
        const data = await resp.json()
        return data.webSocketDebuggerUrl as string
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Browser did not start on port ${port} within ${timeoutMs}ms`)
}

function notifyStatusChange(profileId: string, status: 'running' | 'stopped'): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('browser:status-changed', { profileId, status })
  })
}
```

### 5. Register browser IPC handlers

```typescript
// In ipc-handlers.ts
ipcMain.handle('browser:start', async (_e, profileId: string) => {
  try {
    return { success: true, session: await browserService.start(profileId) }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('browser:stop', (_e, profileId: string) => {
  browserService.stop(profileId)
  return { success: true }
})

ipcMain.handle('browser:status', (_e, profileId: string) => ({
  running: browserService.isRunning(profileId),
  session: browserService.getSession(profileId),
}))
```

### 6. Cleanup on app exit

```typescript
// In main/index.ts
app.on('before-quit', () => {
  browserService.stopAll()
})
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/utils/port-finder.ts` | create | Find free TCP port |
| `src/main/utils/camoufox-path.ts` | create | Platform binary path resolver |
| `src/main/services/fingerprint-service.ts` | create | Fingerprint generator |
| `src/main/services/browser-service.ts` | create | Launch/stop/track Camoufox |
| `src/main/ipc-handlers.ts` | modify | Add browser:start/stop/status |
| `src/main/index.ts` | modify | Add before-quit cleanup |
| `src/preload/index.ts` | modify | Expose browser IPC |
| `scripts/download-camoufox.ts` | create | Download camoufox binaries |
| `resources/camoufox/{platform}/` | create | Binary directories |

---

## Dependencies to Install

```bash
npm install @apify/fingerprint-generator
npm install -D @types/node
```

---

## Todo

- [x] Download Camoufox binaries cho win32, darwin-x64, darwin-arm64, linux-x64
- [x] Implement `camoufox-path.ts` (dev + prod paths)
- [x] Implement `port-finder.ts`
- [x] Implement `fingerprint-service.ts`
- [x] Implement `browser-service.ts` (start/stop/waitForBrowserReady)
- [x] Register browser IPC handlers
- [x] Add `stopAll()` call on `before-quit`
- [x] Test: start profile → Camoufox opens với fingerprint
- [x] Test: CDP endpoint accessible at `ws://127.0.0.1:{port}/...`
- [x] Test: Playwright kết nối được vào running browser
- [x] Test: stop profile → process exits, session removed from DB
- [x] Test: 3 profiles chạy đồng thời trên 3 ports khác nhau

---

## Success Criteria

- Start profile → Camoufox Firefox mở, có fingerprint đúng
- `browser.wsEndpoint` từ session record → Playwright `connect()` hoạt động
- Stop profile → process tắt sạch, không còn zombie processes
- App close → tất cả browser processes đều tắt
- Mỗi profile có cookie isolation (browse gmail ở profile A không ảnh hưởng profile B)

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Camoufox binary size (~200MB per platform) | Bundle chỉ current platform trong dev, tất cả trong prod build |
| CAMOUFOX_FINGERPRINT format thay đổi theo version | Pin Camoufox version, test sau mỗi update |
| macOS Gatekeeper chặn unsigned binary | Code signing Phase 07; dev: `xattr -cr resources/camoufox/darwin-*` |
| Port conflicts nếu nhiều apps dùng 9222+ | Port finder tự động increment đến port free |
| Process leak nếu app crash | Persist PID list, kill orphans khi app restart |

---

## Next Steps

→ Phase 04: React UI Desktop App
