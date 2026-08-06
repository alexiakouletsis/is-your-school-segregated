import { useIsMobile } from '../hooks/useIsMobile'
import { motion } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useScroll } from 'framer-motion'
import type { Mode } from '../App'

const PARA1_BEFORE = "In some schools, this pattern of grouping remains up until middle school. In others,\u2003"
const PARA1_BOLD = "course tracking"
const PARA1_AFTER = " begins to show around 4th grade."
const PARA1_FULL = PARA1_BEFORE + PARA1_BOLD + PARA1_AFTER

const SES_PARA2_BEFORE = "Of course, many confounding factors go into placing students in classes. But for this story, let's say that because our "
const SES_PARA2_PINK = "pink"
const SES_PARA2_AFTER1 = " friend has access to more resources, "
const SES_PARA2_PINK2 = "pink"
const SES_PARA2_AFTER2 = " was filtered into an advanced math class, while our "
const SES_PARA2_GREEN = "green"
const SES_PARA2_AFTER3 = " friend stayed in a \"regular\" one. They still share a home room, but varying affluency gaps take form."
const SES_PARA2_FULL = SES_PARA2_BEFORE + SES_PARA2_PINK + SES_PARA2_AFTER1 + SES_PARA2_PINK2 + SES_PARA2_AFTER2 + SES_PARA2_GREEN + SES_PARA2_AFTER3

const RACE_PARA2_BEFORE = "Of course, many confounding factors go into placing students in classes. But for this story, let's say that because our "
const RACE_PARA2_ORANGE = "orange"
const RACE_PARA2_AFTER1 = " friend has access to more resources, "
const RACE_PARA2_ORANGE2 = "orange"
const RACE_PARA2_AFTER2 = " was filtered into an advanced math class, while our "
const RACE_PARA2_BLUE = "blue"
const RACE_PARA2_AFTER3 = " friend stayed in a \"regular\" one. They still share a home room, but varying gaps take form."
const RACE_PARA2_FULL = RACE_PARA2_BEFORE + RACE_PARA2_ORANGE + RACE_PARA2_AFTER1 + RACE_PARA2_ORANGE2 + RACE_PARA2_AFTER2 + RACE_PARA2_BLUE + RACE_PARA2_AFTER3

interface Props {
  onAnimDone: () => void
  onOverlaySettled: (scrollY: number) => void
  onAnimReset?: () => void
  // Bumped by App.tsx's skipAllIntroAnimations right before NavBar jumps
  // to a section — see that comment. Forces this section's skipAll to
  // run externally, the same way a click on it already does.
  skipSignal?: number
  mode: Mode
}

