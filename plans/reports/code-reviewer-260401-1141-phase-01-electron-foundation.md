# Code Review — Phase 01 Electron Foundation

**Date:** 2026-04-01
**Score: 7.5 / 10**

---

## Scope

| File                      | Lines |
| ------------------------- | ----- |
| src/main/index.ts         | 52    |
| src/main/ipc-handlers.ts  | 29    |
| src/preload/index.ts      | 37    |
| src/renderer/src/App.tsx  | 12    |
| src/renderer/src/main.tsx | 10    |
| src/renderer/index.html   | 17    |
| src/shared/types.ts       | 68    |
| electron.vite.config.ts   | 21    |
| electron-builder.yml      | 45    |
| package.json              | 35    |

---

## Overall Assessment

Solid scaffold for Phase 01. Security defaults are mostly correct — contextIsolation on, nodeIntegration off. The main gaps are: sandbox is explicitly disabled without justification, the `removeAllListeners` escape hatch on the contextBridge is a trust-boundary violation, and `unknown` params in IPC stubs will need typed replacements before Phase 02 merges. Build config is clean. TypeScript strict mode is enabled on both tsconfig targets.

---

## Critical Issues (Blocking)

### 1. `removeAllListeners` exposed on contextBridge — trust boundary violation

**File:** `src/preload/index.ts:36`

```ts
removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
```

`ipcRenderer.removeAllListeners` with an arbitrary string allows renderer code (or injected XSS) to silently unsubscribe ALL listeners on any channel — including internal Electron channels. This is a denial-of-service vector against the app's own event bus and can mask security events (e.g., silently removing the `app:update-available` listener).

**Fix:** Either remove this method entirely, or scope it to the `validChannels` allowlist used in `.on()`:

```ts
removeAllListeners: (channel: string) => {
  const validChannels = ['browser:status-changed', 'app:update-available']
  if (validChannels.includes(channel)) {
    ipcRenderer.removeAllListeners(channel)
  }
},
```

Even better: use `ipcRenderer.removeListener` with the specific callback rather than nuking all listeners on the channel.

---

### 2. `sandbox: false` — unjustified privilege escalation

**File:** `src/main/index.ts:15`

```ts
sandbox: false,
```

