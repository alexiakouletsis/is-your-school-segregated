import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

const PARA1 = "School segregation in the United States was made illegal in 1954 via the supreme court case Brown vs. The Board of Education. It is obvious that in modern times, schools cannot have policies that explicitly segregate based on factors like race and socioeconomic class."

const MIDDLE = "However, the data illustrates a different story."

const PARA3_BEFORE = "The "
const PARA3_LINK = "Plural Connections Group"
const PARA3_AFTER_1 = " has partnered with a public school district in the Southeastern United States to collect data on 75 schools (varying from grades k-12) about classes that students share with one another. Classes can not only affect a student's academic breadth, but also the extent of their friendship networks. Let's take a look at this data in the context of "

const PARA3_BOLD_PINK_SES = "Socio-Economic "
const PARA3_BOLD_GREEN_SES = "Status (SES) line"
const PARA3_FULL_SES = PARA3_BEFORE + PARA3_LINK + PARA3_AFTER_1 + PARA3_BOLD_PINK_SES + PARA3_BOLD_GREEN_SES + "."

const PARA3_AFTER_1_RACE = " has partnered with a public school district in the Southeastern United States to collect data on 75 schools (varying from grades k-12) about classes that students share with one another. Classes can not only affect a student's academic breadth, but also the extent of their friendship networks. Let's take a look at this data in the context of race."
const PARA3_FULL_RACE = PARA3_BEFORE + PARA3_LINK + PARA3_AFTER_1_RACE

interface Props {
  startTyping: boolean
  onDone?: () => void
  onReset?: () => void
  onAdvance?: () => void
  mode: Mode
}

