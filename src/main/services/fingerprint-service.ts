import { FingerprintGenerator } from 'fingerprint-generator'
import type { Fingerprint } from '../../shared/types'

const generator = new FingerprintGenerator()

/**
 * Generate a realistic browser fingerprint using Apify's Bayesian network
 * trained on real-world browser data.
 */
export function generateFingerprint(options?: {
  os?: ('windows' | 'macos' | 'linux')[]
  locale?: string
}): Fingerprint {
  const result = generator.getFingerprint({
    devices: ['desktop'],
    operatingSystems: options?.os ?? ['windows', 'macos'],
    browsers: ['firefox'], // Camoufox is Firefox-based
    locales: options?.locale ? [options.locale] : ['vi-VN', 'en-US'],
  })

  const fp = result.fingerprint
  const platform = (fp.navigator.platform ?? '').toLowerCase()
  const os: Fingerprint['os'] = platform.includes('win')
    ? 'windows'
    : platform.includes('mac')
      ? 'macos'
      : 'linux'

  const locale = options?.locale ?? 'vi-VN'

  return {
    os,
    browser: 'firefox',
    screenWidth: fp.screen.width,
    screenHeight: fp.screen.height,
    timezone: locale === 'vi-VN' ? 'Asia/Ho_Chi_Minh' : 'America/New_York',
    locale,
    userAgent: fp.navigator.userAgent,
    raw: fp as unknown as Record<string, unknown>,
  }
}
