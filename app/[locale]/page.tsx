'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Dither from '@/components/ui/Dither'
import WordRotate from '@/components/ui/WordRotate'
import { useSharedUpload } from '@/hooks/useSharedUpload'
import styles from './home.module.css'

export default function HomePage({ params }: { params: { locale: string } }) {
  const { sharedImage } = useSharedUpload()
  const parallaxRef = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: parallaxRef,
    offset: ['start end', 'end start'],
  })
  const rearLayerY = useTransform(scrollYProgress, [0, 1], ['-8%', '10%'])
  const frontLayerY = useTransform(scrollYProgress, [0, 1], ['-18%', '20%'])

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

            <h1 className={styles.heroTitle}>
              MAKE VIRAL
              <WordRotate
                words={['FLASH PHOTO', 'LIDAR LOOKS', 'GLITCH CUTOUTS']}
                duration={2100}
                className={styles.heroRotateWord}
              />
            </h1>

            <p className={styles.heroSub}>
              PICK AN EFFECT, DROP A PHOTO, SHIP SHORT-FORM VISUALS FAST WITHIN SECONDS.
            </p>

            <a href="#effects" className={styles.scrollCue}>
              SCROLL FOR EFFECTS
            </a>
          </div>
        </div>

        <Footer modelReady modelStatus="ready" modelProgress={1} />
      </section>

      <section id="effects" ref={parallaxRef} className={styles.parallaxScreen}>
        <motion.div
          aria-hidden="true"
          className={`${styles.parallaxLayer} ${styles.parallaxLayerRear}`}
          style={{ y: rearLayerY }}
        />
        <motion.div
          aria-hidden="true"
          className={`${styles.parallaxLayer} ${styles.parallaxLayerFront}`}
          style={{ y: frontLayerY }}
        />

        <div className={styles.parallaxContent}>
          <span className={styles.parallaxLead}>EFFECT STACK</span>
          <h2 className={styles.parallaxTitle}>CHOOSE YOUR NEXT PAGE</h2>
          <p className={styles.parallaxSub}>
            FLASH PHOTO IS FOR RHYTHM POWER-ON CUTOUTS. LIDAR IS FOR DEPTH-LOOK VISUALS WITH THE SAME
            SHARED SOURCE.
          </p>

          <div className={styles.routeGrid}>
            <a className={styles.routeCard} href={`/${params.locale}/flash-photo`}>
              <span className={styles.routeName}>FLASH PHOTO</span>
              <span className={styles.routeDesc}>MASK SEQUENCE, GLITCH PRESETS, EXPORT</span>
            </a>
            <a className={styles.routeCard} href={`/${params.locale}/lidar`}>
              <span className={styles.routeName}>LIDAR LOOK</span>
              <span className={styles.routeDesc}>DEPTH RECONSTRUCTION, LAYERED FLICKER</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
