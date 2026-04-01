import { app } from 'electron'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { profileService } from './profile-service'

const MAX_COOKIE_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_IMPORT_EXTENSIONS = new Set(['.json', '.txt'])

export interface ImportedCookie {
  domain: string
  path: string
  secure: boolean
  expiry: number
  name: string
  value: string
  httpOnly?: boolean
  sameSite?: 'Lax' | 'None' | 'Strict'
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase()
    return normalized === 'true' || normalized === '1'
  }
  return false
}

function normalizeCookie(raw: Record<string, unknown>): ImportedCookie | null {
  const name = typeof raw['name'] === 'string' ? raw['name'].trim() : ''
  const value = typeof raw['value'] === 'string' ? raw['value'] : ''
  const domain = typeof raw['domain'] === 'string' ? raw['domain'].trim() : ''
  if (!name || !domain) return null

  const sameSiteRaw = raw['sameSite']
  const sameSite =
    sameSiteRaw === 'Lax' || sameSiteRaw === 'None' || sameSiteRaw === 'Strict'
      ? sameSiteRaw
      : undefined

  return {
    name,
    value,
    domain,
    path: typeof raw['path'] === 'string' && raw['path'] ? raw['path'] : '/',
    secure: toBoolean(raw['secure']),
    expiry: Math.floor(
      toNumber(raw['expiry'] ?? raw['expirationDate'] ?? raw['expires'])
    ),
    httpOnly: toBoolean(raw['httpOnly']),
    sameSite,
  }
}

function parseJsonCookies(content: string): ImportedCookie[] {
  const parsed = JSON.parse(content) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Cookie JSON phai la array')
  }

  return parsed
    .map((item) =>
      item && typeof item === 'object'
        ? normalizeCookie(item as Record<string, unknown>)
        : null
    )
    .filter((v): v is ImportedCookie => Boolean(v))
}

function parseNetscapeCookies(content: string): ImportedCookie[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  return lines
    .map((line) => {
      const parts = line.split('\t')
      if (parts.length < 7) return null
      const [domain, , path, secure, expiry, name, value] = parts
      if (!domain || !name) return null
      return {
        domain,
        path: path || '/',
        secure: secure.toUpperCase() === 'TRUE',
        expiry: Math.floor(toNumber(expiry)),
        name,
        value: value ?? '',
      } satisfies ImportedCookie
    })
    .filter((v): v is ImportedCookie => Boolean(v))
}

function parseCookies(content: string): ImportedCookie[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseJsonCookies(trimmed)
    } catch {
      return parseNetscapeCookies(trimmed)
    }
  }

  return parseNetscapeCookies(trimmed)
}

export const cookieService = {
  importFromFile(profileId: string, filePath: string): { imported: number } {
    const profile = profileService.getById(profileId)
    if (!profile) throw new Error('Profile khong ton tai')

    const extension = extname(filePath).toLowerCase()
    if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
      throw new Error('Chi ho tro file .json hoac .txt')
    }

    const stat = statSync(filePath)
    if (stat.size > MAX_COOKIE_FILE_SIZE) {
      throw new Error('File cookie qua lon (toi da 2MB)')
    }

    const content = readFileSync(filePath, 'utf8')
    const cookies = parseCookies(content)
    if (cookies.length === 0) {
      throw new Error('Khong tim thay cookie hop le trong file')
    }

    const profileDir = join(app.getPath('userData'), 'profiles', profileId)
    const cookieDir = join(profileDir, 'cookies')
    mkdirSync(cookieDir, { recursive: true })

    const outFile = join(cookieDir, 'imported-cookies.json')
    writeFileSync(outFile, JSON.stringify(cookies, null, 2), 'utf8')

    return { imported: cookies.length }
  },
}
