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
// profileId → in-flight startup Promise
const startingSessions = new Map<string, Promise<Session>>()

export const browserService = {
  async start(profileId: string): Promise<Session> {
    const inFlight = startingSessions.get(profileId)
    if (inFlight) return inFlight

    if (runningProcesses.has(profileId)) {
      const existing = this.getSession(profileId)
      if (existing) return existing
    }

    const startupPromise = (async (): Promise<Session> => {
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
          const auth = proxy.username
            ? `${proxy.username}:${proxy.password}@`
            : ''
          proxyArg = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
        }
      }

      const args = [
        '--remote-debugging-port',
        String(debugPort),
        '--profile',
        profileDir,
        '-no-remote',                 // prevent attaching to an existing Firefox instance
        '--no-default-browser-check',
      ]
      if (proxyArg) args.push('--proxy-server', proxyArg)

      // Inject fingerprint — Camoufox reads this env var at startup and applies at C++ level
      const camoufoxEnv: NodeJS.ProcessEnv = { ...process.env }
      if (profile.fingerprint.raw) {
        camoufoxEnv['CAMOUFOX_FINGERPRINT'] = JSON.stringify(
          profile.fingerprint.raw
        )
      }

      const binaryPath = getCamoufoxBinaryPath()
      const proc = spawn(binaryPath, args, {
        env: camoufoxEnv,
        detached: false,
      })
      runningProcesses.set(profileId, proc)

      const spawnErrorPromise = new Promise<never>((_resolve, reject) => {
        proc.once('error', (err) => {
          if (runningProcesses.get(profileId) === proc) {
            runningProcesses.delete(profileId)
            cleanupStoppedSession(profileId, false)
          }
          reject(err)
        })
      })

      proc.on('exit', () => {
        if (runningProcesses.get(profileId) !== proc) return
        runningProcesses.delete(profileId)
        cleanupStoppedSession(profileId, true)
      })

      let wsEndpoint: string
      try {
        wsEndpoint = await Promise.race([
          waitForBrowserReady(debugPort, proc),
          spawnErrorPromise,
        ])
      } catch (err) {
        runningProcesses.delete(profileId)

        proc.kill('SIGTERM')
        const exitedAfterTerm = await waitForProcessExit(proc, 5000)
        if (!exitedAfterTerm) {
          const killSignal = proc.kill('SIGKILL')
          if (killSignal) await waitForProcessExit(proc, 2000)
        }

        cleanupStoppedSession(profileId, false)
        throw err
      }

      const db = getDb()
      db.prepare(
        `
        INSERT OR REPLACE INTO sessions (profile_id, pid, debug_port, ws_endpoint)
        VALUES (?, ?, ?, ?)
      `
      ).run(profileId, proc.pid ?? null, debugPort, wsEndpoint)

      const session = this.getSession(profileId)
      if (!session) {
        throw new Error(`Session not available after startup for ${profileId}`)
      }

      broadcastStatus(profileId, 'running', session)
      return session
    })()

    startingSessions.set(profileId, startupPromise)
    try {
      return await startupPromise
    } finally {
      if (startingSessions.get(profileId) === startupPromise) {
        startingSessions.delete(profileId)
      }
    }
  },

  async stop(profileId: string): Promise<void> {
    const proc = runningProcesses.get(profileId)
    if (!proc) {
      if (this.getSession(profileId)) cleanupStoppedSession(profileId, true)
      return
    }

    proc.kill('SIGTERM')
    const exitedAfterTerm = await waitForProcessExit(proc, 5000)
    if (exitedAfterTerm) return

    const killSignal = proc.kill('SIGKILL')
    if (!killSignal) {
      if (proc.exitCode !== null || proc.signalCode !== null) return
      throw new Error(`Cannot force stop browser for profile ${profileId}`)
    }
    const exitedAfterKill = await waitForProcessExit(proc, 2000)
    if (exitedAfterKill) return

    runningProcesses.delete(profileId)
    cleanupStoppedSession(profileId, true)
  },

  async stopAll(): Promise<void> {
    const profileIds = Array.from(runningProcesses.keys())
    await Promise.all(profileIds.map((profileId) => this.stop(profileId)))
  },

  getSession(profileId: string): Session | null {
    return (
      (getDb()
        .prepare('SELECT * FROM sessions WHERE profile_id = ?')
        .get(profileId) as Session | undefined) ?? null
    )
  },

  isRunning(profileId: string): boolean {
    return runningProcesses.has(profileId)
  },
}

/**
 * Poll CDP /json/version until the browser responds or timeout elapses.
 */
async function waitForBrowserReady(
  port: number,
  proc: ChildProcess,
  timeoutMs = 30_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(`Camoufox exited before CDP was ready on port ${port}`)
    }
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
  throw new Error(
    `Camoufox did not start on port ${port} within ${timeoutMs}ms`
  )
}

function waitForProcessExit(
  proc: ChildProcess,
  timeoutMs: number
): Promise<boolean> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const onExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      proc.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    proc.once('exit', onExit)
  })
}

function cleanupStoppedSession(
  profileId: string,
  shouldBroadcast: boolean
): void {
  getDb().prepare('DELETE FROM sessions WHERE profile_id = ?').run(profileId)
  if (shouldBroadcast) broadcastStatus(profileId, 'stopped', null)
}

function broadcastStatus(
  profileId: string,
  status: 'running' | 'stopped',
  session: Session | null
): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('browser:status-changed', {
      profileId,
      status,
      session,
    })
  })
}
