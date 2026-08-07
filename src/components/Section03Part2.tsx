import { useIsMobile } from '../hooks/useIsMobile'
import { motion } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useScroll } from 'framer-motion'
import type { Mode } from '../App'

const PARA1 = "As students are filtered into varying levels of classes (regular, honors, AP, etc.), course tracking becomes most prevalent in high school. Throughout the four years, students become increasingly segregated into solidified class pathways, never interacting across those boundaries. These boundaries show clear correlation with attributes like a student's ethnicity and economic background."

const SES_PARA2_BEFORE = "Our two dots are now on completely different pathways. Being set early on an advanced trajectory, "
const SES_PARA2_PINK = "pink"
const SES_PARA2_AFTER1 = " is only taking honors and AP classes. After always being put in \u201cregular\u201d classes throughout previous years, "
const SES_PARA2_GREEN = "green"
const SES_PARA2_AFTER2 = " remains on that pathway. "
const SES_PARA2_BIG = "The two never share a class again."
const SES_PARA2_FULL = SES_PARA2_BEFORE + SES_PARA2_PINK + SES_PARA2_AFTER1 + SES_PARA2_GREEN + SES_PARA2_AFTER2 + SES_PARA2_BIG

const RACE_PARA2_BEFORE = "Our two dots are now on completely different pathways. Being set early on an advanced trajectory, "
const RACE_PARA2_ORANGE = "orange"
const RACE_PARA2_AFTER1 = " is only taking honors and AP classes. After always being put in \u201cregular\u201d classes throughout previous years, "
const RACE_PARA2_BLUE = "blue"
const RACE_PARA2_AFTER2 = " remains on that pathway. "
const RACE_PARA2_BIG = "The two never share a class again."
const RACE_PARA2_FULL = RACE_PARA2_BEFORE + RACE_PARA2_ORANGE + RACE_PARA2_AFTER1 + RACE_PARA2_BLUE + RACE_PARA2_AFTER2 + RACE_PARA2_BIG

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

