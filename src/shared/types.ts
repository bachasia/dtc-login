// Core domain types shared between main process and renderer

export interface Fingerprint {
  os?: 'windows' | 'macos' | 'linux'
  osVersion?: string
  browser?: 'firefox'
  browserVersion?: string
  screenWidth?: number
  screenHeight?: number
  timezone?: string
  locale?: string
  userAgent?: string
  raw?: Record<string, unknown>
}

export interface Profile {
  id: string
  name: string
  group_id: string | null
  proxy_id: string | null
  fingerprint: Fingerprint
  notes: string | null
  tags: string[]
  created_at: number
  updated_at: number
}

export interface Group {
  id: string
  name: string
  color: string
  created_at: number
}

export interface Proxy {
  id: string
  name: string | null
  type: 'http' | 'https' | 'socks4' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
  created_at: number
}

export interface Session {
  profile_id: string
  pid: number | null
  debug_port: number | null
  ws_endpoint: string | null
  started_at: number
}

export interface BrowserStatus {
  running: boolean
  pid?: number
  debugPort?: number
  wsEndpoint?: string
}

// Exclude server-generated fields — prevents renderer from overwriting existing record IDs (IDOR)
export type CreateProfileInput = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>> & { name: string }
export type UpdateProfileInput = Partial<Omit<Profile, 'id' | 'created_at'>>

export type CreateGroupInput = { name: string; color?: string }
export type UpdateGroupInput = Partial<Omit<Group, 'id' | 'created_at'>>

export type CreateProxyInput = Omit<Proxy, 'id' | 'created_at'>
