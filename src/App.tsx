import { useState, useEffect, useRef } from 'react'
import Hero from './components/Hero'
import ArticleSection from './components/ArticleSection'
import NavBar from './components/NavBar'

export type Mode = 'ses' | 'race'

function App() {
  const [curtainDone, setCurtainDone] = useState(false)
  // Forces a full unmount/remount of <Hero> (and everything inside it,
  // including BlobCurtain) on restart — bumped inside
  // handleToggleModeAndScrollTop below. BlobCurtain's mobile press-and-hold
  // gesture depends on several pieces of internal state/refs (hasTriggered,
  // curtainPhase, mobileBlobScale, mobileBlobRadius, hasLockedRef) all
  // resetting in exact lockstep to work again; manually chasing each one
  // individually proved fragile. A key change is the robust way to
  // guarantee every one of them returns to its pristine initial value,
  // without needing to enumerate and verify each piece of state by hand.
  const [heroResetKey, setHeroResetKey] = useState(0)
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
  // Bumped only by the Conclusion toggle's restart action — see the
  // comment on handleToggleModeAndScrollTop below for why this is kept
  // separate from `mode` itself.
  const [graphResetSignal, setGraphResetSignal] = useState(0)
  // Once true, stays true — the nav bar is a one-time milestone unlock
  // ("you've reached the conclusion"), not tied to current scroll
  // position, so it stays available even after scrolling back up.
  // Set once the user actually clicks Conclusion's own bottom SES/Race
  // toggle (the "start over" action) — NOT when Conclusion merely finishes
  // animating in. The nav bar's first-ever auto-reveal is tied to this
  // plus scrolling down from the resulting restarted landing page, not to
  // Conclusion's animation completing on its own.
  const [hasToggledFromConclusion, setHasToggledFromConclusion] = useState(false)
  // Each bumped independently by skipAnimationsUpTo below — separate
  // counters (not one shared signal) so each freeze-gated section can be
  // skipped INDEPENDENTLY depending on where the user actually clicked.
  // See skipAnimationsUpTo's own comment for why that distinction matters.
  const [skipSection01Signal, setSkipSection01Signal] = useState(0)
  const [skipPart2Signal, setSkipPart2Signal] = useState(0)
  const [skipSection02Signal, setSkipSection02Signal] = useState(0)
  const [skipSection03IntroSignal, setSkipSection03IntroSignal] = useState(0)
  const [skipSection03Part2Signal, setSkipSection03Part2Signal] = useState(0)

  // Page order, as laid out in ArticleSection.tsx — only the entries that
  // matter for this: the four nav-jumpable graph ids, and every
  // freeze-gated section that sits somewhere between them. Numbers are
  // arbitrary, only their relative order matters.
  const PAGE_ORDER: Record<string, number> = {
    section01: 0, 'graph-k3': 1, part2: 2, 'graph-45': 3, section02: 4,
    'graph-68': 5, section03Intro: 6, section03Part2: 7, 'graph-912': 8,
  }

  // Called by NavBar right before it jumps to a section via scrollIntoView.
  // That jump passes THROUGH every earlier freeze-gated section's own
  // scroll-linked "settled" threshold on the way — those thresholds are
  // pure scroll-position checks, so they fire regardless of whether the
  // scroll was a slow manual one or scrollIntoView's fast programmatic
  // one. Without skipping those sections, one would end up "settled"
  // (wheel-lock engaged, lockPos captured at wherever it happened to be
  // mid-jump) but never actually "done" (its typing never got a chance to
  // run), so the very next wheel tick after landing on the destination
  // graph snaps the page back to that stale mid-jump position — the exact
  // "teleported back to where sections are animating in" bug.
  //
  // Only sections strictly BEFORE the clicked destination (per PAGE_ORDER)
  // get skipped — a jump to graph-68 has no business marking Section03Part2
  // or GraphSection912 as already played, since the user hasn't reached
  // them yet and should still get their normal scroll-triggered animation
  // when they actually get there. An earlier version of this skipped
  // everything unconditionally regardless of destination, which meant
  // jumping to grades 6-8 silently pre-completed the freeze-frame section
  // and beyond, so scrolling into them later showed nothing left to
  // animate.
  const skipAnimationsUpTo = (targetId: string) => {
    const targetIndex = PAGE_ORDER[targetId] ?? Infinity
    // Hero's own intro/curtain lock only ever engages after the
    // press-and-hold gesture has actually been started (see App.tsx's
    // wheel-lock condition), so this is a no-op in the common "cheated
    // straight past it" case — but harmless, and correct, to always mark
    // it done regardless of target, since every nav destination is after it.
    setCurtainDone(true)
    setTypingDone(true)
    if (targetIndex > PAGE_ORDER.section01) {
      setSectionAnimDone(true)
      setSectionOverlaySettled(true)
      setSkipSection01Signal(v => v + 1)
    }
    if (targetIndex > PAGE_ORDER.part2) {
      setPart2AnimDone(true)
      setPart2OverlaySettled(true)
      setSkipPart2Signal(v => v + 1)
    }
    if (targetIndex > PAGE_ORDER.section02) {
      setSkipSection02Signal(v => v + 1)
    }
    if (targetIndex > PAGE_ORDER.section03Intro) {
      setSkipSection03IntroSignal(v => v + 1)
    }
    if (targetIndex > PAGE_ORDER.section03Part2) {
      setSection03Part2AnimDone(true)
      setSection03Part2OverlaySettled(true)
      setSkipSection03Part2Signal(v => v + 1)
    }
  }

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

  // Show overlay whenever curtainDone becomes false — not just once on
  // initial mount. Previously this only ran on mount, so hideOverlay()
  // setting display:'none' the first time the intro completed was never
  // undone; after Conclusion's toggle later reset curtainDone back to
  // false (to show the real landing screen again), nothing re-showed this
  // overlay, silently breaking the mobile press-and-hold gesture it
  // captures — touches just fell through with no listener to catch them.
  useEffect(() => {
    if (isMobileDevice() && !curtainDone) {
      const el = getOverlay()
      if (el) el.style.display = 'block'
    }
  }, [curtainDone])

  // Plain mode flip, no scroll/graph reset — shared by the 'R' key and the
  // nav bar's toggle. Deliberately the ONLY thing either of those does;
  // contrast with handleToggleModeAndScrollTop below, which is specific to
  // Conclusion's own bottom-of-page restart button.
  const toggleMode = () => setMode(prev => prev === 'ses' ? 'race' : 'ses')

  // R key toggles mode
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        toggleMode()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Conclusion's visible toggle switch: same mode flip as the 'R' key, plus
  // a jump back to the top of the page so "the whole thing starts over" —
  // the user re-scrolls through everything fresh in the new mode. Mode
  // flips immediately (so the toggle's own knob-slide is visible right
  // away), but the actual scroll jump is delayed slightly so the user sees
  // that slide play out before getting teleported, rather than the page
  // jumping away in the same instant the toggle is clicked.
  //
  // graphResetSignal is deliberately separate from `mode` itself — every
  // graph section listens for THIS specific signal to snap its own
  // currentStep back to 0, but plain mode changes (the 'R' key today, and
  // the future navbar toggle) must NOT reset whatever step the user is
  // currently on. Only this bottom-of-page restart action should do that,
  // since scrolling back to the top makes "the graphs are still on
  // whatever step you left them at" a confusing state to land back into.
  const TOGGLE_SLIDE_MS = 350
  const handleToggleModeAndScrollTop = () => {
    setMode(prev => prev === 'ses' ? 'race' : 'ses')
    setHasToggledFromConclusion(true)
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'auto' })
      setGraphResetSignal(v => v + 1)
      // Scrolling to top alone isn't actually "the very start" — curtainDone
      // stays true from before, so Hero would render the already-typed
      // intro screen at scrollY 0 instead of the original press&hold/
      // scroll-prompt landing view. Setting it false here (still needed,
      // since App.tsx itself — not just Hero — reads curtainDone directly
      // in a few places) cascades through the existing !curtainDone effect
      // below (typingDone/curtainDropping/scrollLockPos).
      setCurtainDone(false)
      // The actual fix for mobile press-and-hold breaking on restart:
      // force Hero (and BlobCurtain inside it) to fully remount, rather
      // than depending on BlobCurtain's own internal scrollYProgress<0.2
      // check to correctly reset every one of its refs/state in time.
      setHeroResetKey(k => k + 1)
    }, TOGGLE_SLIDE_MS)
  }

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
        key={heroResetKey}
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
        onToggleModeAndScrollTop={handleToggleModeAndScrollTop}
        graphResetSignal={graphResetSignal}
        skipSection01Signal={skipSection01Signal}
        skipPart2Signal={skipPart2Signal}
        skipSection02Signal={skipSection02Signal}
        skipSection03IntroSignal={skipSection03IntroSignal}
        skipSection03Part2Signal={skipSection03Part2Signal}
        mode={mode}
      />
      {/* NavBar handles its own "hide at the landing page" detection
          internally via direct scroll position — not curtainDone, which
          only flips via a scroll CHANGE event and can get stuck false on a
          page reload that starts already-scrolled-down. The first-ever
          auto-reveal is tied to hasToggledFromConclusion plus scrolling
          down from the landing page afterward (handled inside NavBar). */}
      <NavBar mode={mode} onToggleMode={toggleMode} hasToggledFromConclusion={hasToggledFromConclusion} onNavigate={skipAnimationsUpTo} />
    </main>
  )
}

export default App