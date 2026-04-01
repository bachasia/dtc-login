import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import type { Server } from 'http'
import { app as electronApp } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { browserService } from './browser-service'
import { profileService } from './profile-service'
import { getDb } from '../db/database'
import type { UpdateProfileInput } from '../../shared/types'

const DEFAULT_PORT = 50325

type LocalApiSettings = {
  enabled: boolean
  port: number
  apiKey: string
}

type ApiResult = {
  code: number
  data: Record<string, unknown>
  msg: string
}

let server: Server | null = null
let activePort = DEFAULT_PORT
let activeApiKey = ''
let lifecycleQueue: Promise<unknown> = Promise.resolve()

export const localApiService = {
  getSettings(): LocalApiSettings {
    return normalizeSettings({
      enabled: readSetting('api_enabled', 'false') === 'true',
      port: toNumber(
        readSetting('api_port', String(DEFAULT_PORT)),
        DEFAULT_PORT
      ),
      apiKey: readSetting('api_key', ''),
    })
  },

  async applyFromSettings(): Promise<LocalApiSettings> {
    const settings = this.getSettings()
    await this.configure(settings)
    return settings
  },

  async updateSettings(
    patch: Partial<LocalApiSettings>
  ): Promise<LocalApiSettings> {
    return withLifecycleLock(async () => {
      const current = this.getSettings()
      const next = normalizeSettings({
        enabled: patch.enabled ?? current.enabled,
        port: patch.port ?? current.port,
        apiKey: patch.apiKey ?? current.apiKey,
      })

      await configureInternal(next)

      try {
        writeSettings(next)
      } catch (err) {
        await configureInternal(current)
        throw err
      }

      return next
    })
  },

  async configure(settings: LocalApiSettings): Promise<void> {
    const normalized = normalizeSettings(settings)
    await withLifecycleLock(async () => {
      await configureInternal(normalized)
    })
  },

  async start(port: number, apiKey: string): Promise<void> {
    await this.configure({ enabled: true, port, apiKey })
  },

  async stop(): Promise<void> {
    await withLifecycleLock(async () => {
      await stopInternal()
    })
  },

  isRunning(): boolean {
    return server !== null
  },

  getRuntimeState(): { running: boolean; port: number } {
    return { running: this.isRunning(), port: activePort }
  },

  async testStatus(): Promise<{ ok: boolean; message: string }> {
    if (!this.isRunning()) {
      return { ok: false, message: 'Local API is not running' }
    }

    try {
      const response = await fetch(`http://127.0.0.1:${activePort}/status`)
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }
      return { ok: true, message: 'Local API is reachable' }
    } catch (err) {
      return {
        ok: false,
        message: toPublicMessage(err, 'Local API unreachable'),
      }
    }
  },
}

function withLifecycleLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycleQueue.then(task, task)
  lifecycleQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function configureInternal(settings: LocalApiSettings): Promise<void> {
  if (!settings.enabled) {
    await stopInternal()
    return
  }

  if (
    server &&
    settings.port === activePort &&
    settings.apiKey === activeApiKey
  ) {
    return
  }

  const previous = server ? { port: activePort, apiKey: activeApiKey } : null

  await stopInternal()

  try {
    await startInternal(settings.port, settings.apiKey)
  } catch (err) {
    if (previous) {
      try {
        await startInternal(previous.port, previous.apiKey)
      } catch (rollbackErr) {
        throw new Error(
          `Failed to apply Local API settings and rollback failed: ${toPublicMessage(rollbackErr, 'rollback error')}`
        )
      }
    }
    throw err
  }
}

async function startInternal(port: number, apiKey: string): Promise<void> {
  if (server) return

  const expressApp = createExpressApp(apiKey)
  const listener = await listenLocalOnly(expressApp, port)

  server = listener
  activePort = port
  activeApiKey = apiKey
}

