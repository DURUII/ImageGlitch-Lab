'use client'

import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Dither from '@/components/ui/Dither'
import AnimatedShinyText from '@/components/ui/AnimatedShinyText'
import WordRotate from '@/components/ui/WordRotate'
import styles from './home.module.css'

export default function HomePage({ params }: { params: { locale: string } }) {
  return (
    <main className={styles.main}>
      <section className={styles.heroScreen}>
        <TopBar showActions={false} homeHref={`/${params.locale}`} />

        <div className={styles.heroArea}>
          <div className={styles.heroDither}>
            <Dither
              waveColor={[0.5, 0.5, 0.5]}
              disableAnimation={false}
              enableMouseInteraction
              mouseRadius={0.3}
              colorNum={4}
              waveAmplitude={0.3}
              waveFrequency={3}
              waveSpeed={0.05}
            />
          </div>

          <div className={styles.heroContent}>
            <div className={styles.heroCopy}>
              <span className={styles.heroEyebrow}>EFFECT HUB</span>

              <h1 className={styles.heroTitle}>
                MAKE VIRAL
                <WordRotate
                  words={['FLASH PHOTO', 'LIDAR SCANS', 'GLITCH CUTOUTS']}
                  duration={2100}
                  className={styles.heroRotateWord}
                />
              </h1>

              <AnimatedShinyText className={styles.heroSub}>
                PICK AN EFFECT, DROP A PHOTO, THEN SHIP SHORT-FORM VISUALS IN SECONDS.
              </AnimatedShinyText>
            </div>

            <div className={styles.routePanel}>
              <div className={styles.routePanelHead}>
                <span className={styles.panelLabel}>SELECT RENDER MODE</span>
                <span className={styles.panelStatus}>100% LOCAL PROCESSING</span>
              </div>

              <div className={styles.routeGrid}>
                <a className={styles.routeCard} href={`/${params.locale}/flash-photo`}>
                  <span className={styles.routeMeta}>MASK + RHYTHM</span>
                  <span className={styles.routeName}>FLASH PHOTO</span>
                  <span className={styles.routeDesc}>SEQUENCE SUBJECTS. APPLY GLITCH PRESETS. EXPORT MP4 OR GIF.</span>
                  <span className={styles.routeAction}>OPEN WORKSPACE</span>
                </a>
                <a className={styles.routeCard} href={`/${params.locale}/lidar`}>
                  <span className={styles.routeMeta}>DEPTH + LAYERS</span>
                  <span className={styles.routeName}>LIDAR SCAN</span>
                  <span className={styles.routeDesc}>RECONSTRUCT DEPTH MAPS, STACK FLICKER LAYERS, AND RENDER.</span>
                  <span className={styles.routeAction}>OPEN WORKSPACE</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        <Footer modelReady modelStatus="ready" modelProgress={1} />
      </section>
    </main>
  )
}
