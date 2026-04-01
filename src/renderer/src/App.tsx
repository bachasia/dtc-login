import { useEffect, useState } from 'react'
import { Sidebar } from './components/sidebar'
import { ProfilesPage } from './pages/profiles-page'
import { ProxiesPage } from './pages/proxies-page'
import { SettingsPage } from './pages/settings-page'
import { useProfileStore } from './stores/profile-store'

type PageKey = 'profiles' | 'proxies' | 'settings'

type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'dtc-theme'

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  return saved === 'light' ? 'light' : 'dark'
}

function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('profiles')
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())
  const updateSession = useProfileStore((state) => state.updateSession)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const unsubscribe = window.electronAPI.on(
      'browser:status-changed',
      (payload: unknown) => {
        const data = payload as {
          profileId?: string
          status?: 'running' | 'stopped'
          session?: import('@shared/types').Session | null
        }
        if (!data.profileId || !data.status) return
        updateSession(
          data.profileId,
          data.status === 'running' ? (data.session ?? null) : null
        )
      }
    )

    return unsubscribe
  }, [updateSession])

  return (
    <div className="app-shell">
      <Sidebar page={page} onChangePage={setPage} />

      <main className="main-content">
        {page === 'profiles' && <ProfilesPage />}
        {page === 'proxies' && <ProxiesPage />}
        {page === 'settings' && (
          <SettingsPage theme={theme} onChangeTheme={setTheme} />
        )}
      </main>
    </div>
  )
}

export default App
