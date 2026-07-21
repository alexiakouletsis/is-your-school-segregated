import { motion, MotionValue, useTransform, useMotionValue, animate } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

interface Props {
  scrollYProgress: MotionValue<number>
  onCurtainDone: () => void
  onCurtainReset: () => void
  onCurtainDropping: () => void
  mode: Mode
  pinkDotRef: React.RefObject<HTMLImageElement>
  greenDotRef: React.RefObject<HTMLImageElement>
  mobilePressed: boolean
}

export default function BlobCurtain({ scrollYProgress, onCurtainDone, onCurtainReset, onCurtainDropping, mode, pinkDotRef, greenDotRef, mobilePressed }: Props) {
  const isMobile = useIsMobile()

  const color1 = mode === 'ses' ? 'var(--color-high-ses)' : 'var(--color-race-1)'
  const color2 = mode === 'ses' ? 'var(--color-low-ses)' : 'var(--color-race-2)'

  const blobScalePink = useTransform(scrollYProgress, [0, 0.737], [1, 180])
  const blobScaleGreen = useTransform(scrollYProgress, [0, 0.45], [1, 180])
  const pinkRadius = useTransform(
    scrollYProgress,
    [0, 0.2, 0.35, 0.5, 0.75],
    ['50%', '60% 40% 55% 45% / 50% 45% 55% 50%', '45% 55% 40% 60% / 55% 50% 45% 55%', '55% 45% 60% 40% / 45% 55% 50% 45%', '8%']
  )
  const greenRadius = useTransform(
    scrollYProgress,
    [0, 0.15, 0.25, 0.35, 0.45],
    ['50%', '45% 55% 60% 40% / 55% 45% 50% 55%', '60% 40% 45% 55% / 45% 55% 60% 40%', '40% 60% 55% 45% / 60% 40% 45% 55%', '8%']
  )
  const initialDotsOpacity = useTransform(scrollYProgress, [0.35, 0.45], [1, 0])
  const bgOpacity = useTransform(scrollYProgress, [0.42, 0.48], [0, 1])
  const [curtainPhase, setCurtainPhase] = useState<'hidden' | 'dropping' | 'done'>('hidden')
  // Motion values instead of useState — Framer updates these directly on the
  // DOM via its own scheduler, without triggering a React re-render on every
  // tick the way the old setInterval+setState version did (that was a real
  // source of mobile jank: a full re-render 60 times a second for the whole
  // ~2s press-hold gesture).
  const mobileBlobScale = useMotionValue(1)
  const mobileBlobRadius = useMotionValue('50%')
  const growAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const radiusAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const hasTriggered = useRef(false)
  const hasLockedRef = useRef(false)

  const [pinkOrigin, setPinkOrigin] = useState<{ top: string; left: string; size: number } | null>(null)
  const [greenOrigin, setGreenOrigin] = useState<{ top: string; left: string; size: number } | null>(null)

  // Rendering the mobile blob div at its real tiny size (~12-16px) and
  // scaling it up 180-270x via transform means that, if the browser
  // promotes it to its own compositor layer (needed to avoid a trailing
  // ghost artifact on release), it rasterizes that tiny bitmap once and
  // stretches it enormously — visibly blurry. Rendering at a much larger
  // fixed base instead, with a smaller compensating scale multiplier,
  // reaches the exact same final pixel size with far less upscaling. These
  // derived values don't touch mobileBlobScale's own semantics at all — the
  // growth animation, thresholds, and trigger logic all still operate on
  // the raw 1→270 value exactly as before; only the rendered CSS scale is
  // rescaled per-blob to account for the larger base size.
  const MOBILE_BLOB_CSS_BASE = 80
  const pinkDisplayScale = useTransform(mobileBlobScale, (v) =>
    pinkOrigin ? v * (pinkOrigin.size / MOBILE_BLOB_CSS_BASE) : v
  )
  const greenDisplayScale = useTransform(mobileBlobScale, (v) =>
    greenOrigin ? v * (greenOrigin.size / MOBILE_BLOB_CSS_BASE) : v
  )

  useEffect(() => {
    // Measure in raw pixels (matching getBoundingClientRect's own coordinate
    // space) instead of percentages of window.innerHeight/vw. On mobile Safari,
    // CSS `100vh` (used to size the origin containers) and JS `window.innerHeight`
    // (used for the % math) can disagree by however much the address bar is
    // showing, which pushed the blob origin down/off from the real dot. Pixel
    // offsets sidestep that mismatch entirely since both the container and the
    // dot share the same viewport-relative coordinate space when Hero is stuck.
    const measure = () => {
      if (!pinkDotRef?.current || !greenDotRef?.current) return
      const pinkRect = pinkDotRef.current.getBoundingClientRect()
      const greenRect = greenDotRef.current.getBoundingClientRect()
      // Skip if the dot images haven't laid out yet (e.g. not loaded/rendered),
      // which previously could produce a 0-size rect and a wrong, oversized-looking
      // blob origin. We'll get called again via the load/resize listeners below.
      if (pinkRect.width === 0 || pinkRect.height === 0 || greenRect.width === 0 || greenRect.height === 0) return

      const vw = window.innerWidth

      // Pink's wrapping container sits at (0,0), so its rect is already
      // container-relative.
      setPinkOrigin({
        top: (pinkRect.top + pinkRect.height / 2) + 'px',
        left: (pinkRect.left + pinkRect.width / 2) + 'px',
        size: pinkRect.width,
      })
      // Green's wrapping container is right-anchored (width: calc(50% + 1px)),
      // so its left edge in viewport coords is vw - containerWidth.
      const greenContainerLeft = vw - (vw * 0.5 + 1)
      setGreenOrigin({
        top: (greenRect.top + greenRect.height / 2) + 'px',
        left: (greenRect.left + greenRect.width / 2 - greenContainerLeft) + 'px',
        size: greenRect.width,
      })
    }

    measure()
    const t = setTimeout(measure, 100)
    const t2 = setTimeout(measure, 600)
    const t3 = setTimeout(measure, 2000)
    window.addEventListener('resize', measure)
    document.fonts.ready.then(measure)

    // Re-measure the instant the dot images finish loading (their layout box
    // can change from 0-height to their real size once loaded) and whenever
    // their box changes size for any other reason.
    const pinkImg = pinkDotRef.current
    const greenImg = greenDotRef.current
    pinkImg.addEventListener('load', measure)
    greenImg.addEventListener('load', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(pinkImg)
    ro.observe(greenImg)

    return () => {
      clearTimeout(t)
      clearTimeout(t2)
      clearTimeout(t3)
      window.removeEventListener('resize', measure)
      pinkImg.removeEventListener('load', measure)
      greenImg.removeEventListener('load', measure)
      ro.disconnect()
    }
  }, [pinkDotRef, greenDotRef, isMobile])

  // press and hold blob expansion on mobile
  useEffect(() => {
    if (!isMobile) return
    if (mobilePressed && curtainPhase === 'hidden' && !hasTriggered.current) {
      radiusAnimRef.current?.stop()
      growAnimRef.current?.stop()

      // Original grew by +1.5 every 16ms until reaching 180 — matches this
      // duration: (180-1)/1.5 steps * 16ms ≈ 1.9s, linear.
      growAnimRef.current = animate(mobileBlobScale, 180, {
        duration: 1.9,
        ease: 'linear',
        onUpdate: (latest) => {
          if (latest >= 180 && !hasTriggered.current) {
            hasTriggered.current = true
            hasLockedRef.current = true
            growAnimRef.current?.stop()
            mobileBlobScale.set(270)
            onCurtainDropping()
            // Mount the intro now (underneath the curtain, which sits above
            // it in z-index — see below) so the curtain drop actually
            // reveals something instead of being mounted only after the
            // drop already finished off-screen. Matches the desktop flow.
            onCurtainDone()
            setCurtainPhase('dropping')
            setTimeout(() => setCurtainPhase('done'), 1400)
          }
        },
      })

      // A single smooth morph instead of continuously cycling through all 5
      // shapes on repeat — animating a complex organic border-radius forces
      // a repaint every frame, and doing that continuously while the
      // element simultaneously scales up to 180x was almost certainly the
      // real source of the choppy trail (not just at release). One morph
      // still reads as an organic blob forming, with far less repaint churn.
      radiusAnimRef.current = animate(mobileBlobRadius, [
        '50%',
        '60% 40% 55% 45% / 50% 45% 55% 50%',
        '45% 55% 40% 60% / 55% 50% 45% 55%',
      ], {
        duration: 1.9,
        ease: 'easeInOut',
      })
    } else {
      growAnimRef.current?.stop()
      radiusAnimRef.current?.stop()
      if (!hasTriggered.current) {
        // Snap instantly rather than animate — interpolating between
        // whatever complex organic shape it was mid-wobble and a plain
        // '50%' produced a choppy trailing artifact, especially while the
        // element is still huge from being scaled up. A clean circle
        // shrinking smoothly looks better anyway.
        mobileBlobRadius.set('50%')
        animate(mobileBlobScale, 1, { duration: 0.3, ease: 'easeOut' })
      }
    }
    return () => {
      growAnimRef.current?.stop()
      radiusAnimRef.current?.stop()
    }
  }, [mobilePressed, isMobile, curtainPhase, onCurtainDone, onCurtainDropping])

  // desktop: scroll-driven curtain
  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      if (isMobile && !mobilePressed) return
      if (v >= 0.65 && !hasLockedRef.current) {
        hasLockedRef.current = true
        onCurtainDropping()
        hasTriggered.current = true
        onCurtainDone()
        setCurtainPhase('dropping')
        setTimeout(() => setCurtainPhase('done'), 1400)
      }
      if (v < 0.2 && hasTriggered.current) {
        hasTriggered.current = false
        hasLockedRef.current = false
        growAnimRef.current?.stop()
        radiusAnimRef.current?.stop()
        mobileBlobScale.set(1)
        mobileBlobRadius.set('50%')
        setCurtainPhase('hidden')
        onCurtainReset()
      }
    })
  }, [scrollYProgress, onCurtainDone, onCurtainReset, onCurtainDropping, isMobile, mobilePressed])

  // Blobs must stay visible through the whole drop, not just while curtainPhase
  // is 'hidden'. They're what's providing full-screen color coverage on mobile
  // (bgOpacity never leaves 0 there since it's driven by scroll, which doesn't
  // move on mobile). Fading them out the instant the curtain starts dropping
  // left a ~1.2s gap — after the 0.2s blob fade but before the 1.4s curtain
  // drop and intro mount finished — where the bare landing page showed through.
  const blobsVisible = curtainPhase !== 'done'

  return (
    <>
      <style>{`
        @keyframes curtainDrop {
          from { transform: translateY(-8%); }
          to { transform: translateY(110vh); }
        }
        .curtain-drop {
          animation: curtainDrop 1.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

      <motion.div style={{
        position: 'absolute', top: 0, left: 0, width: '50%', height: '100%',
        backgroundColor: color1, zIndex: 19, pointerEvents: 'none',
        opacity: blobsVisible ? bgOpacity : 0,
      }} />

      <motion.div style={{
        position: 'absolute', top: 0, right: 0, width: '50%', height: '100%',
        backgroundColor: color2, zIndex: 19, pointerEvents: 'none',
        opacity: blobsVisible ? bgOpacity : 0,
      }} />

      {pinkOrigin && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 'calc(50% + 1px)', height: isMobile ? '100dvh' : '100vh',
          overflow: 'hidden', zIndex: 20, pointerEvents: 'none', contain: 'paint',
          opacity: blobsVisible ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <motion.div style={{
            position: 'absolute', top: pinkOrigin.top, left: pinkOrigin.left,
            width: (isMobile ? MOBILE_BLOB_CSS_BASE : 12) + 'px', height: (isMobile ? MOBILE_BLOB_CSS_BASE : 12) + 'px',
            x: '-50%', y: '-50%',
            borderRadius: isMobile ? mobileBlobRadius : pinkRadius,
            backgroundColor: color1,
            scale: isMobile ? pinkDisplayScale : blobScalePink,
            transformOrigin: 'center center',
            willChange: isMobile ? 'transform' : undefined,
          }} />
        </div>
      )}

      {greenOrigin && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 'calc(50% + 1px)', height: isMobile ? '100dvh' : '100vh',
          overflow: 'hidden', zIndex: 20, pointerEvents: 'none', contain: 'paint',
          opacity: blobsVisible ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <motion.div style={{
            position: 'absolute', top: greenOrigin.top, left: greenOrigin.left,
            width: (isMobile ? MOBILE_BLOB_CSS_BASE : 12) + 'px', height: (isMobile ? MOBILE_BLOB_CSS_BASE : 12) + 'px',
            x: '-50%', y: '-50%',
            borderRadius: isMobile ? mobileBlobRadius : greenRadius,
            backgroundColor: color2,
            scale: isMobile ? greenDisplayScale : blobScaleGreen,
            transformOrigin: 'center center',
            willChange: isMobile ? 'transform' : undefined,
          }} />
        </div>
      )}

      {curtainPhase !== 'done' && (
        <div
          className={curtainPhase === 'dropping' ? 'curtain-drop' : ''}
          style={{
            position: 'fixed', left: 0, right: 0, top: 0, height: '115vh',
            // Must render above Hero's intro wrapper (zIndex 10000) so the
            // curtain visibly covers it and reveals it as it drops away,
            // rather than the intro instantly appearing on top of a curtain
            // the user never gets to see.
            zIndex: 10500, pointerEvents: 'none',
            opacity: curtainPhase === 'dropping' ? 1 : 0,
          }}
        >
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '60px', display: 'block' }}>
            <path d="M0 60 L0 30 Q90 0 180 30 Q270 60 360 30 Q450 0 540 30 Q630 60 720 30 L720 60 Z" fill={color1} />
            <path d="M720 60 L720 30 Q810 0 900 30 Q990 60 1080 30 Q1170 0 1260 30 Q1350 60 1440 30 L1440 60 Z" fill={color2} />
          </svg>
          <div style={{ position: 'absolute', top: '58px', left: 0, right: 0, bottom: 0, display: 'flex' }}>
            <div style={{ width: '50%', height: '100%', backgroundColor: color1 }} />
            <div style={{ width: '50%', height: '100%', backgroundColor: color2 }} />
          </div>
        </div>
      )}

      <motion.div style={{
        position: 'absolute', inset: 0, zIndex: 26, pointerEvents: 'none',
        opacity: curtainPhase === 'hidden' ? initialDotsOpacity : 0,
      }} />
    </>
  )
}