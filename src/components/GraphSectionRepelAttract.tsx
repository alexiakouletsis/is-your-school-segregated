import { useEffect, useRef, useState } from 'react'
import { useScroll, useTransform, useMotionValue, animate, motion, AnimatePresence } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import { getNodeColor } from './graphUtils'
import type { Mode } from '../App'
import type { Node } from './graphTypes'

// A small, bespoke two-node illustration of the core graph mechanics
// (repulsion when unconnected, attraction + an edge when connected).
//
// Desktop: scroll position determines WHEN each phase triggers (crossing
// a threshold), and the actual motion plays out as a real, time-based
// animation (Framer's imperative animate()) once triggered.
//
// Mobile: scroll still brings the nodes into view/holds them in place
// (showPanel), but the repel->attract transition itself is TAP-driven —
// matching how the other graph sections (GraphSection45 etc.) handle
// mobile navigation, rather than continuous/threshold-based scrolling.
// Tapping the right half advances, the left half goes back, with the
// same "tap to go forward/back" hints those sections use.
const NODE_1 = { id: 0, ses: 'higher', race_ethnicity: 'white_asian' } as Node

const REPEL_LABEL = "Students who don't share classes will repel from each other."
const ATTRACT_LABEL = "Students who share classes will be pulled together."
const EDGE_NOTICE = "Two students who share at least one class are connected by an edge."

const TOTAL_VH = 320

const D_HOLD_END = 0.17
const D_REPEL_REACHED = 0.17
const D_ATTRACT_REACHED = 0.55

const M_HOLD_END = 0.15

const D_CLOSE = ['38%', '62%']
const D_REPEL = ['15%', '85%']
const D_ATTRACT = ['36%', '64%']

// Mobile: pulled further apart at the start than desktop's — the same
// percentage gap was overlapping given mobile's node size relative to a
// narrower screen. Repel pulled in a bit from the edges (was 10/90,
// slightly off-screen once the node's own width is accounted for).
const M_CLOSE = ['30%', '70%']
const M_REPEL = ['15%', '85%']
const M_ATTRACT = ['33%', '67%']

// Builds a keyframe sequence that moves smoothly toward the target, then
// jitters back and forth a couple times right around it before finally
// settling exactly there — like magnets being pushed apart (repel) or
// pulled together (attract), overshooting slightly before catching.
// startPct is read live via motionValue.get() at trigger time (not
// assumed to always be CLOSE), since repel can also be re-triggered from
// an attract position if the user scrolls/taps backward first.
function buildShakeKeyframes(startPct: string, endPct: string): string[] {
  const start = parseFloat(startPct)
  const end = parseFloat(endPct)
  const jitter = 3.6
  const dir = end >= start ? 1 : -1
  return [
    startPct,
    `${end}%`,
    `${end + jitter * dir}%`,
    `${end - jitter * dir * 0.6}%`,
    `${end + jitter * dir * 0.4}%`,
    `${end}%`,
  ]
}
const SHAKE_TIMES = [0, 0.55, 0.68, 0.8, 0.9, 1]

