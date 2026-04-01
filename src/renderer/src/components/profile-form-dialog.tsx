import { useEffect, useState } from 'react'
import type { Fingerprint, Profile } from '@shared/types'
import {
  useCreateProfile,
  useGroups,
  useProxies,
  useUpdateProfile,
} from '../hooks/use-ipc'
import { FingerprintEditor } from './fingerprint-editor'

interface ProfileFormDialogProps {
  open: boolean
  profile: Profile | null
  onClose: () => void
}

const DEFAULT_FINGERPRINT: Fingerprint = {
  os: 'windows',
  screenWidth: 1920,
  screenHeight: 1080,
  timezone: 'Asia/Ho_Chi_Minh',
  locale: 'vi-VN',
}

export function ProfileFormDialog({
  open,
  profile,
  onClose,
}: ProfileFormDialogProps): JSX.Element | null {
  const createProfile = useCreateProfile()
  const updateProfile = useUpdateProfile()
  const { data: groups = [] } = useGroups()
  const { data: proxies = [] } = useProxies()

  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [proxyId, setProxyId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [fingerprint, setFingerprint] =
    useState<Fingerprint>(DEFAULT_FINGERPRINT)

  useEffect(() => {
    if (!open) return
    if (profile) {
      setName(profile.name)
      setGroupId(profile.group_id ?? '')
      setProxyId(profile.proxy_id ?? '')
      setNotes(profile.notes ?? '')
      setFingerprint({ ...DEFAULT_FINGERPRINT, ...profile.fingerprint })
      return
    }
    setName('')
    setGroupId('')
    setProxyId('')
    setNotes('')
    setFingerprint(DEFAULT_FINGERPRINT)
  }, [open, profile])

  if (!open) return null

  const isSubmitting = createProfile.isPending || updateProfile.isPending

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    const payload = {
      name,
      group_id: groupId || null,
      proxy_id: proxyId || null,
      notes: notes || null,
      fingerprint,
      tags: [],
    }

    try {
      setSubmitError('')
      if (profile) {
        await updateProfile.mutateAsync({ id: profile.id, data: payload })
      } else {
        await createProfile.mutateAsync(payload)
      }
      onClose()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Lưu profile thất bại'
      )
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large" onClick={(event) => event.stopPropagation()}>
        <h3>{profile ? 'Sửa Profile' : 'Tạo Profile'}</h3>

        <form
          className="form-grid"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="field-label">
            Tên profile
            <input
              className="field-input"
              value={name}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field-label">
            Nhóm
            <select
              className="field-input"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">Không chọn</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Proxy
            <select
              className="field-input"
              value={proxyId}
              onChange={(event) => setProxyId(event.target.value)}
            >
              <option value="">Không chọn</option>
              {proxies.map((proxy) => (
                <option key={proxy.id} value={proxy.id}>
                  {proxy.name || `${proxy.host}:${proxy.port}`}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Ghi chú
            <textarea
              className="field-input"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <FingerprintEditor value={fingerprint} onChange={setFingerprint} />

          {submitError && <p className="error-text">{submitError}</p>}

          <div className="actions-row">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Hủy
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
