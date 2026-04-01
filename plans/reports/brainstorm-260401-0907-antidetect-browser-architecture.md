# Brainstorm Report: Antidetect Browser cho VN Market

**Date:** 2026-04-01 09:07 | **Author:** solo dev

---

## Problem Statement

Xây dựng antidetect browser desktop app tương tự AdsPower, target thị trường VN (MMO, affiliate, e-commerce), solo developer, timeline 6-12 tháng.

## Evaluated Approaches

| Option | Mô tả | Verdict |
|--------|-------|---------|
| A: Electron + CDP | Wrapper app + JS fingerprint injection | 80% tính năng, feasible solo |
| B: Fork Chromium | C++ level patches từ đầu | 2-3 năm solo, không khả thi |
| C: Patched engine | Dùng Camoufox (Firefox patched C++) + build UI | **CHOSEN** |

## Final Solution

**Stack:** Electron + React + TypeScript + Camoufox + SQLite + Express

**Architecture:**
- Electron = desktop shell (UI, API server, process manager)
- Camoufox = browser engine (Firefox patched at C++ level, MPL-2.0)
- SQLite = local profile storage
- Express = Local API (AdsPower-compatible, port 50325)
- Playwright = automation connector
- @apify/fingerprint-generator = realistic fingerprint generation

**Key insight:** Camoufox patches fingerprint ở C++ level (Canvas noise, WebGL, WebRTC, human cursor) → không bị detect qua JS inspection. Tốt hơn JS injection approach.

## Competitive Strategy (VN Market)

- Giá: $3-5/tháng vs AdsPower $9+
- UI tiếng Việt (vs EN/CN)
- Support Zalo/FB group
- Profile templates cho FB Ads, TikTok Shop, Shopee

## Architecture Decisions

1. Camoufox runs as separate OS processes (not Electron's Chromium)
2. Each profile = separate Firefox profile directory
3. Local API on main process (Express :50325)
4. contextIsolation: true, nodeIntegration: false (security)
5. electron-builder for cross-platform binary bundling

## SQLite Schema

Tables: `profiles`, `groups`, `proxies`, `sessions`, `settings`
- profiles: id, name, group_id, proxy_id, fingerprint (JSON), tags
- sessions: profile_id, pid, debug_port, ws_endpoint, started_at

## Directory Structure

```
src/main/services/     # profile, browser, proxy, fingerprint, local-api
src/preload/           # contextBridge API
src/renderer/          # React pages + components + Zustand stores
src/shared/            # TypeScript types
resources/camoufox/    # Bundled binaries (win32/darwin/linux)
```

## Roadmap

| Phase | Timeline | Deliverable |
|-------|----------|-------------|
| MVP Core | Month 1-2 | Launch/close profile, basic fingerprint, proxy |
| UI Complete | Month 3-4 | Electron app, profile/group management |
| Automation API | Month 5-6 | Local API, Selenium/Playwright integration |
| VN Features | Month 7-8 | FB/TikTok/Shopee templates, cookie import |
| Licensing | Month 9-10 | Payment (SePay/Polar), license management |
| Launch | Month 11-12 | Marketing VN, first 100 users |

## Risks

- Camoufox maintainer hospitalized (March 2025) → use coryking/camoufox fork
- Bot detection updates → active community, update regularly
- Competition with Hidemyacc (VN) → price + support differentiation

## Resources

- [Camoufox GitHub](https://github.com/daijro/camoufox)
- [Camoufox fork (active)](https://github.com/coryking/camoufox)
- [Camoufox docs](https://camoufox.com)
- [Apify fingerprint-suite](https://github.com/apify/fingerprint-suite)
- [AdsPower Local API docs](https://localapi-doc-en.adspower.com)
- [Hidemyacc (VN competitor)](https://hidemyacc.com)

## Unresolved Questions

1. Camoufox Firefox-based → nhiều user VN quen Chrome, có cần thêm Chromium-based engine?
2. Cloud sync profiles: self-hosted hay dùng service bên ngoài?
3. RPA recording feature: xây từ đầu hay tích hợp existing tool?
4. CAPTCHA solving: tích hợp 2captcha/CapMonster hay để user tự handle?
