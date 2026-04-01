# Camoufox Binary Check & Error Propagation Exploration

**Date:** 2026-04-01 20:53 ICT | **Status:** Complete  
**Explored:** Binary check locations, platform detection, IPC flow, error messaging

---

## 1. Binary Existence Check Functions

### Primary Check: `getCamoufoxBinaryPath()`
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/utils/camoufox-path.ts`  
**Lines:** 10–40

**Function signature:**
```typescript
export function getCamoufoxBinaryPath(): string
```

**Behavior:**
- Checks **two locations** in order:
  1. **Dev mode:** `{cwd}/resources/camoufox/{platform}-{arch}/firefox[.exe]`
  2. **Prod mode:** `{electron app resources}/camoufox/{platform}-{arch}/firefox[.exe]`
- Returns path on success, **throws error if both fail**

**Error message location:**
```
Line 37–39: throw new Error(
  `Camoufox binary not found for ${platformDir}. Run: npm run download-camoufox`
)
```

---

## 2. Platform Detection Logic

**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/utils/camoufox-path.ts`  
**Lines:** 11–14

```typescript
const platform = process.platform  // 'win32' | 'darwin' | 'linux'
const arch = process.arch           // 'x64' | 'arm64'
const binaryName = platform === 'win32' ? 'firefox.exe' : 'firefox'
const platformDir = `${platform}-${arch}`
```

**Platform mapping:**
- **Windows:** `win32-x64`
- **macOS:** `darwin-x64` or `darwin-arm64`
- **Linux:** `linux-x64`

**Path resolution (production):**
```typescript
// macOS: {app.getPath('exe')}/../../Resources/camoufox/
// win/linux: {app.getPath('exe')}/../camoufox/
```

---

## 3. Error Propagation to Renderer UI

### Call Path:
```
ProfilesPage (UI)
  → useStartBrowser() hook (React Query mutation)
    → window.electronAPI.browser.start(profileId)
      ↓ [IPC invoke]
      → ipcMain.handle('browser:start', ...) [ipc-handlers.ts:197]
        → browserService.start(profileId) [browser-service.ts:18]
          → getCamoufoxBinaryPath() [throws Error]
            ↓ [catch in ipc-handlers.ts:203]
            → toIpcErrorMessage(err, 'Failed to start browser')
              ↓ [sanitized error message]
              → { success: false, error: "Camoufox binary not found..." }
      ↓ [IPC response]
    → React component receives BrowserStartResponse
      → UI displays error message [profiles-page.tsx:76–78]
```

### IPC Handler: browser:start
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/ipc-handlers.ts`  
**Lines:** 197–209

```typescript
ipcMain.handle('browser:start', async (_e, profileId: unknown) => {
  try {
    const session = await browserService.start(assertString(profileId, 'profileId'))
    return { success: true, session }
  } catch (err) {
    return {
      success: false,
      error: toIpcErrorMessage(err, 'Failed to start browser'),
    }
  }
})
```

### Error Sanitization: `toIpcErrorMessage()`
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/ipc-handlers.ts`  
**Lines:** 93–100

- Only passes error message if it's a valid Error instance
- Sanitizes message: max 160 chars, no newlines
- Falls back to generic message on sanitization failure

### Preload Bridge Exposure
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/preload/index.ts`  
**Lines:** 28–34

```typescript
browser: {
  start: (profileId: string) =>
    ipcRenderer.invoke('browser:start', profileId),
  stop: (profileId: string) => ipcRenderer.invoke('browser:stop', profileId),
  status: (profileId: string) =>
    ipcRenderer.invoke('browser:status', profileId),
}
```

### TypeScript Typing
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/env.d.ts`  
**Lines:** 38–43

```typescript
browser: {
  start: (profileId: string) => Promise<{
    success: boolean
    session?: import('@shared/types').Session
    error?: string
  }>
  // ...
}
```

---

## 4. Existing IPC Endpoints & Event System

### Browser Control Endpoints
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/ipc-handlers.ts`

| Endpoint | Handler | Response |
|----------|---------|----------|
| `browser:start` | 197–209 | `{ success, session?, error? }` |
| `browser:stop` | 210–220 | `{ success, error? }` |
| `browser:status` | 221–224 | `{ running, session }` |

### Broadcast Events
**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/browser-service.ts`  
**Lines:** 236–248

```typescript
function broadcastStatus(
  profileId: string,
  status: 'running' | 'stopped',
  session: Session | null
): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('browser:status-changed', {
      profileId,
      status,
      session,
    })
  })
}
```

**Triggers:**
- Called when browser **starts successfully** (line 123)
- Called when browser **stops** (line 233)

