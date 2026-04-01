# Phase 01: Electron + React Foundation Shipped, Security Review Caught Runtime Leaks

**Date**: 2026-04-01
**Severity**: Medium
**Component**: Core architecture, Electron main/renderer process, IPC layer
**Status**: Resolved

## What Happened

Bootstrapped the entire Electron + React + TypeScript foundation for the antidetect browser in a single session. Built project scaffold with main process, preload contextBridge, renderer, shared types, and electron-builder config. Code review caught two critical runtime security flaws before they became production issues. All fixes landed in commit 27 files, ~10k LOC.

## The Brutal Truth

Shipping 10k lines in one session is efficient until the code reviewer finds you didn't think about listener cleanup. The fix was simple—return an unsubscribe function from `on()` calls—but it exposed that IPC handlers can leak into React effects without discipline. That's a design flaw disguised as an implementation detail. Also, documenting `sandbox: false` upfront is embarrassing (we know it's normally a security red flag), but Phase 03 demands Camoufox process spawning, so we accept the tradeoff with eyes open. Better to document risk than pretend it doesn't exist.

## Technical Details

**Security issues found during code review:**

1. `contextBridge.on()` returned void—no way to unsubscribe. React useEffect cleanup patterns would leak listeners. Fixed: return unsubscribe function for scoped cleanup.
2. `sandbox: false` set without explanation. Looks like reckless configuration. Added inline comment: "Phase 03 requires spawning Camoufox from preload; full Node API access needed." Context prevents future blame.

**Type safety improvement:**

- Created `env.d.ts` declaring `window.electronAPI` shape for renderer. Prevents type errors when calling IPC handlers from React.
- Fixed `CreateProfileInput` to exclude `id` and timestamps—prevents IDOR vulnerabilities if renderer accidentally included those fields.

**Architecture locked in:**

- `contextIsolation: true`, `nodeIntegration: false` from day 1. Non-negotiable.
- IPC handlers are stubs; logic will be implemented phase by phase.

## What We Tried

Didn't try shortcuts. Built it right: preload validators, type guards in IPC layer, descriptive handler names. Code review was surgical—two issues, both fixed in isolation, no rework.

## Root Cause Analysis

Not really a failure. Code review works. The contextBridge listener pattern is unintuitive—you have to know that Electron IPC doesn't automatically clean up subscribers. We now know this; next feature will be built with unsubscribe patterns from the start. Type safety caught the IDOR risk before it shipped.

## Lessons Learned

1. **Document constraints, not excuses.** `sandbox: false` looks scary. One comment explaining _why_ prevents future developers from blindly changing it "to be secure."
2. **Listener cleanup is not obvious.** Return unsubscribe functions from `on()` calls. Future maintainers will thank you in React useEffect cleanup phases.
3. **Type guards catch intent bugs.** Excluding `id`/timestamps from input types isn't just style—it's a boundary. Enforce it.

## Next Steps

- Address 14 npm audit vulnerabilities before production (4 low, 5 mod, 5 high in devDependencies). Not blocking Phase 02.
- Phase 02 (Browser Engine Setup): Integrate Camoufox, validate preload can spawn processes without security breakage.
- All stub IPC handlers will be replaced as phases land.

---

**Status**: DONE

Foundation is secure, scalable, and type-safe. Ready for browser engine integration.
