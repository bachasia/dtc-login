# Code Review — Phase 04: React UI

**Date:** 2026-04-01
**Reviewer:** code-reviewer agent
**Scope:** Phase 04 React UI layer — 13 files (new + modified)
**Build:** PASS (electron-vite, 0 errors)
**TS check:** PASS (tsc --noEmit, 0 errors)
**Lint (src/):** 23 errors, 150 warnings — errors are missing return types + 2 unused-var (`Fingerprint`, `_removed`) in `use-ipc.ts` / `profile-store.ts` only; all are non-breaking style issues, not logic bugs

---

## Overall Assessment

Solid, well-structured phase. IPC boundary is properly guarded. Zustand + TanStack Query split is idiomatic. No critical security holes found. Three medium-severity bugs and several informational items below.

---

## Critical Issues

None.

---

## High Priority

### H1 — Unhandled rejection in `profile-form-dialog.tsx` can silently swallow submit errors

**File:** `src/renderer/src/components/profile-form-dialog.tsx:79`

```tsx
onSubmit={(event) => void handleSubmit(event)}
```

`handleSubmit` calls `mutateAsync` without a try/catch. If the IPC call throws (e.g., network/IPC failure), the `void` operator discards the rejection — no error is shown to the user and `onClose()` is never called, leaving the modal locked open in a non-pending state (because `isPending` resets on error).

Same pattern repeated in `proxy-form-dialog.tsx:42`.

**Impact:** User clicks "Luu Profile", the call fails silently, modal appears frozen (button re-enables, no feedback). Requires force-close.

**Fix:** Wrap `mutateAsync` calls in try/catch inside `handleSubmit`, or use `onError` callback in the mutation. At minimum:

```tsx
try {
  if (profile) await updateProfile.mutateAsync(...)
  else await createProfile.mutateAsync(...)
  onClose()
} catch {
  // show error toast / alert
}
```

---

### H2 — `browser:stop` IPC handler does not await: stop failure is undetectable

**File:** `src/main/ipc-handlers.ts:80-83`

```ts
ipcMain.handle('browser:stop', (_e, profileId: unknown) => {
  browserService.stop(assertString(profileId, 'profileId'))
  return { success: true }
})
```

`browserService.stop` is called but not awaited (no `async/await`). If `stop` is async and throws, the error is silently dropped and `{ success: true }` is returned regardless of actual outcome. The renderer's `useStopBrowser` also does not check the return value, so there is no visible signal of failure.

**Fix:** Either make the handler `async` and `await` the stop call (if stop is async), or confirm `stop` is intentionally sync and document it. Also add a `{ success: boolean }` error path in `handleStopBrowser` on the renderer side.

---

## Medium Priority

### M1 — `browser:status-changed` race: stale `updateSession` closure does not matter, but lost events do

**File:** `src/renderer/src/App.tsx:29-45`

The `useEffect` correctly lists `updateSession` in dependencies, but the `browser.status()` call inside the handler is async — if two rapid `stopped` + `started` events arrive, the second async `.status()` call could resolve before or after the first, resulting in a stale session reference being written. This is a classic async ordering bug.

Additionally, if the Electron window re-focuses between events, TanStack Query's `refetchOnWindowFocus: false` is set, which is good — but the Zustand `sessions` state and TanStack `profiles` cache can diverge (profiles list shows stale data while sessions map is current, or vice versa).

**Impact:** Low probability in practice (single user, sequential browser ops) but worth documenting.

**Fix (low effort):** For the `started` case, prefer using the `session` from the event payload `data.session` if the backend sends it, rather than firing a second async `browser.status` IPC round-trip. That eliminates the race entirely.

---

### M2 — `assertFingerprintInput` is absent for `fingerprints:generate`

**File:** `src/main/ipc-handlers.ts:90-93`

The new fingerprint handler casts `input` directly without validating field values:

```ts
const opts =
  input && typeof input === 'object'
    ? (input as { os?: Array<'windows' | 'macos' | 'linux'>; locale?: string })
    : undefined
```

The `os` array is never validated — a renderer could pass `os: ['windows', 'injected_value']`. Whether `generateFingerprint` is tolerant of unknown strings depends on the implementation of `fingerprint-generator`, but the validator here should mirror the allowlist used in `preload/index.ts`. The `locale` string is also unvalidated (arbitrary string passed to `fingerprint-generator`).

**Fix (low effort):**

```ts
const VALID_OS = ['windows', 'macos', 'linux'] as const
if (Array.isArray(opts?.os) && !opts.os.every((v) => VALID_OS.includes(v))) {
  throw new Error('invalid os value')
}
```

---

### M3 — `proxy-form-dialog.tsx`: state reset runs after `onClose()` — harmless but ordering is confusing

**File:** `src/renderer/src/components/proxy-form-dialog.tsx:30-35`

