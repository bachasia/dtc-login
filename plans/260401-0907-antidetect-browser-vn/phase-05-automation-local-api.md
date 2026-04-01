# Phase 05: Automation & Local API

## Overview
- **Priority:** P2
- **Status:** pending
- **Depends on:** Phase 03
- **Timeline:** Month 5-6 (~30h)

## Goal
Implement Express.js Local API server (AdsPower-compatible format, port 50325) cho phép Selenium/Playwright/external tools kết nối và điều khiển browser profiles. API key authentication.

---

## Key Insights

- **AdsPower-compatible format** = automation users không cần sửa code nếu đang dùng AdsPower scripts
- API chạy trên **main process** (Express server) — không phải renderer
- **Security:** API key bắt buộc khi enabled; listen only on `127.0.0.1` (không expose ra LAN)
- Session `ws_endpoint` từ Phase 03 là thứ Selenium/Puppeteer/Playwright cần để connect
- Selenium cần `webdriver` path (chromedriver) — với Firefox/Camoufox dùng `geckodriver`

---

## API Endpoints (AdsPower-compatible)

```
Base: http://127.0.0.1:50325

GET  /api/v1/browser/start?user_id={id}   → start profile, return ws endpoints
GET  /api/v1/browser/stop?user_id={id}    → stop profile
GET  /api/v1/browser/active               → list all running profiles

POST /api/v1/user/create                  → create profile
GET  /api/v1/user/list                    → list profiles (with pagination)
POST /api/v1/user/update                  → update profile
POST /api/v1/user/delete                  → delete profile(s)
GET  /api/v1/user/reqs                    → profile requirements/settings

GET  /status                              → health check
```

---

## Response Format (AdsPower-compatible)

```json
// Success
{
  "code": 0,
  "data": { ... },
  "msg": "success"
}

// Error
{
  "code": -1,
  "data": {},
  "msg": "Error description"
}

// browser/start response
{
  "code": 0,
  "data": {
    "ws": {
      "selenium": "127.0.0.1:9222",
      "puppeteer": "ws://127.0.0.1:9222/devtools/browser/xxx"
    },
    "debug_port": "9222",
    "webdriver": "/path/to/geckodriver"
  },
  "msg": "success"
}
```

---

## Implementation Steps

### 1. Install dependencies

```bash
npm install express cors
npm install -D @types/express @types/cors
```

### 2. `src/main/services/local-api-service.ts`

```typescript
import express, { Request, Response, NextFunction } from 'express'
import * as http from 'http'
import { browserService } from './browser-service'
import { profileService } from './profile-service'
import { getDb } from '../db/database'

let server: http.Server | null = null

export const localApiService = {
  start(port: number, apiKey: string): void {
    if (server) return  // Already running

    const app = express()
    app.use(express.json())
    app.use(express.urlencoded({ extended: false }))

    // Only accept connections from localhost
    // (Express listens on 127.0.0.1, not 0.0.0.0)

    // Auth middleware (skip if apiKey is empty)
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/status') return next()  // Health check always allowed
      if (!apiKey) return next()  // API key not set = no auth required
      const auth = req.headers['authorization']
      if (auth !== `Bearer ${apiKey}`) {
        return res.status(401).json({ code: 401, data: {}, msg: 'Unauthorized' })
      }
      next()
    })

    // Health check
    app.get('/status', (_req, res) => {
      res.json({ code: 0, data: { status: 'running' }, msg: 'success' })
    })

    // --- Browser endpoints ---

    // Start browser
    app.get('/api/v1/browser/start', async (req, res) => {
      const profileId = req.query['user_id'] as string
      if (!profileId) return res.json({ code: -1, data: {}, msg: 'user_id required' })
      try {
        const session = await browserService.start(profileId)
        res.json({
          code: 0,
          data: {
            ws: {
              selenium: `127.0.0.1:${session.debug_port}`,
              puppeteer: session.ws_endpoint,
            },
            debug_port: String(session.debug_port),
            webdriver: getGeckodriverPath(),
          },
          msg: 'success',
        })
      } catch (err) {
        res.json({ code: -1, data: {}, msg: String(err) })
      }
    })

    // Stop browser
    app.get('/api/v1/browser/stop', (req, res) => {
      const profileId = req.query['user_id'] as string
      if (!profileId) return res.json({ code: -1, data: {}, msg: 'user_id required' })
      browserService.stop(profileId)
      res.json({ code: 0, data: {}, msg: 'success' })
    })

    // List active browsers
    app.get('/api/v1/browser/active', (_req, res) => {
      const sessions = getDb().prepare('SELECT * FROM sessions').all()
      res.json({ code: 0, data: { list: sessions }, msg: 'success' })
    })

    // --- Profile (user) endpoints ---

    app.get('/api/v1/user/list', (req, res) => {
      const page = parseInt(req.query['page'] as string) || 1
      const pageSize = parseInt(req.query['page_size'] as string) || 50
      const groupId = req.query['group_id'] as string | undefined
      const all = profileService.list(groupId)
      const start = (page - 1) * pageSize
      const list = all.slice(start, start + pageSize)
      res.json({
        code: 0,
        data: {
          list: list.map(adaptProfile),
          page,
          page_size: pageSize,
        },
        msg: 'success',
      })
    })

    app.post('/api/v1/user/create', (req, res) => {
      try {
        const profile = profileService.create(adaptCreateInput(req.body))
        res.json({ code: 0, data: { id: profile.id }, msg: 'success' })
      } catch (err) {
        res.json({ code: -1, data: {}, msg: String(err) })
      }
    })

    app.post('/api/v1/user/delete', (req, res) => {
      const ids: string[] = req.body['user_ids'] ?? [req.body['user_id']]
      profileService.bulkDelete(ids)
      res.json({ code: 0, data: {}, msg: 'success' })
    })

    server = app.listen(port, '127.0.0.1', () => {
      console.log(`Local API listening on http://127.0.0.1:${port}`)
    })
  },

  stop(): void {
    server?.close()
    server = null
  },

  isRunning(): boolean {
    return server !== null
  },
}

