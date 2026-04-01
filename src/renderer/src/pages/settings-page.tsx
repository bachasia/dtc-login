import { useEffect, useState } from 'react'
import {
  useApiSettings,
  useTestApiStatus,
  useUpdateApiSettings,
} from '../hooks/use-ipc'

interface SettingsPageProps {
  theme: 'dark' | 'light'
  onChangeTheme: (theme: 'dark' | 'light') => void
}

function generateApiKey(): string {
  return `dtc_${crypto.randomUUID().replaceAll('-', '')}`
}

export function SettingsPage({
  theme,
  onChangeTheme,
}: SettingsPageProps): JSX.Element {
  const apiSettingsQuery = useApiSettings()
  const updateApiSettings = useUpdateApiSettings()
  const testApiStatus = useTestApiStatus()

  const [enabled, setEnabled] = useState(false)
  const [port, setPort] = useState('50325')
  const [apiKey, setApiKey] = useState('')
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!apiSettingsQuery.data) return
    setEnabled(apiSettingsQuery.data.enabled)
    setPort(String(apiSettingsQuery.data.port))
    setHasSavedApiKey(apiSettingsQuery.data.hasApiKey)
  }, [apiSettingsQuery.data])

  const isSaving = updateApiSettings.isPending
  const runtimeRunning = apiSettingsQuery.data?.running ?? false

  async function onSaveApiSettings(): Promise<void> {
    setMessage(null)

    const parsedPort = Number(port)
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setMessage('Port phải là số nguyên từ 1 đến 65535')
      return
    }

    if (enabled && !apiKey.trim() && !hasSavedApiKey) {
      setMessage('API key là bắt buộc khi bật Local API')
      return
    }

    try {
      const result = await updateApiSettings.mutateAsync({
        enabled,
        port: parsedPort,
        apiKey: apiKey.trim() ? apiKey : undefined,
      })

      if (!result.success) {
        setMessage(result.error ?? 'Không thể cập nhật Local API')
        return
      }

      setHasSavedApiKey(result.settings?.hasApiKey ?? hasSavedApiKey)
      setApiKey('')
      setMessage('Đã lưu Local API settings')
    } catch {
      setMessage('Không thể cập nhật Local API')
    }
  }

  async function onTestApi(): Promise<void> {
    setMessage(null)
    try {
      const result = await testApiStatus.mutateAsync()
      setMessage(result.ok ? 'Kết nối Local API thành công' : result.message)
    } catch {
      setMessage('Không thể kiểm tra Local API')
    }
  }

  async function onCopyApiKey(): Promise<void> {
    if (!apiKey.trim()) return
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopyMessage('Đã copy API key')
    } catch {
      setCopyMessage('Không thể copy API key')
    }
    setTimeout(() => setCopyMessage(null), 1500)
  }

  return (
    <div className="page-container">
      <div className="card settings-grid">
        <h2>Cài đặt ứng dụng</h2>

        <div>
          <h3 className="section-title">Giao diện</h3>
          <div className="inline-actions">
            <button
              className={theme === 'dark' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => onChangeTheme('dark')}
            >
              Dark mode
            </button>
            <button
              className={theme === 'light' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => onChangeTheme('light')}
            >
              Light mode
            </button>
          </div>
        </div>

        <div>
          <h3 className="section-title">Ngôn ngữ</h3>
          <p>Tiếng Việt (mặc định)</p>
        </div>

        <div>
          <h3 className="section-title">Local API (Automation)</h3>
          <p className="muted">AdsPower-compatible endpoint tại 127.0.0.1</p>

          <div className="group-box" style={{ marginTop: 10 }}>
            <label className="field-label">
              <span>Bật Local API</span>
              <select
                className="field-input"
                value={enabled ? 'true' : 'false'}
                onChange={(e) => setEnabled(e.target.value === 'true')}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>

            <label className="field-label">
              <span>API Port</span>
              <input
                className="field-input"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="50325"
              />
            </label>

            <label className="field-label">
              <span>API Key</span>
              <input
                className="field-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasSavedApiKey
                    ? 'Đã có key (nhập key mới để thay)'
                    : 'Nhập API key'
                }
              />
            </label>

            <div className="inline-actions">
              <button
                className="secondary-btn"
                onClick={() => setApiKey(generateApiKey())}
              >
                Generate key
              </button>
              <button className="ghost-btn" onClick={() => void onCopyApiKey()}>
                Copy key
              </button>
              <button
                className="primary-btn"
                onClick={() => void onSaveApiSettings()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save API settings'}
              </button>
              <button
                className="ghost-btn"
                onClick={() => void onTestApi()}
                disabled={testApiStatus.isPending}
              >
                {testApiStatus.isPending ? 'Testing...' : 'Test API'}
              </button>
            </div>

            <p className="muted">
              Runtime status: {runtimeRunning ? 'running' : 'stopped'}
            </p>
            {copyMessage && <p className="muted">{copyMessage}</p>}
            {message && <p className="error-text">{message}</p>}
            {apiSettingsQuery.error && (
              <p className="error-text">Không thể đọc API settings</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
