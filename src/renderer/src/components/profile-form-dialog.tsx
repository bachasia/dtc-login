import { useEffect, useMemo, useState } from 'react'
import type { Fingerprint, Profile } from '@shared/types'
import {
  useCreateProfile,
  useGroups,
  useProfileTemplates,
  useProxies,
  useUpdateProfile,
} from '../hooks/use-ipc'
import { FingerprintEditor } from './fingerprint-editor'

type ProfileDialogMode = 'create' | 'edit' | 'clone'

type ProfilePayload = {
  name: string
  group_id: string | null
  proxy_id: string | null
  notes: string | null
  fingerprint: Fingerprint
  tags: string[]
}

interface ProfileFormDialogProps {
  open: boolean
  mode: ProfileDialogMode
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
  mode,
  profile,
  onClose,
}: ProfileFormDialogProps): JSX.Element | null {
  const createProfile = useCreateProfile()
  const updateProfile = useUpdateProfile()
  const { data: groups = [] } = useGroups()
  const { data: proxies = [] } = useProxies()
  const { data: templates = [] } = useProfileTemplates()

  const [activeTab, setActiveTab] = useState<'general' | 'proxy' | 'fingerprint'>(
    'general'
  )
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [proxyId, setProxyId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [fingerprint, setFingerprint] =
    useState<Fingerprint>(DEFAULT_FINGERPRINT)

  useEffect(() => {
    if (!open) return

    setActiveTab('general')

    if (profile) {
      setName(mode === 'clone' ? `${profile.name} - Copy` : profile.name)
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
  }, [open, profile, mode])

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId),
    [groups, groupId]
  )
  const selectedProxy = useMemo(
    () => proxies.find((proxy) => proxy.id === proxyId),
    [proxies, proxyId]
  )

  if (!open) return null

  const isSubmitting = createProfile.isPending || updateProfile.isPending

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    const payload: ProfilePayload = {
      name,
      group_id: groupId || null,
      proxy_id: proxyId || null,
      notes: notes || null,
      fingerprint,
      tags: [],
    }

    try {
      setSubmitError('')
      if (mode === 'edit' && profile) {
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

  const title =
    mode === 'edit'
      ? 'Sửa Profile'
      : mode === 'clone'
        ? 'Clone Profile'
        : 'Tạo Profile'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>

        <div className="profile-hybrid-layout">
          <form
            className="profile-hybrid-form"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="profile-tab-header">
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                General
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'proxy' ? 'active' : ''}`}
                onClick={() => setActiveTab('proxy')}
              >
                Proxy
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'fingerprint' ? 'active' : ''}`}
                onClick={() => setActiveTab('fingerprint')}
              >
                Fingerprint
              </button>
            </div>

            {activeTab === 'general' && (
              <div className="form-grid">
                <label className="field-label profile-field-span-full">
                  Template
                  <select
                    className="field-input"
                    defaultValue=""
                    onChange={(event) => {
                      const template = templates.find(
                        (item) => item.id === event.target.value
                      )
                      if (!template) return
                      setFingerprint((prev) => ({
                        ...prev,
                        ...template.fingerprint,
                      }))
                    }}
                  >
                    <option value="">Chọn template mặc định</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.description}
                      </option>
                    ))}
                  </select>
                </label>
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

                <label className="field-label profile-field-span-full">
                  Ghi chú
                  <textarea
                    className="field-input"
                    rows={4}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            )}

            {activeTab === 'proxy' && (
              <div className="form-grid">
                <label className="field-label profile-field-span-full">
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

                <div className="profile-proxy-hint profile-field-span-full">
                  {selectedProxy
                    ? `${selectedProxy.type.toUpperCase()} • ${selectedProxy.host}:${selectedProxy.port}`
                    : 'Chưa chọn proxy cho profile này'}
                </div>
              </div>
            )}

            {activeTab === 'fingerprint' && (
              <div className="form-grid">
                <FingerprintEditor value={fingerprint} onChange={setFingerprint} />
              </div>
            )}

            {submitError && <p className="error-text">{submitError}</p>}

            <div className="actions-row">
              <button type="button" className="ghost-btn" onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className="primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu Profile'}
              </button>
            </div>
          </form>

          <aside className="card profile-overview-panel">
            <h4>Tổng quan</h4>
            <div className="profile-overview-list">
              <div className="profile-overview-item">
                <span className="muted">Tên</span>
                <strong>{name.trim() || 'Chưa nhập tên'}</strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Nhóm</span>
                <strong>{selectedGroup?.name ?? 'Không chọn'}</strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Proxy</span>
                <strong>
                  {selectedProxy
                    ? `${selectedProxy.name || selectedProxy.host}:${selectedProxy.port}`
                    : 'Không chọn'}
                </strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">OS</span>
                <strong>{fingerprint.os ?? 'auto'}</strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Screen</span>
                <strong>
                  {fingerprint.screenWidth ?? '-'} x {fingerprint.screenHeight ?? '-'}
                </strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Timezone</span>
                <strong>{fingerprint.timezone ?? '-'}</strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Locale</span>
                <strong>{fingerprint.locale ?? '-'}</strong>
              </div>
              <div className="profile-overview-item">
                <span className="muted">Notes</span>
                <strong>{notes.trim() || 'Không có ghi chú'}</strong>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
