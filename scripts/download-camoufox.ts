/**
 * Download Camoufox binaries from coryking/camoufox GitHub releases.
 * Run: npx ts-node scripts/download-camoufox.ts
 * Run (current platform only): npx ts-node scripts/download-camoufox.ts --current
 */
import { execSync } from 'child_process'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as https from 'https'

const CAMOUFOX_VERSION = '0.4.2'
const GITHUB_RELEASES_BASE = `https://github.com/coryking/camoufox/releases/download/v${CAMOUFOX_VERSION}`

interface PlatformTarget {
  platform: string
  arch: string
  asset: string
}

const ALL_PLATFORMS: PlatformTarget[] = [
  { platform: 'win32', arch: 'x64', asset: `camoufox-${CAMOUFOX_VERSION}-win32-x64.zip` },
  { platform: 'darwin', arch: 'x64', asset: `camoufox-${CAMOUFOX_VERSION}-darwin-x64.tar.gz` },
  { platform: 'darwin', arch: 'arm64', asset: `camoufox-${CAMOUFOX_VERSION}-darwin-arm64.tar.gz` },
  { platform: 'linux', arch: 'x64', asset: `camoufox-${CAMOUFOX_VERSION}-linux-x64.tar.gz` },
]

const currentOnly = process.argv.includes('--current')
const targets = currentOnly
  ? ALL_PLATFORMS.filter((t) => t.platform === process.platform && t.arch === process.arch)
  : ALL_PLATFORMS

const ROOT = join(__dirname, '..')
const RESOURCES_DIR = join(ROOT, 'resources', 'camoufox')
const VERSION_FILE = join(RESOURCES_DIR, 'version.txt')

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(dest)
    const request = (redirectUrl: string): void => {
      https.get(redirectUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${redirectUrl}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
      }).on('error', reject)
    }
    request(url)
  })
}

async function downloadPlatform(target: PlatformTarget): Promise<void> {
  const { platform, arch, asset } = target
  const platformDir = `${platform}-${arch}`
  const destDir = join(RESOURCES_DIR, platformDir)
  const tmpFile = join(RESOURCES_DIR, asset)

  console.log(`\n→ ${platformDir}: downloading ${asset}`)
  mkdirSync(destDir, { recursive: true })

  const url = `${GITHUB_RELEASES_BASE}/${asset}`
  await downloadFile(url, tmpFile)
  console.log(`  downloaded → ${tmpFile}`)

  // Extract
  if (asset.endsWith('.zip')) {
    execSync(`unzip -o "${tmpFile}" -d "${destDir}"`, { stdio: 'inherit' })
  } else {
    execSync(`tar -xzf "${tmpFile}" -C "${destDir}" --strip-components=1`, { stdio: 'inherit' })
  }
  console.log(`  extracted → ${destDir}`)

  // Remove archive after extraction
  require('fs').unlinkSync(tmpFile)

  // macOS: remove quarantine attribute to avoid Gatekeeper blocking unsigned binary
  if (platform === 'darwin') {
    try {
      execSync(`xattr -cr "${destDir}"`, { stdio: 'ignore' })
      console.log(`  cleared quarantine xattr`)
    } catch {
      // xattr not available — safe to ignore
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(RESOURCES_DIR, { recursive: true })

  if (targets.length === 0) {
    console.error(`No matching platform for ${process.platform}-${process.arch}`)
    process.exit(1)
  }

  for (const target of targets) {
    await downloadPlatform(target)
  }

  writeFileSync(VERSION_FILE, CAMOUFOX_VERSION, 'utf8')
  console.log(`\n✓ Camoufox ${CAMOUFOX_VERSION} ready in resources/camoufox/`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
