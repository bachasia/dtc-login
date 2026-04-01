import { app } from 'electron'
import { execSync } from 'child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs'
import * as https from 'https'
import { join } from 'path'

const CAMOUFOX_VERSION = '135.0.1-beta.24'
const GITHUB_RELEASES_BASE = `https://github.com/daijro/camoufox/releases/download/v${CAMOUFOX_VERSION}`

function getReleaseOsName(platform: NodeJS.Platform): 'win' | 'mac' | 'lin' {
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  if (platform === 'linux') return 'lin'
  throw new Error(`Camoufox binary not available for ${platform}`)
}

function getReleaseArchName(arch: string): 'x86_64' | 'arm64' {
  if (arch === 'x64') return 'x86_64'
  if (arch === 'arm64') return 'arm64'
  throw new Error(`Camoufox binary not available for arch ${arch}`)
}

export interface CamoufoxStatus {
  installed: boolean
  platform: NodeJS.Platform
  arch: string
  platformDir: string
  binaryName: string
  binaryPath: string | null
  source: 'userData' | 'devResources' | 'bundledResources' | null
}

function getCamoufoxCandidatePaths(): {
  platform: NodeJS.Platform
  arch: string
  platformDir: string
  binaryName: string
  runtimeDir: string
  userDataPath: string
  devPath: string
  bundledPath: string
} {
  const platform = process.platform
  const arch = process.arch
  const binaryName = platform === 'win32' ? 'camoufox.exe' : 'camoufox'
  const platformDir = `${platform}-${arch}`

  // macOS ships as an app bundle; Linux/Windows extract flat to runtimeDir
  const binaryRelPath =
    platform === 'darwin'
      ? join('Camoufox.app', 'Contents', 'MacOS', binaryName)
      : binaryName

  const runtimeDir = join(app.getPath('userData'), 'camoufox', platformDir)
  const userDataPath = join(runtimeDir, binaryRelPath)

  const devPath = join(
    process.cwd(),
    'resources',
    'camoufox',
    platformDir,
    binaryRelPath
  )

  const resourcesBase =
    platform === 'darwin'
      ? join(app.getPath('exe'), '..', '..', 'Resources')
      : join(app.getPath('exe'), '..')

  const bundledPath = join(resourcesBase, 'camoufox', platformDir, binaryRelPath)

  return {
    platform,
    arch,
    platformDir,
    binaryName,
    runtimeDir,
    userDataPath,
    devPath,
    bundledPath,
  }
}

function getCurrentPlatformAsset(platform: NodeJS.Platform, arch: string): string {
  const osName = getReleaseOsName(platform)
  const archName = getReleaseArchName(arch)
  return `camoufox-${CAMOUFOX_VERSION}-${osName}.${archName}.zip`
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)

    const request = (redirectUrl: string): void => {
      https
        .get(redirectUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            request(res.headers.location ?? '')
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} while downloading Camoufox`))
            return
          }

          res.pipe(file)
          file.on('finish', () => {
            file.close(() => resolve())
          })
        })
        .on('error', reject)
    }

    request(url)
  })
}

export function getCamoufoxStatus(): CamoufoxStatus {
  const {
    platform,
    arch,
    platformDir,
    binaryName,
    userDataPath,
    devPath,
    bundledPath,
  } = getCamoufoxCandidatePaths()

  if (existsSync(userDataPath)) {
    return {
      installed: true,
      platform,
      arch,
      platformDir,
      binaryName,
      binaryPath: userDataPath,
      source: 'userData',
    }
  }

  if (existsSync(devPath)) {
    return {
      installed: true,
      platform,
      arch,
      platformDir,
      binaryName,
      binaryPath: devPath,
      source: 'devResources',
    }
  }

  if (existsSync(bundledPath)) {
    return {
      installed: true,
      platform,
      arch,
      platformDir,
      binaryName,
      binaryPath: bundledPath,
      source: 'bundledResources',
    }
  }

  return {
    installed: false,
    platform,
    arch,
    platformDir,
    binaryName,
    binaryPath: null,
    source: null,
  }
}

export async function downloadCamoufoxForCurrentPlatform(): Promise<CamoufoxStatus> {
  const { platform, arch, platformDir, runtimeDir } = getCamoufoxCandidatePaths()
  const asset = getCurrentPlatformAsset(platform, arch)
  const tmpFile = join(app.getPath('temp'), asset)
  const url = `${GITHUB_RELEASES_BASE}/${asset}`

  mkdirSync(runtimeDir, { recursive: true })
  await downloadFile(url, tmpFile)

  if (asset.endsWith('.zip')) {
    execSync(`unzip -o "${tmpFile}" -d "${runtimeDir}"`, { stdio: 'ignore' })
  } else {
    execSync(
      `tar -xzf "${tmpFile}" -C "${runtimeDir}" --strip-components=1`,
      { stdio: 'ignore' }
    )
  }

  unlinkSync(tmpFile)

  if (platform === 'darwin') {
    try {
      execSync(`xattr -cr "${runtimeDir}"`, { stdio: 'ignore' })
    } catch {
      // xattr might not be available in some environments
    }
  }

  // Ensure binary is executable — unzip doesn't always preserve Unix execute bits
  if (platform !== 'win32') {
    const relPath =
      platform === 'darwin'
        ? join('Camoufox.app', 'Contents', 'MacOS', 'camoufox')
        : 'camoufox'
    try {
      execSync(`chmod +x "${join(runtimeDir, relPath)}"`, { stdio: 'ignore' })
    } catch {
      // non-fatal — binary may already have the execute bit
    }
  }

  const status = getCamoufoxStatus()
  if (!status.installed || status.platformDir !== platformDir) {
    throw new Error(`Failed to install Camoufox for ${platformDir}`)
  }

  return status
}

/**
 * Returns path to Camoufox binary for current platform.
 * Search order: userData runtime install -> dev resources -> bundled resources.
 */
export function getCamoufoxBinaryPath(): string {
  const status = getCamoufoxStatus()
  if (status.installed && status.binaryPath) return status.binaryPath

  throw new Error(
    `Camoufox binary not found for ${status.platformDir}. Run: npm run download-camoufox`
  )
}
