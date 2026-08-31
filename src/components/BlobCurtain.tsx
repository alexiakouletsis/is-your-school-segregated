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
  // Bumped (any increasing number) by the new "Click me"/"Tap me" button in
  // Hero.tsx — this is now the ONLY way the intro plays, on both desktop
  // and mobile. Previously desktop grew the blobs continuously as the user
  // scrolled (scrollYProgress driving blobScalePink/blobScaleGreen/
  // pinkRadius/greenRadius directly), and mobile grew them via a
  // sustained press-and-hold gesture (mobilePressed). Both of those are
  // gone — a single click/tap now plays the exact same fixed-duration
  // growth+morph+drop sequence that mobile's press-and-hold used to,
  // reused here for both platforms instead of just one.
  manualTrigger: number
  // Fires once the ENTIRE sequence (growth + curtain-drop) has actually
  // finished — distinct from onCurtainDone, which fires at the START of
  // the drop (so the intro content can mount underneath the still-falling
  // curtain). Hero.tsx needs this specifically to know when it's actually
  // safe to collapse its own wrapper — collapsing on onCurtainDone instead
  // was the real cause of a visible bug: the bg-color panels and blob
  // shapes are sized relative to that wrapper, so collapsing it before the
  // 1450ms drop had actually played out left them stranded at the wrong
  // size mid-animation, visible as leftover rectangles fading out after
  // the curtain had already appeared to finish.
  onSequenceComplete?: () => void
}

