import { ipcMain } from 'electron'
import { profileService } from './services/profile-service'
import { groupService } from './services/group-service'
import { proxyService } from './services/proxy-service'

// Guard helpers — reject malformed renderer input before it reaches DB layer
function assertString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`${field} must be a non-empty string`)
  return v
}

function assertStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`${field} must be a string array`)
  return v as string[]
}

function assertCreateProfile(v: unknown): { name: string } & Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('profile input must be an object')
  const o = v as Record<string, unknown>
  assertString(o['name'], 'name')
  return o as { name: string } & Record<string, unknown>
}

function assertCreateGroup(v: unknown): { name: string; color?: string } {
  if (!v || typeof v !== 'object') throw new Error('group input must be an object')
  const o = v as Record<string, unknown>
  assertString(o['name'], 'name')
  return o as { name: string; color?: string }
}

function assertCreateProxy(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('proxy input must be an object')
  const o = v as Record<string, unknown>
  const VALID_TYPES = ['http', 'https', 'socks4', 'socks5']
  if (!VALID_TYPES.includes(o['type'] as string)) throw new Error('proxy type must be http|https|socks4|socks5')
  assertString(o['host'], 'host')
  if (typeof o['port'] !== 'number' || o['port'] < 1 || o['port'] > 65535) throw new Error('port must be 1-65535')
  return o
}

// IPC handler registry — services registered here as phases complete
export function registerIpcHandlers(): void {
  // --- Profiles ---
  ipcMain.handle('profiles:list', (_e, groupId?: string) => profileService.list(groupId))
  ipcMain.handle('profiles:get', (_e, id: unknown) => profileService.getById(assertString(id, 'id')))
  ipcMain.handle('profiles:create', (_e, input: unknown) => profileService.create(assertCreateProfile(input)))
  ipcMain.handle('profiles:update', (_e, id: unknown, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('update input must be an object')
    return profileService.update(assertString(id, 'id'), input as Record<string, unknown>)
  })
  ipcMain.handle('profiles:delete', (_e, id: unknown) => profileService.delete(assertString(id, 'id')))
  ipcMain.handle('profiles:bulk-delete', (_e, ids: unknown) => profileService.bulkDelete(assertStringArray(ids, 'ids')))

  // --- Groups ---
  ipcMain.handle('groups:list', () => groupService.list())
  ipcMain.handle('groups:create', (_e, input: unknown) => groupService.create(assertCreateGroup(input)))
  ipcMain.handle('groups:update', (_e, id: unknown, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('update input must be an object')
    return groupService.update(assertString(id, 'id'), input as Record<string, unknown>)
  })
  ipcMain.handle('groups:delete', (_e, id: unknown) => groupService.delete(assertString(id, 'id')))

  // --- Proxies ---
  ipcMain.handle('proxies:list', () => proxyService.list())
  ipcMain.handle('proxies:create', (_e, input: unknown) => proxyService.create(assertCreateProxy(input) as Parameters<typeof proxyService.create>[0]))
  ipcMain.handle('proxies:test', (_e, id: unknown) => proxyService.test(assertString(id, 'id')))
  ipcMain.handle('proxies:delete', (_e, id: unknown) => proxyService.delete(assertString(id, 'id')))

  // Phase 03: Browser control (stubs — implemented in Phase 03)
  ipcMain.handle('browser:start', async (_e, _profileId: string) => ({ ok: false }))
  ipcMain.handle('browser:stop', async (_e, _profileId: string) => ({ ok: false }))
  ipcMain.handle('browser:status', async (_e, _profileId: string) => 'stopped')
}
