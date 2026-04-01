import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  profiles: {
    list: (groupId?: string) => ipcRenderer.invoke('profiles:list', groupId),
    get: (id: string) => ipcRenderer.invoke('profiles:get', id),
    create: (data: unknown) => ipcRenderer.invoke('profiles:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('profiles:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    bulkDelete: (ids: string[]) =>
      ipcRenderer.invoke('profiles:bulk-delete', ids),
    templates: () => ipcRenderer.invoke('profiles:templates'),
    pickCookieFile: () => ipcRenderer.invoke('profiles:pick-cookie-file'),
    importCookies: (profileId: string, filePath: string) =>
      ipcRenderer.invoke('profiles:import-cookies', profileId, filePath),
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    create: (data: unknown) => ipcRenderer.invoke('groups:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('groups:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('groups:delete', id),
  },
  proxies: {
    list: () => ipcRenderer.invoke('proxies:list'),
    create: (data: unknown) => ipcRenderer.invoke('proxies:create', data),
    test: (id: string) => ipcRenderer.invoke('proxies:test', id),
    delete: (id: string) => ipcRenderer.invoke('proxies:delete', id),
  },
  browser: {
    start: (profileId: string) =>
      ipcRenderer.invoke('browser:start', profileId),
    stop: (profileId: string) => ipcRenderer.invoke('browser:stop', profileId),
    status: (profileId: string) =>
      ipcRenderer.invoke('browser:status', profileId),
  },
  fingerprints: {
    generate: (input?: {
      os?: Array<'windows' | 'macos' | 'linux'>
      locale?: string
    }) => ipcRenderer.invoke('fingerprints:generate', input),
  },
  api: {
    getSettings: () => ipcRenderer.invoke('api:get-settings'),
    updateSettings: (patch: {
      enabled?: boolean
      port?: number
      apiKey?: string
    }) => ipcRenderer.invoke('api:update-settings', patch),
    testStatus: () => ipcRenderer.invoke('api:test-status'),
  },
  camoufox: {
    status: () => ipcRenderer.invoke('camoufox:status'),
    downloadCurrent: () => ipcRenderer.invoke('camoufox:download-current'),
  },
  // Returns an unsubscribe function to prevent listener leaks in React useEffect teardowns
  on: (channel: string, cb: (...args: unknown[]) => void): (() => void) => {
    const validChannels = ['browser:status-changed', 'app:update-available']
    if (!validChannels.includes(channel)) return () => void 0
    const listener = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ): void => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