export default function BlobCurtain({ scrollYProgress, onCurtainDone, onCurtainReset, onCurtainDropping, mode, pinkDotRef, greenDotRef, manualTrigger, onSequenceComplete }: Props) {
  const isMobile = useIsMobile()

  const color1 = mode === 'ses' ? 'var(--color-high-ses)' : 'var(--color-race-1)'
  const color2 = mode === 'ses' ? 'var(--color-low-ses)' : 'var(--color-race-2)'

  const [curtainPhase, setCurtainPhase] = useState<'hidden' | 'dropping' | 'done'>('hidden')
  // Motion values instead of useState — Framer updates these directly on
  // the DOM via its own scheduler, without triggering a React re-render on
  // every tick the way a setInterval+setState version would. Used for
  // BOTH platforms now (previously mobile-only, desktop was scroll-driven
  // via separate useTransform chains that have been removed — see the
  // comment on the old blobScalePink/pinkRadius etc. this replaced).
  const blobScale = useMotionValue(1)
  const blobRadius = useMotionValue('50%')
  const growAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const radiusAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const hasTriggered = useRef(false)
  const hasLockedRef = useRef(false)
  const lastManualTriggerRef = useRef(manualTrigger)

  // Mirrors of the callback props, kept current via their own tiny
  // effects below. The growth-trigger effect reads these instead of the
  // props directly, specifically so it never needs onCurtainDropping/
  // onCurtainDone/onCurtainReset in ITS OWN dependency array — those
  // props are recreated as new inline functions on every Hero render
  // (not memoized there), and React tears down + reruns an effect's
  // cleanup whenever any listed dependency changes, even if the new
  // effect body then does nothing. That was silently stopping the
  // in-progress grow/radius animations on any ordinary Hero re-render
  // that happened to land mid-animation (hovering the button, anything),
  // which is what was actually cutting the animation short — a real bug,
  // not a pacing issue.
  const onCurtainDroppingRef = useRef(onCurtainDropping)
  const onCurtainDoneRef = useRef(onCurtainDone)
  const onCurtainResetRef = useRef(onCurtainReset)
  const onSequenceCompleteRef = useRef(onSequenceComplete)
  useEffect(() => { onCurtainDroppingRef.current = onCurtainDropping }, [onCurtainDropping])
  useEffect(() => { onCurtainDoneRef.current = onCurtainDone }, [onCurtainDone])
  useEffect(() => { onCurtainResetRef.current = onCurtainReset }, [onCurtainReset])
  useEffect(() => { onSequenceCompleteRef.current = onSequenceComplete }, [onSequenceComplete])

  const [pinkOrigin, setPinkOrigin] = useState<{ top: string; left: string; size: number } | null>(null)
  const [greenOrigin, setGreenOrigin] = useState<{ top: string; left: string; size: number } | null>(null)

  // Rendering the blob div at its real tiny size (~12px) and scaling it up
  // via transform means that, if the browser promotes it to its own
  // compositor layer (needed to avoid a trailing ghost artifact), it
  // rasterizes that tiny bitmap once and stretches it enormously —
  // visibly blurry. Rendering at a much larger fixed base instead, with a
  // smaller compensating scale multiplier, reaches the exact same final
  // pixel size with far less upscaling.
  const BLOB_CSS_BASE = 80
  const pinkDisplayScale = useTransform(blobScale, (v) =>
    pinkOrigin ? v * (pinkOrigin.size / BLOB_CSS_BASE) : v
  )
  const greenDisplayScale = useTransform(blobScale, (v) =>
    greenOrigin ? v * (greenOrigin.size / BLOB_CSS_BASE) : v
  )

  // Back to the original fixed-target approach (a per-screen computed
  // target didn't actually work out) — GROW_TARGET raised well past the
  // original 180 specifically for extra coverage margin on wider/taller
  // screens, and LOCKED_SCALE (what it snaps to right at completion, same
  // idea as the original's 180->270 jump) raised to match.
  const GROW_TARGET = 260
  const LOCKED_SCALE = 350

  // Background color halves and the (currently invisible/contentless,
  // vestigial) initial-dots-fade layer — previously driven by
  // scrollYProgress directly; now derived from blobScale instead, since
  // growth is no longer scroll-linked at all.
  const bgOpacity = useTransform(blobScale, [GROW_TARGET * 0.78, GROW_TARGET], [0, 1])
  const initialDotsOpacity = useTransform(blobScale, [GROW_TARGET * 0.2, GROW_TARGET * 0.45], [1, 0])

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

  // Single unified trigger for BOTH platforms — replaces the old
  // press-and-hold effect (mobile) and the scroll-driven growth inside the
  // effect below (desktop). manualTrigger starts at whatever value Hero.tsx
  // initializes it to and only changes when the button is actually
  // clicked/tapped, so the ref comparison below (not a boolean check)
  // avoids firing on mount.
  useEffect(() => {
    if (manualTrigger === lastManualTriggerRef.current) return
    lastManualTriggerRef.current = manualTrigger
    if (hasTriggered.current) return

    radiusAnimRef.current?.stop()
    growAnimRef.current?.stop()

    // Original grew by +1.5 every 16ms until reaching 180 over ~1.9s —
    // same idea, at a middle-ground pace (faster than the original, but
    // not so fast the sequence blurs together) — and with
    // GROW_TARGET/LOCKED_SCALE raised well past the original 180/270 for
    // real coverage margin on wider/taller screens (see the constants'
    // own comment above).
    growAnimRef.current = animate(blobScale, GROW_TARGET, {
      duration: 1.5,
      ease: 'linear',
      onUpdate: (latest) => {
        if (latest >= GROW_TARGET && !hasTriggered.current) {
          hasTriggered.current = true
          hasLockedRef.current = true
          growAnimRef.current?.stop()
          blobScale.set(LOCKED_SCALE)
          onCurtainDroppingRef.current()
          // Mount the intro now (underneath the curtain, which sits above
          // it in z-index — see below) so the curtain drop actually
          // reveals something instead of being mounted only after the
          // drop already finished off-screen.
          onCurtainDoneRef.current()
          setCurtainPhase('dropping')
          // Matches the .curtain-drop CSS animation's own duration below
          // (1.7s) — this is the separate "wall falls away, revealing the
          // article underneath" beat, distinct from the growth above.
          setTimeout(() => {
            setCurtainPhase('done')
            onSequenceCompleteRef.current?.()
          }, 1450)
        }
      },
    })

    // A single smooth morph instead of continuously cycling through all 5
    // shapes on repeat — animating a complex organic border-radius forces
    // a repaint every frame, and doing that continuously while the element
    // simultaneously scales up was almost certainly the real source of
    // choppiness. One morph still reads as an organic blob forming, with
    // far less repaint churn.
    radiusAnimRef.current = animate(blobRadius, [
      '50%',
      '60% 40% 55% 45% / 50% 45% 55% 50%',
      '45% 55% 40% 60% / 55% 50% 45% 55%',
    ], {
      duration: 1.5,
      ease: 'easeInOut',
    })

    return () => {
      growAnimRef.current?.stop()
      radiusAnimRef.current?.stop()
    }
  }, [manualTrigger])

  // Scrolling back up near the very top still resets everything, as a
  // safety net/escape hatch for "take me back to the start" — but nothing
  // here ever TRIGGERS the growth anymore, only this reset path remains.
  //
  // hasProgressedPastResetZone guards against a real bug this surfaced:
  // since growth is click-triggered now (not scroll-driven), the user's
  // actual scroll position never moves during the whole intro sequence —
  // they're still sitting at v≈0 the moment typing finishes and scrolling
  // unlocks. Without this guard, their very first scroll forward into
  // Section 01 starts at v≈0, which already satisfies "v < 0.2", firing
  // this reset immediately and sending them straight back to the landing
  // page. Only firing once they've actually reached v>=0.2 at least once
  // since the last trigger — a genuine "scrolled forward, then back up
  // again" — distinguishes that from "hasn't scrolled forward yet."
  // (Noted for whenever intro/Section01 get combined into one section —
  // this whole v<0.2 concept may not even apply to that new structure,
  // but keeping the fix scoped/minimal for now rather than redesigning
  // ahead of that.)
  const hasProgressedPastResetZone = useRef(false)
  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      if (v >= 0.2) hasProgressedPastResetZone.current = true
      if (v < 0.2 && hasTriggered.current && hasProgressedPastResetZone.current) {
        hasTriggered.current = false
        hasLockedRef.current = false
        hasProgressedPastResetZone.current = false
        growAnimRef.current?.stop()
        radiusAnimRef.current?.stop()
        blobScale.set(1)
        blobRadius.set('50%')
        setCurtainPhase('hidden')
        onCurtainResetRef.current()
      }
    })
  }, [scrollYProgress])

  // Only visible during growth ('hidden') — hidden again as soon as the
  // curtain starts dropping. The reasoning that used to justify keeping
  // these visible through the WHOLE drop (bgOpacity never reaching 1 on
  // mobile since it was scroll-driven; the bare landing page showing
  // through if they faded too early) no longer applies: bgOpacity is
  // blobScale-driven now on both platforms (reaches 1 reliably before
  // growth even finishes), and the landing page unmounts the instant
  // curtainDone flips regardless of these panels' own opacity. Keeping
  // them at full opacity through the entire drop meant the whole screen
  // was already fully colored before the curtain even started — since
  // the curtain uses the same colors, there was no contrast for its own
  // slide-down motion to read against, making it effectively invisible
  // even though it was genuinely still playing.
  const blobsVisible = curtainPhase === 'hidden'

  return (
    <>
      <style>{`
        @keyframes curtainDrop {
          from { transform: translateY(-8%); }
          to { transform: translateY(110vh); }
        }
        .curtain-drop {
          animation: curtainDrop 1.45s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

      <motion.div style={{
        position: 'fixed', top: 0, left: 0, width: '50%', height: isMobile ? '100dvh' : '100vh',
        backgroundColor: color1, zIndex: 19, pointerEvents: 'none',
        opacity: blobsVisible ? bgOpacity : 0,
        transition: blobsVisible ? undefined : 'opacity 0.2s',
      }} />

      <motion.div style={{
        position: 'fixed', top: 0, right: 0, width: '50%', height: isMobile ? '100dvh' : '100vh',
        backgroundColor: color2, zIndex: 19, pointerEvents: 'none',
        opacity: blobsVisible ? bgOpacity : 0,
        transition: blobsVisible ? undefined : 'opacity 0.2s',
      }} />

      {pinkOrigin && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 'calc(50% + 1px)', height: isMobile ? '100dvh' : '100vh',
          overflow: 'hidden', zIndex: 20, pointerEvents: 'none', contain: 'paint',
          opacity: blobsVisible ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <motion.div style={{
            position: 'absolute', top: pinkOrigin.top, left: pinkOrigin.left,
            width: BLOB_CSS_BASE + 'px', height: BLOB_CSS_BASE + 'px',
            x: '-50%', y: '-50%',
            borderRadius: blobRadius,
            backgroundColor: color1,
            scale: pinkDisplayScale,
            transformOrigin: 'center center',
            willChange: 'transform',
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
            width: BLOB_CSS_BASE + 'px', height: BLOB_CSS_BASE + 'px',
            x: '-50%', y: '-50%',
            borderRadius: blobRadius,
            backgroundColor: color2,
            scale: greenDisplayScale,
            transformOrigin: 'center center',
            willChange: 'transform',
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