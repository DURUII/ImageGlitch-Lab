import styles from './OnboardingOverlay.module.css'

type Step = {
  title: string
  body: string[]
}

const STEPS: Step[] = [
  {
    title: 'UPLOAD',
    body: [
      'UPLOAD AN IMAGE OR START FROM AN EXAMPLE.'
    ]
  },
  {
    title: 'CLICK TO SELECT',
    body: [
      'CLICK WHAT YOU WANT.',
      'WE INSTANTLY DETECT THE SUBJECT.',
      'LEFT: LIVE MASK UPDATES.',
      'RIGHT: CUTOUT PREVIEW APPEARS AS A NEW ASSET.'
    ]
  },
  {
    title: 'REFINE',
    body: [
      'NOT PERFECT? JUST CLICK MORE.',
      'ADD POINTS TO EXPAND THE AREA.',
      'UNDO ANYTIME.',
      'CLICK = INCLUDE MORE.',
      'UNDO = GO BACK.'
    ]
  },
  {
    title: 'COMMIT ONE SUBJECT',
    body: [
      'WHEN IT LOOKS RIGHT:',
      'ADD -> SAVE IT AS AN ASSET.',
      'OR DEL -> CLEAR THE CURRENT SELECTION.',
      'THEN YOU CAN:',
      'CUT ANOTHER SUBJECT.',
      'OR START ARRANGING.'
    ]
  },
  {
    title: 'PREVIEW',
    body: [
      'HIT PLAY.',
      'PREVIEW WITH BACKGROUND MUSIC.',
      'PROGRESS PLAYS FROM GREY -> WHITE.',
      "WHAT YOU SEE IS WHAT YOU'LL EXPORT."
    ]
  },
  {
    title: 'ARRANGE',
    body: [
      'ON THE RIGHT PANEL:',
      'REORDER ASSETS.',
      'ADJUST DURATION.',
      'DUPLICATE OR DELETE.',
      'SIMPLE TIMELINE. NO HIDDEN STATES.'
    ]
  },
  {
    title: 'EXPORT',
    body: [
      'CHOOSE FORMAT -> EXPORT.',
      'DONE.'
    ]
  }
]

interface OnboardingOverlayProps {
  isOpen: boolean
  step: number
  onNext: () => void
  onSkip: () => void
}

export default function OnboardingOverlay({
  isOpen,
  step,
  onNext,
  onSkip
}: OnboardingOverlayProps) {
  if (!isOpen) return null

  const clampedStep = Math.min(Math.max(step, 0), STEPS.length - 1)
  const isLast = clampedStep === STEPS.length - 1
  const current = STEPS[clampedStep]

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.stepCount}>{clampedStep + 1}/{STEPS.length}</span>
          <h2 className={styles.title}>{current.title}</h2>
        </div>
        <div className={styles.body}>
          {current.body.map((line, idx) => (
            <p key={`${current.title}-${idx}`} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
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
