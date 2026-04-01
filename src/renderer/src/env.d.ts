/// <reference types="vite/client" />

// Type declarations for contextBridge API exposed by preload/index.ts
interface Window {
  electronAPI: {
    profiles: {
      list: (groupId?: string) => Promise<import('@shared/types').Profile[]>
      get: (id: string) => Promise<import('@shared/types').Profile | null>
      create: (data: import('@shared/types').CreateProfileInput) => Promise<import('@shared/types').Profile>
      update: (id: string, data: import('@shared/types').UpdateProfileInput) => Promise<import('@shared/types').Profile>
      delete: (id: string) => Promise<void>
      bulkDelete: (ids: string[]) => Promise<void>
    }
    groups: {
      list: () => Promise<import('@shared/types').Group[]>
      create: (data: import('@shared/types').CreateGroupInput) => Promise<import('@shared/types').Group>
      update: (id: string, data: import('@shared/types').UpdateGroupInput) => Promise<import('@shared/types').Group>
      delete: (id: string) => Promise<void>
    }
    proxies: {
      list: () => Promise<import('@shared/types').Proxy[]>
      create: (data: import('@shared/types').CreateProxyInput) => Promise<import('@shared/types').Proxy>
      test: (id: string) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>
      delete: (id: string) => Promise<void>
    }
    browser: {
      start: (profileId: string) => Promise<{ ok: boolean; wsEndpoint?: string }>
      stop: (profileId: string) => Promise<{ ok: boolean }>
      status: (profileId: string) => Promise<string>
    }
    // Returns unsubscribe function — call in useEffect cleanup to prevent listener leaks
    on: (channel: 'browser:status-changed' | 'app:update-available', cb: (...args: unknown[]) => void) => () => void
  }
}