`sandbox: false` re-enables Node.js builtins inside the renderer process even when `nodeIntegration: false`. The standard electron-vite template sets this because the preload script needs Node APIs before contextBridge is established, but this should be documented with a comment explaining the trade-off. If the preload script does not require Node APIs at runtime (it currently doesn't — it only calls `contextBridge` and `ipcRenderer`), set `sandbox: true`.

If camoufox integration requires a non-sandboxed renderer in Phase 03, document that constraint here explicitly so it isn't silently inherited.

**Action:** Audit whether `sandbox: true` works for the current preload. If it does, flip it. If not, add a comment justifying `false`.

---

## High Priority Issues

### 3. `profiles:list` IPC argument ignored — mismatch between bridge and handler

**File:** `src/preload/index.ts:6` vs `src/main/ipc-handlers.ts:6`

The bridge calls:

```ts
list: (groupId?: string) => ipcRenderer.invoke('profiles:list', groupId),
```

The handler signature is:

```ts
ipcMain.handle('profiles:list', async () => [])
```

The handler discards the `groupId` arg silently. This is fine for stubs, but when Phase 02 implements the real handler, the API contract (filter by group) must be honored. Mark this explicitly in a comment so Phase 02 doesn't ship a regression.

---

### 4. `on()` event listener leaks — no unsubscribe handle returned

**File:** `src/preload/index.ts:30-35`

```ts
on: (channel: string, cb: (...args: unknown[]) => void) => {
  const validChannels = ['browser:status-changed', 'app:update-available']
  if (validChannels.includes(channel)) {
    ipcRenderer.on(channel, (_event, ...args) => cb(...args))
  }
},
```

Each call to `.on()` registers a **new wrapper function** that closes over `cb`. Even if the renderer calls `removeAllListeners`, the original `cb` reference is unreachable — there is no way to remove a single listener. In a React app where `useEffect` registers and cleans up listeners on mount/unmount cycles, this causes unbounded listener accumulation per component lifecycle.

**Fix:** Return the unsubscribe function:

```ts
on: (channel, cb) => {
  if (!validChannels.includes(channel)) return () => {}
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
},
```

This also renders the top-level `removeAllListeners` unnecessary.

---

### 5. npm audit HIGH — `tar` arbitrary file overwrite (CVE in node-tar)

**Severity:** HIGH (devDependency via electron-builder)

`tar` has path traversal vulnerabilities. This is a devDependency build tool — it does not ship in the packaged app — so **runtime production risk is low**. However, a malicious package in the build pipeline could exploit this during `npm run package`. Track the electron-builder upgrade path; this will be resolved when electron-builder updates its tar dependency.

---

## Medium Priority Issues

### 6. `CreateProfileInput` type is overly permissive

**File:** `src/shared/types.ts:61`

```ts
export type CreateProfileInput = Partial<Profile> & { name: string }
```

`Partial<Profile>` includes `id`, `created_at`, `updated_at` — fields that should be server-assigned and never accepted from the renderer. A renderer could supply an `id` and attempt to overwrite an existing record (IDOR risk once the DB layer lands in Phase 02).

**Fix:**

```ts
export type CreateProfileInput = Partial<
  Omit<Profile, 'id' | 'created_at' | 'updated_at'>
> & { name: string }
```

---

### 7. `electron` version 29 has known ASAR integrity bypass (moderate)

**File:** `package.json:27`

```json
"electron": "^29.1.1"
```

Electron 29 has a moderate vuln: ASAR integrity can be bypassed via resource modification. This matters for the antidetect use case — tampered ASAR could swap fingerprint injection scripts without detection. Electron 33+ resolves this. Upgrading is a build-breaking change (API differences possible) but should be scheduled before beta release.

---

### 8. `window.electronAPI` has no TypeScript declaration in renderer

**File:** `src/renderer/src/main.tsx`, `App.tsx`

`contextBridge.exposeInMainWorld('electronAPI', ...)` populates `window.electronAPI` but there is no `Window` interface augmentation in the renderer `tsconfig` scope. Any renderer code calling `window.electronAPI.profiles.list()` will get a TypeScript error or have to cast to `any`.

**Fix:** Add `src/renderer/src/env.d.ts` (or `global.d.ts`):

```ts
import type { /* shape types */ } from '@shared/types'

interface Window {
  electronAPI: {
    profiles: { list: (groupId?: string) => Promise<Profile[]>; ... }
    // ... full shape
  }
}
```

This is low-effort and blocks Phase 02 renderer work from needing `any` casts.

---

## Low Priority / Informational

### 9. CSP allows `'unsafe-inline'` for styles

**File:** `src/renderer/index.html:9`

```
style-src 'self' 'unsafe-inline'
```

Inline styles are necessary for Vite HMR in dev. For production build, consider adding a `nonce` or switching to hashed CSP to eliminate the inline vector. Not critical for Phase 01.

---

### 10. `setWindowOpenHandler` only checks `https:` — `http:` URLs silently discarded

**File:** `src/main/index.ts:36`

```ts
if (url.startsWith('https:')) shell.openExternal(url)
```

`http:` URLs are silently swallowed. This is secure (no plaintext external nav) but may surprise users. Consider explicitly logging or denying with feedback. `javascript:` and `data:` URLs also fall through — both are harmlessly denied since `shell.openExternal` is never called, but the intent is clearer if all non-https schemes are explicitly rejected.

---

### 11. electron-vite config missing `@shared` alias for main process

**File:** `electron.vite.config.ts`

The `@shared` path alias is configured only for the renderer. The main process and preload use direct relative imports to `../shared/...`. If main process files grow, add the alias to both targets for consistency.

---

### 12. `electron-updater` listed as production dependency but not yet wired

**File:** `package.json:15`

`electron-updater` is in `dependencies` (ships in packaged app) but no update logic exists in `src/main/index.ts`. Fine for Phase 01, but verify it's not triggering update checks to a non-existent endpoint on launch.

---

## Positive Observations

- `contextIsolation: true` + `nodeIntegration: false` — core Electron security defaults correct.
- Channel allowlist on `.on()` — good practice, prevents arbitrary event subscription.
- `setWindowOpenHandler` returning `{ action: 'deny' }` unconditionally — popup suppression correct.
- `show: false` + `ready-to-show` pattern — avoids white flash on startup.
- TypeScript `strict: true` on both tsconfig targets — no loose mode.
- `electron-builder.yml` correctly excludes `.env` and source files from packaged output.
- `extraResources` for camoufox uses `${os}/**` filter — platform-appropriate binary bundling.
- `React.StrictMode` enabled.
- IPC channel naming convention (`domain:verb`) is consistent across all 13 channels.

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Scope `removeAllListeners` to `validChannels` allowlist or remove it and use the listener-handle pattern from issue #4.
2. **[HIGH]** Audit `sandbox: false` — flip to `true` if preload doesn't require Node APIs; add justification comment if keeping `false`.
3. **[HIGH]** Fix `on()` to return an unsubscribe function (issue #4).
4. **[HIGH]** Fix `CreateProfileInput` to exclude server-assigned fields (issue #6).
5. **[MEDIUM]** Add `Window` interface augmentation for `electronAPI` before Phase 02 renderer work starts (issue #8).
6. **[MEDIUM]** Add comment on `profiles:list` handler noting the `groupId` filter must be honored in Phase 02 (issue #3).
7. **[BACKLOG]** Schedule Electron upgrade to 33+ before beta (issue #7).
8. **[BACKLOG]** Schedule electron-builder upgrade to resolve `tar` HIGH (issue #5).

---

## Unresolved Questions

1. Does the camoufox binary require `sandbox: false` in the renderer? If so, document the threat model rationale in `src/main/index.ts`.
2. Will `electron-updater` be pointed at a real update server before Phase 01 ships to testers? If not, ensure update checks are disabled to avoid connection errors on launch.
3. Is the `NSCameraUsageDescription` + `NSMicrophoneUsageDescription` in `electron-builder.yml` required for the antidetect feature, or is it a template leftover? Unnecessary entitlements widen the macOS permission surface.
