import { useState } from 'react'
import { useCreateProxy } from '../hooks/use-ipc'

interface ProxyFormDialogProps {
  open: boolean
  onClose: () => void
}

export function ProxyFormDialog({
  open,
  onClose,
}: ProxyFormDialogProps): JSX.Element | null {
  const createProxy = useCreateProxy()
  const [name, setName] = useState('')
  const [type, setType] = useState<'http' | 'https' | 'socks4' | 'socks5'>(
    'http'
  )
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8080')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState('')

  if (!open) return null

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()
    try {
      setSubmitError('')
      await createProxy.mutateAsync({
        name: name || null,
        type,
        host,
        port: Number(port),
        username: username || null,
        password: password || null,
      })
      setName('')
      setHost('')
      setPort('8080')
      setUsername('')
      setPassword('')
      onClose()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Lưu proxy thất bại'
      )
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>Thêm Proxy</h3>
        <form
          className="form-grid"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="field-label">
            Tên proxy
            <input
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field-label">
            Loại
            <select
              className="field-input"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </label>

          <label className="field-label">
            Host
            <input
              className="field-input"
              value={host}
              required
              onChange={(event) => setHost(event.target.value)}
            />
          </label>

          <label className="field-label">
            Port
            <input
              className="field-input"
              type="number"
              min={1}
              max={65535}
              value={port}
              required
              onChange={(event) => setPort(event.target.value)}
            />
          </label>

          <label className="field-label">
            Username
            <input
              className="field-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="field-label">
            Password
            <input
              className="field-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {submitError && <p className="error-text">{submitError}</p>}

          <div className="actions-row">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Hủy
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={createProxy.isPending}
            >
              {createProxy.isPending ? 'Đang lưu...' : 'Lưu Proxy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