export default function GraphSectionRepelAttract({ mode }: { mode: Mode }) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  })

  const dot1Src = mode === 'race' ? '/assets/whiteasian-dot-K3.svg' : '/assets/high-SES-dot-K3.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-dot-K3.svg' : '/assets/low-SES-dot-K3.svg'
  const nodeSize = isMobile ? 'clamp(70px, 20vw, 100px)' : 'clamp(90px, 12vw, 150px)'

  const CLOSE = isMobile ? M_CLOSE : D_CLOSE
  const REPEL = isMobile ? M_REPEL : D_REPEL
  const ATTRACT = isMobile ? M_ATTRACT : D_ATTRACT

  const node1Left = useMotionValue(CLOSE[0])
  const node2Left = useMotionValue(CLOSE[1])
  // Bumped up (0.2 -> 0.4) per feedback that the attract edge needed to
  // read as more solid/opaque.
  const edgeOpacity = useMotionValue(0)

  const holdEndFrac = isMobile ? M_HOLD_END : D_HOLD_END
  const dNodeTop = useTransform(scrollYProgress, [holdEndFrac * 0.6, holdEndFrac], ['70%', '50%'])
  // Mobile: starts a bit lower during the intro/hold phase (so it fits
  // comfortably within the initial viewport), then transitions to
  // vertically centered once the actual graph phase begins (showPanel),
  // matching where desktop's own scroll-linked dNodeTop above ends up.
  const mobileNodeTopMV = useMotionValue('18%')
  const nodeTop = isMobile ? mobileNodeTopMV : dNodeTop

  const edgeColor = getNodeColor(NODE_1, mode)

  const holdEnd = isMobile ? M_HOLD_END : D_HOLD_END
  // Fade-out start: exactly where attract begins on desktop (scroll-tied
  // there); mobile doesn't have a scroll-tied attract point anymore (it's
  // tap-triggered), so a fixed later fraction stands in for it there.
  const fadeOutStart = isMobile ? 0.6 : D_ATTRACT_REACHED
  // Set directly inside the same scroll effects that drive showPanel
  // below (not a separate useTransform reading scrollYProgress on its
  // own) — that's what guarantees this snaps to visible at the exact
  // same v as the solid background color and left-panel text do, rather
  // than risking the same visual-timing mismatch the earlier fade-out
  // bug had.
  const bgOpacity = useMotionValue(0)

  const [showPanel, setShowPanel] = useState(false)
  // Tells App.tsx's toggle-shadow whether this section is "visually
  // showing graph content" — deliberately NOT tied to showPanel, which
  // (like bgOpacity before its own fix) never reverts to false on
  // forward scroll past the section, since v clamps at 1 and stays
  // there. Set in the exact same v-window as the background fade
  // (holdEnd to fadeOutStart), so the shadow disappears once the
  // background itself has faded out, not just once during a full page
  // scroll-through.
  const [isVisuallyActive, setIsVisuallyActive] = useState(false)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'repel-attract', active: isVisuallyActive } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'repel-attract', active: false } }))
    }
  }, [isVisuallyActive])
  const [phase, setPhase] = useState<'repel' | 'attract'>('repel')

  // Repel's own label now fades in (matching the other graph sections'
  // step-label convention) instead of typing character-by-character —
  // per feedback, typing was specifically the wrong treatment here.
  const [noticeText, setNoticeText] = useState('')
  const noticeDoneRef = useRef(false)
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasRepelledRef = useRef(false)
  const hasAttractedRef = useRef(false)
  const hasFadedInRef = useRef(false)
  // Holds the in-flight bgOpacity fade-in animation's controls, if any —
  // so it can be explicitly stopped whenever a different branch below
  // needs to directly .set() bgOpacity instead. Framer's animate() keeps
  // ticking on its own schedule until its duration completes; a bare
  // bgOpacity.set(0) elsewhere doesn't cancel it, so if the user reverses
  // scroll direction while this fade-in is still mid-flight, the
  // animation can keep overwriting that reset on subsequent frames — the
  // graph-paper background staying stuck visible when scrolling back up
  // into the intro was exactly this race, not a logic bug in the reset
  // itself.
  const bgAnimRef = useRef<{ stop: () => void } | null>(null)

  const triggerRepel = () => {
    if (hasRepelledRef.current) return
    hasRepelledRef.current = true
    hasAttractedRef.current = false
    animate(node1Left, buildShakeKeyframes(node1Left.get(), REPEL[0]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(node2Left, buildShakeKeyframes(node2Left.get(), REPEL[1]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(edgeOpacity, 0, { duration: 0.3 })
    setPhase(prev => {
      if (prev === 'attract') {
        noticeDoneRef.current = false
        clearInterval(noticeIntervalRef.current!)
        setNoticeText('')
      }
      return 'repel'
    })
  }

  const triggerAttract = () => {
    if (hasAttractedRef.current) return
    hasAttractedRef.current = true
    hasRepelledRef.current = false
    animate(node1Left, buildShakeKeyframes(node1Left.get(), ATTRACT[0]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(node2Left, buildShakeKeyframes(node2Left.get(), ATTRACT[1]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(edgeOpacity, 0.9, { duration: 0.8, delay: 0.5 })
    if (!noticeDoneRef.current) {
      noticeDoneRef.current = true
      setNoticeText('')
      let i = 0
      clearInterval(noticeIntervalRef.current!)
      noticeIntervalRef.current = setInterval(() => {
        i++
        setNoticeText(EDGE_NOTICE.slice(0, i))
        if (i >= EDGE_NOTICE.length) clearInterval(noticeIntervalRef.current!)
      }, 22)
    }
    setPhase('attract')
  }

  // Desktop only: scroll position triggers phase changes automatically.
  useEffect(() => {
    if (isMobile) return
    return scrollYProgress.on('change', (v) => {
      setShowPanel(v >= holdEnd)
      if (v < holdEnd) {
        bgAnimRef.current?.stop()
        bgOpacity.set(0)
        hasFadedInRef.current = false
        setIsVisuallyActive(false)
      } else if (v < fadeOutStart) {
        if (!hasFadedInRef.current) {
          hasFadedInRef.current = true
          bgAnimRef.current = animate(bgOpacity, 1, { duration: 0.5, ease: 'easeInOut' })
        }
        setIsVisuallyActive(true)
      } else {
        hasFadedInRef.current = false
        bgAnimRef.current?.stop()
        const fadeProgress = Math.min(1, (v - fadeOutStart) / (1 - fadeOutStart))
        bgOpacity.set(1 - fadeProgress)
        setIsVisuallyActive(fadeProgress < 0.3)
      }
      if (v >= D_ATTRACT_REACHED) triggerAttract()
      else if (v >= D_REPEL_REACHED) triggerRepel()
      else {
        // Scrolled back above repel — reset both triggers and node
        // position so scrolling forward again re-triggers cleanly.
        hasRepelledRef.current = false
        hasAttractedRef.current = false
        animate(node1Left, CLOSE[0], { duration: 0.6, ease: 'easeInOut' })
        animate(node2Left, CLOSE[1], { duration: 0.6, ease: 'easeInOut' })
        animate(edgeOpacity, 0, { duration: 0.3 })
      }
    })
  }, [scrollYProgress, isMobile, holdEnd, fadeOutStart])

  // Mobile only: scroll just brings the panel into view; repel/attract
  // are tap-driven instead (see the graph panel's onClick below).
  useEffect(() => {
    if (!isMobile) return
    return scrollYProgress.on('change', (v) => {
      setShowPanel(v >= holdEnd)
      if (v < holdEnd) {
        bgAnimRef.current?.stop()
        bgOpacity.set(0)
        hasFadedInRef.current = false
        setIsVisuallyActive(false)
      } else if (v < fadeOutStart) {
        if (!hasFadedInRef.current) {
          hasFadedInRef.current = true
          bgAnimRef.current = animate(bgOpacity, 1, { duration: 0.5, ease: 'easeInOut' })
        }
        setIsVisuallyActive(true)
      } else {
        hasFadedInRef.current = false
        bgAnimRef.current?.stop()
        const fadeProgress = Math.min(1, (v - fadeOutStart) / (1 - fadeOutStart))
        bgOpacity.set(1 - fadeProgress)
        setIsVisuallyActive(fadeProgress < 0.3)
      }
      if (v < holdEnd) {
        hasRepelledRef.current = false
        hasAttractedRef.current = false
        setPhase('repel')
        node1Left.set(CLOSE[0])
        node2Left.set(CLOSE[1])
        edgeOpacity.set(0)
      } else if (!hasRepelledRef.current && !hasAttractedRef.current) {
        // First time the panel appears, land on repel automatically —
        // subsequent phase changes are tap-only from here.
        triggerRepel()
      }
    })
  }, [scrollYProgress, isMobile, holdEnd, fadeOutStart])

  useEffect(() => () => clearInterval(noticeIntervalRef.current!), [])

  useEffect(() => {
    if (!isMobile) return
    animate(mobileNodeTopMV, showPanel ? '50%' : '18%', { duration: 0.4, ease: 'easeInOut' })
  }, [isMobile, showPanel])

  // Scroll resistance — desktop only (mobile's graph phases are tap-
  // driven now, so there's nothing for scroll resistance to protect
  // there). Same always-block-until-enough-delta-pushed-through pattern
  // the grade4/5 -> next section transition already uses reliably,
  // instead of a reactive wall-clock buffer keyed off scrollYProgress —
  // that Framer motion value's recompute can lag several wheel events
  // behind on a fast flick, which was exactly why the FIRST scroll-in
  // could sail through both zones before either buffer ref ever got set
  // (a second attempt worked because by then real scroll position had
  // already caught up from the first pass). Zone detection here reads the
  // container's live getBoundingClientRect() directly on every wheel
  // event instead — always in sync with the actual current scroll
  // position, no async recompute lag involved. Repel's threshold cut
  // down per earlier feedback that it was way too sticky; attract's
  // stays generous.
  const REPEL_BLOCK_DELTA = 550
  const ATTRACT_BLOCK_DELTA = 550
  const repelDeltaAccumRef = useRef(0)
  const attractDeltaAccumRef = useRef(0)
  // Tracks the previous wheel event's own v so a single aggressive scroll
  // that jumps clean over an entire zone in one tick can be caught and
  // corrected, rather than only ever checking whichever zone the jump
  // happened to land in. Without this, a fast-enough flick could move v
  // from before D_REPEL_REACHED to past D_ATTRACT_REACHED within one
  // wheel event — the very first time this handler ever sees it, v is
  // already in attract's own zone, so repel's resistance check never runs
  // at all, and the same can happen scrolling far enough past attract in
  // one event too.
  const lastVRef = useRef(0)
  // Some browsers (Safari with trackpad momentum, in particular) won't let
  // JS cancel an already-started INERTIAL scroll via preventDefault, no
  // matter how the listener is registered — the deltaY events keep coming
  // from the OS's own momentum simulation, not a cancelable input. That's
  // a real candidate for "still blows through on the very first flick"
  // even with the gating logic above computed correctly. This locks the
  // scrollY position the moment a zone is entered while delta is still
  // owed, and forcibly snaps back to it if the browser lets the page
  // drift away anyway — the same lock-and-correct pattern already used
  // (and confirmed working) for the grade5 exit lock elsewhere in this
  // codebase, just not relying on preventDefault alone this time.
  const lockedScrollYRef = useRef<number | null>(null)
  useEffect(() => {
    if (isMobile) return
    const handleWheel = (e: WheelEvent) => {
      if (!containerRef.current || e.ctrlKey) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.top > 0 || rect.bottom <= 0) return
      // Same "start start" -> "end start" mapping this component's own
      // useScroll target/offset uses, computed straight from the live
      // rect rather than read from scrollYProgress.
      const v = Math.min(1, Math.max(0, -rect.top / rect.height))
      const prevV = lastVRef.current
      lastVRef.current = v

      if (e.deltaY <= 0) {
        // Scrolling backward resets both — re-entering a zone forward
        // again always requires a fresh push, same as
        // useGraphSection's own accumulatedDeltaRef behavior.
        repelDeltaAccumRef.current = 0
        attractDeltaAccumRef.current = 0
        lockedScrollYRef.current = null
        return
      }

      // A fixed property of the container's position in the document —
      // doesn't change as the page scrolls, so this is safe to compute
      // fresh each time and reuse for either correction below.
      const containerTopAbsolute = window.scrollY + rect.top

      // Caught a jump that skipped the entire repel zone in one go
      // (started before it, landed at or past attract) — snap back to
      // right at repel's own threshold instead of letting attract's
      // resistance check run against wherever the jump actually landed.
      if (prevV < D_REPEL_REACHED && v >= D_ATTRACT_REACHED) {
        const targetScrollY = containerTopAbsolute + D_REPEL_REACHED * rect.height
        window.scrollTo(0, targetScrollY)
        lockedScrollYRef.current = targetScrollY
        repelDeltaAccumRef.current = 0
        e.preventDefault()
        return
      }
      // Same idea for overshooting well past attract's own threshold in
      // one jump, starting from before it — snap back to right at
      // attract's threshold so its resistance can't be skipped either.
      if (prevV < D_ATTRACT_REACHED && v > D_ATTRACT_REACHED + 0.05) {
        const targetScrollY = containerTopAbsolute + D_ATTRACT_REACHED * rect.height
        window.scrollTo(0, targetScrollY)
        lockedScrollYRef.current = targetScrollY
        attractDeltaAccumRef.current = 0
        e.preventDefault()
        return
      }

      if (v >= D_REPEL_REACHED && v < D_ATTRACT_REACHED) {
        repelDeltaAccumRef.current += e.deltaY
        if (repelDeltaAccumRef.current < REPEL_BLOCK_DELTA) {
          if (lockedScrollYRef.current === null) lockedScrollYRef.current = window.scrollY
          e.preventDefault()
        } else {
          lockedScrollYRef.current = null
        }
      } else if (v >= D_ATTRACT_REACHED) {
        attractDeltaAccumRef.current += e.deltaY
        if (attractDeltaAccumRef.current < ATTRACT_BLOCK_DELTA) {
          if (lockedScrollYRef.current === null) lockedScrollYRef.current = window.scrollY
          e.preventDefault()
        } else {
          lockedScrollYRef.current = null
        }
      } else {
        lockedScrollYRef.current = null
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    // Corrective safety net — runs on every real scroll event regardless
    // of whether it was triggered by a wheel event we could intercept.
    // Only acts while a lock is actively held (i.e. delta is still owed),
    // and only when drift is actually detected, so this is a no-op
    // whenever preventDefault already did its job.
    const handleScroll = () => {
      if (lockedScrollYRef.current !== null && Math.abs(window.scrollY - lockedScrollYRef.current) > 1) {
        window.scrollTo(0, lockedScrollYRef.current)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isMobile])

  return (
    <div
      ref={containerRef}
      style={{
        height: isMobile ? '190vh' : `${TOTAL_VH}vh`,
        position: 'relative',
        marginTop: isMobile ? '-65vh' : '-85vh',
      }}
    >
      <div style={{
        position: 'sticky', top: 0, width: '100%', height: '100vh',
        backgroundColor: showPanel ? 'var(--color-bg)' : 'transparent',
        transition: 'background-color 0.3s ease',
        overflow: 'hidden',
        pointerEvents: showPanel ? 'auto' : 'none',
      }}>

        {/* Experimental — graph-paper texture fading in as the section
            transitions from the intro text into the graph itself,
            differentiating graph sections from plain text ones. A
            separate overlay layer (not baked into the panel's own
            background) specifically so background-color opacity can't
            interfere with it, and so it's a one-line removal if it
            doesn't end up working visually. If it reads well here, the
            plan is to reuse it as the background for other graph
            sections too. A direct child of the sticky panel (not the
            content wrapper below) so it always spans the panel's full
            height regardless of how much shorter the actual content is
            on mobile — otherwise the wallpaper stopped short of the
            bottom of the screen right along with the content. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/assets/graph-paper-bg.png)',
          backgroundRepeat: 'repeat',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Content wrapper — capped at the mobile graph screen's actual
            height (shorter than the panel's own 100vh, to leave edge
            padding at the bottom) so none of the content shifts position;
            only the wallpaper above extends into that extra space. */}
        <div style={{ height: isMobile ? '94vh' : '100%', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', position: 'relative' }}>

        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'center', padding: isMobile ? '4.5rem 1.5rem 0.5rem 1.5rem' : '3rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem' }}>
          {/* Desktop: the panel background is now a full block spanning
              the whole left column (inset from top/bottom/sides), not
              just wrapped around the current text — so the look stays
              consistent once future graph sections fill this panel with
              actual stats instead of just a label. */}
          {!isMobile && showPanel && (
            <div style={{ position: 'absolute', top: '3%', bottom: '3%', left: '1rem', right: '1rem', backgroundColor: 'rgba(250, 249, 246, 0.82)', borderRadius: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 0 }} />
          )}
          {showPanel && (
            <>
              {!isMobile && noticeText && (
                <p style={{ position: 'absolute', top: '6rem', left: '3rem', right: '2rem', zIndex: 1, fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                  {noticeText}
                  {noticeText.length < EDGE_NOTICE.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
                </p>
              )}
              <div style={{
                position: 'relative', zIndex: 1,
                // Mobile still wraps just the text (no explicit full
                // panel there), matching the toggle's own backdrop style.
                backgroundColor: isMobile ? 'rgba(250, 249, 246, 0.82)' : 'transparent',
                borderRadius: isMobile ? '18px' : 0,
                padding: isMobile ? '1rem 1.5rem' : 0,
                display: 'flex', flexDirection: 'column', gap: '1.5rem',
                alignItems: isMobile ? 'center' : 'flex-start',
              }}>
                <AnimatePresence mode="wait">
                  <motion.p key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
                    style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: isMobile ? 'center' : 'left' }}>
                    {phase === 'repel' ? REPEL_LABEL : ATTRACT_LABEL}
                  </motion.p>
                </AnimatePresence>
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: phase === 'repel' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: phase === 'attract' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div
          ref={graphPanelRef}
          onClick={(e) => {
            if (!isMobile || !showPanel) return
            const rect = graphPanelRef.current?.getBoundingClientRect()
            if (!rect) return
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) triggerAttract()
            else triggerRepel()
          }}
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: (isMobile && showPanel) ? 'pointer' : undefined }}
        >
          {isMobile && showPanel && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '16%', right: '16%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {noticeText}
                {noticeText.length < EDGE_NOTICE.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
              </p>
            </div>
          )}

          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <motion.line y1={nodeTop} y2={nodeTop} stroke={edgeColor} strokeWidth={5} x1={node1Left} x2={node2Left} opacity={edgeOpacity} />
          </svg>

          {/* Solid white circles behind each face image, slightly larger
              than the image itself — a border illusion that works
              regardless of the SVG's own (non-circular) silhouette,
              unlike a boxShadow outline which would trace the image's
              actual bounding box instead of its visible artwork. Same
              position/animation values as their corresponding images,
              rendered first so they sit behind. Only visible once
              showPanel is true (the graph part), not during the
              intro/settle phase. */}
          <motion.div
            animate={{ y: showPanel ? '-50%' : ['-50%', '-58%', '-50%'] }}
            transition={showPanel ? { duration: 0.3 } : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', left: node1Left, top: nodeTop, x: '-50%',
              width: `calc(${nodeSize} * 1.015)`, aspectRatio: '1 / 1',
              backgroundColor: 'white', borderRadius: '50%',
              opacity: showPanel ? 1 : 0,
            }}
          />
          <motion.div
            animate={{ y: showPanel ? '-50%' : ['-50%', '-58%', '-50%'] }}
            transition={showPanel ? { duration: 0.3 } : { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            style={{
              position: 'absolute', left: node2Left, top: nodeTop, x: '-50%',
              width: `calc(${nodeSize} * 1.015)`, aspectRatio: '1 / 1',
              backgroundColor: 'white', borderRadius: '50%',
              opacity: showPanel ? 1 : 0,
            }}
          />

          <motion.img
            src={dot1Src}
            animate={{ y: showPanel ? '-50%' : ['-50%', '-58%', '-50%'] }}
            transition={showPanel ? { duration: 0.3 } : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', left: node1Left, top: nodeTop, x: '-50%', width: nodeSize, height: 'auto',
            }}
          />
          <motion.img
            src={dot2Src}
            animate={{ y: showPanel ? '-50%' : ['-50%', '-58%', '-50%'] }}
            transition={showPanel ? { duration: 0.3 } : { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            style={{
              position: 'absolute', left: node2Left, top: nodeTop, x: '-50%', width: nodeSize, height: 'auto',
            }}
          />

          {isMobile && showPanel && (
            <>
              {phase === 'attract' && (
                <div style={{
                  position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  ← Tap to go back
                </div>
              )}
              {phase === 'repel' && (
                <div style={{
                  position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  Tap to go forward →
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '3.4rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: phase === 'repel' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: phase === 'attract' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}