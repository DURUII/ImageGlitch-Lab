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
        <div className={styles.logoWrapper}>
          <div className={styles.logo}>IMAGEGLITCH</div>
          <div className={styles.aboutTooltip}>
            <span className={styles.aboutTitle}>FLASHPHOTO / IMAGEGLITCH</span>
            <p className={styles.aboutText}>
              Online glitch art video generator for rhythm-synced flicker and electro-cutout effects.
              Photo to video, AI segmentation, and social-ready outputs for TikTok, Instagram, and
              Xiaohongshu. 支持故障艺术、照片闪烁、在线抠图与 AI 主体分割。
            </p>
          </div>
        </div>
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
