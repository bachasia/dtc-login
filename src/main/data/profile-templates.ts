import type { Fingerprint } from '../../shared/types'

export interface ProfileTemplate {
  id: string
  name: string
  description: string
  fingerprint: Fingerprint
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: 'facebook-vn',
    name: 'Facebook VN',
    description: 'Toi uu cho Facebook Ads Manager, fanpage, group',
    fingerprint: {
      os: 'windows',
      screenWidth: 1920,
      screenHeight: 1080,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'tiktok-shop',
    name: 'TikTok Shop',
    description: 'Toi uu cho TikTok Shop seller',
    fingerprint: {
      os: 'windows',
      screenWidth: 1366,
      screenHeight: 768,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'shopee-seller',
    name: 'Shopee Seller',
    description: 'Toi uu cho Shopee Seller Center',
    fingerprint: {
      os: 'macos',
      screenWidth: 1440,
      screenHeight: 900,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
    },
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    description: 'Toi uu cho Google Ads manager',
    fingerprint: {
      os: 'windows',
      screenWidth: 1920,
      screenHeight: 1080,
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'en-US',
    },
  },
]
