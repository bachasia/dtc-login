import type { Fingerprint } from '@shared/types'
import { useGenerateFingerprint } from '../hooks/use-ipc'

interface FingerprintEditorProps {
  value: Fingerprint
  onChange: (next: Fingerprint) => void
}

const SCREEN_OPTIONS = [
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '2560x1440', width: 2560, height: 1440 },
  { label: '1440x900', width: 1440, height: 900 },
]

export function FingerprintEditor({
  value,
  onChange,
}: FingerprintEditorProps): JSX.Element {
  const generateFingerprint = useGenerateFingerprint()

  const selectedScreen = SCREEN_OPTIONS.find(
    (screen) =>
      screen.width === value.screenWidth && screen.height === value.screenHeight
  )

  const handleRandom = async (): Promise<void> => {
    const generated = await generateFingerprint.mutateAsync({
      os: value.os ? [value.os] : undefined,
      locale: value.locale,
    })
    onChange({ ...value, ...generated })
  }

  return (
    <div className="card fingerprint-grid">
      <h4 className="section-title">Fingerprint</h4>

      <label className="field-label">
        Hệ điều hành
        <select
          className="field-input"
          value={value.os ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              os: (event.target.value || undefined) as Fingerprint['os'],
            })
          }
        >
          <option value="">Tự động</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="linux">Linux</option>
        </select>
      </label>

      <label className="field-label">
        Màn hình
        <select
          className="field-input"
          value={selectedScreen?.label ?? 'custom'}
          onChange={(event) => {
            const screen = SCREEN_OPTIONS.find(
              (option) => option.label === event.target.value
            )
            if (!screen) return
            onChange({
              ...value,
              screenWidth: screen.width,
              screenHeight: screen.height,
            })
          }}
        >
          {SCREEN_OPTIONS.map((option) => (
            <option key={option.label} value={option.label}>
              {option.label}
            </option>
          ))}
          <option value="custom">Tùy chỉnh</option>
        </select>
      </label>

      <label className="field-label">
        Timezone
        <select
          className="field-input"
          value={value.timezone ?? 'Asia/Ho_Chi_Minh'}
          onChange={(event) =>
            onChange({ ...value, timezone: event.target.value })
          }
        >
          <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
          <option value="Asia/Bangkok">Asia/Bangkok</option>
          <option value="America/New_York">America/New_York</option>
          <option value="Europe/London">Europe/London</option>
        </select>
      </label>

      <label className="field-label">
        Locale
        <select
          className="field-input"
          value={value.locale ?? 'vi-VN'}
          onChange={(event) =>
            onChange({ ...value, locale: event.target.value })
          }
        >
          <option value="vi-VN">vi-VN</option>
          <option value="en-US">en-US</option>
          <option value="th-TH">th-TH</option>
        </select>
      </label>

      <button
        type="button"
        className="secondary-btn"
        disabled={generateFingerprint.isPending}
        onClick={() => void handleRandom()}
      >
        {generateFingerprint.isPending ? 'Đang tạo...' : 'Tạo ngẫu nhiên'}
      </button>
    </div>
  )
}
