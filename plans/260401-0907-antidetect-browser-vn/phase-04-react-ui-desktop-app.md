# Phase 04: React UI Desktop App

## Overview

- **Priority:** P1
- **Status:** complete
- **Depends on:** Phase 01, 02, 03
- **Timeline:** Month 3-4 (~40h)

## Goal

Build complete Electron desktop UI: profile list, create/edit profile, proxy manager, group management, real-time browser status. UI tiếng Việt, dark/light mode.

---

## Key Insights

- Dùng **shadcn/ui** components (Radix UI + Tailwind) — không reinvent từ đầu
- **Zustand** cho client state — đơn giản hơn Redux, đủ cho app này
- Profile list cần virtual scroll nếu 500+ profiles → dùng `@tanstack/react-virtual`
- Browser status update qua IPC event (`browser:status-changed`) → Zustand store update realtime
- **Sidebar layout** giống AdsPower: left nav, main content area, top bar
- Fingerprint editor: dropdown chọn OS/locale/timezone, screen size — không expose raw JSON cho user thường

---

## UI Architecture

```
App
├── Layout
│   ├── Sidebar (GroupList + NavLinks)
│   ├── TopBar (search, create button, bulk actions)
│   └── MainContent
│       ├── ProfilesPage (default)
│       ├── ProxiesPage
│       └── SettingsPage
├── Modals (Radix Dialog)
│   ├── ProfileForm (create/edit)
│   ├── FingerprintEditor
│   └── ProxyForm
└── Providers
    ├── ThemeProvider
    └── QueryClient (TanStack Query for IPC calls)
```

---

## Implementation Steps

### 1. Install UI dependencies

```bash
# shadcn/ui setup
npx shadcn@latest init
npx shadcn@latest add button input label select dialog table badge tooltip

# State + data fetching
npm install zustand @tanstack/react-query

# Icons
npm install lucide-react

# Virtual scroll (for large profile lists)
npm install @tanstack/react-virtual

# Date formatting
npm install date-fns
```

### 2. `src/renderer/src/stores/profile-store.ts`

```typescript
import { create } from 'zustand'
import type { Profile, Group, Session } from '@shared/types'

interface ProfileStore {
  profiles: Profile[]
  groups: Group[]
  sessions: Record<string, Session> // profileId → Session
  selectedGroup: string | null
  selectedIds: Set<string>

  // Actions
  setProfiles: (p: Profile[]) => void
  setGroups: (g: Group[]) => void
  updateSession: (profileId: string, session: Session | null) => void
  setSelectedGroup: (id: string | null) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profiles: [],
  groups: [],
  sessions: {},
  selectedGroup: null,
  selectedIds: new Set(),

  setProfiles: (profiles) => set({ profiles }),
  setGroups: (groups) => set({ groups }),
  updateSession: (profileId, session) =>
    set((state) => ({
      sessions: session
        ? { ...state.sessions, [profileId]: session }
        : Object.fromEntries(
            Object.entries(state.sessions).filter(([k]) => k !== profileId)
          ),
    })),
  setSelectedGroup: (selectedGroup) =>
    set({ selectedGroup, selectedIds: new Set() }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      next.has(id) ? next.delete(id) : next.add(id)
      return { selectedIds: next }
    }),
  clearSelection: () => set({ selectedIds: new Set() }),
}))
```

### 3. `src/renderer/src/hooks/use-ipc.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Generic hook for IPC calls via TanStack Query
export function useProfiles(groupId?: string) {
  return useQuery({
    queryKey: ['profiles', groupId],
    queryFn: () => window.electronAPI.profiles.list(groupId),
    staleTime: 0,
  })
}

export function useCreateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => window.electronAPI.profiles.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteProfiles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => window.electronAPI.profiles.bulkDelete(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useStartBrowser() {
  return useMutation({
    mutationFn: (profileId: string) =>
      window.electronAPI.browser.start(profileId),
  })
}
```

### 4. `src/renderer/src/pages/profiles-page.tsx` — skeleton

```typescript
import { useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProfileTable } from '@/components/profile-table'
import { ProfileFormDialog } from '@/components/profile-form-dialog'
import { useProfiles } from '@/hooks/use-ipc'
import { useProfileStore } from '@/stores/profile-store'

export function ProfilesPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { selectedGroup, selectedIds, clearSelection } = useProfileStore()
  const { data: profiles = [], isLoading } = useProfiles(selectedGroup ?? undefined)

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm profile..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={clearSelection}>
            <Trash2 className="h-4 w-4 mr-1" />
            Xóa {selectedIds.size} profile
          </Button>
        )}
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Tạo Profile
        </Button>
      </div>

      {/* Profile table */}
      <ProfileTable profiles={filtered} loading={isLoading} />

      {/* Create dialog */}
      <ProfileFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
