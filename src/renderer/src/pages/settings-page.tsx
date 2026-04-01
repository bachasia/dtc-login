interface SettingsPageProps {
  theme: 'dark' | 'light'
  onChangeTheme: (theme: 'dark' | 'light') => void
}

export function SettingsPage({
  theme,
  onChangeTheme,
}: SettingsPageProps): JSX.Element {
  return (
    <div className="page-container">
      <div className="card settings-grid">
        <h2>Cài đặt ứng dụng</h2>

        <div>
          <h3 className="section-title">Giao diện</h3>
          <div className="inline-actions">
            <button
              className={theme === 'dark' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => onChangeTheme('dark')}
            >
              Dark mode
            </button>
            <button
              className={theme === 'light' ? 'primary-btn' : 'secondary-btn'}
              onClick={() => onChangeTheme('light')}
            >
              Light mode
            </button>
          </div>
        </div>

        <div>
          <h3 className="section-title">Ngôn ngữ</h3>
          <p>Tiếng Việt (mặc định)</p>
        </div>
      </div>
    </div>
  )
}
