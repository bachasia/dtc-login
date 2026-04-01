import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Returns path to bundled Camoufox binary for current platform.
 * Dev mode: looks in resources/camoufox/{platform-arch}/
 * Prod mode: uses app resources path from electron-builder extraResources
 */
export function getCamoufoxBinaryPath(): string {
  const platform = process.platform // 'win32' | 'darwin' | 'linux'
  const arch = process.arch // 'x64' | 'arm64'
  const binaryName = platform === 'win32' ? 'firefox.exe' : 'firefox'
  const platformDir = `${platform}-${arch}`

  // Development: relative to project root
  const devPath = join(
    process.cwd(),
    'resources',
    'camoufox',
    platformDir,
    binaryName
  )
  if (existsSync(devPath)) return devPath

  // Production: extraResources land at:
  //   macOS → {app.getPath('exe')}/../../Resources/camoufox/
  //   win/linux → {app.getPath('exe')}/../camoufox/
  const resourcesBase =
    platform === 'darwin'
      ? join(app.getPath('exe'), '..', '..', 'Resources')
      : join(app.getPath('exe'), '..')

  const prodPath = join(resourcesBase, 'camoufox', platformDir, binaryName)
  if (existsSync(prodPath)) return prodPath

  throw new Error(
    `Camoufox binary not found for ${platformDir}. Run: npm run download-camoufox`
  )
}
