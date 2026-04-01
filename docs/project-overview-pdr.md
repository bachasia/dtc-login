# Project Overview & PDR — DTC Browser

## Executive Summary

**DTC Browser** is a desktop antidetect browser built on Electron + React + TypeScript, targeting the Vietnamese market. It enables users to manage multiple browser profiles with custom fingerprints and proxies, bypassing fingerprint-based detection and geo-restrictions.

**Status:** Phase 04 (React UI) complete. Phase 05 (Automation & Local API) in planning.

---

## Product Definition

### Vision

Empower Vietnamese businesses and individuals with a lightweight, privacy-focused desktop browser that:

- Manages unlimited browser profiles with independent fingerprints
- Routes traffic through custom proxies (HTTP/HTTPS/SOCKS)
- Automatically assigns fingerprints per profile (OS, browser version, screen resolution, timezone)
- Provides simple UI for non-technical users

### Target Market

- **Primary:** Vietnamese e-commerce, affiliate marketing, multi-account SMEs
- **Secondary:** Global users requiring fingerprint/proxy rotation
- **Exclusions:** Malware, illegal activity — use Acceptable Use Policy (AUP)

### Core Value Props

1. **Fingerprint Isolation** — Each profile has unique OS/browser/hardware signature
2. **Proxy Routing** — Support HTTP/HTTPS/SOCKS4/5 with authentication
3. **Bulk Profile Management** — Create/organize/delete profiles in bulk
4. **Cross-Platform** — Windows, macOS, Linux with native installers
5. **Lightweight** — Electron-based (~150MB installed, ~500MB with browser binary)

---

## Functional Requirements

### F1: Profile Management

| Requirement | Description                                                    | Priority |
| ----------- | -------------------------------------------------------------- | -------- |
| F1.1        | Create profile with custom name, fingerprint, proxy assignment | P1       |
| F1.2        | List all profiles with filters (group, proxy, status)          | P1       |
| F1.3        | Update profile (name, fingerprint, proxy, tags, notes)         | P1       |
| F1.4        | Delete single profile                                          | P1       |
| F1.5        | Bulk delete profiles (multi-select)                            | P2       |
| F1.6        | Export profiles as JSON (for backup)                           | P3       |
| F1.7        | Import profiles from JSON                                      | P3       |

### F2: Group Organization

| Requirement | Description                           | Priority |
| ----------- | ------------------------------------- | -------- |
| F2.1        | Create groups to organize profiles    | P1       |
| F2.2        | Assign profiles to groups             | P1       |
| F2.3        | Color-code groups for UI organization | P1       |
| F2.4        | List profiles by group                | P1       |
| F2.5        | Delete groups (reassign profiles)     | P1       |

### F3: Proxy Management

| Requirement | Description                               | Priority |
| ----------- | ----------------------------------------- | -------- |
| F3.1        | Add proxy (HTTP/HTTPS/SOCKS4/5 with auth) | P1       |
| F3.2        | List all proxies                          | P1       |
| F3.3        | Test proxy connectivity                   | P1       |
| F3.4        | Assign proxy to profile                   | P1       |
| F3.5        | Delete proxy                              | P1       |
| F3.6        | Bulk proxy import                         | P2       |

### F4: Browser Control

| Requirement | Description                                    | Priority |
| ----------- | ---------------------------------------------- | -------- |
| F4.1        | Launch browser with selected profile           | P1       |
| F4.2        | View browser status (running, PID, debug port) | P1       |
| F4.3        | Stop running browser                           | P1       |
| F4.4        | List all running browser sessions              | P2       |
| F4.5        | Auto-kill orphaned processes on app exit       | P1       |

### F5: Fingerprint Customization

| Requirement | Description                                                           | Priority |
| ----------- | --------------------------------------------------------------------- | -------- |
| F5.1        | Auto-generate fingerprint (random OS/browser/resolution/timezone)     | P1       |
| F5.2        | Manual fingerprint editor (text fields for OS, browser version, etc.) | P2       |
| F5.3        | Fingerprint presets (e.g., "Windows 11 Chrome latest")                | P2       |
| F5.4        | Raw JSON editor for advanced users                                    | P2       |

### F6: Application

| Requirement | Description                                                 | Priority |
| ----------- | ----------------------------------------------------------- | -------- |
| F6.1        | Settings panel (data directory, auto-update, logging level) | P2       |
| F6.2        | Auto-update via electron-updater                            | P2       |
| F6.3        | Keyboard shortcuts for common actions                       | P3       |
| F6.4        | Dark/light theme support                                    | P3       |

---

## Non-Functional Requirements

### NFR1: Performance

- **Profile load time:** < 500ms (list 1000 profiles)
- **Browser spawn:** < 3 seconds (from click to Camoufox process running)
- **Proxy test:** < 10 seconds per proxy
- **Database:** SQLite (local) — sub-100ms queries for typical workloads

### NFR2: Reliability

