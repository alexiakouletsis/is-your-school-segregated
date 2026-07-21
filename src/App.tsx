import { useState, useEffect, useRef } from 'react'
import Hero from './components/Hero'
import ArticleSection from './components/ArticleSection'

export type Mode = 'ses' | 'race'

function App() {
  const [curtainDone, setCurtainDone] = useState(false)
  const [forceSection01Start, setForceSection01Start] = useState(0)
  const [curtainDropping, setCurtainDropping] = useState(false)
  const [mobilePressed, setMobilePressed] = useState(false)
  const [typingDone, setTypingDone] = useState(false)
  const [sectionAnimDone, setSectionAnimDone] = useState(false)
  const [sectionOverlaySettled, setSectionOverlaySettled] = useState(false)
  const [part2AnimDone, setPart2AnimDone] = useState(false)
  const [part2OverlaySettled, setPart2OverlaySettled] = useState(false)
  const [section03Part2AnimDone, setSection03Part2AnimDone] = useState(false)
  const [section03Part2OverlaySettled, setSection03Part2OverlaySettled] = useState(false)
  const [mode, setMode] = useState<Mode>('ses')

  const scrollLockPos = useRef<number | null>(null)
  const sectionLockPos = useRef<number | null>(null)
  const part2LockPos = useRef<number | null>(null)
  const section03Part2LockPos = useRef<number | null>(null)
  const typingDoneRef = useRef(false)
  const sectionAnimDoneRef = useRef(false)
  const part2AnimDoneRef = useRef(false)
  const section03Part2AnimDoneRef = useRef(false)
  const curtainDroppingRef = useRef(false)
  const curtainDoneRef = useRef(false)
  const sectionOverlaySettledRef = useRef(false)
  const part2OverlaySettledRef = useRef(false)
  const section03Part2OverlaySettledRef = useRef(false)
  const typingAlreadyDoneRef = useRef(false)


  useEffect(() => { typingDoneRef.current = typingDone }, [typingDone])
  useEffect(() => { sectionAnimDoneRef.current = sectionAnimDone }, [sectionAnimDone])
  useEffect(() => { part2AnimDoneRef.current = part2AnimDone }, [part2AnimDone])
  useEffect(() => { section03Part2AnimDoneRef.current = section03Part2AnimDone }, [section03Part2AnimDone])
  useEffect(() => { curtainDoneRef.current = curtainDone }, [curtainDone])

  const isMobileDevice = () => window.innerWidth <= 768

  const getOverlay = () => document.getElementById('mobile-overlay')

  const hideOverlay = () => {
    const el = getOverlay()
    if (!el) return
    el.style.display = 'none'
    el.innerHTML = ''
  }

  // attach non-passive listeners to overlay
  useEffect(() => {
    const el = getOverlay()
    if (!el) return

    const blockMove = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handlePressStart = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!curtainDoneRef.current) {
        setMobilePressed(true)
      }
    }

    const handlePressEnd = (e: TouchEvent) => {
      e.preventDefault()
      setMobilePressed(false)
    }

    el.addEventListener('touchmove', blockMove, { passive: false })
    el.addEventListener('touchstart', handlePressStart, { passive: false })
    el.addEventListener('touchend', handlePressEnd, { passive: false })

    return () => {
      el.removeEventListener('touchmove', blockMove)
      el.removeEventListener('touchstart', handlePressStart)
      el.removeEventListener('touchend', handlePressEnd)
    }
  }, [])

  // show overlay immediately on mobile
  useEffect(() => {
    if (isMobileDevice()) {
      const el = getOverlay()
      if (el) el.style.display = 'block'
    }
  }, [])

  // R key toggles mode
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        setMode(prev => prev === 'ses' ? 'race' : 'ses')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!curtainDone) {
      typingAlreadyDoneRef.current = false
      setTypingDone(false)
      setCurtainDropping(false)
      curtainDroppingRef.current = false
      scrollLockPos.current = null
    } else {
      scrollLockPos.current = window.scrollY
      // The overlay was shown to capture the press-and-hold gesture. Once the
      // curtain has finished, it must be explicitly hidden here — the overlay's
      // own touchend handler only hides it when a "tap to continue" prompt is
      // active, which isn't the case yet, so without this it stays up
      // (z-index 99999) and silently blocks every tap meant for the intro's
      // own skip handler.
      if (isMobileDevice()) hideOverlay()
    }
  }, [curtainDone])

  useEffect(() => {
    if (curtainDropping) {
      scrollLockPos.current = window.scrollY
    }
  }, [curtainDropping])

  useEffect(() => {
    if (!sectionOverlaySettled) {
      setSectionAnimDone(false)
      sectionOverlaySettledRef.current = false
      sectionLockPos.current = null
    }
  }, [sectionOverlaySettled])

  useEffect(() => {
    if (!part2OverlaySettled) {
      setPart2AnimDone(false)
      part2OverlaySettledRef.current = false
      part2LockPos.current = null
    }
  }, [part2OverlaySettled])

  useEffect(() => {
    if (!section03Part2OverlaySettled) {
      setSection03Part2AnimDone(false)
      section03Part2OverlaySettledRef.current = false
      section03Part2LockPos.current = null
    }
  }, [section03Part2OverlaySettled])

  // desktop wheel lock only
  useEffect(() => {
    const handleWheel = (e: Event) => {
      if (isMobileDevice()) return
      const introLocked = curtainDroppingRef.current && !typingDoneRef.current
      const section1Locked = sectionOverlaySettledRef.current && !sectionAnimDoneRef.current
      const part2Locked = part2OverlaySettledRef.current && !part2AnimDoneRef.current
      const section03Part2Locked = section03Part2OverlaySettledRef.current && !section03Part2AnimDoneRef.current
      if (introLocked || section1Locked || part2Locked || section03Part2Locked) {
        e.preventDefault()
        const target = introLocked ? (scrollLockPos.current ?? 0)
          : section1Locked ? (sectionLockPos.current ?? 0)
          : part2Locked ? (part2LockPos.current ?? 0)
          : (section03Part2LockPos.current ?? 0)
        // preventDefault above already stops the native scroll from moving
        // in the vast majority of cases, so calling scrollTo unconditionally
        // on every single wheel tick was redundant work — and on trackpads,
        // redundant scrollTo calls stacked on top of already-blocked scroll
        // can visibly read as a jitter/vibration. Only correct when we've
        // actually drifted from the locked target.
        if (Math.abs(window.scrollY - target) > 1) {
          window.scrollTo(0, target)
        }
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <main>
      <Hero
        curtainDone={curtainDone}
        setCurtainDone={setCurtainDone}
        mobilePressed={mobilePressed}
        onTypingDone={() => {
          if (typingAlreadyDoneRef.current) return
          typingAlreadyDoneRef.current = true
          setTypingDone(true)
        }}
        onAdvance={() => {
          // The intro's own last line already shows a "tap" cue, so we don't
          // need a separate "tap to continue" overlay prompt here — the
          // intro itself (once done) calls this directly when tapped.
          if (!isMobileDevice()) return

          // v≈0.35 on ArticleSection's ["start end","end end"] scroll range —
          // just past the sticky-engage point, keeping the title in view at
          // the top. Pure math against the container's own (untransformed)
          // position, no trial-and-error jumps: every window.scrollTo call
          // gets painted by the browser, so a "measure, correct, jump back"
          // sequence before the real scroll wasn't actually invisible — it
          // was a rapid flash of real position changes, which is exactly the
          // choppy jump this was meant to avoid.
          const container = document.querySelector('[data-section="01"]') as HTMLElement | null
          let target: number
          if (container) {
            const containerTopAbsolute = container.getBoundingClientRect().top + window.scrollY
            target = containerTopAbsolute + window.innerHeight * 0.35
          } else {
            target = window.scrollY + window.innerHeight
          }

          window.scrollTo({ top: target, behavior: 'smooth' })

          // Directly trigger the typing start rather than relying solely on
          // ArticleSection's own scroll-linked detection recomputing in time
          // (a burst of programmatic scrollTo calls doesn't always give that
          // a chance to catch up, leaving it stuck reading a stale, pre-jump
          // value until the user manually scrolls).
          setForceSection01Start(v => v + 1)
          // Failsafe: force a genuine, tiny scroll delta (not just a
          // synthetic event) after things settle. Some browsers throttle or
          // dedupe scroll event dispatch when window.scrollY hasn't visibly
          // changed since the last one, so a synthetic dispatchEvent alone
          // wasn't reliably reaching ArticleSection's scroll-linked listener
          // in time — an actual, tiny position change can't be ignored the
          // same way. Delayed to land after the smooth scroll above has
          // settled, so it doesn't interrupt that animation.
          setTimeout(() => {
            const y = window.scrollY
            window.scrollTo({ top: y + 2, behavior: 'auto' })
            requestAnimationFrame(() => {
              window.scrollTo({ top: y, behavior: 'auto' })
            })
          }, 500)
        }}
        onTypingReset={() => {}}
        onCurtainDropping={() => {
          curtainDroppingRef.current = true
          setCurtainDropping(true)
          scrollLockPos.current = window.scrollY
        }}
        mode={mode}
      />
      <ArticleSection
        forceStart={forceSection01Start}
        onAnimDone={() => {
          setSectionAnimDone(true)
          // No tap gate on mobile anymore — once typing's done (or skipped),
          // the user just keeps scrolling straight into the graph.
        }}
        onOverlaySettled={(scrollY) => {
          sectionLockPos.current = scrollY
          sectionOverlaySettledRef.current = true
          setSectionOverlaySettled(true)
          // No mobile overlay here anymore — Section 01's paragraph should
          // just be freely scrollable on mobile, with tap-to-skip on the
          // typing itself (handled in ArticleSection) instead of a
          // touch-blocking overlay. Desktop's wheel-lock still reads
          // sectionOverlaySettledRef below, unaffected.
        }}
        onAnimReset={() => {
          sectionOverlaySettledRef.current = false
          setSectionOverlaySettled(false)
        }}
        onPart2AnimDone={() => {
          setPart2AnimDone(true)
          // No tap gate on mobile anymore — keep scrolling straight through.
        }}
        onPart2OverlaySettled={(scrollY) => {
          part2LockPos.current = scrollY
          part2OverlaySettledRef.current = true
          setPart2OverlaySettled(true)
          // No mobile freeze here anymore — same treatment as Section 01's
          // paragraph, this should just be freely scrollable on mobile.
          // Desktop's wheel-lock still reads part2OverlaySettledRef below.
        }}
        onPart2AnimReset={() => {
          part2OverlaySettledRef.current = false
          setPart2OverlaySettled(false)
        }}
        onSection03Part2AnimDone={() => {
          setSection03Part2AnimDone(true)
          // No tap gate on mobile — same treatment as the other body-text
          // sections, keep scrolling straight through once typing's done.
        }}
        onSection03Part2OverlaySettled={(scrollY) => {
          section03Part2LockPos.current = scrollY
          section03Part2OverlaySettledRef.current = true
          setSection03Part2OverlaySettled(true)
        }}
        onSection03Part2AnimReset={() => {
          section03Part2OverlaySettledRef.current = false
          setSection03Part2OverlaySettled(false)
        }}
        mode={mode}
      />
    </main>
  )
}

export default App