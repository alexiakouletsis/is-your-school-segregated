import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

interface Dot {
  id: number
  x: number
  y: number
  size: number
  color: string
  bobDuration: number
  bobDelay: number
  bobAmount: number
}

const SES_COLORS = ['#F17091', '#F17091', '#00B178', '#00B178', '#F17091', '#00B178']
const RACE_COLORS = ['#FF954D', '#FF954D', '#6897FF', '#6897FF', '#FF954D', '#6897FF']

const PARA = "Typically begin around 6th grade, middle school floods our graphs with a whole new wave of student body. Students that were once kept in smaller, (mostly) isolated cohorts will truly share classes as a group for the first time. In some schools, course tracking is still minimal at this stage. However, where it's bad... is bad. Let's zoom in on what a less segregated versus more segregated middle school looks like."

function generateDots(mode: Mode, count: number): Dot[] {
  const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
  const dots: Dot[] = []
  for (let i = 0; i < count; i++) {
    dots.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 10 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      bobDuration: 1.8 + Math.random() * 1.4,
      bobDelay: Math.random() * 2,
      bobAmount: 6 + Math.random() * 8,
    })
  }
  return dots
}

export default function Section02({ mode, skipSignal }: { mode: Mode; skipSignal?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  // Measured via window.innerWidth rather than trusted to the CSS `100vw`
  // unit used below. On some mobile browsers 100vw doesn't reliably equal
  // the true visible width (a known category of vw/vh browser quirk this
  // codebase has already run into elsewhere, e.g. BlobCurtain's mobile
  // measurement comment) — since this component's dots are positioned as
  // percentages of THIS panel's own box, if the panel itself renders even
  // slightly wider/narrower or offset from the true screen edges because
  // of that quirk, the dots (accurately placed within the panel) still end
  // up missing from one true screen edge and spilling past the other.
  // Measuring window.innerWidth directly and using it in place of every
  // 100vw below sidesteps that unit's quirk entirely.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const vwPx = viewportWidth !== null ? `${viewportWidth}px` : '100vw'
  const fullBleedMarginLeft = viewportWidth !== null
    ? `calc(-1 * ((${viewportWidth}px - 100%) / 2))`
    : 'calc(-1 * ((100vw - 100%) / 2))'
  const [dots, setDots] = useState<Dot[]>(() => generateDots(mode, 500))
  const [dotColors, setDotColors] = useState<string[]>(() => dots.map(d => d.color))
  const [textOpacity, setTextOpacity] = useState(0)
  const progressRef = useRef(0)
  const dotRefs = useRef<(HTMLDivElement | null)[]>([])
  // Tracks each dot's last-written opacity so the scroll handler below can
  // skip the DOM write entirely once a dot has settled at a stable value
  // (fully 0 before its reveal / after its fade, or fully 1 mid-hold) —
  // most of the 200+ dots sit at one of those two stable states for most
  // of the scroll range at any given moment, so this is what actually lets
  // the dot count go back up without a proportional per-frame cost.
  const lastOpacityRef = useRef<number[]>([])

  useEffect(() => {
    // Mobile count restored now that the dirty-check above (and bob being
    // desktop-only) keep the actual per-frame work low regardless of total
    // count — the earlier plain cut to 110 fixed the symptom but lost too
    // much of the flood's visual density.
    const count = isMobile ? 240 : 700
    setDots(generateDots(mode, count))
    lastOpacityRef.current = new Array(count).fill(-1)
  }, [isMobile])

  // typing state
  const [paraText, setParaText] = useState('')
  const [typingDone, setTypingDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const typingStarted = useRef(false)
  const typingDoneRef = useRef(false)
  const lockScrollY = useRef<number | null>(null)
  const paraInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { typingDoneRef.current = typingDone }, [typingDone])

  useEffect(() => {
    const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
    setDotColors(dots.map(() => colors[Math.floor(Math.random() * colors.length)]))
  }, [mode, dots])

  // scroll tracking
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    // The actual per-frame work, pulled into its own function so the
    // listener below can coalesce many 'scroll' events (which can fire
    // dozens of times within a single animation frame, especially during a
    // fast mobile touch-scroll) into at most one recompute per frame,
    // instead of redoing this full dot loop on every single event. This
    // matters a lot more on mobile, where the same JS work costs more.
    const update = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRef.current.offsetHeight

      // Bail out entirely once this section is nowhere near the viewport.
      // Without this, this handler (and its up-to-110/700-element dot loop
      // below) kept running on every single scroll event for the rest of
      // the page's life, since this component is never unmounted after you
      // scroll past it — a real, unnecessary, continuous main-thread cost
      // that could stack with other work (e.g. GraphSection68's dialogue
      // mount) on whatever scroll tick happens to land on both at once.
      if (rect.bottom < -window.innerHeight || rect.top > containerHeight + window.innerHeight) {
        return
      }

      const p = Math.max(0, Math.min(1,
        (-rect.top) / (containerHeight - window.innerHeight)
      ))
      progressRef.current = p
      setTextOpacity(getTextOpacity(p))
      dots.forEach((dot, i) => {
        const el = dotRefs.current[i]
        if (!el) return
        const opacity = getDotOpacity(dot, p)
        // Skip the DOM write entirely if this dot's opacity hasn't
        // meaningfully moved since last frame — see the comment on
        // lastOpacityRef above for why this is what actually makes a
        // higher dot count affordable.
        if (Math.abs(opacity - (lastOpacityRef.current[i] ?? -1)) > 0.004) {
          el.style.opacity = String(opacity)
          lastOpacityRef.current[i] = opacity
          if (!isMobile) el.style.animationPlayState = opacity > 0.01 ? 'running' : 'paused'
        }
      })

      // when dots are done fading, start typing + lock scroll
      if (p >= 0.9 && !typingStarted.current) {
        typingStarted.current = true
        lockScrollY.current = window.scrollY
      }
    }

    const handleScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        update()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [dots, isMobile])

  // scroll lock while typing (desktop only — mobile keeps scrolling freely,
  // with the typing animation just playing out in the background)
  useEffect(() => {
    if (isMobile) return
    if (lockScrollY.current === null || typingDone) return
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
  }, [lockScrollY.current, typingDone, isMobile])

  // start typing when triggered
  useEffect(() => {
    if (!typingStarted.current || skipped) return
    const t = setTimeout(() => {
      paraInterval.current = setInterval(() => {
        setParaText(prev => {
          const next = PARA.slice(0, prev.length + 1)
          if (next.length === PARA.length) {
            clearInterval(paraInterval.current!)
            setTypingDone(true)
            setShowScroll(true)
          }
          return next
        })
      }, 22)
    }, 400)
    return () => clearTimeout(t)
  }, [typingStarted.current, skipped])

  const skipAll = useCallback(() => {
    if (skipped || typingDone) return
    // Normally only reachable once typingStarted.current is already true
    // (the onClick that calls this is gated on it) — set explicitly here
    // too so this is safe to call externally, before that would have
    // happened naturally. Without it, paraText would be set to the full
    // text but never actually render, since the text layer reads
    // `typingStarted.current ? paraText : ''`.
    typingStarted.current = true
    setSkipped(true)
    clearInterval(paraInterval.current!)
    setParaText(PARA)
    setTypingDone(true)
    setShowScroll(true)
  }, [skipped, typingDone])

  // External trigger for the same skip a click already does — see
  // App.tsx's skipAllIntroAnimations. Guarded against StrictMode's
  // dev-mode double-invoke the same way ArticleSection's forceStart is.
  const lastSkipSignalRef = useRef(skipSignal)
  useEffect(() => {
    if (skipSignal === undefined) return
    if (skipSignal === lastSkipSignalRef.current) return
    lastSkipSignalRef.current = skipSignal
    skipAll()
  }, [skipSignal, skipAll])

  const getDotOpacity = (dot: Dot, p: number) => {
    const yFrac = dot.y / 100
    const revealStart = (1 - yFrac) * 0.15
    const revealEnd = revealStart + 0.06
    const fadeStart = 0.55 + (1 - yFrac) * 0.25
    const fadeEnd = fadeStart + 0.1
    if (p < revealStart) return 0
    if (p < revealEnd) return (p - revealStart) / (revealEnd - revealStart)
    if (p < fadeStart) return 1
    if (p < fadeEnd) return 1 - (p - fadeStart) / (fadeEnd - fadeStart)
    return 0
  }

  const getTextOpacity = (p: number) => {
    if (p < 0.65) return 0
    if (p < 0.9) return (p - 0.65) / 0.25
    return 1
  }

  return (
    <div
      ref={containerRef}
      onClick={typingStarted.current && !typingDone ? skipAll : undefined}
      style={{
        height: '300vh',
        position: 'relative',
        flexShrink: 0,
        width: vwPx,
        marginLeft: fullBleedMarginLeft,
        // Desktop: pulled up to overlap GraphSection45's tail so the dot
        // flood rises over it directly instead of after a scroll gap over
        // blank background. Scaled back from a full viewport (-100vh) to a
        // smaller overlap — the full-viewport version was too large a shift
        // relative to how much scroll distance the shared ancestor sticky
        // panel budgets around this section. Still a starting guess; tune
        // this one number to taste.
        //
        // Mobile: reverted to its original small value. Mobile doesn't give
        // each section its own independent position:sticky the way desktop
        // does — every section here (GraphSection45, Section02, etc.) lives
        // inside one shared sticky wrapper in ArticleSection.tsx. A large
        // negative margin is a much bigger structural move in that shared-
        // parent context than on desktop, and is the likely cause of
        // GraphSection45's graph disappearing and the dot wall painting
        // beneath its overlay labels. Not attempting the overlap effect on
        // mobile for now rather than risk more of that breakage.
        marginTop: isMobile ? '-8vh' : '-20vh',
      }}
    >
      <div style={{
        position: 'sticky',
        top: 0,
        width: '100%',
        marginLeft: fullBleedMarginLeft,
        height: '100vh',
        minHeight: '100vh',
        overflow: 'hidden',
        // Transparent, not a solid color — the whole point of overlapping
        // GraphSection45 is so the dots themselves are what visually cover
        // it as they reveal. A solid background here would show up as an
        // opaque wall the instant this panel overlaps GraphSection45,
        // before the dots (which start at opacity 0) have appeared at all.
        // Body's own background-color is the same value, so once this panel
        // has scrolled well past GraphSection45 there's no visible
        // difference from before.
        backgroundColor: 'transparent',
        cursor: typingStarted.current && !typingDone ? 'default' : 'auto',
        ...(isMobile ? { overflowAnchor: 'none' as const, willChange: 'transform' } : {}),
      }}>

        {/* text layer */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isMobile ? 'flex-start' : 'center',
          padding: isMobile ? '5rem 2rem 3rem 2rem' : '4rem 3rem',
          zIndex: 0,
          opacity: textOpacity,
        }}>
          <div style={{
            height: '1px',
            backgroundColor: '#111',
            width: '100%',
            position: 'absolute',
            top: 0,
          }} />

          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            color: '#111',
            fontWeight: 400,
            textAlign: 'center',
            margin: '0 0 2.5rem 0',
          }}>
            Section 02: Middle School
          </h2>

          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
            color: '#111',
            lineHeight: 1.9,
            maxWidth: '940px',
            textAlign: 'center',
            margin: 0,
            height: isMobile ? '22em' : '11em',
            overflow: 'hidden',
          }}>
            {typingStarted.current ? paraText : ''}
            {paraText.length > 0 && paraText.length < PARA.length && (
              <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
            )}
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '0.5rem' : '0rem',
            width: '100%',
            maxWidth: '900px',
            marginTop: isMobile ? '-1rem' : '3.5rem',
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
              padding: isMobile ? '0.5rem 0' : '1rem 0',
            }}>
              <img
                src={mode === 'race' ? '/assets/whiteasian-dot-68.svg' : '/assets/high-SES-dot-68.svg'}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(90px, 12vw, 160px)',
                  height: 'auto',
                  animation: 'bob 2s ease-in-out infinite',
                }}
              />
              <img
                src={mode === 'race' ? '/assets/poc-dot-68.svg' : '/assets/low-SES-dot-68.svg'}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(90px, 12vw, 160px)',
                  height: 'auto',
                  animation: 'bob 2s ease-in-out infinite',
                  animationDelay: '0.4s',
                }}
              />
            </div>
          </div>
        </div>

        {/* dot flood layer */}
        {dots.map((dot, i) => (
          <div
            key={dot.id}
            ref={(el) => { dotRefs.current[i] = el }}
            style={{
              position: 'absolute',
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              backgroundColor: dotColors[i],
              opacity: 0,
              zIndex: 2,
              pointerEvents: 'none',
              // Bob animation is desktop-only — each infinite keyframe
              // animation likely gets promoted to its own compositor layer,
              // and up to 300 of those running simultaneously is a very
              // plausible source of mobile jank/heat. The dots still fade
              // in/out and drive the scroll-linked reveal on mobile; they
              // just stay still instead of continuously bobbing there.
              ...(isMobile ? {} : {
                animation: `dotFloatBob ${dot.bobDuration}s ease-in-out infinite`,
                animationDelay: `${dot.bobDelay}s`,
              }),
              animationPlayState: 'paused',
              ['--dot-bob-amount' as string]: `${-dot.bobAmount}px`,
            }}
          />
        ))}
      </div>
    </div>
  )
}