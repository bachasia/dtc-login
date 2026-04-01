# UI Styling/Layout System Exploration
**DateTime:** 2026-04-01 21:15 ICT  
**Focus:** Modal + 3-tab + right overview panel layout (AdsPower-like)  
**Status:** Complete

---

## 1. RELEVANT FILES & LINE REFERENCES

### Core Styling System
- **`src/renderer/src/index.css`** (407 lines)
  - Design tokens: lines 7-47 (CSS variables for colors, typography, spacing)
  - Modal classes: lines 347-367 (`.modal-backdrop`, `.modal`, `.modal.large`)
  - Grid/flex layouts: lines 64-65, 295-305 (`.app-shell`, `.form-grid`, `.fingerprint-grid`)
  - Button styles: lines 132-226 (all button variants with transitions)
  - Card/container: lines 84-89 (`.card`)
  - Input/form: lines 247-292 (`.field-input`, `.input-with-icon`, `.field-label`)

### Modal Components (Current Implementation)
- **`src/renderer/src/components/proxy-form-dialog.tsx`** (144 lines)
  - Simple modal with 2-column form grid (lines 54-142)
  - Uses `.modal-backdrop` + `.modal` structure
  - Form layout: `.form-grid` (2 columns)

- **`src/renderer/src/components/profile-form-dialog.tsx`** (175 lines)
  - Extended modal with `.modal.large` variant (line 95)
  - Nested component: `<FingerprintEditor>` (line 154)
  - Form grid + card-based sections

- **`src/renderer/src/components/fingerprint-editor.tsx`** (125 lines)
  - Card-based section with `.fingerprint-grid` (2-column grid, line 35)
  - Demonstrates nested grid pattern within forms

### Layout Patterns
- **`src/renderer/src/App.tsx`** (65 lines)
  - App shell: `.app-shell` grid (sidebar 290px + main 1fr, lines 50-60)
  - Page routing structure

- **`src/renderer/src/pages/profiles-page.tsx`** (194 lines)
  - `.page-container` flex column layout (lines 111-192)
  - `.top-bar` with search + actions (lines 112-143)
  - Table wrapper pattern (lines 171-181)

- **`src/renderer/src/pages/settings-page.tsx`** (236 lines)
  - `.settings-grid` flex column (line 110)
  - Nested sections with `.group-box` (line 149)
  - Demonstrates vertical stacking pattern

---

## 2. WHAT CAN BE REUSED DIRECTLY

### Design Tokens (Ready to Use)
```css
/* Colors */
--bg, --surface, --surface-2, --text, --muted, --border
--primary, --primary-2, --danger, --danger-2, --ok

/* Typography */
--font-14, --font-16, --font-20

/* Spacing */
--space-6, --space-8, --space-10, --space-12, --space-14, --space-16, --space-20
```

### Reusable CSS Classes
| Class | Purpose | Notes |
|-------|---------|-------|
| `.modal-backdrop` | Overlay | Fixed, centered, z-index 30 |
| `.modal` | Container | 620px max, 14px padding, border-radius 14px |
| `.modal.large` | Wide variant | 900px max |
| `.card` | Section container | Surface bg, border, 12px padding, 12px border-radius |
| `.form-grid` | 2-column form | `grid-template-columns: 1fr 1fr`, 10px gap |
| `.field-label` | Form label | Flex column, 6px gap |
| `.field-input` | Input/select | 38px min-height, 10px border-radius |
| `.primary-btn` | Primary action | Blue bg, white text, hover shadow |
| `.secondary-btn` | Secondary action | Surface-2 bg |
| `.ghost-btn` | Tertiary action | Transparent, text color |
| `.danger-btn` | Destructive | Red bg, white text |
| `.inline-actions` | Button row | Flex, 8px gap, wrappable |
| `.top-bar` | Header row | Flex, space-between, 8px gap |
| `.group-box` | Vertical section | Flex column, 10px gap |

### Button Styling System
- **Shared properties** (lines 132-149):
  - Border, border-radius 10px, padding 8px 10px
  - Smooth transitions (180ms ease for colors/borders, 120ms for transform)
  - Focus-visible outline (2px solid, 1px offset)
  - Active state: `translateY(1px) scale(0.99)`

- **Hover effects**:
  - Primary: darker shade + shadow
  - Secondary: border + bg color-mix
  - Ghost: border + subtle bg

