import { ipcMain } from 'electron'
import { profileService } from './services/profile-service'
import { groupService } from './services/group-service'
import { proxyService } from './services/proxy-service'
import { browserService } from './services/browser-service'
import { generateFingerprint } from './services/fingerprint-service'

// Guard helpers — reject malformed renderer input before it reaches DB layer
function assertString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${field} must be a non-empty string`)
  return v
}

function assertStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))
    throw new Error(`${field} must be a string array`)
  return v as string[]
}

function assertCreateProfile(
  v: unknown
): { name: string } & Record<string, unknown> {
  if (!v || typeof v !== 'object')
    throw new Error('profile input must be an object')
  const o = v as Record<string, unknown>
  assertString(o['name'], 'name')
  return o as { name: string } & Record<string, unknown>
}

function assertCreateGroup(v: unknown): { name: string; color?: string } {
  if (!v || typeof v !== 'object')
    throw new Error('group input must be an object')
  const o = v as Record<string, unknown>
  assertString(o['name'], 'name')
  return o as { name: string; color?: string }
}

function assertCreateProxy(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object')
    throw new Error('proxy input must be an object')
  const o = v as Record<string, unknown>
  const VALID_TYPES = ['http', 'https', 'socks4', 'socks5']
  if (!VALID_TYPES.includes(o['type'] as string))
    throw new Error('proxy type must be http|https|socks4|socks5')
  assertString(o['host'], 'host')
  if (typeof o['port'] !== 'number' || o['port'] < 1 || o['port'] > 65535)
    throw new Error('port must be 1-65535')
  return o
}

function assertFingerprintGenerateInput(
  v: unknown
): { os?: Array<'windows' | 'macos' | 'linux'>; locale?: string } | undefined {
  if (v === undefined) return undefined
  if (!v || typeof v !== 'object')
    throw new Error('fingerprint input must be an object')

  const o = v as Record<string, unknown>
  const result: { os?: Array<'windows' | 'macos' | 'linux'>; locale?: string } =
    {}

  if (o['os'] !== undefined) {
    if (!Array.isArray(o['os'])) throw new Error('os must be an array')
    const validOs = ['windows', 'macos', 'linux'] as const
    const os = o['os'] as unknown[]
    if (
      os.some(
        (v) =>
          typeof v !== 'string' ||
          !validOs.includes(v as (typeof validOs)[number])
      )
    ) {
      throw new Error('os must only include windows|macos|linux')
    }
    result.os = os as Array<'windows' | 'macos' | 'linux'>
  }

  if (o['locale'] !== undefined) {
    const locale = assertString(o['locale'], 'locale')
    if (locale.length > 32) throw new Error('locale too long')
    result.locale = locale
  }

  return result
}

// IPC handler registry — services registered here as phases complete
export function registerIpcHandlers(): void {
  // --- Profiles ---
  ipcMain.handle('profiles:list', (_e, groupId?: string) =>
    profileService.list(groupId)
  )
  ipcMain.handle('profiles:get', (_e, id: unknown) =>
    profileService.getById(assertString(id, 'id'))
  )
  ipcMain.handle('profiles:create', (_e, input: unknown) =>
    profileService.create(assertCreateProfile(input))
  )
  ipcMain.handle('profiles:update', (_e, id: unknown, input: unknown) => {
    if (!input || typeof input !== 'object')
      throw new Error('update input must be an object')
    return profileService.update(
      assertString(id, 'id'),
      input as Record<string, unknown>
    )
  })
  ipcMain.handle('profiles:delete', (_e, id: unknown) =>
    profileService.delete(assertString(id, 'id'))
  )
  ipcMain.handle('profiles:bulk-delete', (_e, ids: unknown) =>
    profileService.bulkDelete(assertStringArray(ids, 'ids'))
  )

  // --- Groups ---
  ipcMain.handle('groups:list', () => groupService.list())
  ipcMain.handle('groups:create', (_e, input: unknown) =>
    groupService.create(assertCreateGroup(input))
  )
  ipcMain.handle('groups:update', (_e, id: unknown, input: unknown) => {
    if (!input || typeof input !== 'object')
      throw new Error('update input must be an object')
    return groupService.update(
      assertString(id, 'id'),
      input as Record<string, unknown>
    )
  })
  ipcMain.handle('groups:delete', (_e, id: unknown) =>
    groupService.delete(assertString(id, 'id'))
  )

  // --- Proxies ---
  ipcMain.handle('proxies:list', () => proxyService.list())
  ipcMain.handle('proxies:create', (_e, input: unknown) =>
    proxyService.create(
      assertCreateProxy(input) as Parameters<typeof proxyService.create>[0]
    )
  )
  ipcMain.handle('proxies:test', (_e, id: unknown) =>
    proxyService.test(assertString(id, 'id'))
  )
  ipcMain.handle('proxies:delete', (_e, id: unknown) =>
    proxyService.delete(assertString(id, 'id'))
  )

  // --- Browser control ---
  ipcMain.handle('browser:start', async (_e, profileId: unknown) => {
    try {
      const session = await browserService.start(
        assertString(profileId, 'profileId')
      )
      return { success: true, session }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('browser:stop', async (_e, profileId: unknown) => {
    try {
      await browserService.stop(assertString(profileId, 'profileId'))
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('browser:status', (_e, profileId: unknown) => ({
    running: browserService.isRunning(assertString(profileId, 'profileId')),
    session: browserService.getSession(assertString(profileId, 'profileId')),
  }))

  // --- Fingerprint generation ---
  ipcMain.handle('fingerprints:generate', (_e, input: unknown) => {
    return generateFingerprint(assertFingerprintGenerateInput(input))
  })
}