function adaptProfile(p: Profile) {
  // Map internal fields to AdsPower-compatible field names
  return {
    user_id: p.id,
    name: p.name,
    group_id: p.group_id ?? '',
    domain_name: '',
    username: '',
    remark: p.notes ?? '',
    created_time: p.created_at,
  }
}

function adaptCreateInput(body: Record<string, unknown>) {
  return {
    name: body['name'] as string,
    group_id: body['group_id'] as string | undefined,
    notes: body['remark'] as string | undefined,
  }
}

function getGeckodriverPath(): string {
  // Return bundled geckodriver path
  // Similar to getCamoufoxBinaryPath() logic
  return ''  // Phase 03 utility can be extended
}
```

### 3. Start API on app launch

```typescript
// main/index.ts — after createWindow():
const db = getDb()
const apiEnabled = db.prepare("SELECT value FROM settings WHERE key='api_enabled'").get()?.value === 'true'
const apiKey = db.prepare("SELECT value FROM settings WHERE key='api_key'").get()?.value ?? ''
const apiPort = parseInt(db.prepare("SELECT value FROM settings WHERE key='api_port'").get()?.value ?? '50325')

if (apiEnabled) {
  localApiService.start(apiPort, apiKey)
}

// Cleanup
app.on('before-quit', () => {
  localApiService.stop()
})
```

### 4. Settings UI for API

```typescript
// settings-page.tsx — API section:
// Toggle: Enable Local API
// Input: API Port (default 50325)
// Input: API Key (generate random / copy)
// Show: API status (running/stopped)
// Button: Test API (curl /status)
```

### 5. IPC for API control from UI

```typescript
// ipc-handlers.ts
ipcMain.handle('api:toggle', (_e, enabled: boolean) => {
  if (enabled) {
    localApiService.start(port, apiKey)
  } else {
    localApiService.stop()
  }
  db.prepare("UPDATE settings SET value=? WHERE key='api_enabled'").run(String(enabled))
})
```

---

## Automation Usage Examples (for documentation)

### Python + Selenium
```python
import requests
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

resp = requests.get('http://127.0.0.1:50325/api/v1/browser/start?user_id=PROFILE_ID',
                    headers={'Authorization': 'Bearer YOUR_API_KEY'}).json()

options = Options()
# Connect to running Camoufox (Firefox)
# Note: Camoufox uses Marionette, not CDP for Selenium
```

### Node.js + Playwright
```javascript
const { chromium } = require('playwright')  // or firefox
const resp = await fetch('http://127.0.0.1:50325/api/v1/browser/start?user_id=PROFILE_ID',
  { headers: { Authorization: 'Bearer YOUR_API_KEY' } })
const { data } = await resp.json()
const browser = await chromium.connectOverCDP(data.ws.puppeteer)
const page = await browser.newPage()
await page.goto('https://example.com')
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/services/local-api-service.ts` | create | Express API server |
| `src/main/index.ts` | modify | Start API on launch |
| `src/main/ipc-handlers.ts` | modify | API toggle handlers |
| `src/renderer/src/pages/settings-page.tsx` | modify | API settings UI |
| `src/preload/index.ts` | modify | Expose api:toggle |
| `docs/local-api.md` | create | API documentation |

---

## Todo

- [ ] `npm install express cors`
- [ ] Implement `local-api-service.ts` (Express + all endpoints)
- [ ] Add API startup in `main/index.ts`
- [ ] Add API cleanup in `before-quit`
- [ ] Implement Settings UI với API enable/disable toggle
- [ ] Test: `curl http://127.0.0.1:50325/status` → `{"code":0,...}`
- [ ] Test: start profile via API → Camoufox opens
- [ ] Test: Playwright `connectOverCDP()` vào running browser
- [ ] Test: API key auth (reject invalid key, accept valid)
- [ ] Write `docs/local-api.md` với examples

---

## Success Criteria

- `GET /status` → 200 `{"code":0,"data":{"status":"running"}}`
- `GET /api/v1/browser/start?user_id=xxx` → returns ws endpoint
- Playwright `connectOverCDP(wsEndpoint)` → browser controlled
- Invalid API key → 401 Unauthorized
- API disabled in settings → no port 50325 listener

---

## Next Steps

→ Phase 06: VN Features & Polish