```ts
await createProxy.mutateAsync(...)
onClose()      // hides dialog
setName('')    // resets state after close
```

The component returns `null` when `!open`, so state resets after the component unmounts — they are no-ops. However, if the parent ever memoizes the dialog or switches to a CSS `display:none` pattern, stale state would persist between opens. The reset should happen _before_ `onClose()` or inside the `useEffect([open])` pattern already used in `profile-form-dialog`.

---

## Low Priority

### L1 — `use-ipc.ts`: `Fingerprint`, `Session` imported but `Fingerprint` unused at module level

**File:** `src/renderer/src/hooks/use-ipc.ts:6`

ESLint reports `Fingerprint` as defined but never used. It's likely a leftover from an earlier draft — `BrowserStartResponse` at line 117 uses `Session` but `Fingerprint` appears only in the import. Remove to keep lint clean.

### L2 — `profile-store.ts`: `_removed` unused variable in destructuring

**File:** `src/renderer/src/stores/profile-store.ts:30`

```ts
const { [profileId]: _removed, ...rest } = state.sessions
```

The `_removed` variable triggers `@typescript-eslint/no-unused-vars`. Use `void` prefix or the eslint-disable comment pattern if the intent is deliberate:

```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { [profileId]: _removed, ...rest } = state.sessions
```

### L3 — `fingerprint-editor.tsx`: custom screen dimensions are silently ignored

When user selects "Tuy chinh" from the screen dropdown, the `onChange` handler returns early (`if (!screen) return`) rather than presenting inputs for manual width/height entry. The value stays at the last selected preset. This is a UX gap, not a bug.

### L4 — `sidebar.tsx`: duplicate sync of groups into Zustand store

`Sidebar` syncs `groups` from TanStack Query into Zustand via `setGroups(groups)` in a `useEffect`. `ProfilesPage` also syncs `profiles` via `setProfiles(profiles)`. Neither component requires both synced values simultaneously — the store is used primarily for `sessions`, `selectedGroup`, and `selectedIds`. Consider whether the groups/profiles sync is actually needed in the store, or if components should read directly from TanStack Query. Mixing two sources for the same data can cause subtle stale-data bugs.

### L5 — No `aria-label` on icon-only / short-text buttons

Buttons labeled "+" (add group) and "X" (close) lack `aria-label`. Low priority for an internal desktop tool but worth noting for future accessibility pass.

---

## Positive Observations

- IPC channel allowlist in `preload/index.ts` (`validChannels`) is correctly implemented — no arbitrary channel injection possible from renderer.
- `assertString`, `assertStringArray`, `assertCreateProxy` guards are comprehensive and applied consistently to all main-process handlers.
- `updateSession` reducer in `profile-store.ts` correctly produces a new object rather than mutating state.
- `useEffect` in `App.tsx` returns the unsubscribe function — no IPC listener leak.
- `QueryClientProvider` with `refetchOnWindowFocus: false` is a sensible default for a desktop Electron app where window focus events are frequent.
- `ProfileFormDialog` uses `useEffect([open, profile])` to reset form state on open — clean controlled-form pattern.
- `fingerprintsInput` in preload is typed narrowly (vs `unknown`) and validated consistently with `env.d.ts`.
- Build is fully clean — zero compilation errors.

---

## Recommended Actions (Prioritized)

1. **[H1]** Add try/catch around `mutateAsync` in `profile-form-dialog.tsx` and `proxy-form-dialog.tsx` to display errors and prevent silent modal lock.
2. **[H2]** Verify `browserService.stop` sync/async contract; if async, add `await` in the handler.
3. **[M2]** Add OS allowlist validation in `fingerprints:generate` handler; validate `locale` is a non-empty string.
4. **[M3]** Move proxy form state reset to before `onClose()` (or rely on the `useEffect([open])` guard pattern).
5. **[L1/L2]** Fix the two unused-variable ESLint errors in `use-ipc.ts` and `profile-store.ts`.
6. **[L4]** Evaluate whether groups/profiles Zustand sync is necessary or if TanStack Query data can be consumed directly.

---

## Metrics

- Build errors: 0
- TS errors: 0
- ESLint errors (src/): 23 (all return-type + 2 unused-var — no logic errors)
- ESLint warnings (src/): 150 (all prettier formatting)

---

## Unresolved Questions

1. Is `browserService.stop()` synchronous or async? The handler assumes sync but does not document it.
2. Does the `browser:status-changed` event payload from the main process include a `session` field on `started`? If so, the async re-fetch in `App.tsx` can be eliminated.
3. Are there plans for error toast infrastructure? Currently all async errors in the UI are surfaced via `window.alert` (profiles-page) or silently dropped (dialogs). A consistent error boundary or toast would be needed before production.
