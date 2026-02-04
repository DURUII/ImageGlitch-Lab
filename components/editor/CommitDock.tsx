import { useState } from 'react'
import styles from './CommitDock.module.css'
import { ArrowRight, Trash2 } from 'lucide-react'

interface CommitDockProps {
  onAdd: () => void
  onReset: () => void
  canAdd: boolean
  canReset: boolean
  mode: 'editing' | 'arrange' | 'previewing'
  previewStyle?: 'highlight' | 'solid'
  onPreviewStyleChange?: (style: 'highlight' | 'solid') => void
  bgm?: 'none' | 'all-my-fellas.mp3' | 'whats-wrong-with-u.mp3'
  onBgmChange?: (bgm: 'none' | 'all-my-fellas.mp3' | 'whats-wrong-with-u.mp3') => void
  isPlaying?: boolean
  isLooping?: boolean
  canPlay?: boolean
  onPlayToggle?: () => void
  onLoopToggle?: () => void
}

export default function CommitDock({
  onAdd,
  onReset,
  canAdd,
  canReset,
  mode,
  previewStyle = 'highlight',
  onPreviewStyleChange,
  bgm = 'none',
  onBgmChange,
  isPlaying = false,
  isLooping = false,
  canPlay = true,
  onPlayToggle,
  onLoopToggle
}: CommitDockProps) {
  const isPreviewing = mode === 'previewing'
  const isEditing = mode === 'editing'
  const [resetPulse, setResetPulse] = useState(false)
  return (
    <div className={styles.dock}>
      <button 
        className={`${styles.actionButton} ${styles.addButton}`}
        onClick={onAdd}
        disabled={!canAdd || isPreviewing || !isEditing}
        title="Add Subject (Enter)"
      >
        <ArrowRight size={18} strokeWidth={2} />
        <span>ADD</span>
      </button>

      <button 
        className={`${styles.actionButton} ${styles.resetButton} ${resetPulse ? styles.resetPulse : ''}`}
        onClick={() => {
          onReset()
          setResetPulse(true)
          window.setTimeout(() => setResetPulse(false), 320)
        }}
        disabled={!canReset || isPreviewing || !isEditing}
        title="Delete Selection"
      >
        <Trash2 size={16} strokeWidth={2} />
        <span>DEL</span>
      </button>

      <div className={styles.transport}>
        <button
          className={styles.transportButton}
          onClick={onPlayToggle}
          disabled={!canPlay}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          className={`${styles.transportButton} ${isLooping ? styles.transportActive : ''}`}
          onClick={onLoopToggle}
          disabled={!canPlay}
        >
          LOOP
        </button>
        <label className={styles.control}>
          <span className={styles.controlLabel}>STYLE</span>
          <select
            className={styles.select}
            value={previewStyle}
            onChange={(e) => onPreviewStyleChange?.(e.target.value as 'highlight' | 'solid')}
          >
            <option value="highlight">HIGHLIGHT</option>
            <option value="solid">SOLID COLOR</option>
          </select>
        </label>
        <label className={styles.control}>
          <span className={styles.controlLabel}>BGM</span>
          <select
            className={styles.select}
            value={bgm}
            onChange={(e) => onBgmChange?.(e.target.value as 'none' | 'all-my-fellas.mp3' | 'whats-wrong-with-u.mp3')}
          >
            <option value="none">NONE</option>
            <option value="all-my-fellas.mp3">ALL MY FELLAS</option>
            <option value="whats-wrong-with-u.mp3">WHATS WRONG WITH U</option>
          </select>
        </label>
      </div>
    </div>
  )
}
