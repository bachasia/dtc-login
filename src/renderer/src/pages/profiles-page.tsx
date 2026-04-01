import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import type { Profile } from '@shared/types'
import {
  useCamoufoxStatus,
  useDeleteProfile,
  useDeleteProfiles,
  useDownloadCamoufoxCurrent,
  useImportCookies,
  useProfiles,
  useStartBrowser,
  useStopBrowser,
} from '../hooks/use-ipc'
import { ProfileFormDialog } from '../components/profile-form-dialog'
import { ProfileTable } from '../components/profile-table'
import { useProfileStore } from '../stores/profile-store'

type ProfileDialogMode = 'create' | 'edit' | 'clone'

export function ProfilesPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<ProfileDialogMode>('create')
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
  const importCookies = useImportCookies()
  const camoufoxStatus = useCamoufoxStatus()
  const downloadCamoufox = useDownloadCamoufoxCurrent()

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

  const handleDownloadCamoufox = async (): Promise<void> => {
    setActionError('')
    const result = await downloadCamoufox.mutateAsync()
    if (!result.success) {
      setActionError(result.error ?? 'Không thể tải Camoufox')
      return
    }

    setActionError('')
  }

  const handleImportCookies = async (profile: Profile): Promise<void> => {
    setActionError('')
    try {
      const picked = await window.electronAPI.profiles.pickCookieFile()
      if (!picked.success || !picked.filePath) {
        if (picked.error && picked.error !== 'Đã huỷ chọn file') {
          setActionError(picked.error)
        }
        return
      }

      const result = await importCookies.mutateAsync({
        profileId: profile.id,
        filePath: picked.filePath,
      })

      if (!result.success) {
        setActionError(result.error ?? 'Import cookie thất bại')
        return
      }

      window.alert(`Import cookie thành công: ${result.result?.imported ?? 0}`)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Import cookie thất bại'
      )
    }
  }

  return (
    <div className="page-container">
      <div className="top-bar card">
        <div className="input-with-icon search-input">
          <Search size={16} strokeWidth={2} />
          <input
            className="field-input"
            placeholder="Tìm kiếm profile..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {selectedIds.size > 0 && (
          <button
            className="danger-btn button-with-icon"
            onClick={() => void handleDeleteSelected()}
          >
            <Trash2 size={15} strokeWidth={2} />
            <span>Xóa {selectedIds.size} profile</span>
          </button>
        )}

        <button
          className="primary-btn button-with-icon"
          onClick={() => {
            setDialogMode('create')
            setEditingProfile(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>Tạo Profile</span>
        </button>
      </div>

      {camoufoxStatus.data && !camoufoxStatus.data.installed && (
        <div className="card error-text">
          <div
            className="inline-actions"
            style={{ justifyContent: 'space-between' }}
          >
            <span className="button-with-icon">
              <TriangleAlert size={15} strokeWidth={2} />
              <span>
                Camoufox chưa có cho {camoufoxStatus.data.platformDir}. Cần tải để
                mở browser.
              </span>
            </span>

            <button
              className="primary-btn button-with-icon"
              onClick={() => void handleDownloadCamoufox()}
              disabled={downloadCamoufox.isPending}
            >
              <Download size={15} strokeWidth={2} />
              <span>
                {downloadCamoufox.isPending
                  ? 'Đang tải Camoufox...'
                  : 'Download Camoufox'}
              </span>
            </button>
          </div>
        </div>
      )}

      {actionError && <div className="card error-text">{actionError}</div>}

      <ProfileTable
        profiles={filteredProfiles}
        loading={isLoading}
        onEdit={(profile) => {
          setDialogMode('edit')
          setEditingProfile(profile)
          setDialogOpen(true)
        }}
        onClone={(profile) => {
          setDialogMode('clone')
          setEditingProfile(profile)
          setDialogOpen(true)
        }}
        onImportCookies={(profile) => void handleImportCookies(profile)}
        onDelete={(profileId) => void handleDeleteOne(profileId)}
        onStartBrowser={(profileId) => void handleStartBrowser(profileId)}
        onStopBrowser={(profileId) => void handleStopBrowser(profileId)}
      />

      <ProfileFormDialog
        open={dialogOpen}
        mode={dialogMode}
        profile={editingProfile}
        onClose={() => {
          setDialogOpen(false)
          setEditingProfile(null)
          setDialogMode('create')
        }}
      />
    </div>
  )
}
