import type { Profile } from '@shared/types'
import { useProfileStore } from '../stores/profile-store'

interface ProfileTableProps {
  profiles: Profile[]
  loading: boolean
  onEdit: (profile: Profile) => void
  onClone: (profile: Profile) => void
  onImportCookies: (profile: Profile) => void
  onDelete: (profileId: string) => void
  onStartBrowser: (profileId: string) => void
  onStopBrowser: (profileId: string) => void
}

export function ProfileTable({
  profiles,
  loading,
  onEdit,
  onClone,
  onImportCookies,
  onDelete,
  onStartBrowser,
  onStopBrowser,
}: ProfileTableProps): JSX.Element {
  const selectedIds = useProfileStore((state) => state.selectedIds)
  const toggleSelect = useProfileStore((state) => state.toggleSelect)
  const sessions = useProfileStore((state) => state.sessions)

  if (loading) {
    return <div className="card">Đang tải profiles...</div>
  }

  if (profiles.length === 0) {
    return <div className="card">Chưa có profile nào.</div>
  }

  return (
    <div className="table-wrapper card">
      <table className="data-table">
        <thead>
          <tr>
            <th />
            <th>Tên</th>
            <th>OS</th>
            <th>Proxy</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const running = Boolean(sessions[profile.id])
            return (
              <tr key={profile.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(profile.id)}
                    onChange={() => toggleSelect(profile.id)}
                  />
                </td>
                <td>{profile.name}</td>
                <td>{profile.fingerprint.os ?? '-'}</td>
                <td>{profile.proxy_id ?? '-'}</td>
                <td>
                  <span
                    className={
                      running ? 'status-badge running' : 'status-badge stopped'
                    }
                  >
                    {running ? 'Đang chạy' : 'Đã dừng'}
                  </span>
                </td>
                <td>
                  <div className="inline-actions">
                    {running ? (
                      <button
                        className="ghost-btn"
                        onClick={() => onStopBrowser(profile.id)}
                      >
                        Dừng
                      </button>
                    ) : (
                      <button
                        className="secondary-btn"
                        onClick={() => onStartBrowser(profile.id)}
                      >
                        Mở Browser
                      </button>
                    )}
                    <button
                      className="ghost-btn"
                      onClick={() => onEdit(profile)}
                    >
                      Sửa
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={() => onClone(profile)}
                    >
                      Clone
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={() => onImportCookies(profile)}
                    >
                      Import Cookie
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => onDelete(profile.id)}
                    >
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
