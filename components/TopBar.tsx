import styles from './TopBar.module.css'

interface TopBarProps {
  onExport?: () => void
  onHelp?: () => void
  showActions?: boolean
  status?: string
  statusColor?: string
}

export default function TopBar({
  onExport,
  onHelp,
  showActions = true,
  status,
  statusColor = '#FFFFFF',
}: TopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <div className={styles.logo}>IMAGEGLITCH</div>
        {status && (
          <div 
            className={styles.status}
            style={{ 
              backgroundColor: statusColor,
              color: statusColor === '#FFFFFF' ? '#000000' : '#000000'
            }}
          >
            {status}
          </div>
        )}
      </div>

      {showActions && (
        <div className={styles.right}>
          <button className={styles.actionButton} onClick={onHelp}>Help</button>
          <button className={`${styles.actionButton} ${styles.exportButton}`} onClick={onExport}>
            Export
          </button>
        </div>
      )}
    </header>
  )
}