```

### 5. Profile Table với browser launch button

```typescript
// components/profile-table.tsx — key columns:
// | Checkbox | Name | OS | Proxy | Status | Actions |
// Status badge: "Đang chạy" (green) / "Đã dừng" (gray)
// Actions: Open Browser, Edit, Delete

// Browser status từ IPC event
useEffect(() => {
  window.electronAPI.on('browser:status-changed', ({ profileId, status }) => {
    useProfileStore
      .getState()
      .updateSession(
        profileId,
        status === 'running' ? { profile_id: profileId, ...rest } : null
      )
  })
  return () => window.electronAPI.removeAllListeners('browser:status-changed')
}, [])
```

### 6. Fingerprint Editor Component

```typescript
// components/fingerprint-editor.tsx
// User-friendly form for common fingerprint fields:
// - OS: Windows / macOS / Linux (Select)
// - Screen: 1920x1080 / 2560x1440 / 1440x900 / Custom (Select)
// - Timezone: Asia/Ho_Chi_Minh / America/New_York / ... (Select)
// - Locale: vi-VN / en-US / ... (Select)
// - [Generate Random] button → calls fingerprint-service
// Hides raw JSON from users
```

### 7. Sidebar với Group management

```typescript
// components/sidebar.tsx
// - App logo + name
// - "Tất cả profiles" link (count badge)
// - Groups list (click to filter)
// - "+" add group inline
// - Bottom: Settings, version
```

---

## Files to Create

| File                                                  | Action | Description                   |
| ----------------------------------------------------- | ------ | ----------------------------- |
| `src/renderer/src/App.tsx`                            | modify | Layout + routing              |
| `src/renderer/src/stores/profile-store.ts`            | create | Zustand profile/session state |
| `src/renderer/src/hooks/use-ipc.ts`                   | create | TanStack Query wrappers       |
| `src/renderer/src/pages/profiles-page.tsx`            | create | Main profiles view            |
| `src/renderer/src/pages/proxies-page.tsx`             | create | Proxy management              |
| `src/renderer/src/pages/settings-page.tsx`            | create | App settings                  |
| `src/renderer/src/components/profile-table.tsx`       | create | Profile list table            |
| `src/renderer/src/components/profile-form-dialog.tsx` | create | Create/edit modal             |
| `src/renderer/src/components/fingerprint-editor.tsx`  | create | Fingerprint UI                |
| `src/renderer/src/components/sidebar.tsx`             | create | Left navigation               |
| `src/renderer/src/components/proxy-form-dialog.tsx`   | create | Proxy create/edit             |

---

## Todo

- [ ] `npx shadcn@latest init` + add components
- [ ] Install zustand, @tanstack/react-query, lucide-react
- [ ] Setup TanStack QueryClient provider in `main.tsx`
- [ ] Implement profile-store.ts (Zustand)
- [ ] Implement use-ipc.ts hooks
- [ ] Build Sidebar với group list + navigation
- [ ] Build ProfilesPage với search + table
- [ ] Build ProfileTable với status badges + launch button
- [ ] Build ProfileFormDialog (create/edit)
- [ ] Build FingerprintEditor (user-friendly dropdowns)
- [ ] Build ProxiesPage (CRUD)
- [ ] Subscribe to `browser:status-changed` IPC event
- [ ] Dark mode toggle (Tailwind `dark:` classes + localStorage)
- [ ] Vietnamese labels cho tất cả UI text

---

## Success Criteria

- Tạo profile qua UI → hiện trong list ngay
- Click "Mở Browser" → Camoufox mở, status badge đổi thành "Đang chạy"
- Group filter → list chỉ hiện profiles trong group đó
- Search → filter theo tên real-time
- App restart → profile list vẫn còn (persisted in SQLite)

---

## Next Steps

→ Phase 05: Automation & Local API
