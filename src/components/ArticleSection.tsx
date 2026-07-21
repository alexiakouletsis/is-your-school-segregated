import { useRef, useState, useEffect, useCallback } from 'react'
import { useScroll, useTransform, motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import GraphSection from './GraphSection'
import Section01Part2 from './Section01Part2'
import GraphSection45 from './GraphSection45'
import type { Mode } from '../App'
import Section02 from './Section02'
import GraphSection68 from './GraphSection68'
import Section03Intro from './Section03Intro'
import CourseClusterSection from './CourseClusterSection'
import Section03Part2 from './Section03Part2'
import GraphSection912 from './GraphSection912'

const INFO_TEXT = "Graphs are calculated based on how students share classes with one another. The closer the nodes are, the more classes they share. The further they repel from each other, the less classes they share. An edge between two nodes shows that those nodes/students share at least one class."

const SES_PARA_FULL = "Take these two students entering kindergarten. One of them comes from a family above the median SES line (pink/left), and the other below (green/right). Perhaps throughout being randomly sorted into similar K-3 classes, they became best friends."
const SES_SEGMENTS = [
  { text: "Take these two students entering kindergarten. One of them comes from a family ", color: null },
  { text: "above", color: 'var(--color-high-ses)' },
  { text: " the median SES line (", color: null },
  { text: "pink/left", color: 'var(--color-high-ses)' },
  { text: "), and the other ", color: null },
  { text: "below", color: 'var(--color-low-ses)' },
  { text: " (", color: null },
  { text: "green/right", color: 'var(--color-low-ses)' },
  { text: "). Perhaps throughout being randomly sorted into similar K-3 classes, they became best friends.", color: null },
]

const RACE_PARA_FULL = "Take these two students entering kindergarten. One of them is a white/asian student (orange/left), and the other is a student of color (blue/right). Perhaps throughout being randomly sorted into similar K-3 classes, they became best friends."
const RACE_SEGMENTS = [
  { text: "Take these two students entering kindergarten. One of them is a ", color: null },
  { text: "white/asian student", color: 'var(--color-race-1)' },
  { text: " (", color: null },
  { text: "orange/left", color: 'var(--color-race-1)' },
  { text: "), and the other is a ", color: null },
  { text: "student of color", color: 'var(--color-race-2)' },
  { text: " (", color: null },
  { text: "blue/right", color: 'var(--color-race-2)' },
  { text: "). Perhaps throughout being randomly sorted into similar K-3 classes, they became best friends.", color: null },
]

interface Node {
  id: number
  ses: string
  race_ethnicity: string
  courses: string
  grade_level: number
  x?: number
  y?: number
}

interface Props {
  onAnimDone?: () => void
  onOverlaySettled?: (scrollY: number) => void
  onAnimReset?: () => void
  onPart2AnimDone?: () => void
  onPart2OverlaySettled?: (scrollY: number) => void
  onPart2AnimReset?: () => void
  onSection03Part2AnimDone?: () => void
  onSection03Part2OverlaySettled?: (scrollY: number) => void
  onSection03Part2AnimReset?: () => void
  mode: Mode
  forceStart?: number
}

export default function ArticleSection({
  onAnimDone = () => {},
  onOverlaySettled = () => {},
  onAnimReset = () => {},
  onPart2AnimDone = () => {},
  onPart2OverlaySettled = () => {},
  onPart2AnimReset = () => {},
  onSection03Part2AnimDone = () => {},
  onSection03Part2OverlaySettled = () => {},
  onSection03Part2AnimReset = () => {},
  mode,
  forceStart,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [overlaySettled, setOverlaySettled] = useState(false)
  const [paraText, setParaText] = useState('')
  const [skipped, setSkipped] = useState(false)
  const [animsDone, setAnimsDone] = useState(false)
  const [showScroll, setShowScroll] = useState(false)
  const paraInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasSettledRef = useRef(false)
  const hasResetRef = useRef(false)
  const finalGrade3NodesRef = useRef<Node[]>([])

  const PARA_FULL = mode === 'race' ? RACE_PARA_FULL : SES_PARA_FULL
  const SEGMENTS = mode === 'race' ? RACE_SEGMENTS : SES_SEGMENTS
  const dot1Src = mode === 'race' ? '/assets/whiteasian-dot-K3.svg' : '/assets/high-SES-dot-K3.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-dot-K3.svg' : '/assets/low-SES-dot-K3.svg'

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end end"]
  })

  const overlayY = useTransform(scrollYProgress, [0, 0.5], ['100vh', '-1vh'])

  const forceStartedAtRef = useRef(0)

  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      if (v >= 0.40 && !hasSettledRef.current) {
        hasSettledRef.current = true
        hasResetRef.current = false
        setOverlaySettled(true)
        onOverlaySettled(window.scrollY)
      }
      // Suppressed for a second after a forced start (see below) — the jump
      // there is done via a burst of scrollTo calls across several frames,
      // and this listener can catch an intermediate, still-low reading from
      // partway through that burst and reset everything it had just set.
      if (v < 0.35 && !hasResetRef.current && Date.now() - forceStartedAtRef.current > 1000) {
        hasResetRef.current = true
        hasSettledRef.current = false
        setOverlaySettled(false)
        setParaText('')
        setSkipped(false)
        setAnimsDone(false)
        setShowScroll(false)
        clearInterval(paraInterval.current!)
        onAnimReset()
      }
    })
  }, [scrollYProgress, onOverlaySettled, onAnimReset])

  // Force settle+typing-start directly, bypassing scroll-progress detection.
  // Used when the intro's tap-to-advance jumps here programmatically — a
  // burst of scrollTo calls doesn't reliably give the scroll-linked v value
  // above a chance to recompute in time, leaving typing stuck until a manual
  // scroll. This runs unconditionally on tap, sidestepping that race.
  //
  // Guards by comparing against the last-seen forceStart value rather than a
  // one-shot boolean ref — React StrictMode's dev-mode double-invoke of
  // effects on mount was flipping a boolean guard on the first of the two
  // simulated invocations, letting the second slip through and fire this
  // prematurely on page load (starting the typing while still reading the
  // intro, well before any real tap happened).
  const lastForceStartRef = useRef(forceStart)
  useEffect(() => {
    if (forceStart === undefined) return
    if (forceStart === lastForceStartRef.current) return
    lastForceStartRef.current = forceStart
    forceStartedAtRef.current = Date.now()
    hasSettledRef.current = true
    hasResetRef.current = false
    setOverlaySettled(true)
    onOverlaySettled(window.scrollY)
  }, [forceStart])

  // reset and retype on mode change
  useEffect(() => {
    setParaText('')
    setSkipped(false)
    setAnimsDone(false)
    setShowScroll(false)
    clearInterval(paraInterval.current!)
    if (overlaySettled) {
      setOverlaySettled(false)
      setTimeout(() => setOverlaySettled(true), 50)
    }
  }, [mode])

  useEffect(() => {
    if (!overlaySettled || skipped) return
    const t = setTimeout(() => {
      paraInterval.current = setInterval(() => {
        setParaText(prev => {
          const next = PARA_FULL.slice(0, prev.length + 1)
          if (next.length === PARA_FULL.length) {
            clearInterval(paraInterval.current!)
            setAnimsDone(true)
            setShowScroll(true)
          }
          return next
        })
      }, 22)
    }, 800)
    return () => clearTimeout(t)
  }, [overlaySettled, skipped, PARA_FULL])

  useEffect(() => {
    if (animsDone) onAnimDone()
  }, [animsDone, onAnimDone])

  const skipAll = useCallback(() => {
    if (skipped || animsDone) return
    setSkipped(true)
    clearInterval(paraInterval.current!)
    setParaText(PARA_FULL)
    setAnimsDone(true)
    setShowScroll(true)
    onAnimDone()
  }, [skipped, animsDone, onAnimDone, PARA_FULL])

  const renderPara = () => {
    let remaining = paraText
    return SEGMENTS.map((seg, i) => {
      if (remaining.length === 0) return null
      const chunk = remaining.slice(0, seg.text.length)
      remaining = remaining.slice(seg.text.length)
      if (!chunk) return null
      return seg.color
        ? <span key={i} style={{ color: seg.color }}>{chunk}</span>
        : <span key={i}>{chunk}</span>
    })
  }

  return (
    <div ref={containerRef} style={{ height: '300vh', marginTop: '-220vh', position: 'relative' }} data-section="01">
      <motion.div
        data-section-panel="01"
        onClick={overlaySettled && !animsDone ? skipAll : undefined}
        onTouchEnd={(e) => {
          if (overlaySettled && !animsDone) {
            e.preventDefault()
            skipAll()
          }
        }}
        style={{
          position: 'sticky',
          top: 0,
          y: overlayY,
          zIndex: 51,
          backgroundColor: 'var(--color-bg)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          cursor: overlaySettled && !animsDone ? 'default' : 'auto',
        }}
      >
        <div style={{ height: '1px', backgroundColor: '#111', width: '100%', flexShrink: 0 }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: isMobile ? '1.5rem 2rem 1rem 2rem' : '6rem 2rem 4rem 2rem',
        }}>
          <h2 data-section-header="01" style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            color: '#111', fontWeight: 400, textAlign: 'center', margin: 0,
          }}>
            Section 01: Elementary School
          </h2>
        </div>

        <div style={{
          padding: '0 2rem 4rem 2rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: isMobile ? '1rem' : '3rem',
        }}>
          <div className="info-box" style={{
            backgroundColor: '#EADDDD',
            borderRadius: isMobile ? '20px' : '999px',
            padding: isMobile ? '1.2rem 1.5rem' : '1.2rem 2rem',
            maxWidth: '900px', width: '100%',
            display: 'flex', alignItems: 'center', gap: '1.5rem',
          }}>
            <img src="/assets/i-icon.svg" style={{
              width: isMobile ? '32px' : '40px',
              height: isMobile ? '32px' : '40px', flexShrink: 0,
            }} />
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.6rem, 2.5vw, 0.72rem)' : 'clamp(0.7rem, 1.2vw, 0.9rem)',
              color: '#111', lineHeight: 1.6, margin: 0,
            }}>
              {INFO_TEXT}
            </p>
          </div>

          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: 'clamp(1rem, 1.8vw, 1.3rem)',
            color: '#111', lineHeight: 1.9,
            maxWidth: '940px', width: '100%',
            textAlign: 'center', margin: 0,
            minHeight: isMobile ? '14em' : '6em',
          }}>
            {renderPara()}
            {paraText.length > 0 && paraText.length < PARA_FULL.length && (
              <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
            )}
          </p>

          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: isMobile ? '0.5rem' : '0rem',
            width: '100%', maxWidth: '900px',
          }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: showScroll ? 1 : 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '0',
            }}>
              <img src={dot1Src} style={{
                width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
                height: 'auto', animation: 'bob 2s ease-in-out infinite',
              }} />
              <img src={dot2Src} style={{
                width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
                height: 'auto', animation: 'bob 2s ease-in-out infinite 0.4s',
              }} />
            </div>
          </div>

        </div>

        <GraphSection
          mode={mode}
          onGrade3Complete={(nodes) => { finalGrade3NodesRef.current = nodes }}
        />

        <div style={{ width: '100%', position: 'relative', zIndex: 2, backgroundColor: 'var(--color-bg)' }}>
          <Section01Part2
            onAnimDone={onPart2AnimDone}
            onOverlaySettled={onPart2OverlaySettled}
            onAnimReset={onPart2AnimReset}
            mode={mode}
          />
        </div>

        <GraphSection45
          mode={mode}
          initialNodes={finalGrade3NodesRef}
        />

        <Section02 mode={mode} />
        <GraphSection68 mode={mode} />
        <Section03Intro mode={mode} />
        <CourseClusterSection mode={mode} />
        <Section03Part2
          onAnimDone={onSection03Part2AnimDone}
          onOverlaySettled={onSection03Part2OverlaySettled}
          onAnimReset={onSection03Part2AnimReset}
          mode={mode}
        />
        <GraphSection912 mode={mode} />

      </motion.div>
    </div>
  )
}