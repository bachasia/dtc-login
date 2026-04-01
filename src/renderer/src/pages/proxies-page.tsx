import { useState } from 'react'
import { ProxyFormDialog } from '../components/proxy-form-dialog'
import { useDeleteProxy, useProxies, useTestProxy } from '../hooks/use-ipc'

export function ProxiesPage(): JSX.Element {
  const { data: proxies = [], isLoading } = useProxies()
  const deleteProxy = useDeleteProxy()
  const testProxy = useTestProxy()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [testMessages, setTestMessages] = useState<Record<string, string>>({})

  const handleTest = async (proxyId: string): Promise<void> => {
    try {
      setActionError('')
      const result = await testProxy.mutateAsync(proxyId)
      setTestMessages((state) => ({ ...state, [proxyId]: result.message }))
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Kiểm tra proxy thất bại'
      )
    }
  }

  const handleDelete = async (proxyId: string): Promise<void> => {
    if (!window.confirm('Bạn muốn xóa proxy này?')) return
    try {
      setActionError('')
      await deleteProxy.mutateAsync(proxyId)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Xóa proxy thất bại'
      )
    }
  }

  return (
    <div className="page-container">
      <div className="top-bar card">
        <h2>Quản lý Proxy</h2>
        <button className="primary-btn" onClick={() => setDialogOpen(true)}>
          Thêm Proxy
        </button>
      </div>

      {actionError && <div className="card error-text">{actionError}</div>}

      <div className="table-wrapper card">
        {isLoading ? (
          <p>Đang tải proxy...</p>
        ) : proxies.length === 0 ? (
          <p>Chưa có proxy nào.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Loại</th>
                <th>Địa chỉ</th>
                <th>Kiểm tra</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((proxy) => (
                <tr key={proxy.id}>
                  <td>{proxy.name || '-'}</td>
                  <td>{proxy.type}</td>
                  <td>{`${proxy.host}:${proxy.port}`}</td>
                  <td>{testMessages[proxy.id] || '-'}</td>
                  <td>
                    <div className="inline-actions">
                      <button
                        className="secondary-btn"
                        onClick={() => void handleTest(proxy.id)}
                      >
                        Test
                      </button>
                      <button
                        className="danger-btn"
                        onClick={() => void handleDelete(proxy.id)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ProxyFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
