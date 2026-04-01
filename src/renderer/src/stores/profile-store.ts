import { create } from 'zustand'
import type { Group, Profile, Session } from '@shared/types'

interface ProfileStore {
  profiles: Profile[]
  groups: Group[]
  sessions: Record<string, Session>
  selectedGroup: string | null
  selectedIds: Set<string>
  setProfiles: (profiles: Profile[]) => void
  setGroups: (groups: Group[]) => void
  updateSession: (profileId: string, session: Session | null) => void
  setSelectedGroup: (groupId: string | null) => void
  setSelectedIds: (ids: Set<string>) => void
  toggleSelect: (profileId: string) => void
  clearSelection: () => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profiles: [],
  groups: [],
  sessions: {},
  selectedGroup: null,
  selectedIds: new Set<string>(),
  setProfiles: (profiles): void => set({ profiles }),
  setGroups: (groups): void => set({ groups }),
  updateSession: (profileId, session): void =>
    set((state) => {
      if (!session) {
        const nextSessions = { ...state.sessions }
        delete nextSessions[profileId]
        return { sessions: nextSessions }
      }
      return { sessions: { ...state.sessions, [profileId]: session } }
    }),
  setSelectedGroup: (groupId): void =>
    set({ selectedGroup: groupId, selectedIds: new Set<string>() }),
  setSelectedIds: (ids): void => set({ selectedIds: new Set(ids) }),
  toggleSelect: (profileId): void =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return { selectedIds: next }
    }),
  clearSelection: (): void => set({ selectedIds: new Set<string>() }),
}))