export default function Section01Part2({ onAnimDone, onOverlaySettled, skipSignal, mode }: Props) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  const [showDefinition, setShowDefinition] = useState(false)
  const [settled, setSettled] = useState(false)
  const [para1Text, setPara1Text] = useState('')
  const [para1Done, setPara1Done] = useState(false)
  const [para2Text, setPara2Text] = useState('')
  const [para2Done, setPara2Done] = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const para1Interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const para2Interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasSettledRef = useRef(false)

  const PARA2_FULL = mode === 'race' ? RACE_PARA2_FULL : SES_PARA2_FULL

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  })

  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      if (v >= (isMobile ? 0.38 : 0.495) && !hasSettledRef.current) {
        hasSettledRef.current = true
        setSettled(true)
        onOverlaySettled(window.scrollY)
      }
    })
  }, [scrollYProgress, onOverlaySettled, isMobile])

  const reset = useCallback(() => {
    hasSettledRef.current = false
    setSettled(false)
    setPara1Text('')
    setPara2Text('')
    setPara1Done(false)
    setPara2Done(false)
    setShowScroll(false)
    setSkipped(false)
    setShowDefinition(false)
    clearInterval(para1Interval.current!)
    clearInterval(para2Interval.current!)
  }, [])

  useEffect(() => {
    return () => reset()
  }, [reset])

  // reset on mode change
  useEffect(() => {
    reset()
    if (settled) {
      setTimeout(() => setSettled(true), 50)
    }
  }, [mode])

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
    }, 600)
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
            onAnimDone()
          }
          return next
        })
      }, 22)
    }, 600)
    return () => clearTimeout(t)
  }, [para1Done, skipped, onAnimDone, PARA2_FULL])

  const skipAll = useCallback(() => {
    if (skipped || para2Done) return
    setSkipped(true)
    clearInterval(para1Interval.current!)
    clearInterval(para2Interval.current!)
    setPara1Text(PARA1_FULL)
    setPara1Done(true)
    setPara2Text(PARA2_FULL)
    setPara2Done(true)
    setShowScroll(true)
    onAnimDone()
  }, [skipped, para2Done, onAnimDone, PARA2_FULL])

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

  const renderPara1 = () => {
    const boldStart = PARA1_BEFORE.length
    const boldEnd = boldStart + PARA1_BOLD.length
    const before = para1Text.slice(0, Math.min(para1Text.length, boldStart))
    const bold = para1Text.slice(boldStart, Math.min(para1Text.length, boldEnd))
    const after = para1Text.slice(boldEnd)
    return (
      <>
        {before}
        {bold && (
          <span
            onClick={(e) => { e.stopPropagation(); setShowDefinition(prev => !prev) }}
            style={{
              fontWeight: 700,
              fontSize: isMobile ? 'clamp(1.0rem, 4.4vw, 1.25rem)' : 'clamp(1.25rem, 2.3vw, 1.8rem)',
              textDecoration: showDefinition ? 'underline' : 'none',
              position: 'relative',
              display: 'inline-block',
            }}
            className="course-tracking-link"
          >
            <img src="/assets/sparkle-sketch.svg" style={{
              position: 'absolute',
              top: '0.1em',
              left: '-0.8em',
              width: '1em',
              height: 'auto',
              transform: 'scaleX(-1) rotate(10deg)',
            }} />
            {bold}
          </span>
        )}
        {after}
      </>
    )
  }

  const renderPara2 = () => {
    const segments = mode === 'race' ? [
      { text: RACE_PARA2_BEFORE, color: null },
      { text: RACE_PARA2_ORANGE, color: null },
      { text: RACE_PARA2_AFTER1, color: null },
      { text: RACE_PARA2_ORANGE2, color: 'var(--color-race-1)' },
      { text: RACE_PARA2_AFTER2, color: null },
      { text: RACE_PARA2_BLUE, color: 'var(--color-race-2)' },
      { text: RACE_PARA2_AFTER3, color: null },
    ] : [
      { text: SES_PARA2_BEFORE, color: null },
      { text: SES_PARA2_PINK, color: null },
      { text: SES_PARA2_AFTER1, color: null },
      { text: SES_PARA2_PINK2, color: 'var(--color-high-ses)' },
      { text: SES_PARA2_AFTER2, color: null },
      { text: SES_PARA2_GREEN, color: 'var(--color-low-ses)' },
      { text: SES_PARA2_AFTER3, color: null },
    ]
    let remaining = para2Text
    return segments.map((seg, i) => {
      if (remaining.length === 0) return null
      const chunk = remaining.slice(0, seg.text.length)
      remaining = remaining.slice(seg.text.length)
      if (!chunk) return null
      return seg.color
        ? <span key={i} style={{ color: seg.color }}>{chunk}</span>
        : <span key={i}>{chunk}</span>
    })
  }

  const dot1Src = mode === 'race' ? '/assets/whiteasian-dot-45.svg' : '/assets/high-SES-dot-45.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-dot-45.svg' : '/assets/low-SES-dot-45.svg'

  return (
    <div
      ref={containerRef}
      onClick={settled && !para2Done ? skipAll : undefined}
      style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: isMobile ? '5.5rem 1.5rem 2.5rem 1.5rem' : '6rem 2rem 2.5rem 2rem',
        gap: isMobile ? '1.3rem' : '2.7rem',
        cursor: settled && !para2Done ? 'default' : 'auto',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        width: '100%',
        maxWidth: '990px',
        alignItems: 'center',
      }}>
        <p style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(1rem, 4vw, 1.2rem)' : 'clamp(1.25rem, 2.15vw, 1.75rem)',
          color: '#111',
          lineHeight: 1.7,
          width: '100%',
          textAlign: 'center',
          margin: 0,
          height: isMobile ? '7em' : '4em',
          overflow: 'hidden',
        }}>
          {renderPara1()}
          {para1Text.length > 0 && para1Text.length < PARA1_FULL.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </p>

        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: showDefinition ? 'auto' : 0, opacity: showDefinition ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden', width: '100%', maxWidth: '940px' }}
        >
          <div style={{
            height: 0,
            backgroundColor: 'var(--color-bg)',
            width: '100%',
            flexShrink: 0,
          }} />
            <div style={{
              backgroundColor: '#EADDDD',
              borderRadius: '16px',
              padding: '0.8rem 1.4rem',
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.55rem, 2.75vw, 0.75rem)' : 'clamp(0.8rem, 1.3vw, 1rem)',
              color: '#111',
              lineHeight: 1.7,
            }}>
              <strong style={{ textDecoration: 'underline' }}>Course tracking</strong> refers to the practice of sorting and grouping students into specific learning pathways or class levels based on their perceived academic abilities
            </div>
        </motion.div>
      </div>

      <p style={{
        fontFamily: "'Kiwi Maru', serif",
        fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1rem, 1.8vw, 1.3rem)',
        color: '#111',
        lineHeight: 1.9,
        maxWidth: '940px',
        width: '100%',
        textAlign: 'center',
        margin: 0,
        height: isMobile ? '18em' : '8em',
        overflow: 'hidden',
      }}>
        {renderPara2()}
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
        maxWidth: '900px',
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
          <img src={dot1Src} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
            height: 'auto',
            animation: 'bob 2s ease-in-out infinite',
          }} />
          <img src={dot2Src} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
            height: 'auto',
            animation: 'bob 2s ease-in-out infinite',
            animationDelay: '0.4s',
          }} />
        </div>
      </div>
    </div>
  )
}