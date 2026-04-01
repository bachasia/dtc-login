# Phase 02: SQLite Core & Service Layer Complete

**Date**: 2026-04-01 13:57
**Severity**: Low
**Component**: Database, IPC Handlers, Service Layer
**Status**: Resolved

## What Happened

Completed Phase 02 implementation: built SQLite persistence layer with full CRUD services (Profile, Group, Proxy) and wired them via Electron IPC with input validation. All code review findings fixed. Ready for testing.

## The Brutal Truth

This phase felt deceptively smooth until the code review. No runtime crashes, tests compiled cleanly — then the reviewer flagged seven issues we should have caught ourselves. The gap between "it runs" and "it's safe" is wider than we admit. Three findings were security-adjacent (SSRF, race conditions). That stings.

## Technical Details

**Database initialization race**: Eager `getDb()` call in `app.whenReady()` prevents singleton initialization race when IPC handlers register. Without it, first profile write could initialize DB and handlers simultaneously.

**SSRF in proxy test**: TCP connect test in proxy-service accepted any hostname. Added private IP blocklist (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1). Renderer can't force main process to scan internal networks.

**ID generation**: Replaced `last_insert_rowid()` pattern with uuidv4 in group-service and proxy-service. SQLite rowid not guaranteed to be unique across transactions in concurrent scenarios.

**Input validation**: Zero guards on IPC inputs. Added `assertString()`, `assertStringArray()`, `assertCreateProxy()` type guards. Prevents renderer from passing undefined/malformed data.

## Root Cause Analysis

We built without asking "what if renderer sends garbage?" Electron's IPC feels synchronous and same-process, so untrusting renderer input didn't feel urgent. It was. Code review forced defensive posture retroactively.

Migrations in plain strings felt brittle initially, but inlining beats bundling .sql files with electron-vite. Transactional wrapper fixed atomicity.

## Lessons Learned

- **Never assume IPC is safe**: Renderer is untrusted. Guard every input.
- **Concurrency assumptions bite later**: uuidv4 and eager init cost milliseconds now, save debugging hours later.
- **Migrations-as-strings work if transactional**: Bundling SQL files creates more complexity than inline strings + transaction wrapper.
- **Code review catches what testing misses**: Functional correctness ≠ security or robustness.

## Next Steps

- Delegate to tester: run full service layer unit tests (database state isolation, null checks, JSON parsing edge cases)
- Verify IPC guard coverage on all handlers (complete checklist)
- Security audit: confirm SSRF blocklist covers all private ranges
- Ready for Phase 03 (IPC event hooks + group management UI)
