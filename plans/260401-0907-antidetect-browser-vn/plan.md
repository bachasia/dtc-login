---
title: 'Antidetect Browser Desktop App — VN Market'
description: 'Electron + Camoufox desktop app for multi-account management targeting Vietnamese MMO/affiliate/e-commerce market'
status: pending
priority: P1
effort: 480h
issue: ~
branch: main
tags: [feature, frontend, backend, electron, antidetect]
blockedBy: []
blocks: []
created: 2026-04-01
---

# Antidetect Browser Desktop App — VN Market

## Overview

Build antidetect browser desktop app similar to AdsPower, using **Camoufox** (Firefox patched at C++ level) as browser engine + **Electron** as desktop shell. Target: Vietnamese MMO, affiliate, e-commerce users.

**Key differentiators vs AdsPower:**

- UI tiếng Việt
- Giá $3-5/tháng (vs $9+)
- Support Zalo/FB group
- Profile templates cho FB Ads, TikTok Shop, Shopee

**Brainstorm report:** `plans/reports/brainstorm-260401-0907-antidetect-browser-architecture.md`

---

## Architecture Summary

```
Electron Desktop App (shell)
├── React UI (tiếng Việt)
├── Main process services:
│   ├── Profile Manager (SQLite)
│   ├── Browser Launcher (spawns Camoufox)
│   ├── Proxy Manager
│   └── Local API Server (Express :50325)
└── Camoufox binaries (bundled per platform)
    └── Each profile = separate Firefox process + user-data-dir
```

**Stack:**

- Desktop: Electron + React + TypeScript
- Browser engine: Camoufox (Firefox C++-patched, MPL-2.0)
- Storage: SQLite (better-sqlite3)
- Automation API: Express.js (AdsPower-compatible format)
- Fingerprint: @apify/fingerprint-generator
- UI: Tailwind CSS + shadcn/ui
- State: Zustand
- Build: electron-builder

---

## Phases

| #   | Phase                                                                                | Timeline          | Status   |
| --- | ------------------------------------------------------------------------------------ | ----------------- | -------- |
| 01  | [Project Setup & Electron Foundation](phase-01-project-setup-electron-foundation.md) | Month 1, Week 1-2 | complete |
| 02  | [Profile Manager & SQLite Core](phase-02-profile-manager-sqlite-core.md)             | Month 1, Week 3-4 | complete |
| 03  | [Camoufox Browser Launcher](phase-03-camoufox-browser-launcher.md)                   | Month 2           | complete |
| 04  | [React UI Desktop App](phase-04-react-ui-desktop-app.md)                             | Month 3-4         | complete |
| 05  | [Automation & Local API](phase-05-automation-local-api.md)                           | Month 5-6         | pending  |
| 06  | [VN Features & Polish](phase-06-vn-features-polish.md)                               | Month 7-8         | pending  |
| 07  | [Licensing & Monetization](phase-07-licensing-monetization.md)                       | Month 9-10        | pending  |
| 08  | [Launch & Marketing VN](phase-08-launch-marketing.md)                                | Month 11-12       | pending  |

---

## Key Dependencies

```
Phase 01 → Phase 02 → Phase 03 → Phase 04 → Phase 05
                                              ↓
                                          Phase 06 → Phase 07 → Phase 08
```

Phases 01-03 = MVP Core (blocking). Phase 04+ = iterative enhancement.

---

## Project Structure

```
dtc-login/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Entry point
│   │   ├── ipc-handlers.ts      # IPC event registry
│   │   └── services/
│   │       ├── profile-service.ts
│   │       ├── browser-service.ts
│   │       ├── proxy-service.ts
│   │       ├── fingerprint-service.ts
│   │       └── local-api-service.ts
│   │   └── db/
│   │       ├── database.ts
│   │       └── migrations/001-init.sql
│   ├── preload/
│   │   └── index.ts             # contextBridge API
│   ├── renderer/                # React app
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── stores/
│   └── shared/
│       └── types.ts             # Shared TypeScript types
├── resources/
│   └── camoufox/                # Bundled binaries
│       ├── win32/
│       ├── darwin/
│       └── linux/
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

---

## Security Constraints

- `contextIsolation: true`, `nodeIntegration: false` in all renderer windows
- Local API authenticated via API key header
- Profile data stored locally only (no cloud in MVP)
- Proxy credentials encrypted at rest

---

## Success Criteria

- Launch/close Camoufox profile with custom fingerprint: ✓
- Each profile has isolated cookies, localStorage, proxy: ✓
- Local API returns AdsPower-compatible response format: ✓
- Selenium/Playwright can connect to running browser: ✓
- App packages and runs on Windows + macOS: ✓
- First 100 paying users (VN market): target Month 12
