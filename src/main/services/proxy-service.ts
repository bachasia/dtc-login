import * as net from 'net'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import type { Proxy, CreateProxyInput } from '../../shared/types'

// Block connections to private/link-local ranges from proxy test (SSRF prevention)
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

function isBlockedHost(host: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((re) => re.test(host))
}

export const proxyService = {
  list(): Proxy[] {
    return getDb()
      .prepare('SELECT * FROM proxies ORDER BY created_at DESC')
      .all() as Proxy[]
  },

  getById(id: string): Proxy | null {
    return (
      (getDb().prepare('SELECT * FROM proxies WHERE id = ?').get(id) as
        | Proxy
        | undefined) ?? null
    )
  },

  create(input: CreateProxyInput): Proxy {
    const db = getDb()
    const id = uuidv4()
    db.prepare(
      `
      INSERT INTO proxies (id, name, type, host, port, username, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.name ?? null,
      input.type,
      input.host,
      input.port,
      input.username ?? null,
      input.password ?? null
    )
    const created = this.getById(id)
    if (!created) throw new Error(`Proxy ${id} not found after insert`)
    return created
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM proxies WHERE id = ?').run(id)
  },

  /** TCP connect check — verifies proxy host:port is reachable within 5s */
  test(id: string): Promise<{ ok: boolean; message: string }> {
    const proxy = this.getById(id)
    if (!proxy)
      return Promise.resolve({ ok: false, message: 'Proxy not found' })
    if (isBlockedHost(proxy.host)) {
      return Promise.resolve({
        ok: false,
        message: 'Host is in a blocked private range',
      })
    }

    return new Promise((resolve) => {
      const socket = new net.Socket()
      const TIMEOUT_MS = 5000

      socket.setTimeout(TIMEOUT_MS)

      socket.connect(proxy.port, proxy.host, () => {
        socket.destroy()
        resolve({
          ok: true,
          message: `Connected to ${proxy.host}:${proxy.port}`,
        })
      })

      socket.on('error', (err) => {
        socket.destroy()
        resolve({ ok: false, message: err.message })
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve({ ok: false, message: `Timeout after ${TIMEOUT_MS}ms` })
      })
    })
  },
}
