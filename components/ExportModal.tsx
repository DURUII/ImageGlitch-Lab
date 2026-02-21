import styles from './ExportModal.module.css'

type ExportFormat = 'mp4' | 'gif' | 'live' | 'cutout'
type CutoutMode = 'cropped' | 'fullsize'

interface ExportModalProps {
  isOpen: boolean
  formats: ExportFormat[]
  cutoutModes: CutoutMode[]
  availableFormats?: ExportFormat[]
  formatLabels?: Partial<Record<ExportFormat, string>>
  optionGroup?: {
    title: string
    options: Array<{ id: string; label: string }>
    selected: string[]
    onToggle: (id: string) => void
  }
  onFormatToggle: (format: ExportFormat) => void
  onCutoutModeToggle: (mode: CutoutMode) => void
  onCancel: () => void
  onDownload: () => void
  isBusy?: boolean
  note?: string | null
  progress?: number
}

export default function ExportModal({
  isOpen,
  formats,
  cutoutModes,
  availableFormats,
  formatLabels,
  optionGroup,
  onFormatToggle,
  onCutoutModeToggle,
  onCancel,
  onDownload,
  isBusy = false,
  note,
  progress = 0
}: ExportModalProps) {
  if (!isOpen) return null

  const formatOptions = availableFormats ?? (['mp4', 'gif', 'live', 'cutout'] as ExportFormat[])
  const getFormatLabel = (opt: ExportFormat) => {
    if (formatLabels?.[opt]) return formatLabels[opt]
    if (opt === 'mp4') return 'MP4'
    if (opt === 'gif') return 'GIF'
    if (opt === 'live') return 'LIVE PHOTO'
    return 'CUTOUT'
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>EXPORT</h2>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>FORMAT</div>
          <div className={styles.optionRow}>
            {formatOptions.map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.optionButton} ${formats.includes(opt) ? styles.active : ''}`}
                onClick={() => onFormatToggle(opt)}
                disabled={isBusy}
              >
                {getFormatLabel(opt)}
              </button>
            ))}
          </div>
        </div>

        {optionGroup && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{optionGroup.title}</div>
            <div className={styles.optionRow}>
              {optionGroup.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles.optionButton} ${optionGroup.selected.includes(opt.id) ? styles.active : ''}`}
                  onClick={() => optionGroup.onToggle(opt.id)}
                  disabled={isBusy}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {formats.includes('cutout') && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>CUTOUT</div>
            <div className={styles.optionRow}>
              {(['cropped', 'fullsize'] as CutoutMode[]).map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`${styles.optionButton} ${cutoutModes.includes(opt) ? styles.active : ''}`}
                  onClick={() => onCutoutModeToggle(opt)}
                  disabled={isBusy}
                >
                  {opt === 'cropped' ? 'CROPPED' : 'FULLSIZE'}
                </button>
              ))}
            </div>
          </div>
        )}

        {note && <div className={styles.note}>{note}</div>}
        {isBusy && (
          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.progressText}>{progress}%</div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.secondaryButton} onClick={onCancel} disabled={isBusy}>
            CANCEL
          </button>
          <button className={styles.primaryButton} onClick={onDownload} disabled={isBusy}>
            {isBusy ? 'EXPORTING...' : 'DOWNLOAD'}
          </button>
        </div>
      </div>
    </div>
  )
}