- **Crash recovery:** Auto-restore window state on restart
- **Data persistence:** SQLite ACID guarantees
- **Process cleanup:** Kill orphaned browser processes on app exit
- **Uptime target:** 99% (dev phase, improve before production)

### NFR3: Security

- **No credentials in transit:** All proxy auth stored locally in encrypted SQLite (future: add encryption)
- **Input validation:** All IPC inputs type-checked before use
- **Fingerprint privacy:** User controls fingerprint data, never sent to external service
- **Proxy auth:** Stored plaintext in SQLite (Phase 07: add AES-256 encryption)

### NFR4: Scalability

- **Profiles:** Support up to 10,000 profiles per installation
- **Concurrent browsers:** 1-2 typical (Electron memory limits on older machines)
- **Databases:** Single SQLite file (~1MB per 1000 profiles)

### NFR5: Usability

- **UI response:** All buttons respond within 200ms
- **Tooltips:** For all non-obvious controls
- **Accessibility:** Basic keyboard navigation (Phase 06+)
- **Help:** In-app help panel with FAQ (Phase 06+)

### NFR6: Deployment

- **Installer size:** < 150MB (excluding Camoufox binary)
- **Installation time:** < 2 minutes on consumer hardware
- **Code signing:** Windows SmartScreen, macOS notarization (Phase 07)
- **License:** MIT open source (or custom if monetized)

---

## Acceptance Criteria

### Phase 01: Electron Foundation

- ✓ App scaffolds with Electron 29 + React 18 + TypeScript
- ✓ IPC contextBridge pattern working (no direct Node access from renderer)
- ✓ Build pipeline: `npm run dev` (HMR), `npm run build` (bundles), `npm run package` (installers)
- ✓ TypeScript strict mode, ESLint, Prettier configured
- ✓ Cross-platform build targets: Windows x64, macOS arm64/x64, Linux x64

### Phase 02: Profile Manager & SQLite Core

- ✓ SQLite database schema (profiles, groups, proxies, sessions)
- ✓ CRUD services for profiles, groups, proxies
- ✓ IPC handlers (replace stubs)
- ✓ Database migrations system
- ✓ Type-safe inputs prevent IDOR attacks

### Phase 03: Camoufox Browser Launcher

- ✓ Camoufox binary bundled in resources/
- ✓ Browser spawn with profile fingerprint + proxy
- ✓ Process management (start, stop, status)
- ✓ Debug protocol WebSocket connection
- ✓ Event stream: browser:status-changed to renderer

### Phase 04: React UI (Desktop App)

- ✓ Profile list view with search, filter, sort
- ✓ Profile editor (create, edit, delete, bulk delete)
- ✓ Group manager
- ✓ Proxy manager
- ✓ Browser launcher (click to start)
- ✓ Responsive layout for 1024x600 and up

### Phase 05: Automation & Local API

- ✓ Local HTTP API (port 7777) for 3rd-party integrations
- ✓ Browser automation (Puppeteer/Playwright via debug protocol)
- ✓ Profile tagging + advanced search API

### Phase 06: VN Features & Polish

- ✓ Vietnamese localization (UI, help, docs)
- ✓ In-app help panel + FAQ
- ✓ Keyboard shortcuts
- ✓ Theme customization (dark/light)
- ✓ Settings panel

### Phase 07: Licensing & Monetization

- ✓ License key validation (local, offline-capable)
- ✓ Trial mode (14 days free)
- ✓ Pro features: browser automation, API access, priority support
- ✓ Code signing & notarization
- ✓ Auto-update endpoint

### Phase 08: Launch & Marketing

- ✓ Website + landing page
- ✓ Release notes + changelog
- ✓ Community: Telegram, Discord, GitHub issues
- ✓ Marketing materials (Vietnamese, English)

---

## Architecture Summary

### Process Model

```
Main Process (Node.js)
├─ BrowserWindow lifecycle
├─ IPC dispatch to services
├─ SQLite database
└─ Camoufox process spawn

Preload (Isolated)
├─ contextBridge.exposeInMainWorld('electronAPI')
└─ Safe IPC relay (ipcRenderer.invoke/on)

Renderer (React in Chromium)
├─ UI state management
├─ window.electronAPI.{feature}() calls
└─ No direct Node access
```

### Tech Stack

| Layer            | Technology              | Version  |
| ---------------- | ----------------------- | -------- |
| **Desktop**      | Electron                | 29.1.1   |
| **UI Framework** | React                   | 18.2.0   |
| **Language**     | TypeScript              | 5.3.3    |
| **Build**        | electron-vite           | 2.0.0    |
| **Package**      | electron-builder        | 24.13.3  |
| **Database**     | SQLite (better-sqlite3) | Phase 02 |
| **Browser**      | Camoufox                | Phase 03 |
| **Linting**      | ESLint 8                | 8.57.0   |
| **Formatting**   | Prettier                | 3.2.5    |

### Data Model (Phase 02+)

**Core Entities:**

