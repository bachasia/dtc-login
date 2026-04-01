# Phase 07: Licensing & Monetization

## Overview
- **Priority:** P2
- **Status:** pending
- **Depends on:** Phase 04, 05, 06
- **Timeline:** Month 9-10 (~25h)

## Goal
Implement license key system, payment integration (SePay VN + Polar), profile count limits per plan, auto-update mechanism.

---

## Key Insights

- **Polar.sh** = modern Stripe alternative, handles VAT, good DX — dùng cho global/card payments
- **SePay** = VietQR-based, phổ biến ở VN cho chuyển khoản ngân hàng — cần cho VN market
- License validation phải **offline-capable** (cache license locally, re-validate mỗi 7 ngày)
- **Profile count limit** = primary monetization lever (free=5, starter=50, pro=200, unlimited)
- Tránh DRM phức tạp — dễ crack, làm khó user chân thật hơn pirate
- Licensing key = JWT signed bởi server private key → validate bằng public key locally

---

## Pricing Tiers

| Plan | Profiles | Price | Notes |
|------|---------|-------|-------|
| Free | 5 | $0 | Không có Local API |
| Starter | 50 | ~70k VND/tháng (~$3) | Local API included |
| Pro | 200 | ~120k VND/tháng (~$5) | All features |
| Team | Unlimited | ~250k VND/tháng (~$10) | Multi-device |

---

## License System Architecture

```
User pays (SePay/Polar)
    ↓
License server issues JWT license key
    ↓
App validates JWT với embedded public key
    ↓
License stored in: app.getPath('userData')/license.json
    ↓
Re-validate every 7 days (grace period: 3 days offline)
    ↓
Enforce profile count limit from license payload
```

### License JWT Payload
```typescript
interface LicensePayload {
  email: string
  plan: 'free' | 'starter' | 'pro' | 'team'
  maxProfiles: number
  features: {
    localApi: boolean
    bulkOpen: boolean
    cookieImport: boolean
  }
  issuedAt: number   // Unix timestamp
  expiresAt: number  // Unix timestamp
  deviceId: string   // Hardware fingerprint (MAC address hash)
}
```

---

## Implementation Steps

### 1. `src/main/services/license-service.ts`

```typescript
import * as jose from 'jose'  // JWT library
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { LicensePayload } from '../../shared/types'

// Embedded public key (from license server)
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
...your RSA public key here...
-----END PUBLIC KEY-----`

const LICENSE_FILE = join(app.getPath('userData'), 'license.json')
const REVALIDATE_INTERVAL_DAYS = 7
const GRACE_PERIOD_DAYS = 3

let cachedLicense: LicensePayload | null = null

export const licenseService = {
  /**
   * Load license from disk, validate signature, check expiry.
   * Called on app startup.
   */
  async load(): Promise<LicensePayload> {
    if (!existsSync(LICENSE_FILE)) {
      return this.getFreePlan()
    }

    const stored = JSON.parse(readFileSync(LICENSE_FILE, 'utf8'))
    const { token, lastValidated } = stored

    try {
      const publicKey = await jose.importSPKI(PUBLIC_KEY_PEM, 'RS256')
      const { payload } = await jose.jwtVerify(token, publicKey)
      cachedLicense = payload as unknown as LicensePayload

      // Re-validate online if > 7 days
      const daysSinceValidation = (Date.now() / 1000 - lastValidated) / 86400
      if (daysSinceValidation > REVALIDATE_INTERVAL_DAYS) {
        this.revalidateOnline(token).catch(console.warn)
      }

      return cachedLicense
    } catch (err) {
      console.warn('License validation failed:', err)
      return this.getFreePlan()
    }
  },

  /**
   * Activate with license key from user input.
   */
  async activate(licenseKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resp = await fetch('https://api.dtcbrowser.com/v1/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey, deviceId: getDeviceId() }),
      })
      const data = await resp.json()
      if (!resp.ok) return { success: false, error: data.message }

      // Validate + cache the returned JWT
      const publicKey = await jose.importSPKI(PUBLIC_KEY_PEM, 'RS256')
      const { payload } = await jose.jwtVerify(data.token, publicKey)
      cachedLicense = payload as unknown as LicensePayload

      writeFileSync(LICENSE_FILE, JSON.stringify({
        token: data.token,
        lastValidated: Math.floor(Date.now() / 1000),
      }))

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  getCurrent(): LicensePayload {
    return cachedLicense ?? this.getFreePlan()
  },

  canCreateProfile(): boolean {
    const license = this.getCurrent()
    const profileCount = profileService.list().length
    return profileCount < license.maxProfiles
  },

  getFreePlan(): LicensePayload {
    return {
      email: '',
      plan: 'free',
      maxProfiles: 5,
      features: { localApi: false, bulkOpen: false, cookieImport: false },
      issuedAt: 0,
      expiresAt: 0,
      deviceId: getDeviceId(),
    }
  },

  async revalidateOnline(token: string): Promise<void> {
    const resp = await fetch('https://api.dtcbrowser.com/v1/license/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, deviceId: getDeviceId() }),
    })
    if (resp.ok) {
      writeFileSync(LICENSE_FILE, JSON.stringify({
        token,
        lastValidated: Math.floor(Date.now() / 1000),
      }))
    }
  },
}