export default function Section03Part2({ onAnimDone, onOverlaySettled, skipSignal, mode }: Props) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
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

  // Measures the container's own TOP edge against fixed points in the
  // viewport (80% down -> 35% down), rather than the container's start vs
  // end against viewport center. That earlier approach (copied from
  // Section01Part2) measures progress across a scroll distance equal to
  // the container's own total height, so the "right" fraction to trigger
  // at depends on how tall the content is — it happened to work for
  // Section01Part2's shorter paragraph, but this section's longer text
  // pushed the same fraction to a point where the paragraphs had already
  // scrolled above the fold by the time settle fired. Anchoring to the
  // viewport instead makes the trigger point content-height-independent.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.85", "start -0.05"]
  })

  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      // Mobile never freezes (see App.tsx's wheel-lock, which only ever
      // applies on desktop), so there's no reason to wait until the section
      // has nearly scrolled past before starting the typing there — trigger
      // much earlier, as soon as the section is meaningfully in view.
      // Desktop's threshold was lowered from 0.90 to 0.85 previously — at
      // 0.90 the freeze engaged just late enough that GraphSection912's top
      // edge was already peeking into the locked viewport underneath this
      // section's extra bottom padding. 0.85 fixed that but overshot the
      // other direction (froze noticeably early); 0.88 splits the
      // difference — later/further down the page than 0.85, but with
      // enough margin below 0.90 to still stay clear of the peeking issue.
      const threshold = isMobile ? 0.3 : 0.88
      if (v >= threshold && !hasSettledRef.current) {
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
    clearInterval(para1Interval.current!)
    clearInterval(para2Interval.current!)
  }, [])

  useEffect(() => {
    return () => reset()
  }, [reset])

  useEffect(() => {
    if (!settled || skipped) return
    const t = setTimeout(() => {
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
    }, 600)
    return () => clearTimeout(t)
  }, [settled, skipped])

  const startPara2Typing = useCallback((target: string) => {
    clearInterval(para2Interval.current!)
    const t = setTimeout(() => {
      para2Interval.current = setInterval(() => {
        setPara2Text(prev => {
          const next = target.slice(0, prev.length + 1)
          if (next.length === target.length) {
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
  }, [onAnimDone])

  useEffect(() => {
    if (!para1Done || skipped) return
    return startPara2Typing(PARA2_FULL)
    // PARA2_FULL intentionally excluded — a mode change while already past
    // paragraph 1 is handled by the dedicated retype effect below instead,
    // same split ArticleIntro uses for its own mode-dependent paragraph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [para1Done, skipped])

  // Retype ONLY paragraph 2 when mode changes after it's already been
  // reached. Paragraph 1's text doesn't depend on mode at all, so unlike
  // Section01Part2 (where the whole section resets on mode change), this
  // section leaves paragraph 1 alone entirely — only paragraph 2 clears and
  // retypes, without touching `skipped` (which would also re-trigger
  // paragraph 1's own typing effect above for no visible reason).
  const isFirstModeRender = useRef(true)
  useEffect(() => {
    if (isFirstModeRender.current) { isFirstModeRender.current = false; return }
    if (!para1Done) return // haven't reached paragraph 2 yet — it'll read the current mode when it gets there
    setPara2Text('')
    setPara2Done(false)
    setShowScroll(false)
    startPara2Typing(PARA2_FULL)
  }, [mode])

  const skipAll = useCallback(() => {
    if (skipped || para2Done) return
    setSkipped(true)
    clearInterval(para1Interval.current!)
    clearInterval(para2Interval.current!)
    setPara1Text(PARA1)
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

  const para2Segments = mode === 'race' ? [
    { text: RACE_PARA2_BEFORE, color: null, big: false },
    { text: RACE_PARA2_ORANGE, color: 'var(--color-race-1)', big: false },
    { text: RACE_PARA2_AFTER1, color: null, big: false },
    { text: RACE_PARA2_BLUE, color: 'var(--color-race-2)', big: false },
    { text: RACE_PARA2_AFTER2, color: null, big: false },
    { text: RACE_PARA2_BIG, color: null, big: true },
  ] : [
    { text: SES_PARA2_BEFORE, color: null, big: false },
    { text: SES_PARA2_PINK, color: 'var(--color-high-ses)', big: false },
    { text: SES_PARA2_AFTER1, color: null, big: false },
    { text: SES_PARA2_GREEN, color: 'var(--color-low-ses)', big: false },
    { text: SES_PARA2_AFTER2, color: null, big: false },
    { text: SES_PARA2_BIG, color: null, big: true },
  ]

  const segStyle = (seg: { color: string | null; big: boolean }): React.CSSProperties => {
    const style: React.CSSProperties = seg.color ? { color: seg.color } : {}
    if (seg.big) { style.fontWeight = 700; style.fontSize = '1.15em' }
    return style
  }

  const renderPara2 = () => {
    let remaining = para2Text
    return para2Segments.map((seg, i) => {
      if (remaining.length === 0) return null
      const chunk = remaining.slice(0, seg.text.length)
      remaining = remaining.slice(seg.text.length)
      if (!chunk) return null
      return <span key={i} style={segStyle(seg)}>{chunk}</span>
    })
  }

  // Full (non-progressive) version of paragraph 2, used only by the
  // invisible sizer below — same segments/styling, just the complete text
  // instead of para2Text's current typed-so-far slice.
  const renderPara2Full = () => para2Segments.map((seg, i) => (
    <span key={i} style={segStyle(seg)}>{seg.text}</span>
  ))

  const dot1Src = mode === 'race' ? '/assets/whiteasian-highschool-sad.svg' : '/assets/high-SES-highschool-sad.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-highschool-sad.svg' : '/assets/low-SES-highschool-sad.svg'

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
        padding: isMobile ? '5rem 1.5rem 7rem 1.5rem' : '6rem 2rem 9rem 2rem',
        gap: isMobile ? '1.3rem' : '2.7rem',
        cursor: settled && !para2Done ? 'default' : 'auto',
      }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: '990px' }}>
        {/* Invisible sizer: renders the complete final text so this wrapper's
            height is always exactly right, regardless of how many lines it
            actually wraps to at the current font-size/width. The animated
            paragraph below is absolutely positioned over it, so growing
            from empty to full text never changes the wrapper's height and
            never pushes the dots below it. */}
        <p aria-hidden="true" style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.85rem, 3.6vw, 1.05rem)' : 'clamp(1.05rem, 1.9vw, 1.5rem)',
          lineHeight: 1.7,
          width: '100%',
          textAlign: 'center',
          margin: 0,
          visibility: 'hidden',
        }}>
          {PARA1}
        </p>
        <p style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.85rem, 3.6vw, 1.05rem)' : 'clamp(1.05rem, 1.9vw, 1.5rem)',
          color: '#111',
          lineHeight: 1.7,
          width: '100%',
          textAlign: 'center',
          margin: 0,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
        }}>
          {para1Text}
          {para1Text.length > 0 && para1Text.length < PARA1.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </p>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: '940px' }}>
        <p aria-hidden="true" style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.78rem, 3.15vw, 0.95rem)' : 'clamp(0.85rem, 1.6vw, 1.1rem)',
          lineHeight: 1.9,
          width: '100%',
          textAlign: 'center',
          margin: 0,
          visibility: 'hidden',
        }}>
          {renderPara2Full()}
        </p>
        <p style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.78rem, 3.15vw, 0.95rem)' : 'clamp(0.85rem, 1.6vw, 1.1rem)',
          color: '#111',
          lineHeight: 1.9,
          width: '100%',
          textAlign: 'center',
          margin: 0,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
        }}>
          {renderPara2()}
          {para2Text.length > 0 && para2Text.length < PARA2_FULL.length && (
            <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
          )}
        </p>
      </div>

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
            width: isMobile ? 'clamp(100px, 26vw, 150px)' : 'clamp(130px, 18vw, 220px)',
            height: 'auto',
            animation: 'bob 2s ease-in-out infinite',
          }} />
          <img src={dot2Src} style={{
            width: isMobile ? 'clamp(100px, 26vw, 150px)' : 'clamp(130px, 18vw, 220px)',
            height: 'auto',
            animation: 'bob 2s ease-in-out infinite',
            animationDelay: '0.4s',
          }} />
        </div>
      </div>
    </div>
  )
}