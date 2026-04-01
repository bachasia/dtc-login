# Phase 06: VN Features & Polish

## Overview
- **Priority:** P2
- **Status:** pending
- **Depends on:** Phase 04, 05
- **Timeline:** Month 7-8 (~30h)

## Goal
VN-market specific features: profile templates cho FB/TikTok/Shopee, cookie import/export, bulk operations, performance optimization, app polish.

---

## Key Insights

- Vietnamese MMO users cần **cookie import** nhiều nhất — đây là killer feature
- Profile templates = pre-configured fingerprints tối ưu cho từng platform
- **Bulk open browsers** (mở 10-20 cùng lúc) = use case phổ biến trong MMO
- Synchronizer feature (sync actions across windows) = AdsPower differentiator — defer sang Phase sau
- Cookie import: support `.json` (Netscape/JSON format) và Selenium cookies

---

## Features

### 1. Profile Templates

Pre-configured fingerprint profiles tối ưu cho VN platforms:

```typescript
// src/main/data/profile-templates.ts
export const PROFILE_TEMPLATES = [
  {
    id: 'facebook-vn',
    name: 'Facebook VN',
    icon: '📘',
    description: 'Tối ưu cho Facebook Ads Manager, fanpage, group',
    fingerprint: {
      os: 'windows',
      screenWidth: 1920,
      screenHeight: 1080,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'tiktok-shop',
    name: 'TikTok Shop',
    icon: '🎵',
    description: 'Tối ưu cho TikTok Shop seller',
    fingerprint: {
      os: 'windows',
      screenWidth: 1366,
      screenHeight: 768,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'shopee-seller',
    name: 'Shopee Seller',
    icon: '🛒',
    description: 'Tối ưu cho Shopee seller center',
    fingerprint: {
      os: 'macos',
      screenWidth: 1440,
      screenHeight: 900,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    icon: '🔍',
    description: 'Tối ưu cho Google Ads manager',
    fingerprint: { os: 'windows', locale: 'en-US' },
  },
]
```

UI: Template picker trong ProfileFormDialog — chọn template → auto-fill fingerprint fields.

---

### 2. Cookie Import/Export

```typescript
// src/main/services/cookie-service.ts

interface NetscapeCookie {
  domain: string
  path: string
  secure: boolean
  expiry: number
  name: string
  value: string
}

export const cookieService = {
  /**
   * Import cookies từ JSON file vào profile's Firefox cookie store.
   * Supports: Netscape format, Selenium JSON format, EditThisCookie format.
   */
  async importFromFile(profileId: string, filePath: string): Promise<{ imported: number }> {
    const content = readFileSync(filePath, 'utf8')
    const cookies = parseCookies(content)  // Auto-detect format
    return await this.importCookies(profileId, cookies)
  },

  /**
   * Import cookies qua CDP (browser phải đang chạy).
   * Dùng Playwright để call Page.setCookie.
   */
  async importCookies(profileId: string, cookies: NetscapeCookie[]): Promise<{ imported: number }> {
    const session = browserService.getSession(profileId)
    if (!session) throw new Error('Browser not running. Start browser first.')

    // Connect via CDP and set cookies
    const browser = await chromium.connectOverCDP(session.ws_endpoint!)
    const context = browser.contexts()[0]

    await context.addCookies(cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expiry,
      secure: c.secure,
    })))

    await browser.close()
    return { imported: cookies.length }
  },

  /**
   * Export cookies từ running browser profile.
   */
  async exportCookies(profileId: string): Promise<NetscapeCookie[]> {
    const session = browserService.getSession(profileId)
    if (!session) throw new Error('Browser not running')
    // Connect + getAllCookies via CDP
    ...
  },
}

function parseCookies(content: string): NetscapeCookie[] {
  // Try JSON first, fall back to Netscape tab-delimited format
  try {
    const parsed = JSON.parse(content)
    // EditThisCookie format: array of {name, value, domain, path, expirationDate, ...}
    if (Array.isArray(parsed)) return parsed.map(adaptEditThisCookieFormat)
    throw new Error('Not array JSON')
  } catch {
    // Netscape format: tab-separated lines
    return parseNetscapeCookies(content)
  }
}
```

