import { useEffect, useMemo, useState } from 'react'
import type { Profile } from '@shared/types'
import {
  useDeleteProfile,
  useDeleteProfiles,
  useProfiles,
  useStartBrowser,
  useStopBrowser,
} from '../hooks/use-ipc'
import { ProfileFormDialog } from '../components/profile-form-dialog'
import { ProfileTable } from '../components/profile-table'
import { useProfileStore } from '../stores/profile-store'

export function ProfilesPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [actionError, setActionError] = useState('')

  const selectedGroup = useProfileStore((state) => state.selectedGroup)
  const selectedIds = useProfileStore((state) => state.selectedIds)
  const clearSelection = useProfileStore((state) => state.clearSelection)
  const setProfiles = useProfileStore((state) => state.setProfiles)

  const { data: profiles = [], isLoading } = useProfiles(
    selectedGroup ?? undefined
  )
  const deleteProfile = useDeleteProfile()
  const deleteProfiles = useDeleteProfiles()
  const startBrowser = useStartBrowser()
  const stopBrowser = useStopBrowser()

  useEffect(() => {
    setProfiles(profiles)
  }, [profiles, setProfiles])

  const filteredProfiles = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return profiles
    return profiles.filter((profile) =>
      profile.name.toLowerCase().includes(keyword)
    )
  }, [profiles, search])

  const handleDeleteOne = async (profileId: string): Promise<void> => {
    if (!window.confirm('Bạn muốn xóa profile này?')) return
    try {
      setActionError('')
      await deleteProfile.mutateAsync(profileId)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Xóa profile thất bại'
      )
    }
  }

  const handleDeleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Xóa ${ids.length} profile đã chọn?`)) return
    try {
      setActionError('')
      await deleteProfiles.mutateAsync(ids)
      clearSelection()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Xóa nhiều profile thất bại'
      )
    }
  }

  const handleStartBrowser = async (profileId: string): Promise<void> => {
    setActionError('')
    const result = await startBrowser.mutateAsync(profileId)
    if (!result.success) {
      setActionError(result.error ?? 'Không thể mở browser')
    }
  }

  const handleStopBrowser = async (profileId: string): Promise<void> => {
    try {
      setActionError('')
      const result = await stopBrowser.mutateAsync(profileId)
      if (!result.success) {
        setActionError(result.error ?? 'Không thể dừng browser')
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Không thể dừng browser'
      )
    }
  }

  return (
    <div className="page-container">
      <div className="top-bar card">
        <input
          className="field-input search-input"
          placeholder="Tìm kiếm profile..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {selectedIds.size > 0 && (
          <button
            className="danger-btn"
            onClick={() => void handleDeleteSelected()}
          >
            Xóa {selectedIds.size} profile
          </button>
        )}

        <button
          className="primary-btn"
          onClick={() => {
            setEditingProfile(null)
            setDialogOpen(true)
          }}
        >
          Tạo Profile
        </button>
      </div>

      {actionError && <div className="card error-text">{actionError}</div>}

      <ProfileTable
        profiles={filteredProfiles}
        loading={isLoading}
        onEdit={(profile) => {
          setEditingProfile(profile)
          setDialogOpen(true)
        }}
        onDelete={(profileId) => void handleDeleteOne(profileId)}
        onStartBrowser={(profileId) => void handleStartBrowser(profileId)}
        onStopBrowser={(profileId) => void handleStopBrowser(profileId)}
      />

      <ProfileFormDialog
        open={dialogOpen}
        profile={editingProfile}
        onClose={() => {
          setDialogOpen(false)
          setEditingProfile(null)
        }}
      />
    </div>
  )
}
