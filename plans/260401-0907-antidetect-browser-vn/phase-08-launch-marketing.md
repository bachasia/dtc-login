# Phase 08: Launch & Marketing VN

## Overview
- **Priority:** P3
- **Status:** pending
- **Depends on:** Phase 07
- **Timeline:** Month 11-12 (~20h dev + ongoing marketing)

## Goal
Public launch targeting Vietnamese MMO/affiliate/e-commerce community. First 100 paying users. Community building.

---

## Pre-Launch Checklist

### Technical
- [ ] Code signing: Windows (EV certificate hoặc standard) + macOS (Developer ID)
- [ ] macOS notarization (để Gatekeeper không chặn)
- [ ] Windows installer (NSIS) signed
- [ ] Auto-update pipeline tested (GitHub Releases)
- [ ] Crash reporting setup (Sentry hoặc custom)
- [ ] Analytics: basic usage metrics (privacy-respecting, opt-in)
- [ ] License server deployed (Cloudflare Workers / Railway)
- [ ] Landing page live

### Content
- [ ] Landing page (dtcbrowser.com hoặc tương tự)
- [ ] YouTube: 1-2 tutorial videos tiếng Việt
- [ ] Docs site: setup guide, API reference, FAQ
- [ ] Pricing page rõ ràng

---

## Go-to-Market Strategy (VN)

### Primary Channels

**1. Facebook Groups (most important)**
- Target groups: MMO Việt Nam, Affiliate Marketing VN, Làm giàu Online, TikTok Shop Việt Nam
- Content: Tutorial posts, comparison with AdsPower (price + VN support)
- Seeding: 10-20 posts/tháng, answer questions proactively

**2. Zalo Groups**
- Create official Zalo group cho users
- Direct support qua Zalo OA
- VN users prefer Zalo >> email for support

**3. YouTube**
- Tutorial: "Cách tạo 20 tài khoản Facebook không bị khóa"
- Demo: "DTC Browser vs AdsPower - So sánh giá + tính năng"
- SEO: Vietnamese keywords

**4. TikTok** (thứ cấp)
- Short demo videos (30-60s)
- Show profile management, fingerprint features

### Pricing Strategy

**Launch offer:** 
- 3 tháng đầu: Free plan 10 profiles (double normal)
- Starter: 50k VND/tháng (giảm từ 70k) trong 6 tháng đầu
- Lifetime deal cho 50 user đầu tiên: 500k VND

---

## Landing Page Content

```
Hero: "Browser đa tài khoản cho người Việt"
      "Quản lý hàng trăm tài khoản Facebook, TikTok, Shopee
       mà không lo bị khóa. Giá chỉ từ 70k/tháng."

CTA: [Tải Miễn Phí] [Xem Demo]

Features:
- Fingerprint thật (không bị detect)
- Proxy riêng mỗi profile
- Tự động hóa với script
- Hỗ trợ tiếng Việt 24/7

Pricing table (3 tiers)
Testimonials
FAQ tiếng Việt
```

---

## Support Infrastructure

```
Support channels:
- Zalo OA (primary - VN users prefer)
- Facebook Page + Messenger
- Email: support@dtcbrowser.com
- Docs: docs.dtcbrowser.com

Response time target:
- Zalo/FB: < 4 giờ (business hours VN)
- Email: < 24 giờ
```

---

## Launch Metrics (Month 12 targets)

| Metric | Target |
|--------|--------|
| Free users registered | 500 |
| Paid users | 100 |
| Monthly revenue | ~7-10M VND (~$300-400) |
| Zalo group members | 300+ |
| YouTube subscribers | 500+ |
| Churn rate | < 15%/tháng |

---

## Crash Reporting Setup

```typescript
// main/index.ts
import * as Sentry from '@sentry/electron/main'

if (!isDev) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Only send if user opted in
    beforeSend: (event) => {
      const optIn = db.prepare("SELECT value FROM settings WHERE key='analytics_optin'").get()?.value
      return optIn === 'true' ? event : null
    }
  })
}
```

---

## Files to Create

| File | Action | Description |
|------|--------|-------------|
| `src/main/index.ts` | modify | Add Sentry crash reporting |
| `src/renderer/src/pages/settings-page.tsx` | modify | Analytics opt-in toggle |
| `build/entitlements.mac.plist` | create | macOS notarization entitlements |
| `build/icon.png` | create | App icon (1024x1024) |
| `docs/setup-guide-vi.md` | create | Vietnamese setup guide |
| `docs/local-api.md` | create | API documentation |

---

## Todo

- [ ] Buy code signing certificate (Windows: ~$70/năm, macOS: Apple Developer $99/năm)
- [ ] Setup macOS notarization in CI
- [ ] Build landing page (simple static site, Vercel)
- [ ] Record 2 YouTube tutorials
- [ ] Create Zalo OA + Facebook Page
- [ ] Setup Sentry (free tier)
- [ ] Soft launch: share trong 3-5 FB groups nhỏ trước
- [ ] Collect feedback, fix critical bugs (2 tuần)
- [ ] Hard launch: tất cả channels
- [ ] Monitor: license activations, crash reports, support tickets

---

## Success Criteria

- App installs trên Windows + macOS không bị antivirus/Gatekeeper chặn
- First 100 registered users trong tháng 12
- First 10 paying users
- < 5 critical crash reports/tuần

---

## Unresolved Questions

1. Domain name choice: dtcbrowser.com, dtcbr.io, hay khác?
2. License server: Cloudflare Workers (free tier) vs Railway vs self-hosted VPS?
3. Analytics: anonymous telemetry opt-in? Mixpanel, PostHog, hay custom?
4. Windows code signing: EV cert (~$300/năm) vs standard cert (~$70/năm)?