UI: Right-click trên profile → "Import Cookies" → file picker → show count imported.

---

### 3. Bulk Operations

```typescript
// Bulk open multiple profiles
async function bulkOpenBrowsers(profileIds: string[]): Promise<void> {
  // Open with concurrency limit (max 5 at once to avoid overwhelming system)
  const limit = 5
  for (let i = 0; i < profileIds.length; i += limit) {
    const batch = profileIds.slice(i, i + limit)
    await Promise.all(batch.map(id => browserService.start(id)))
    // Small delay between batches
    if (i + limit < profileIds.length) await sleep(1000)
  }
}
```

UI: Select multiple profiles → "Mở tất cả" button → progress indicator.

---

### 4. Profile Import from AdsPower

Allow users chuyển từ AdsPower sang DTC Browser:

```typescript
// Import profile config từ AdsPower export JSON
// AdsPower cho phép export profile data (không bao gồm cookies)
// Map AdsPower fields → DTC Browser profile format
```

---

### 5. Performance Optimizations

**Virtual scroll for profile list:**
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
// Render only visible rows → smooth với 1000+ profiles
```

**Lazy load fingerprint generation:**
```typescript
// Generate fingerprint only when profile form opens
// Cache last generated fingerprint
```

**Browser process health check:**
```typescript
// Periodically ping debug port to detect crashed browsers
// Remove stale sessions from DB
setInterval(() => {
  for (const [profileId, proc] of runningProcesses) {
    if (proc.exitCode !== null) {
      // Process died
      browserService.cleanup(profileId)
    }
  }
}, 5000)
```

---

### 6. App Polish

- **System tray icon:** App ẩn vào tray khi đóng window, không quit hẳn
- **Keyboard shortcuts:** Ctrl+N (new profile), Ctrl+F (search), Del (delete selected)
- **Onboarding:** First-run wizard (download Camoufox if not bundled, set language)
- **Error toasts:** User-friendly Vietnamese error messages
- **Loading states:** Skeleton loaders khi fetch profile list
- **Confirmation dialogs:** Before delete (tiếng Việt)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/data/profile-templates.ts` | create | VN platform templates |
| `src/main/services/cookie-service.ts` | create | Cookie import/export |
| `src/main/ipc-handlers.ts` | modify | Cookie + bulk handlers |
| `src/renderer/src/components/profile-form-dialog.tsx` | modify | Template picker |
| `src/renderer/src/components/profile-table.tsx` | modify | Virtual scroll + bulk select |
| `src/renderer/src/components/cookie-import-dialog.tsx` | create | Cookie import UI |
| `src/main/index.ts` | modify | System tray setup |

---

## Todo

- [ ] Implement profile templates data + UI
- [ ] Implement `cookie-service.ts` (import JSON + Netscape format)
- [ ] Add cookie import IPC handler
- [ ] Build CookieImportDialog UI
- [ ] Implement bulk open browsers (with concurrency limit)
- [ ] Add virtual scroll to ProfileTable
- [ ] System tray: minimize to tray on close
- [ ] Keyboard shortcuts (Ctrl+N, Del)
- [ ] Health check interval for running browsers
- [ ] Vietnamese error messages (i18n-lite, no need full i18n library)

---

## Success Criteria

- Import 100 cookies từ EditThisCookie JSON file → browser shows cookies
- Select 20 profiles → "Mở tất cả" → 20 browsers open without crashing
- Profile template "Facebook VN" → fingerprint pre-filled correctly
- Virtual scroll: 1000 profiles smooth 60fps scroll

---

## Next Steps

→ Phase 07: Licensing & Monetization