- **Profile** — Browser session with fingerprint + proxy
- **Group** — Organize profiles
- **Proxy** — HTTP/HTTPS/SOCKS endpoint with auth
- **Session** — Runtime browser process state (PID, debug port)
- **Fingerprint** — OS, browser, hardware signature

**Schema Design:**

- All IDs: UUID v4 (not auto-increment) — prevents enumeration attacks
- Timestamps: Unix milliseconds (created_at, updated_at)
- Foreign keys: profiles.group_id → groups.id, profiles.proxy_id → proxies.id
- Indexes: on group_id, proxy_id for fast filtering

---

## Known Constraints & Risks

### Technical Debt

| Issue                          | Severity | Mitigation                 | Timeline |
| ------------------------------ | -------- | -------------------------- | -------- |
| npm audit warnings (14)        | Low      | Upgrade dependencies       | Phase 07 |
| sandbox: false in preload      | Medium   | Revisit after Phase 03     | Phase 04 |
| Plaintext proxy auth in SQLite | Medium   | Add AES-256 encryption     | Phase 07 |
| No error logging service       | Low      | Add structured logging     | Phase 06 |
| Camoufox binary size (~500MB)  | Medium   | Only bundle necessary arch | Phase 03 |

### Market Risks

| Risk                              | Impact | Mitigation                          |
| --------------------------------- | ------ | ----------------------------------- |
| Browser detection improves        | Medium | Continuous fingerprint updates      |
| Legal gray area (VN market)       | High   | AUP, Terms of Service, legal review |
| Competitor antidetect tools       | Medium | Focus on UX, VN localization        |
| Browser engine updates (Chromium) | Low    | Camoufox handles updates            |

---

## Success Metrics

### Phase 01

- ✓ App launches, React renders
- ✓ TypeScript strict mode, no errors
- ✓ Build succeeds on all platforms
- ✓ `npm run dev` with HMR working

### Phase 02

- ✓ 1000 profiles created and listed in < 500ms
- ✓ Profile CRUD fully functional
- ✓ Zero SQL injection vulnerabilities (parameterized queries)
- ✓ All IPC handlers tested

### Phase 03

- ✓ Browser spawns in < 3 seconds
- ✓ Fingerprint applied correctly to browser session
- ✓ Proxy routing verified (IP check)
- ✓ WebSocket debug protocol connected

### Phase 04

- ✓ UI renders 1000-profile list in < 1 second
- ✓ Bulk delete 100 profiles in < 5 seconds
- ✓ Mobile responsive (1024x600 minimum)

### Phase 07 (Launch)

- ✓ 1000+ downloads (first month)
- ✓ < 1% crash rate
- ✓ < 5 minutes avg session time

---

## Timeline & Roadmap

| Phase  | Duration | Status     | Deliverable                                              |
| ------ | -------- | ---------- | -------------------------------------------------------- |
| **01** | ~2 weeks | ✓ Complete | Electron scaffold, IPC skeleton, build pipeline          |
| **02** | ~2 weeks | ✓ Complete | SQLite, CRUD services, IPC implementations               |
| **03** | ~3 weeks | ✓ Complete | Camoufox launcher, fingerprint injection, proxy routing  |
| **04** | ~3 weeks | ✓ Complete | React UI, profile/group/proxy managers, browser launcher |
| **05** | ~2 weeks | Planned    | Local HTTP API, automation hooks, advanced search        |
| **06** | ~2 weeks | Planned    | VN localization, help system, polish, themes             |
| **07** | ~2 weeks | Planned    | Licensing, code signing, notarization, auto-update       |
| **08** | ~1 week  | Planned    | Website, launch marketing, community setup               |

**Total:** ~17 weeks (~4 months)  
**Start:** April 2026  
**Target Launch:** August 2026

---

## Next Steps

1. **Phase 05 Planning** — Define local HTTP API surface, automation hooks, authentication model
2. **Phase 05 Execution** — Implement HTTP API, automation workflows, advanced search filters
3. **Phase 06 Prep** — Gather VN localization copy, QA the new UI, plan help system components

---

## Glossary

| Term            | Definition                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| **Antidetect**  | Software that spoofs browser fingerprint to appear as different device/location |
| **Fingerprint** | Browser/OS/hardware signature (OS, browser version, screen res, timezone, etc.) |
| **Proxy**       | Intermediate server routing traffic (hides real IP, can set location)           |
| **Profile**     | Saved configuration: fingerprint + proxy + name + metadata                      |
| **Camoufox**    | Open-source Firefox fork with improved privacy (used as browser engine)         |
| **IPC**         | Inter-Process Communication (Electron: main ↔ renderer via contextBridge)       |
| **IDOR**        | Insecure Direct Object Reference (attacker guesses/modifies IDs)                |

---

## Related Documentation

- `./codebase-summary.md` — Project structure and Phase 01 deliverables
- `./system-architecture.md` — Component interactions, data flow, process model
- `./code-standards.md` — Coding conventions, module patterns, code review checklist
