import { ipcMain } from 'electron'

// IPC handler registry — services registered here as phases complete
export function registerIpcHandlers(): void {
  // Phase 02: Profile CRUD
  ipcMain.handle('profiles:list', async () => [])
  ipcMain.handle('profiles:get', async (_e, _id: string) => null)
  ipcMain.handle('profiles:create', async (_e, _input: unknown) => null)
  ipcMain.handle('profiles:update', async (_e, _id: string, _input: unknown) => null)
  ipcMain.handle('profiles:delete', async (_e, _id: string) => void 0)
  ipcMain.handle('profiles:bulk-delete', async (_e, _ids: string[]) => void 0)

  // Phase 02: Groups
  ipcMain.handle('groups:list', async () => [])
  ipcMain.handle('groups:create', async (_e, _input: unknown) => null)
  ipcMain.handle('groups:update', async (_e, _id: string, _input: unknown) => null)
  ipcMain.handle('groups:delete', async (_e, _id: string) => void 0)

  // Phase 02: Proxies
  ipcMain.handle('proxies:list', async () => [])
  ipcMain.handle('proxies:create', async (_e, _input: unknown) => null)
  ipcMain.handle('proxies:test', async (_e, _id: string) => ({ ok: false }))
  ipcMain.handle('proxies:delete', async (_e, _id: string) => void 0)

  // Phase 03: Browser control
  ipcMain.handle('browser:start', async (_e, _profileId: string) => ({ ok: false }))
  ipcMain.handle('browser:stop', async (_e, _profileId: string) => ({ ok: false }))
  ipcMain.handle('browser:status', async (_e, _profileId: string) => 'stopped')
}
