/// <reference types="vite/client" />

// Type declarations for contextBridge API exposed by preload/index.ts
interface Window {
  electronAPI: {
    profiles: {
      list: (groupId?: string) => Promise<import('@shared/types').Profile[]>
      get: (id: string) => Promise<import('@shared/types').Profile | null>
      create: (
        data: import('@shared/types').CreateProfileInput
      ) => Promise<import('@shared/types').Profile>
      update: (
        id: string,
        data: import('@shared/types').UpdateProfileInput
      ) => Promise<import('@shared/types').Profile>
      delete: (id: string) => Promise<void>
      bulkDelete: (ids: string[]) => Promise<void>
    }
    groups: {
      list: () => Promise<import('@shared/types').Group[]>
      create: (
        data: import('@shared/types').CreateGroupInput
      ) => Promise<import('@shared/types').Group>
      update: (
        id: string,
        data: import('@shared/types').UpdateGroupInput
      ) => Promise<import('@shared/types').Group>
      delete: (id: string) => Promise<void>
    }
    proxies: {
      list: () => Promise<import('@shared/types').Proxy[]>
      create: (
        data: import('@shared/types').CreateProxyInput
      ) => Promise<import('@shared/types').Proxy>
      test: (id: string) => Promise<{ ok: boolean; message: string }>
      delete: (id: string) => Promise<void>
    }
    browser: {
      start: (profileId: string) => Promise<{
        success: boolean
        session?: import('@shared/types').Session
        error?: string
      }>
      stop: (profileId: string) => Promise<{ success: boolean; error?: string }>
      status: (profileId: string) => Promise<{
        running: boolean
        session: import('@shared/types').Session | null
      }>
    }
    fingerprints: {
      generate: (input?: {
        os?: Array<'windows' | 'macos' | 'linux'>
        locale?: string
      }) => Promise<import('@shared/types').Fingerprint>
    }
    api: {
      getSettings: () => Promise<{
        enabled: boolean
        port: number
        hasApiKey: boolean
        running: boolean
      }>
      updateSettings: (patch: {
        enabled?: boolean
        port?: number
        apiKey?: string
      }) => Promise<{
        success: boolean
        settings?: {
          enabled: boolean
          port: number
          hasApiKey: boolean
          running: boolean
        }
        error?: string
      }>
      testStatus: () => Promise<{ ok: boolean; message: string }>
    }
    // Returns unsubscribe function — call in useEffect cleanup to prevent listener leaks
    on: (
      channel: 'browser:status-changed' | 'app:update-available',
      cb: (
        payload:
          | {
              profileId: string
              status: 'running' | 'stopped'
              session?: import('@shared/types').Session | null
            }
          | unknown
      ) => void
    ) => () => void
  }
}