### Input System
- Consistent 38px min-height across all inputs
- 10px border-radius
- Surface-2 background
- Border color from `--border` token
- Focus-visible outline matching buttons

### Responsive Constraints
- Modal: `min(620px, 95vw)` for standard, `min(900px, 96vw)` for large
- Search input: `min(420px, 100%)`
- App shell: Fixed 290px sidebar + 1fr main
- No media queries currently (desktop-first, Electron app)

---

## 3. STYLING GAPS FOR 80-90% SIMILARITY

### Missing Tab Component
**Gap:** No existing tab navigation pattern
- Current: Simple page routing (App.tsx line 8: `type PageKey`)
- Needed: Tab bar with active state styling
- **Recommendation:** Create `.tab-list` + `.tab-button` classes
  ```css
  .tab-list {
    display: flex;
    gap: var(--space-8);
    border-bottom: 1px solid var(--border);
  }
  
  .tab-button {
    /* Reuse nav-button base, add bottom border indicator */
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-10) var(--space-12);
    cursor: pointer;
    transition: border-color 180ms ease, color 180ms ease;
  }
  
  .tab-button.active {
    border-bottom-color: var(--primary);
    color: var(--primary);
  }
  ```

### Missing Right Panel Layout
**Gap:** No side-by-side panel pattern (modal currently single-column)
- Current: `.form-grid` is 2-column for form fields only
- Needed: Modal with left content area + right overview sidebar
- **Recommendation:** Create `.modal-with-sidebar` layout
  ```css
  .modal-content {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--space-16);
  }
  
  .modal-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }
  
  .modal-sidebar {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: var(--space-12);
    display: flex;
    flex-direction: column;
    gap: var(--space-10);
  }
  ```

### Missing Tab Content Container
**Gap:** No pattern for switching between tab panels
- Current: Page-level routing only
- Needed: Tab-scoped content switching within modal
- **Recommendation:** Create `.tab-content` + `.tab-panel` classes
  ```css
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }
  
  .tab-panel {
    display: none;
  }
  
  .tab-panel.active {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }
  ```

### Missing Responsive Constraints for Tab+Panel
**Gap:** No breakpoint handling for narrow viewports
- Current: Modal uses `min(900px, 96vw)` but no internal responsive behavior
- Needed: Stack sidebar below tabs on narrow screens
- **Recommendation:** Add media query
  ```css
  @media (max-width: 1024px) {
    .modal-content {
      grid-template-columns: 1fr;
    }
    
    .modal-sidebar {
      order: -1; /* Move above main content */
    }
  }
  ```

### Missing Scroll Behavior
**Gap:** No overflow handling for tall content
- Current: Modal has no max-height or scroll container
- Needed: Scrollable tab content area
- **Recommendation:** Add scroll container
  ```css
  .tab-content {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }
  ```

### Missing Section Dividers
**Gap:** No visual separator between tab sections
- Current: `.card` used for sections, but no divider pattern
- Needed: Subtle dividers between overview panel sections
- **Recommendation:** Use border-bottom on section headers
  ```css
  .overview-section {
    padding-bottom: var(--space-12);
    border-bottom: 1px solid var(--border);
  }
  
  .overview-section:last-child {
    border-bottom: none;
  }
  ```

---

## 4. IMPLEMENTATION READINESS

### Fully Reusable (0% Gap)
- Design tokens (colors, spacing, typography)
- Button system (all variants)
- Input/form system
- Card container
- Modal backdrop + base modal
- Flex/grid utilities

### Partially Reusable (20-30% Gap)
- Modal structure (needs sidebar layout extension)
- Form grid (needs tab content wrapper)
- Button styling (needs tab-specific active state)

### Needs New Implementation (70-80% Gap)
- Tab navigation bar
- Tab panel switching
- Right overview sidebar
- Responsive stacking behavior
- Scroll containers for tall content

---

## 5. UNRESOLVED QUESTIONS

1. **Tab styling preference:** Should active tab use bottom border (like nav buttons) or full background highlight?
2. **Overview panel width:** Fixed 280px or responsive percentage?
3. **Tab content scrolling:** Individual tab scroll or shared modal scroll?
4. **Modal height constraint:** Should modal be full viewport height or auto-fit content?
5. **Sidebar content structure:** Cards, sections, or custom layout for overview panel?