**Renderer listener:**
- **File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/App.tsx` (lines 29–32)
- Updates UI on status changes

---

## 5. Auto-Download & Retry Logic

### Current State: **NONE**

**Download mechanism:** Build-time script only
- **File:** `/Users/bachasia/Data/VibeCoding/dtc-login/scripts/download-camoufox.ts`
- **Trigger:** Manual `npm run download-camoufox` (dev) or `npm run download-camoufox:current` (current platform only)
- **Platforms supported:**
  - `darwin-x64` / `darwin-arm64` (macOS)
  - `win32-x64` (Windows)
  - `linux-x64` (Linux)
- **Version:** Hardcoded as `0.4.2`

**Error handling in browser-service:**
- **Lines 74–108:** On spawn error or timeout, process is killed and cleaned up
- **No retry mechanism:** Single attempt only
- **Cleanup:** `cleanupStoppedSession()` removes DB record on failure

### Missing Auto-Download
- ✅ Binary check exists
- ✅ Error message is clear ("Run: npm run download-camoufox")
- ❌ No runtime download mechanism (requires build script)
- ❌ No retry with backoff
- ❌ No status polling for download progress

---

## 6. Recommended Patterns for Reuse

### Pattern 1: Platform Detection Utility
**Status:** REUSABLE

The `camoufox-path.ts` pattern is clean:
```typescript
const platform = process.platform
const arch = process.arch
const platformDir = `${platform}-${arch}`
```

**Example reuse:** If adding download service, inherit this logic directly.

### Pattern 2: IPC Error Wrapping
**Status:** REUSABLE

The `toIpcErrorMessage()` helper handles:
- Type-safe error extraction
- Message sanitization (length, newlines)
- Fallback messages

**Reuse for download endpoints:**
```typescript
ipcMain.handle('camoufox:download', async () => {
  try {
    return { success: true, data: ... }
  } catch (err) {
    return {
      success: false,
      error: toIpcErrorMessage(err, 'Download failed')
    }
  }
})
```

### Pattern 3: Broadcast Status Updates
**Status:** REUSABLE

`browserService` uses `broadcastStatus()` to push updates:
```typescript
BrowserWindow.getAllWindows().forEach((win) => {
  win.webContents.send('browser:status-changed', payload)
})
```

**Reuse for download progress:**
```typescript
// Send: { downloadId, percent, status, error? }
win.webContents.send('camoufox:download-progress', {...})
```

### Pattern 4: Lifecycle Locking
**Status:** REUSABLE (in local-api-service)

**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/local-api-service.ts`

The `localApiService` uses a `lifecycleQueue` to prevent concurrent operations:
```typescript
let lifecycleQueue: Promise<unknown> = Promise.resolve()

function withLifecycleLock(fn: () => Promise<T>): Promise<T> {
  lifecycleQueue = lifecycleQueue.then(fn)
  return lifecycleQueue
}
```

**Reuse for download:** Prevent concurrent downloads of same binary.

### Pattern 5: Service Initialization
**Status:** REUSABLE

**File:** `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/index.ts` (lines 45–47)

```typescript
app.whenReady().then(() => {
  getDb()  // eager init before IPC
  registerIpcHandlers()
  void localApiService.applyFromSettings().catch(...)
  createWindow()
})
```

**Reuse:** Initialize a `camoufoxService` before registering handlers.

---

## 7. Code Reuse Recommendations (No Edits)

### For implementing auto-download/check, reuse:

1. **Check validation:** `getCamoufoxBinaryPath()` already validates existence
   - Wrap error in try-catch, offer download prompt

2. **IPC error pattern:** Copy `toIpcErrorMessage()` wrapper
   - Sanitizes and delivers errors safely

3. **Broadcast pattern:** Use `BrowserWindow.getAllWindows().forEach()` model
   - Emit progress/status updates to all renderer windows

4. **Platform detection:** Reuse `const platformDir = \`${platform}-${arch}\``
   - Matches the download script's platform targets

5. **Script reference:** Review `/scripts/download-camoufox.ts`
   - Shows exact download URLs (GitHub releases)
   - Demonstrates extraction logic (zip vs tar.gz)
   - Includes quarantine attribute removal for macOS

6. **Lifecycle queue:** Adapt `withLifecycleLock()` from local-api-service
   - Prevent overlapping download attempts

---

## Summary

**Where binary check happens:**
- **Function:** `getCamoufoxBinaryPath()` in `src/main/utils/camoufox-path.ts:10–40`
- **Error thrown:** Line 37–39

**Where error reaches UI:**
- **IPC handler:** `ipcMain.handle('browser:start')` in `src/main/ipc-handlers.ts:197–209`
- **Error message sanitization:** `toIpcErrorMessage()` in `src/main/ipc-handlers.ts:93–100`
- **Preload bridge:** `src/preload/index.ts:28–34`
- **React component:** `src/renderer/src/pages/profiles-page.tsx:73–79` displays error

**Platform detection:**
- Process module: `process.platform` (win32|darwin|linux), `process.arch` (x64|arm64)
- Path format: `{resources}/camoufox/{platform}-{arch}/firefox[.exe]`

**Existing endpoints:**
- ✅ `browser:start`, `browser:stop`, `browser:status` (IPC handles)
- ✅ `browser:status-changed` event (broadcast from main)
- ❌ No download/check status endpoints yet

**Reusable patterns identified:**
- Platform detection utility
- IPC error wrapping (`toIpcErrorMessage`)
- Broadcast status updates (`broadcastStatus`)
- Lifecycle locking (from local-api-service)
- Service initialization pattern