async function stopInternal(): Promise<void> {
  if (!server) return

  const current = server

  await new Promise<void>((resolve, reject) => {
    current.close((err?: Error) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })

  if (server === current) {
    server = null
  }
}

function createExpressApp(apiKey: string): express.Express {
  const expressApp = express()

  expressApp.use(express.json())
  expressApp.use(express.urlencoded({ extended: false }))

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/status') {
      next()
      return
    }

    const auth = req.headers['authorization']
    if (auth !== `Bearer ${apiKey}`) {
      res.status(401).json(errorResult('Unauthorized', 401))
      return
    }
    next()
  })

  expressApp.get('/status', (_req, res) => {
    res.json(successResult({ status: 'running' }))
  })

  expressApp.get('/api/v1/browser/start', async (req, res) => {
    const profileId = readQueryString(req.query['user_id'])
    if (!profileId) {
      res.json(errorResult('user_id required'))
      return
    }

    try {
      const session = await browserService.start(profileId)
      res.json(
        successResult({
          ws: {
            selenium: `127.0.0.1:${session.debug_port ?? ''}`,
            puppeteer: session.ws_endpoint ?? '',
          },
          debug_port: String(session.debug_port ?? ''),
          webdriver: getGeckodriverPath(),
        })
      )
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to start browser')))
    }
  })

  expressApp.get('/api/v1/browser/stop', async (req, res) => {
    const profileId = readQueryString(req.query['user_id'])
    if (!profileId) {
      res.json(errorResult('user_id required'))
      return
    }

    try {
      await browserService.stop(profileId)
      res.json(successResult())
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to stop browser')))
    }
  })

  expressApp.get('/api/v1/browser/active', (_req, res) => {
    try {
      const sessions = getDb().prepare('SELECT * FROM sessions').all()
      res.json(successResult({ list: sessions as Record<string, unknown>[] }))
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to read sessions')))
    }
  })

  expressApp.post('/api/v1/user/create', (req, res) => {
    const body = readBody(req)
    const name = readBodyString(body['name'])
    if (!name) {
      res.json(errorResult('name required'))
      return
    }

    try {
      const profile = profileService.create({
        name,
        group_id: readBodyString(body['group_id']) ?? null,
        notes: readBodyString(body['remark']) ?? null,
      })
      res.json(successResult({ id: profile.id }))
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to create profile')))
    }
  })

  expressApp.get('/api/v1/user/list', (req, res) => {
    try {
      const page = Math.max(1, toNumber(readQueryString(req.query['page']), 1))
      const pageSize = Math.max(
        1,
        Math.min(200, toNumber(readQueryString(req.query['page_size']), 50))
      )
      const groupId = readQueryString(req.query['group_id'])
      const offset = (page - 1) * pageSize

      const whereClause = groupId ? 'WHERE group_id = ?' : ''
      const params: unknown[] = groupId ? [groupId] : []

      const db = getDb()
      const countRow = db
        .prepare(`SELECT COUNT(*) as total FROM profiles ${whereClause}`)
        .get(...params) as { total: number } | undefined

      const listRows = db
        .prepare(
          `
            SELECT id, name, group_id, notes, created_at
            FROM profiles
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(...params, pageSize, offset) as Array<{
        id: string
        name: string
        group_id: string | null
        notes: string | null
        created_at: number
      }>

      const list = listRows.map((row) => ({
        user_id: row.id,
        name: row.name,
        group_id: row.group_id ?? '',
        remark: row.notes ?? '',
        created_time: row.created_at,
      }))

      res.json(
        successResult({
          list,
          page,
          page_size: pageSize,
          total: countRow?.total ?? 0,
        })
      )
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to list profiles')))
    }
  })

  expressApp.post('/api/v1/user/update', (req, res) => {
    const body = readBody(req)
    const userId = readBodyString(body['user_id'])
    if (!userId) {
      res.json(errorResult('user_id required'))
      return
    }

    const updateInput: UpdateProfileInput = {}
    const name = readBodyString(body['name'])
    const groupId = readBodyString(body['group_id'])
    const remark = readBodyString(body['remark'])

    if (name !== undefined) updateInput.name = name
    if (groupId !== undefined) updateInput.group_id = groupId || null
    if (remark !== undefined) updateInput.notes = remark || null

    if (Object.keys(updateInput).length === 0) {
      res.json(errorResult('no update fields provided'))
      return
    }

    try {
      profileService.update(userId, updateInput)
      res.json(successResult())
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to update profile')))
    }
  })

  expressApp.post('/api/v1/user/delete', (req, res) => {
    try {
      const ids = readUserIds(readBody(req))
      if (ids.length === 0) {
        res.json(errorResult('user_id or user_ids required'))
        return
      }

      profileService.bulkDelete(ids)
      res.json(successResult())
    } catch (err) {
      res.json(errorResult(toPublicMessage(err, 'Failed to delete profiles')))
    }
  })

  expressApp.get('/api/v1/user/reqs', (_req, res) => {
    res.json(
      successResult({
        required_fields: ['name'],
        optional_fields: ['group_id', 'remark'],
      })
    )
  })

  expressApp.use(
    (_err: Error, _req: Request, res: Response, next: NextFunction): void => {
      void next
      if (res.headersSent) return
      res.status(500).json(errorResult('Internal server error'))
    }
  )

  return expressApp
}

function readSetting(key: string, fallback: string): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

function writeSettings(settings: LocalApiSettings): void {
  const db = getDb()
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )

  const txn = db.transaction(() => {
    upsert.run('api_enabled', String(settings.enabled))
    upsert.run('api_port', String(settings.port))
    upsert.run('api_key', settings.apiKey)
  })

  txn()
}

function normalizeSettings(settings: LocalApiSettings): LocalApiSettings {
  const normalized = {
    enabled: settings.enabled,
    port: clampPort(settings.port),
    apiKey: settings.apiKey.trim(),
  }

  if (normalized.enabled && !normalized.apiKey) {
    throw new Error('API key is required when Local API is enabled')
  }

  return normalized
}

function clampPort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('API port must be an integer between 1 and 65535')
  }
  return value
}

function listenLocalOnly(
  expressApp: express.Express,
  port: number
): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const listener = expressApp.listen(port, '127.0.0.1')
    const onError = (err: Error): void => {
      listener.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      listener.removeListener('error', onError)
      resolve(listener)
    }

    listener.once('error', onError)
    listener.once('listening', onListening)
  })
}

function toPublicMessage(_err: unknown, fallback: string): string {
  return fallback
}

function successResult(data: Record<string, unknown> = {}): ApiResult {
  return { code: 0, data, msg: 'success' }
}

function errorResult(msg: string, code = -1): ApiResult {
  return { code, data: {}, msg }
}

function readBody(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object') return {}
  return req.body as Record<string, unknown>
}

function readBodyString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return undefined
  return value.trim()
}

function readQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  return undefined
}

function readUserIds(body: Record<string, unknown>): string[] {
  if (Array.isArray(body['user_ids'])) {
    return (body['user_ids'] as unknown[])
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
  }

  const userId = readBodyString(body['user_id'])
  return userId ? [userId] : []
}

function toNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.trunc(parsed)
}

function getGeckodriverPath(): string {
  const platform = process.platform
  const arch = process.arch
  const binaryName = platform === 'win32' ? 'geckodriver.exe' : 'geckodriver'
  const platformDir = `${platform}-${arch}`

  const devPath = join(
    process.cwd(),
    'resources',
    'geckodriver',
    platformDir,
    binaryName
  )
  if (existsSync(devPath)) return devPath

  const resourcesBase =
    platform === 'darwin'
      ? join(electronApp.getPath('exe'), '..', '..', 'Resources')
      : join(electronApp.getPath('exe'), '..')

  const prodPath = join(resourcesBase, 'geckodriver', platformDir, binaryName)
  if (existsSync(prodPath)) return prodPath

  return ''
}

export type { LocalApiSettings }