export default function ArticleIntro({ startTyping, onDone, onReset, onAdvance, mode }: Props) {
  const isMobile = useIsMobile()

  const PARA3_FULL = mode === 'ses' ? PARA3_FULL_SES : PARA3_FULL_RACE

  const [delayedStart, setDelayedStart] = useState(false)
  const [para1Text, setPara1Text] = useState('')
  const [para1Done, setPara1Done] = useState(false)
  const [showMiddle, setShowMiddle] = useState(false)
  const [middleDone, setMiddleDone] = useState(false)
  const [para3Text, setPara3Text] = useState('')
  const [skipped, setSkipped] = useState(false)
  const [showScroll, setShowScroll] = useState(false)

  const para1Interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const para3Interval = useRef<ReturnType<typeof setInterval> | null>(null)

  const skipAll = useCallback(() => {
    if (skipped) return
    setSkipped(true)
    clearInterval(para1Interval.current!)
    clearInterval(para3Interval.current!)
    setPara1Text(PARA1)
    setPara1Done(true)
    setShowMiddle(true)
    setMiddleDone(true)
    setPara3Text(PARA3_FULL)
    setShowScroll(true)
    onDone?.()
  }, [skipped, onDone, PARA3_FULL])

  useEffect(() => {
    if (startTyping && !skipped) {
      const t = setTimeout(() => setDelayedStart(true), 1000)
      return () => clearTimeout(t)
    }
    if (!startTyping) {
      setDelayedStart(false)
      setSkipped(false)
      setPara1Text('')
      setPara1Done(false)
      setShowMiddle(false)
      setMiddleDone(false)
      setPara3Text('')
      setShowScroll(false)
      onReset?.()
    }
  }, [startTyping])

  useEffect(() => {
    if (delayedStart && !skipped && para1Text.length < PARA1.length) {
      para1Interval.current = setInterval(() => {
        setPara1Text(prev => {
          const next = PARA1.slice(0, prev.length + 1)
          if (next.length === PARA1.length) {
            clearInterval(para1Interval.current!)
            setPara1Done(true)
          }
          return next
        })
      }, 22)
    }
    return () => clearInterval(para1Interval.current!)
  }, [delayedStart, skipped])

  useEffect(() => {
    if (para1Done && !skipped) {
      const t = setTimeout(() => setShowMiddle(true), 800)
      return () => clearTimeout(t)
    }
  }, [para1Done, skipped])

  const startPara3Typing = useCallback((target: string) => {
    clearInterval(para3Interval.current!)
    const t = setTimeout(() => {
      para3Interval.current = setInterval(() => {
        setPara3Text(prev => {
          const next = target.slice(0, prev.length + 1)
          if (next.length === target.length) {
            clearInterval(para3Interval.current!)
            setShowScroll(true)
            onDone?.()
          }
          return next
        })
      }, 22)
    }, 800)
    return () => clearTimeout(t)
  }, [onDone])

  useEffect(() => {
    if (middleDone && !skipped && para3Text.length < PARA3_FULL.length) {
      return startPara3Typing(PARA3_FULL)
    }
    // PARA3_FULL intentionally excluded from deps — see the mode-change
    // effect below for why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [middleDone, skipped])

  // Retype paragraph 3 when mode changes after it's already been reached.
  // Its text (and only its text — paragraphs 1 and the middle line don't
  // depend on mode) is mode-specific; colors already re-evaluate live at
  // render time regardless, but the actual typed characters were staying
  // frozen on whichever mode was active when typing finished/was skipped,
  // so a mode toggle only visually changed colors while the words stayed stale.
  //
  // This mirrors Section 01's approach: reset state, then toggle the gating
  // flag (middleDone) off and back on, relying on the effect above — the
  // single source of truth for starting typing — to cleanly restart. An
  // earlier version called startPara3Typing directly from here in addition
  // to that effect also depending on PARA3_FULL directly; on a mode change
  // BOTH could fire (the other effect using stale, not-yet-reset para3Text
  // in the same render pass), creating two overlapping intervals racing to
  // update the same state — the vibrating/glitching text on repeated toggles.
  // Excluding PARA3_FULL from the effect above's deps and routing every
  // restart through this single middleDone toggle guarantees only one
  // interval is ever running.
  const isFirstModeRender = useRef(true)
  useEffect(() => {
    if (isFirstModeRender.current) { isFirstModeRender.current = false; return }
    if (!middleDone) return // hasn't reached paragraph 3 yet — it'll just read the current mode when it gets there
    clearInterval(para3Interval.current!)
    setSkipped(false)
    setShowScroll(false)
    setPara3Text('')
    setMiddleDone(false)
    setTimeout(() => setMiddleDone(true), 50)
  }, [mode])

  const linkStart = PARA3_BEFORE.length
  const linkEnd = linkStart + PARA3_LINK.length

  const renderPara3 = () => {
    const beforeLink = para3Text.slice(0, linkStart)
    const linkPart = para3Text.slice(linkStart, Math.min(para3Text.length, linkEnd))

    if (mode === 'ses') {
      const boldStart = linkEnd + PARA3_AFTER_1.length
      const regularAfter = para3Text.slice(linkEnd, boldStart)
      const boldPart = para3Text.slice(boldStart)
      const boldPinkPart = boldPart.slice(0, Math.min(boldPart.length, PARA3_BOLD_PINK_SES.length))
      const boldGreenPart = boldPart.length > PARA3_BOLD_PINK_SES.length
        ? boldPart.slice(PARA3_BOLD_PINK_SES.length, PARA3_BOLD_PINK_SES.length + PARA3_BOLD_GREEN_SES.length)
        : ''
      const periodTyped = para3Text.length === PARA3_FULL_SES.length

      return (
        <>
          {beforeLink}
          {linkPart && (
            <a href="https://www.pluralconnections.org/" target="_blank" rel="noopener noreferrer"
              className="pcg-link" style={{ color: '#9E2591', textDecoration: 'none' }}>
              {linkPart}
            </a>
          )}
          {regularAfter}
          {boldPinkPart && <strong style={{ color: 'var(--color-high-ses)' }}>{boldPinkPart}</strong>}
          {boldGreenPart && <strong style={{ color: 'var(--color-low-ses)' }}>{boldGreenPart}</strong>}
          {periodTyped && <span style={{ color: '#111', fontWeight: 'normal' }}>.</span>}
          {para3Text.length > 0 && para3Text.length < PARA3_FULL_SES.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </>
      )
    } else {
      const after1End = linkEnd + PARA3_AFTER_1_RACE.length - 5
      const regularAfter = para3Text.slice(linkEnd, Math.min(para3Text.length, after1End))
      const racePart = para3Text.slice(after1End)
      const raPart = racePart.slice(0, Math.min(racePart.length, 2))
      const cePart = racePart.length > 2 ? racePart.slice(2, Math.min(racePart.length, 4)) : ''
      const periodPart = racePart.length > 4 ? racePart.slice(4) : ''

      return (
        <>
          {beforeLink}
          {linkPart && (
            <a href="https://www.pluralconnections.org/" target="_blank" rel="noopener noreferrer"
              className="pcg-link" style={{ color: '#9E2591', textDecoration: 'none' }}>
              {linkPart}
            </a>
          )}
          {regularAfter}
          {raPart && <strong style={{ color: 'var(--color-race-1)' }}>{raPart}</strong>}
          {cePart && <strong style={{ color: 'var(--color-race-2)' }}>{cePart}</strong>}
          {periodPart}
          {para3Text.length > 0 && para3Text.length < PARA3_FULL_RACE.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </>
      )
    }
  }

  const handleTap = useCallback(() => {
    // On mobile, once the intro has fully finished (its own last line already
    // shows a "tap" cue), a further tap should advance to Section 01 instead
    // of re-running skipAll (which would just be a harmless no-op). Desktop
    // is unaffected — it still always calls skipAll here, same as before.
    // (Desktop click-to-advance was tried and reverted twice — leaving this
    // mobile-only, which is the one path actually confirmed to work.)
    if (isMobile && showScroll) {
      onAdvance?.()
    } else {
      skipAll()
    }
  }, [isMobile, showScroll, onAdvance, skipAll])

  return (
    <div
      onClick={handleTap}
      onTouchEnd={(e) => { e.preventDefault(); handleTap() }}
      style={{
        maxWidth: isMobile ? '100%' : '1000px',
        width: '100%',
        textAlign: 'center',
        fontFamily: "'Kiwi Maru', serif",
        color: '#111',
        lineHeight: isMobile ? 1.95 : 2.15,
        cursor: 'default',
      }}
    >
      <div style={{ position: 'relative', width: '100%', marginBottom: isMobile ? '1.2rem' : '2rem' }}>
        <span aria-hidden="true" style={{
          fontSize: isMobile ? 'clamp(0.75rem, 3.5vw, 0.95rem)' : 'clamp(1.1rem, 1.8vw, 1.4rem)',
          display: 'block',
          visibility: 'hidden',
        }}>
          {PARA1}
        </span>
        <span style={{
          fontSize: isMobile ? 'clamp(0.75rem, 3.5vw, 0.95rem)' : 'clamp(1.1rem, 1.8vw, 1.4rem)',
          display: 'block',
          position: 'absolute',
          top: 0, left: 0, right: 0,
        }}>
          {para1Text}
          {para1Text.length > 0 && para1Text.length < PARA1.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showMiddle ? 1 : 0 }}
        transition={{ duration: 1.5 }}
        onAnimationComplete={() => { if (showMiddle && !skipped) setMiddleDone(true) }}
        style={{
          fontSize: isMobile ? 'clamp(1rem, 5vw, 1.3rem)' : 'clamp(1.5rem, 2.8vw, 2.1rem)',
          fontWeight: 700,
          marginBottom: isMobile ? '1.2rem' : '2rem',
        }}
      >
        {MIDDLE}
      </motion.div>

      <div style={{ position: 'relative', width: '100%' }}>
        <span aria-hidden="true" style={{
          fontSize: isMobile ? 'clamp(0.75rem, 3.5vw, 0.95rem)' : 'clamp(1.1rem, 1.8vw, 1.4rem)',
          display: 'block',
          visibility: 'hidden',
        }}>
          {PARA3_FULL}
        </span>
        <span style={{
          fontSize: isMobile ? 'clamp(0.75rem, 3.5vw, 0.95rem)' : 'clamp(1.1rem, 1.8vw, 1.4rem)',
          display: 'block',
          position: 'absolute',
          top: 0, left: 0, right: 0,
        }}>
          {renderPara3()}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showScroll ? 1 : 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          marginTop: isMobile ? '0.5rem' : '2rem',
          fontFamily: "'Gaegu', cursive",
          fontSize: isMobile ? 'clamp(1.3rem, 5vw, 1.8rem)' : 'clamp(1.1rem, 2.5vw, 1.6rem)',
          color: '#111',
        }}
      >
        <span>{isMobile ? 'tap' : 'scroll'}</span>
        <img
          src={isMobile ? '/assets/tap-icon.svg' : '/assets/down-scroll-arrow.svg'}
          style={{
            width: isMobile ? '1.5rem' : '1.4rem',
            height: 'auto',
            animation: isMobile ? 'bob 2s ease-in-out infinite' : 'none',
          }}
        />
      </motion.div>
    </div>
  )
}