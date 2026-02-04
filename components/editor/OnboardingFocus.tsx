import styles from './OnboardingFocus.module.css'

const STEPS = [
  {
    title: 'SELECT',
    body: [
      'CLICK A SUBJECT ON THE CANVAS.',
      'WE INSTANTLY DETECT THE AREA.'
    ],
    target: 'canvas'
  },
  {
    title: 'COMMIT',
    body: [
      'HIT ADD TO SAVE AS AN ASSET.',
      'DEL CLEARS THE CURRENT SELECTION.'
    ],
    target: 'dock'
  }
] as const

interface OnboardingFocusProps {
  isOpen: boolean
  step: number
  onNext: () => void
  onSkip: () => void
}

export default function OnboardingFocus({
  isOpen,
  step,
  onNext,
  onSkip
}: OnboardingFocusProps) {
  if (!isOpen) return null

  const clampedStep = Math.min(Math.max(step, 0), STEPS.length - 1)
  const isLast = clampedStep === STEPS.length - 1
  const current = STEPS[clampedStep]

  return (
    <div className={styles.overlay}>
      <div className={`${styles.focus} ${current.target === 'canvas' ? styles.canvasFocus : styles.dockFocus}`} />
      <div className={`${styles.card} ${current.target === 'canvas' ? styles.cardCanvas : styles.cardDock}`}>
        <div className={styles.title}>{current.title}</div>
        {current.body.map((line, idx) => (
          <div key={`${current.title}-${idx}`} className={styles.line}>
            {line}
          </div>
        ))}
        <div className={styles.actions}>
          <button className={styles.skip} type="button" onClick={onSkip}>
            SKIP
          </button>
          <button className={styles.next} type="button" onClick={onNext}>
            {isLast ? 'GOT IT' : 'NEXT'}
          </button>
        </div>
      </div>
    </div>
  )
}
