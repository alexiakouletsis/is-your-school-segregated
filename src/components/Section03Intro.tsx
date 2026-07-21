import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

const PARA1_FULL = "Our two nodes are growing up. Now they get to make their schedules—but what to pick? Honors/AP or regular? What electives?"
const PARA2_FULL = "Before we dive into how segregation now looks for our nodes in high school, let's first observe which specific classes in high school are most divisive."

export default function Section03Intro({ mode }: { mode: Mode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [p, setP] = useState(0)
  const [panelHeight, setPanelHeight] = useState(0)

  // Measure the sticky panel's ACTUAL rendered height, rather than
  // assuming CSS's 100vh unit exactly equals it — the same kind of JS
  // measurement this app already uses elsewhere (e.g. graphSize in the
  // graph sections), instead of a hardcoded vh guess. This is likely why
  // Section02's dot-flood covers the full screen with no gap while this
  // wall didn't: dots positioned relative to a measured box adapt to
  // whatever that box actually turns out to be; hardcoded vh sizing
  // can't, if the sticky panel's true rendered box doesn't precisely
  // match what vh units assume (which we already have direct evidence
  // of, from position:sticky not perfectly pinning in this nested
  // structure).
  useEffect(() => {
    const measure = () => {
      if (panelRef.current) setPanelHeight(panelRef.current.getBoundingClientRect().height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const [settled, setSettled] = useState(false)
  const [para1Text, setPara1Text] = useState('')
  const [para1Done, setPara1Done] = useState(false)
  const [para2Text, setPara2Text] = useState('')
  const [para2Done, setPara2Done] = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const hasSettledRef = useRef(false)
  const typingDoneRef = useRef(false)
  const lockScrollY = useRef<number | null>(null)
  const para1Interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const para2Interval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mobile-only: instead of scrolling straight through cover+open like
  // desktop does, mobile holds fully closed once the wall covers the
  // screen, blocks further scroll, and shows a tap prompt — opening (and
  // the typing that follows) only plays once the user actually taps.
  const [mobileTapped, setMobileTapped] = useState(false)
  const [mobileOpenProgress, setMobileOpenProgress] = useState(0)
  const [wallClosed, setWallClosed] = useState(false)
  const mobileTappedRef = useRef(false)
  const wallClosedRef = useRef(false)

  useEffect(() => { typingDoneRef.current = para2Done }, [para2Done])

  // No overlap with GraphSection68 at all — the user just scrolls
  // normally into this section like any other, arriving at a full-screen
  // solid color block (the two wall SVGs, closed). Only once that's fully
  // in view does further scrolling do anything: PART_START holds it
  // closed for a moment, then opening runs from PART_START to 1 as the
  // user keeps scrolling. Everything happens within this section's own
  // self-contained range — no reaching backward into GraphSection68's
  // territory, which is what caused the duplicate-graph and overlap-
  // timing bugs in earlier attempts.
  const PART_START = 0.01

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRef.current.offsetHeight
      const next = Math.max(0, Math.min(1, (-rect.top) / (containerHeight - window.innerHeight)))
      setP(next)
      if (isMobile) {
        // Mobile: rather than a fraction of container height (which
        // depends on containerHeight/window.innerHeight resolving the way
        // we expect — exactly the kind of vh-based assumption that's
        // burned us before), check the container's raw pixel position
        // directly. rect.top <= -40 means the container has scrolled up
        // by a small, fixed, unambiguous 40px past reaching the viewport
        // top — the tap prompt should appear almost immediately, not
        // require a large or uncertain scroll distance.
        if (rect.top <= -15 && !wallClosedRef.current) {
          wallClosedRef.current = true
          setWallClosed(true)
        }
      } else if (next >= 1 && !hasSettledRef.current) {
        hasSettledRef.current = true
        setSettled(true)
        lockScrollY.current = window.scrollY
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isMobile])

  // Mobile: block scroll for the entire stretch from "wall closed" through
  // "typing finished" — covers both the wait-for-tap state and the
  // opening+typing playback after tapping, in one condition. Checking
  // refs directly (not state) so there's no race between detecting
  // closed/tapped/typing-done and actually blocking.
  useEffect(() => {
    if (!isMobile) return
    const handleTouchMove = (e: TouchEvent) => {
      if (wallClosedRef.current && !typingDoneRef.current) e.preventDefault()
    }
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => window.removeEventListener('touchmove', handleTouchMove)
  }, [isMobile])

  // Mobile: on tap, animate the open progress over a fixed duration
  // (not scroll-driven anymore, since scroll is now blocked), then settle
  // into typing once fully open — mirroring what scroll does on desktop.
  const handleMobileTap = () => {
    if (mobileTappedRef.current) return
    mobileTappedRef.current = true
    setMobileTapped(true)
    const start = Date.now()
    const DURATION = 950
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION)
      setMobileOpenProgress(t)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else if (!hasSettledRef.current) {
        hasSettledRef.current = true
        setSettled(true)
      }
    }
    requestAnimationFrame(tick)
  }

  // Desktop-only scroll lock while typing (mobile scrolls freely the whole
  // time, typing just plays out in the background) — identical technique
  // to Section02.tsx.
  useEffect(() => {
    if (isMobile) return
    if (lockScrollY.current === null || para2Done) return
    const preventScroll = (e: Event) => {
      if (!typingDoneRef.current) {
        e.preventDefault()
        window.scrollTo(0, lockScrollY.current ?? 0)
      }
    }
    window.addEventListener('wheel', preventScroll, { passive: false })
    window.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      window.removeEventListener('wheel', preventScroll)
      window.removeEventListener('touchmove', preventScroll)
    }
  }, [lockScrollY.current, para2Done, isMobile])

  useEffect(() => {
    if (!settled || skipped) return
    const t = setTimeout(() => {
      para1Interval.current = setInterval(() => {
        setPara1Text(prev => {
          const next = PARA1_FULL.slice(0, prev.length + 1)
          if (next.length === PARA1_FULL.length) {
            clearInterval(para1Interval.current!)
            setPara1Done(true)
          }
          return next
        })
      }, 22)
    }, 400)
    return () => clearTimeout(t)
  }, [settled, skipped])

  useEffect(() => {
    if (!para1Done || skipped) return
    const t = setTimeout(() => {
      para2Interval.current = setInterval(() => {
        setPara2Text(prev => {
          const next = PARA2_FULL.slice(0, prev.length + 1)
          if (next.length === PARA2_FULL.length) {
            clearInterval(para2Interval.current!)
            setPara2Done(true)
            setShowScroll(true)
          }
          return next
        })
      }, 22)
    }, 600)
    return () => clearTimeout(t)
  }, [para1Done, skipped])

  const skipAll = () => {
    if (skipped || para2Done) return
    setSkipped(true)
    clearInterval(para1Interval.current!)
    clearInterval(para2Interval.current!)
    setPara1Text(PARA1_FULL)
    setPara1Done(true)
    setPara2Text(PARA2_FULL)
    setPara2Done(true)
    setShowScroll(true)
  }

  // Closed (0) -> fully open (1). Desktop: driven directly by scroll,
  // holding closed until PART_START. Mobile: held at 0 regardless of
  // scroll once the wall is closed, only advancing via the tap-triggered
  // timer above.
  const scrollPartAmount = p <= PART_START ? 0 : Math.min(1, (p - PART_START) / (1 - PART_START))
  const partAmount = isMobile ? (mobileTapped ? mobileOpenProgress : 0) : scrollPartAmount
  const leftPartX = `${-partAmount * 100}%`
  const rightPartX = `${partAmount * 100}%`
  // Mobile-only: content used to fade in at the exact same rate as the
  // wall's own parting (both driven by the same progress value), which
  // read as the text starting too soon since the whole sequence plays
  // automatically rather than under the user's own scroll control like
  // desktop. Delaying the fade to only the last 25% of the motion means
  // content stays hidden through most of the opening, only appearing
  // once the wall is nearly/fully open.
  const mobileContentOpacity = mobileOpenProgress <= 0.75 ? 0 : (mobileOpenProgress - 0.75) / 0.25
  const contentOpacity = isMobile ? (mobileTapped ? mobileContentOpacity : 0) : partAmount

  const wallHeight = panelHeight
    ? `${panelHeight * (isMobile ? 1.03 : 1.15)}px`
    : (isMobile ? '103vh' : '115vh')

  // TODO: drop the real SVG files into public/assets/.
  const dot1Src = mode === 'race' ? '/assets/whiteasian-highschooler.svg' : '/assets/high-SES-highschooler.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-highschooler.svg' : '/assets/low-SES-highschooler.svg'
  // Just-for-fun: clicking/tapping a dot does a full 360° flip in place.
  // Incrementing a counter and using it as part of the img's `key` forces
  // React to remount the element, which is the reliable way to restart a
  // CSS animation that's already finished (just re-setting the same
  // animation value via style doesn't retrigger it).
  const [flip1, setFlip1] = useState(0)
  const [flip2, setFlip2] = useState(0)
  // Custom wall artwork — the organic curve/edge is baked into these SVGs
  // themselves now, so there's no code-generated shape to get right.
  const leftWallSrc = mode === 'race' ? '/assets/orangeleftwall.svg' : '/assets/pinkleftwall.svg'
  const rightWallSrc = mode === 'race' ? '/assets/bluerightwall.svg' : '/assets/greenrightwall.svg'

  return (
    <>
    {/* Scoped keyframe for the highschooler dots — a diagonal teeter
        (slight rotation + diagonal drift) instead of the straight-up-down
        'bob' used elsewhere, just for these two. New name so it doesn't
        touch the existing 'bob' keyframe other sections rely on. */}
    <style>{`
      @keyframes s3-teeter {
        0% { transform: translate(0, 0) rotate(-3deg); }
        50% { transform: translate(5px, -5px) rotate(3deg); }
        100% { transform: translate(0, 0) rotate(-3deg); }
      }
      @keyframes s3-flip {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    <div
      ref={containerRef}
      style={{
        height: isMobile ? '103vh' : '220vh',
        position: 'relative',
        marginTop: isMobile ? '17vh' : '9vh',
      }}
    >
      <div
        ref={panelRef}
        onClick={settled && !para2Done ? skipAll : undefined}
        style={{
          position: 'sticky',
          top: 0,
          width: '100%',
          height: '100vh',
          // No overflow property here at all, deliberately — setting
          // overflowX:hidden while overflowY stayed 'visible' triggered a
          // real CSS quirk: browsers force the 'visible' axis to compute
          // as 'auto' when the other axis isn't 'visible'. 'auto' on an
          // element with vertically-overflowing content (the wall's
          // height buffer) clips by default AND turns the element into
          // its own independently-scrollable region — which is very
          // likely why the wall became scrollable on mobile (bypassing
          // the touch-lock) and the bottom gap came back on desktop, at
          // the same time. The horizontal clip now lives on a separate
          // wrapper below, sized so nothing overflows it vertically.
          backgroundColor: 'var(--color-bg)',
          cursor: settled && !para2Done ? 'default' : 'auto',
        }}
      >
        {/* content */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: isMobile ? '6.3rem 1.5rem 1.5rem 1.5rem' : '5.4rem 2rem 2rem 2rem',
          overflow: 'hidden',
          opacity: contentOpacity,
          zIndex: 10,
        }}>
          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(1.8rem, 4.5vw, 3.5rem)',
            color: '#111',
            fontWeight: 400,
            textAlign: 'center',
            margin: isMobile ? '0 0 1.85rem 0' : '0 0 2.45rem 0',
          }}>
            Section 03: High School
          </h2>

          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.85rem, 3.4vw, 1.05rem)' : 'clamp(1rem, 1.7vw, 1.3rem)',
            color: '#111',
            lineHeight: 1.7,
            maxWidth: '860px',
            width: '100%',
            textAlign: 'center',
            margin: isMobile ? '0 0 0.6rem 0' : '0 0 0.9rem 0',
            minHeight: isMobile ? '8.5em' : '4.5em',
          }}>
            {settled ? para1Text : ''}
            {para1Text.length > 0 && para1Text.length < PARA1_FULL.length && (
              <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
            )}
          </p>

          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.85rem, 3.4vw, 1.05rem)' : 'clamp(1rem, 1.7vw, 1.3rem)',
            color: '#111',
            lineHeight: 1.7,
            maxWidth: '860px',
            width: '100%',
            textAlign: 'center',
            margin: isMobile ? '0 0 0.6rem 0' : '0 0 0.9rem 0',
            minHeight: isMobile ? '8.5em' : '4.5em',
          }}>
            {para2Text}
            {para2Text.length > 0 && para2Text.length < PARA2_FULL.length && (
              <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
            )}
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '0.3rem' : '0.5rem',
            width: '100%',
            maxWidth: '860px',
          }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: showScroll ? 1 : 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                fontFamily: "'Gaegu', cursive",
                fontSize: 'clamp(1.1rem, 2.5vw, 1.6rem)',
                color: '#111',
              }}
            >
              <span>scroll</span>
              <img src="/assets/down-scroll-arrow.svg" style={{ width: isMobile ? '1.25rem' : '1.4rem', height: 'auto' }} />
            </motion.div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: isMobile ? '0.3rem 0' : '0.6rem 0',
            }}>
              <img
                key={`dot1-${flip1}`}
                src={dot1Src}
                onClick={() => setFlip1(f => f + 1)}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 13vw, 160px)',
                  height: 'auto',
                  animation: 's3-teeter 2.4s ease-in-out infinite, s3-flip 0.6s ease-in-out',
                }}
              />
              <img
                key={`dot2-${flip2}`}
                src={dot2Src}
                onClick={() => setFlip2(f => f + 1)}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 13vw, 160px)',
                  height: 'auto',
                  animation: 's3-teeter 2.4s ease-in-out infinite, s3-flip 0.6s ease-in-out',
                  animationDelay: '0.4s, 0s',
                }}
              />
            </div>
          </div>
        </div>

        {/* Decorative thin white line above the wall */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: isMobile ? '3px' : '7px',
          backgroundColor: 'white',
          zIndex: 35,
          pointerEvents: 'none',
        }} />

        {/* Horizontal-clip wrapper for the wall images — sized to exactly
            match their own height (wallHeight below), so nothing overflows
            THIS element vertically. That matters because setting
            overflowX:hidden here also forces this element's overflowY to
            compute as 'auto' (the same CSS quirk described above) — but
            since nothing inside it actually overflows vertically, that
            coercion has nothing to act on and is harmless. */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: wallHeight,
          overflowX: 'hidden',
        }}>
          {/* left wall — sized slightly over half-width so it overlaps the
              center a bit. Height/offset derived from the panel's actual
              measured size (panelHeight), not a hardcoded vh guess. */}
          <img
            src={leftWallSrc}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: isMobile ? '65%' : '55%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'right center',
              zIndex: 30,
              pointerEvents: 'none',
              transform: `translateX(${leftPartX})`,
            }}
          />

          {/* right wall — 53% (narrower than the left) so its left edge
              sits a touch further right, anchored via right:0. */}
          <img
            src={rightWallSrc}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: isMobile ? '61%' : '53%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'left center',
              zIndex: 30,
              pointerEvents: 'none',
              transform: `translateX(${rightPartX})`,
            }}
          />
        </div>

        {/* Mobile-only tap-to-open prompt — appears once the wall has
            scrolled fully closed, fades smoothly in/out rather than
            popping abruptly. */}
        <AnimatePresence>
          {isMobile && wallClosed && !mobileTapped && (
            <motion.div
              key="tap-prompt"
              onClick={handleMobileTap}
              onTouchEnd={(e) => { e.preventDefault(); handleMobileTap() }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '1rem 1.6rem',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(250,249,246,0.9)',
                }}>
                <img src="/assets/tap-icon.svg" style={{ width: '2rem', height: 'auto' }} />
                <span style={{
                  fontFamily: "'Gaegu', cursive",
                  fontSize: '1.3rem',
                  color: '#111',
                }}>
                  tap
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </>
  )
}