import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getCamoufoxBinaryPath } from '../utils/camoufox-path'
import { findFreePort } from '../utils/port-finder'
import { profileService } from './profile-service'
import { proxyService } from './proxy-service'
import { getDb } from '../db/database'
import type { Session } from '../../shared/types'

// profileId → running ChildProcess
const runningProcesses = new Map<string, ChildProcess>()

export const browserService = {
  async start(profileId: string): Promise<Session> {
    if (runningProcesses.has(profileId)) {
      const existing = this.getSession(profileId)
      if (existing) return existing
    }

    const profile = profileService.getById(profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)

    // Isolated Firefox profile directory per profile
    const profileDir = join(app.getPath('userData'), 'profiles', profileId)
    mkdirSync(profileDir, { recursive: true })

    const debugPort = await findFreePort(9222)

    // Build proxy URL if assigned
    let proxyArg: string | undefined
    if (profile.proxy_id) {
      const proxy = proxyService.getById(profile.proxy_id)
      if (proxy) {
        const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : ''
        proxyArg = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
      }
    }

    const args = [
      '--remote-debugging-port', String(debugPort),
      '--profile', profileDir,
      '--no-first-run',
      '--no-default-browser-check',
    ]
    if (proxyArg) args.push('--proxy-server', proxyArg)

    // Inject fingerprint — Camoufox reads this env var at startup and applies at C++ level
    const camoufoxEnv: NodeJS.ProcessEnv = { ...process.env }
    if (profile.fingerprint.raw) {
      camoufoxEnv['CAMOUFOX_FINGERPRINT'] = JSON.stringify(profile.fingerprint.raw)
    }

    const binaryPath = getCamoufoxBinaryPath()
    const proc = spawn(binaryPath, args, { env: camoufoxEnv, detached: false })
    runningProcesses.set(profileId, proc)

    let wsEndpoint: string
    try {
      wsEndpoint = await waitForBrowserReady(debugPort)
    } catch (err) {
      proc.kill('SIGTERM')
      runningProcesses.delete(profileId)
      throw err
    }

    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO sessions (profile_id, pid, debug_port, ws_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(profileId, proc.pid ?? null, debugPort, wsEndpoint)

    proc.on('exit', () => {
      runningProcesses.delete(profileId)
      getDb().prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId)
      broadcastStatus(profileId, 'stopped')
    })

    broadcastStatus(profileId, 'running')
    return this.getSession(profileId)!
  },

  stop(profileId: string): void {
    const proc = runningProcesses.get(profileId)
    if (proc) {
      proc.kill('SIGTERM')
      runningProcesses.delete(profileId)
    }
    getDb().prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId)
    broadcastStatus(profileId, 'stopped')
  },

  stopAll(): void {
    for (const [profileId] of runningProcesses) {
      this.stop(profileId)
    }
  },

  getSession(profileId: string): Session | null {
    return (
      (getDb().prepare('SELECT * FROM sessions WHERE profile_id = ?').get(profileId) as Session | undefined) ?? null
    )
  },

  isRunning(profileId: string): boolean {
    return runningProcesses.has(profileId)
  },
}

/**
 * Poll CDP /json/version until the browser responds or timeout elapses.
 */
async function waitForBrowserReady(port: number, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (resp.ok) {
        const data = (await resp.json()) as { webSocketDebuggerUrl?: string }
        if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl
      }
    } catch {
      // not ready yet — fall through to sleep
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Camoufox did not start on port ${port} within ${timeoutMs}ms`)
}

function broadcastStatus(profileId: string, status: 'running' | 'stopped'): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('browser:status-changed', { profileId, status })
  })
}
