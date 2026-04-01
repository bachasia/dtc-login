## Code Review Summary

### Scope
- Files: 
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/data/profile-templates.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/cookie-service.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/ipc-handlers.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/preload/index.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/env.d.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/hooks/use-ipc.ts`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/components/profile-form-dialog.tsx`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/components/profile-table.tsx`
  - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/pages/profiles-page.tsx`
- Focus: Recent MVP additions (templates + cookie import), correctness/security/maintainability
- Scout findings: `ck scout` returned no output; manual edge-case scouting performed

### Overall Assessment
Feature direction is good and IPC typing is consistent end-to-end. Main risks are at trust boundary and file I/O handling in cookie import path.

### Critical Issues
1. **Renderer-controlled file path crosses trust boundary without restriction**
   - Location:
     - `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/ipc-handlers.ts` (`profiles:import-cookies`)
     - `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/cookie-service.ts` (`readFileSync(filePath, 'utf8')`)
     - `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/pages/profiles-page.tsx` (`window.prompt` path input)
   - Impact:
     - Any compromised renderer (XSS/supply-chain UI bug) can force main process to read arbitrary local files by absolute path.
     - Even if content is not returned directly, this still creates a local file access primitive and DoS vector.
   - Minimal fix:
     - Move file selection to main process (`dialog.showOpenDialog`) and only import selected file paths.
     - Enforce allowlist extensions (`.json`, `.txt`) + size cap before reading.

### High Priority
1. **Main-thread blocking synchronous file I/O in Electron main process**
   - Location: `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/cookie-service.ts` (`readFileSync`, `writeFileSync`)
   - Impact: Large cookie files can freeze app responsiveness (UI/main thread stall).
   - Minimal fix: switch to `fs/promises` async APIs and reject oversized files (e.g., >5MB).

2. **Boolean coercion bug can mis-import cookie flags**
   - Location: `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/cookie-service.ts`
     - `secure: Boolean(raw['secure'])`
     - `httpOnly: Boolean(raw['httpOnly'])`
   - Impact: string values like `'false'` become `true`; cookie semantics corrupted.
   - Minimal fix: explicit parser:
     - `true | 'true' | 1` => true
     - `false | 'false' | 0` => false
     - otherwise default false.

### Medium Priority
1. **Unbounded parsing/memory risk for malformed or huge input**
   - Location: `/Users/bachasia/Data/VibeCoding/dtc-login/src/main/services/cookie-service.ts`
   - Impact: full-file parse (`JSON.parse`, `.split().map()`) with no hard size/row limits can spike memory and stall app.
   - Minimal fix: `stat` size limit + line count cap for Netscape parse.

2. **Maintainability: dialog component exceeds project size guideline**
   - Location: `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/components/profile-form-dialog.tsx` (~320 LOC)
   - Impact: increased change risk and review cost.
   - Minimal fix: split tab sections into child components (`general-tab`, `proxy-tab`, `overview-panel`).

### Low Priority
1. **Template select uses uncontrolled `defaultValue`, easy to drift from state on reopen**
   - Location: `/Users/bachasia/Data/VibeCoding/dtc-login/src/renderer/src/components/profile-form-dialog.tsx`
   - Impact: UX inconsistency in clone/edit flows.
   - Minimal fix: control select with local `selectedTemplateId` state and reset in `useEffect`.

### Edge Cases Found by Scout
- Concurrent imports for same profile overwrite same output file (`imported-cookies.json`) last-write-wins.
- Relative/space-padded paths from prompt can fail non-obviously; no canonicalization.
- Inputs with string booleans (`"false"`) and mixed schemas produce silently wrong cookie flags.

### Positive Observations
- IPC input guards are present and generally strict (`assertString`, `assertApiSettingsPatch`, etc.).
- Error messages are sanitized via `toIpcErrorMessage` to avoid leaking long stack traces.
- Renderer/main typing for new IPC methods is mostly consistent.

### Recommended Actions
1. Block trust-boundary risk first: replace renderer path prompt with main-process file picker + allowlist + size checks.
2. Make cookie import non-blocking: async fs + size/line caps.
3. Fix boolean parsing for `secure`/`httpOnly` to avoid semantic corruption.
4. (Non-blocking) modularize `profile-form-dialog.tsx` for maintainability.

### Metrics
- Type Coverage: Not measured in this review
- Test Coverage: Not measured in this review
- Linting Issues: Not measured in this review

### Unresolved Questions
- Should imported cookies be encrypted-at-rest under profile storage, or is plaintext JSON acceptable by product/security policy?
- Should import behavior merge with existing cookie state or always replace (current behavior is overwrite)?
