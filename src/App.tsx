import { useState, useEffect, useRef } from 'react'
import Hero from './components/Hero'
import ArticleSection from './components/ArticleSection'
import NavBar from './components/NavBar'
import ToggleSwitch from './components/ToggleSwitch'
import { useIsMobile } from './hooks/useIsMobile'

export type Mode = 'ses' | 'race'

// Every image the pre-curtain landing screen actually renders (both mode
// variants, since mode can toggle later and this only needs to run once).
// Preloaded so BlobCurtain's pink/green dot-position measurement (which
// depends on these images having already loaded) can't race against a
// slow network — see the loading-screen effect below for the full
// reasoning.
const LANDING_ASSETS = [
  '/assets/sparkle-sketch.svg',
  '/assets/heart-sketch.svg',
  '/assets/plane-sketch.svg',
  '/assets/pencil-sketch.svg',
  '/assets/stars-sketch.svg',
  '/assets/apple-sketch.svg',
  '/assets/butterfly-sketch.svg',
  '/assets/pink-dot-on-i.svg',
  '/assets/orange-dot-on-i.svg',
  '/assets/green-dot-on-q.svg',
  '/assets/blue-dot-on-q.svg',
  '/assets/button.svg',
]

function App() {
  const isMobile = useIsMobile()
  // Hover tooltip ("Or toggle using the 'R' key") for the new persistent
  // top-right toggle — moved here from NavBar.tsx (currently not rendered)
  // along with the toggle itself. Desktop-only, matching the original —
  // there's no hover on touch devices to show it from anyway.
  const [tooltipVisible, setTooltipVisible] = useState(false)
  // Tracks whether any graph section currently considers itself "in the
  // graph part" (not the intro/settle phase before it) — drives the
  // toggle's drop shadow. Each graph section (GraphSectionRepelAttract,
  // the merged elementary section, future ones) dispatches its own
  // 'graphSectionActive' custom event with {id, active} whenever its own
  // showPanel-equivalent state changes, rather than App.tsx trying to
  // infer this from DOM geometry — geometric intersection was fooled by
  // GraphSectionRepelAttract's own negative-margin overlap trick (its
  // wrapper deliberately overlaps the preceding intro text so its nodes
  // are visible early), which meant its bounding box was "intersecting"
  // well before showPanel ever actually turned true.
  const [isInGraphSection, setIsInGraphSection] = useState(false)
  useEffect(() => {
    const activeSections = new Set<string>()
    const handler = (e: Event) => {
      const { id, active } = (e as CustomEvent<{ id: string, active: boolean }>).detail
      if (active) activeSections.add(id)
      else activeSections.delete(id)
      setIsInGraphSection(activeSections.size > 0)
    }
    window.addEventListener('graphSectionActive', handler)
    return () => window.removeEventListener('graphSectionActive', handler)
  }, [])

  // Same pattern as graphSectionActive just above, but tracking
  // specifically whether any graph section's own "Click to go forward"
  // button is currently on screen — the persistent toggle needs to bump
  // down to avoid covering it (see the toggle's own top calculation
  // below). Each graph section with click-driven navigation
  // (GraphSectionElementary, GraphSection68, GraphSectionRepelAttract,
  // GraphSection912) dispatches 'graphForwardButtonActive' with {id,
  // active} whenever its own forward button's visibility condition
  // changes.
  const [forwardButtonVisible, setForwardButtonVisible] = useState(false)
  useEffect(() => {
    const activeButtons = new Set<string>()
    const handler = (e: Event) => {
      const { id, active } = (e as CustomEvent<{ id: string, active: boolean }>).detail
      if (active) activeButtons.add(id)
      else activeButtons.delete(id)
      setForwardButtonVisible(activeButtons.size > 0)
    }
    window.addEventListener('graphForwardButtonActive', handler)
    return () => window.removeEventListener('graphForwardButtonActive', handler)
  }, [])

  // Gates scrolling until the landing page's own assets (images + fonts)
  // are actually ready. Purely as-needed — no artificial minimum display
  // time — it just waits for the real assets/fonts, or a 5s safety-net
  // timeout regardless, so a slow/failed asset can never leave this stuck
  // on a permanent loading screen.
  const [assetsReady, setAssetsReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const imagePromises = LANDING_ASSETS.map(src => new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => resolve()
      // Resolve on error too — a missing/broken asset shouldn't hang the
      // whole page behind a permanent loading screen.
      img.onerror = () => resolve()
      img.src = src
    }))
    const fontsPromise = typeof document !== 'undefined' && document.fonts
      ? document.fonts.ready
      : Promise.resolve()
    const readyPromise = Promise.all([...imagePromises, fontsPromise])
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 5000))
    Promise.race([readyPromise, timeoutPromise]).then(() => {
      if (!cancelled) setAssetsReady(true)
    })
    return () => { cancelled = true }
  }, [])

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
  const [section03Part2AnimDone, setSection03Part2AnimDone] = useState(false)
  const [section03Part2OverlaySettled, setSection03Part2OverlaySettled] = useState(false)
  const [mode, setMode] = useState<Mode>('ses')
  // Bumped only by the Conclusion toggle's restart action — see the
  // comment on handleToggleModeAndScrollTop below for why this is kept
  // separate from `mode` itself.
  const [graphResetSignal, setGraphResetSignal] = useState(0)
  // True once Conclusion's own dot condense-then-explode reveal has
  // actually finished (see Conclusion.tsx's onRevealed prop, forwarded
  // through ArticleSection) — drives NavBar's one-time auto-reveal.
  // Replaces the old hasToggledFromConclusion, which was tied to
  // Conclusion's own bottom toggle — that toggle no longer exists now
  // that the persistent top-right toggle covers the same need from the
  // very start of the article, so the trigger moved to "reached the
  // conclusion" instead of "clicked its toggle."
  const [reachedConclusion, setReachedConclusion] = useState(false)
  // Persistent toggle reveal — permanently flips true the first time the
  // user reaches GraphSection68's race-toggle-intro pause (its step 1),
  // via ArticleSection's onRaceIntroReached. One-way: never reset back to
  // false, even if the user scrolls back up past that point afterward.
  const [toggleRevealed, setToggleRevealed] = useState(false)
  // Reported by NavBar itself (desktop only — see its own comment) so the
  // persistent toggle can be bumped down while the bar is showing, rather
  // than the two overlapping.
  const [navBarVisible, setNavBarVisible] = useState(false)
  // Each bumped independently by skipAnimationsUpTo below — separate
  // counters (not one shared signal) so each freeze-gated section can be
  // skipped INDEPENDENTLY depending on where the user actually clicked.
  // See skipAnimationsUpTo's own comment for why that distinction matters.
  const [skipSection01Signal, setSkipSection01Signal] = useState(0)
  const [skipSection02Signal, setSkipSection02Signal] = useState(0)
  const [skipSection03IntroSignal, setSkipSection03IntroSignal] = useState(0)
  const [skipSection03Part2Signal, setSkipSection03Part2Signal] = useState(0)

  // Actually prevents scrolling — not just a visual cover — through the
  // entire sequence: the loading screen, the landing page before the
  // button is clicked, the growth+curtain-drop animation, and the intro's
  // own typing. Previously there was a real gap here: nothing blocked
  // scroll at all before the button was clicked (the old scroll-driven
  // desktop growth doubled as an implicit lock; the old mobile overlay
  // doubled as one too, both now gone), so a user could scroll straight
  // past the whole landing/intro sequence without ever interacting with
  // it. overflow:hidden blocks every input method uniformly (wheel, touch,
  // keyboard) with zero drift possible, rather than the wheel-only
  // preventDefault+snapback approach used for later sections below (which
  // can still allow a small amount of drift before correcting).
  useEffect(() => {
    const locked = !assetsReady || !typingDone
    // Both html and body — in some browsers/doctypes the actual
    // scrolling element is <html>, not <body>, so locking only one can
    // still leave scrolling possible depending on which one the browser
    // treats as the real scroll container.
    document.documentElement.style.overflow = locked ? 'hidden' : ''
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [assetsReady, typingDone])

  // Supplements the overflow:hidden lock above specifically for touch
  // devices — overflow:hidden on body doesn't always fully suppress touch
  // scroll/rubber-banding on every mobile browser (a known enough quirk
  // that this codebase previously had a dedicated full-viewport overlay
  // just to capture touches for this reason). Only touchmove is
  // preventDefault'd here, not touchstart/touchend/click, so the button's
  // own tap still reaches it normally — this blocks the scroll gesture
  // specifically, not interaction in general.
  useEffect(() => {
    const blockTouchMove = (e: TouchEvent) => {
      if (!assetsReady || !typingDone) e.preventDefault()
    }
    window.addEventListener('touchmove', blockTouchMove, { passive: false })
    return () => window.removeEventListener('touchmove', blockTouchMove)
  }, [assetsReady, typingDone])

  // Same idea for mouse-wheel/trackpad scroll specifically — belt and
  // suspenders alongside the overflow:hidden lock above, in case anything
  // about the page's layout lets a wheel event slip through it.
  useEffect(() => {
    const blockWheel = (e: Event) => {
      if (!assetsReady || !typingDone) e.preventDefault()
    }
    window.addEventListener('wheel', blockWheel, { passive: false })
    return () => window.removeEventListener('wheel', blockWheel)
  }, [assetsReady, typingDone])

  // Page order, as laid out in ArticleSection.tsx — only the entries that
  // matter for this: the four nav-jumpable graph ids, and every
  // freeze-gated section that sits somewhere between them. Numbers are
  // arbitrary, only their relative order matters.
  const PAGE_ORDER: Record<string, number> = {
    section01: 0, 'graph-elementary': 1, section02: 4,
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
    // If the destination itself is a graph section, reset ONLY that one
    // back to its first step — nav-jumping there should always start
    // fresh, not resume wherever the user last left it. Scoped to just
    // this one id (not graphResetSignal, which resets every graph section
    // at once) since jumping to grades 6-8 has no business wiping out
    // progress in grades 9-12 or K-5.
    window.dispatchEvent(new CustomEvent('navResetGraphStep', { detail: { id: targetId } }))
  }

  const scrollLockPos = useRef<number | null>(null)
  const sectionLockPos = useRef<number | null>(null)
  const section03Part2LockPos = useRef<number | null>(null)
  const typingDoneRef = useRef(false)
  const sectionAnimDoneRef = useRef(false)
  const section03Part2AnimDoneRef = useRef(false)
  const curtainDroppingRef = useRef(false)
  const curtainDoneRef = useRef(false)
  const sectionOverlaySettledRef = useRef(false)
  const section03Part2OverlaySettledRef = useRef(false)
  const typingAlreadyDoneRef = useRef(false)


  useEffect(() => { typingDoneRef.current = typingDone }, [typingDone])
  useEffect(() => { sectionAnimDoneRef.current = sectionAnimDone }, [sectionAnimDone])
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

  // Previously showed the mobile-overlay div (z-index 99999, full-viewport)
  // to capture the press-and-hold gesture. That gesture is gone — a single
  // click/tap on Hero's new button triggers the intro directly now — so
  // this no longer runs. Left the overlay element itself, hideOverlay(),
  // and the listener-attaching effect above alone (harmless: an element
  // that's never shown never receives events, so there's nothing to
  // actually clean up), but if this effect still set display:'block' here,
  // it would sit on top of the entire viewport and swallow every tap meant
  // for the new button before it ever reached it.

  // Plain mode flip, no scroll/graph reset — shared by the 'R' key and the
  // nav bar's toggle. Deliberately the ONLY thing either of those does;
  // contrast with handleToggleModeAndScrollTop below, which is specific to
  // Conclusion's own bottom-of-page restart button.
  const toggleMode = () => setMode(prev => prev === 'ses' ? 'race' : 'ses')

  // R key toggles mode — gated on toggleRevealed so this isn't a secret
  // way to flip modes before the toggle has actually been introduced.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && toggleRevealed) {
        toggleMode()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggleRevealed])

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
    if (!section03Part2OverlaySettled) {
      setSection03Part2AnimDone(false)
      section03Part2OverlaySettledRef.current = false
      section03Part2LockPos.current = null
    }
  }, [section03Part2OverlaySettled])

  // desktop wheel lock only — for the LATER freeze-gated sections
  // (Section 01, Section03Part2). The intro's own lock is no longer
  // handled here at all — see the unified overflow:hidden effect above,
  // which covers it more robustly (blocks touch scroll too, not just
  // wheel, and allows zero drift rather than correcting after the fact).
  useEffect(() => {
    const handleWheel = (e: Event) => {
      if (isMobileDevice()) return
      const section1Locked = sectionOverlaySettledRef.current && !sectionAnimDoneRef.current
      const section03Part2Locked = section03Part2OverlaySettledRef.current && !section03Part2AnimDoneRef.current
      if (section1Locked || section03Part2Locked) {
        e.preventDefault()
        const target = section1Locked ? (sectionLockPos.current ?? 0)
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
      {!assetsReady && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          backgroundColor: 'var(--color-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
        }}>
          <style>{`
            @keyframes loadingDotBounce {
              0%, 80%, 100% { transform: translateY(0); }
              40% { transform: translateY(-0.55em); }
            }
          `}</style>
          {/* A tall icon sitting above shorter text pulls the block's true
              geometric center higher than where the text alone visually
              reads as "centered" — nudging the whole stack up compensates
              for that, rather than relying on plain center-alignment. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', transform: 'translateY(-11%)' }}>
            <img
              src="/favicon.svg"
              style={{
                width: 'clamp(7rem, 23vw, 12rem)',
                height: 'clamp(7rem, 23vw, 12rem)',
              }}
            />
            <span style={{
              fontFamily: "'Gaegu', cursive",
              fontSize: 'clamp(1.8rem, 6vw, 3rem)',
              color: '#111',
              display: 'flex',
            }}>
              loading
              <span style={{ display: 'inline-flex' }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      animation: 'loadingDotBounce 1s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                    }}
                  >
                    .
                  </span>
                ))}
              </span>
            </span>
          </div>
        </div>
      )}
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
        navBarVisible={navBarVisible}
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
        onRevealed={() => setReachedConclusion(true)}
        // The deliberate, designed reveal moment — see GraphSection68's
        // own race-toggle-intro pause (step 1) and its onRaceIntroReached
        // prop.
        onRaceIntroReached={() => setToggleRevealed(true)}
        // Fallback: reveals on EITHER this or onRaceIntroReached above,
        // whichever fires first — covers scrolling/jumping past
        // GraphSection68 entirely without ever reaching step 1, which
        // would otherwise leave the toggle permanently hidden.
        onGraph68Exited={() => setToggleRevealed(true)}
        graphResetSignal={graphResetSignal}
        skipSection01Signal={skipSection01Signal}
        skipSection02Signal={skipSection02Signal}
        skipSection03IntroSignal={skipSection03IntroSignal}
        skipSection03Part2Signal={skipSection03Part2Signal}
        mode={mode}
      />
      {/* Restored — now just 3 links (Grades K-5/6-8/9-12, no more split of
          K-3 vs 3-5), no toggle inside it (the persistent top-right one
          covers that from the very start now), and driven by
          reachedConclusion instead of a toggle click that no longer
          exists on Conclusion's own screen. onVisibilityChange reports
          the bar's desktop visibility back here so the persistent toggle
          can be bumped down while it's showing — see that logic below.
          Gated on curtainDone, same as the persistent toggle right below
          — NavBar.tsx's own mobile hamburger assumes it's always visible
          once mounted, relying on this gate rather than its own internal
          show/hide state for that. */}
      {curtainDone && (
        <NavBar reachedConclusion={reachedConclusion} onNavigate={skipAnimationsUpTo} onVisibilityChange={setNavBarVisible} />
      )}

      {/* Persistent top-right toggle — replaces the old "toggle only
          appears in NavBar/at Conclusion" setup. Per feedback, race mode
          should be discoverable from the very start of the actual content
          (not just at the end), which is the whole point of this being
          always visible rather than tucked into a nav bar or the
          conclusion. Visible for the entire site EXCEPT the pre-click
          landing page itself (gated on curtainDone, not on scroll
          position, so it can't get stuck hidden the way NavBar's own
          scroll-based detection could). The 'R' key hover hint is
          desktop-only, moved here verbatim from NavBar.tsx.
          
          Vertical position now accounts for two independent things that
          can each push it down, per feedback that the toggle was covering
          graph sections' own "Click to go forward" button:
          - navBarVisible (reported by NavBar itself): unchanged from
            before, bumps down to clear NavBar's own hamburger spot.
          - forwardButtonVisible (reported by whichever graph section
            currently has its forward button on screen, see the comment
            on that state above): bumps down to clear that button instead.
          When BOTH are true, the graph section's own forward/back buttons
          ALSO bump themselves down first (each section handles this
          locally, using the same navBarVisible prop passed down through
          ArticleSection) to clear NavBar, so the toggle then needs to
          clear the navbar-bumped button position, not the button's normal
          one — hence the larger BOTH_TOP value below rather than just
          summing the two independent bumps.
          
          All four numeric values here are estimates — I can't measure
          NavBar's actual height or the graph buttons' actual rendered
          height/position from here, so this needs a live pass to confirm
          nothing overlaps in any of the four combinations. */}
      {curtainDone && toggleRevealed && (
        <div
          onMouseEnter={() => !isMobile && setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          style={{
            position: 'fixed',
            top: navBarVisible
              ? (forwardButtonVisible ? '9rem' : '4.8rem')
              : (forwardButtonVisible ? '5.5rem' : '1.25rem'),
            right: '1.5rem',
            zIndex: 9000,
            backgroundColor: 'rgba(250, 249, 246, 0.82)',
            borderRadius: '18px',
            padding: isMobile ? '0.4rem 0.7rem' : '0.5rem 0.9rem',
            boxShadow: isInGraphSection ? '0 4px 14px rgba(0,0,0,0.18)' : 'none',
            // Scales THIS outer pill (background + content together) on
            // hover, matching the graph sections' forward/back buttons'
            // 1.05 scale exactly — same convention, same trigger
            // (tooltipVisible, already tracking hover here for the 'R'
            // key hint). Deliberately not on ToggleSwitch's own inner
            // content instead: that left the background pill not
            // scaling along with it, so the text visibly outgrew its own
            // background — the actual cause of "too exaggerated"/
            // mismatched, not the 1.08 value itself.
            transform: tooltipVisible ? 'scale(1.05)' : 'scale(1)',
            transition: 'box-shadow 0.3s ease, transform 0.15s ease, top 0.4s ease',
          }}
        >
          <ToggleSwitch mode={mode} onToggle={toggleMode} sesLabelColor="#111" raceLabelColor="#111" scale={isMobile ? 0.62 : 1} />
          {tooltipVisible && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: '0.6rem', backgroundColor: '#111', color: '#fff',
              padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.78rem',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              Or toggle using the 'R' key
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default App