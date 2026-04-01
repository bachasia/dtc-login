import { useEffect, useState } from 'react'
import {
  FolderTree,
  Plus,
  Settings,
  Shield,
  UserCircle2,
  Waypoints,
} from 'lucide-react'
import { useCreateGroup, useGroups } from '../hooks/use-ipc'
import { useProfileStore } from '../stores/profile-store'

type PageKey = 'profiles' | 'proxies' | 'settings'

interface SidebarProps {
  page: PageKey
  onChangePage: (page: PageKey) => void
}

export function Sidebar({ page, onChangePage }: SidebarProps): JSX.Element {
  const { data: groups = [] } = useGroups()
  const createGroup = useCreateGroup()
  const selectedGroup = useProfileStore((state) => state.selectedGroup)
  const setSelectedGroup = useProfileStore((state) => state.setSelectedGroup)
  const setGroups = useProfileStore((state) => state.setGroups)
  const [newGroup, setNewGroup] = useState('')

  useEffect(() => {
    setGroups(groups)
  }, [groups, setGroups])

  const handleAddGroup = async (): Promise<void> => {
    const name = newGroup.trim()
    if (!name) return
    await createGroup.mutateAsync({ name })
    setNewGroup('')
  }

  return (
    <aside className="sidebar">
      <div>
        <h1 className="logo logo-row">
          <Shield size={22} strokeWidth={2} />
          <span>DTC Browser</span>
        </h1>
        <p className="muted">Antidetect cho thị trường Việt Nam</p>
      </div>

      <nav className="nav-list">
        <button
          className={page === 'profiles' ? 'nav-button active' : 'nav-button'}
          onClick={() => onChangePage('profiles')}
        >
          <UserCircle2 size={16} strokeWidth={2} />
          <span>Profiles</span>
        </button>
        <button
          className={page === 'proxies' ? 'nav-button active' : 'nav-button'}
          onClick={() => onChangePage('proxies')}
        >
          <Waypoints size={16} strokeWidth={2} />
          <span>Proxies</span>
        </button>
        <button
          className={page === 'settings' ? 'nav-button active' : 'nav-button'}
          onClick={() => onChangePage('settings')}
        >
          <Settings size={16} strokeWidth={2} />
          <span>Cài đặt</span>
        </button>
      </nav>

      <div className="group-box">
        <div className="group-row">
          <h3 className="section-title">Nhóm</h3>
          <button className="ghost-btn ghost-btn-inline" onClick={() => setSelectedGroup(null)}>
            <FolderTree size={15} strokeWidth={2} />
            <span>Tất cả</span>
          </button>
        </div>

        <div className="group-list">
          {groups.map((group) => (
            <button
              key={group.id}
              className={
                selectedGroup === group.id
                  ? 'group-button active'
                  : 'group-button'
              }
              onClick={() => {
                onChangePage('profiles')
                setSelectedGroup(group.id)
              }}
            >
              {group.name}
            </button>
          ))}
        </div>

        <div className="group-row">
          <input
            className="field-input"
            placeholder="Tên nhóm mới"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleAddGroup()
            }}
          />
          <button className="primary-btn btn-icon-only" onClick={() => void handleAddGroup()}>
            <Plus size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <p className="muted">v0.1.0</p>
    </aside>
  )
}