function getDeviceId(): string {
  // Hash of MAC address + CPU info = stable device identifier
  const { networkInterfaces } = require('os')
  const macs = Object.values(networkInterfaces())
    .flat()
    .filter((i: any) => !i?.internal && i?.mac !== '00:00:00:00:00:00')
    .map((i: any) => i?.mac)
    .filter(Boolean)
  const { createHash } = require('crypto')
  return createHash('sha256').update(macs.join(',')).digest('hex').slice(0, 16)
}
```

### 2. License enforcement in services

```typescript
// profile-service.ts create():
create(input: CreateProfileInput): Profile {
  if (!licenseService.canCreateProfile()) {
    throw new Error(`Đã đạt giới hạn ${licenseService.getCurrent().maxProfiles} profiles. Nâng cấp để tạo thêm.`)
  }
  // ... rest of create logic
}

// local-api-service.ts start():
start(port, apiKey) {
  if (!licenseService.getCurrent().features.localApi) {
    throw new Error('Local API yêu cầu gói Starter trở lên')
  }
  // ...
}
```

### 3. Payment Integration

**Polar.sh (card payments, global):**
```typescript
// Redirect to Polar checkout URL
const POLAR_PRODUCTS = {
  starter: 'https://polar.sh/dtcbrowser/checkout/starter',
  pro: 'https://polar.sh/dtcbrowser/checkout/pro',
  team: 'https://polar.sh/dtcbrowser/checkout/team',
}
// After payment, Polar webhook → license server → issue JWT
```

**SePay (VietQR, VN banks):**
```typescript
// SePay integration for VN bank transfer
// User pays → SePay webhook → license server → issue JWT
// QR code shown in app payment modal
```

### 4. License UI in Settings

```typescript
// settings-page.tsx — License section:
// - Current plan badge (Free / Starter / Pro / Team)
// - Profile usage: "3/5 profiles"
// - [Activate License] input + button
// - [Buy License] button → opens payment page in system browser
// - Expiry date
// - [Refresh License] button
```

### 5. Auto-update with electron-updater

```bash
npm install electron-updater
```

```typescript
// main/index.ts
import { autoUpdater } from 'electron-updater'

app.whenReady().then(() => {
  // Check for updates on startup (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('app:update-available')
  })
})
```

electron-builder.yml publish config:
```yaml
publish:
  provider: github
  owner: your-github-username
  repo: dtc-browser
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/services/license-service.ts` | create | JWT license validation |
| `src/main/services/profile-service.ts` | modify | Enforce profile count limit |
| `src/main/services/local-api-service.ts` | modify | Enforce feature flags |
| `src/main/ipc-handlers.ts` | modify | license:get, license:activate |
| `src/renderer/src/pages/settings-page.tsx` | modify | License UI section |
| `src/renderer/src/components/upgrade-dialog.tsx` | create | Upsell modal |
| `src/shared/types.ts` | modify | Add LicensePayload type |

---

## Todo

- [ ] `npm install jose electron-updater`
- [ ] Implement `license-service.ts` (JWT validate, activate, device ID)
- [ ] Embed RSA public key (generate key pair for license server)
- [ ] Enforce profile limit in `profile-service.create()`
- [ ] Enforce feature flags in `local-api-service`
- [ ] Build License UI in Settings page
- [ ] Build UpgradeDialog (show pricing, payment buttons)
- [ ] Setup Polar.sh account + products
- [ ] Setup SePay account + webhook endpoint
- [ ] Setup minimal license server (can be simple Cloudflare Worker)
- [ ] Configure `electron-builder.yml` publish → GitHub releases
- [ ] Test auto-update flow

---

## Success Criteria

- Free plan: max 5 profiles enforced, Local API disabled
- Activate valid license → plan upgrades, limits increase immediately
- Invalid/expired license → gracefully falls back to free plan
- Auto-update: app shows update notification when new version available

---

## Next Steps

→ Phase 08: Launch & Marketing VN
