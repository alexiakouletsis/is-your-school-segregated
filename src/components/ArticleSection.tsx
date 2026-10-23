import { useState, useEffect, useRef } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import GraphSectionElementary from './GraphSectionElementary'
import GraphExplainerIntro from './GraphExplainerIntro'
import GraphSectionRepelAttract from './GraphSectionRepelAttract'
// Section01Part2 is still out of the flow per feedback — its "Section 01:
// Elementary School" title block comes back later. Commented out (not
// deleted) so it's a one-line restore, and so the noUnusedLocals build
// check doesn't fail on the import below in the meantime.
// import Section01Part2 from './Section01Part2'
import type { Mode } from '../App'
import Section02 from './Section02'
import GraphSection68 from './GraphSection68'
import Section03Intro from './Section03Intro'
import CourseClusterSection from './CourseClusterSection'
import Section03Part2 from './Section03Part2'
import GraphSection912 from './GraphSection912'
import Conclusion from './Conclusion'

// Moved in from the now-retired ArticleIntro.tsx — per feedback, everything
// else from the old typed multi-paragraph intro is gone; this is the one
// piece that survives, now living directly at the top of Section 01 itself
// rather than in a separate component/section, specifically so there's no
// seam (no gap, no divider, no transition animation) between it and the
// section's own content. Static, small, left-aligned — not typed/animated.
// Unused for now — the citation paragraph that read these is temporarily
// cut from render below. Kept here (not deleted) for the one-line restore.
// const CITATION_BEFORE = "The "
// const CITATION_LINK = "Plural Connections Group"
// const CITATION_AFTER = " has partnered with a public school district in the Southeastern United States to collect data on 75 schools (varying from grades k-12) about classes that students share with one another. Classes can not only affect a student's academic breadth, but also the extent of their friendship networks. Let's take a look at this data in the context of "

interface Props {
  onAnimDone?: () => void
  onOverlaySettled?: (scrollY: number) => void
  onAnimReset?: () => void
  onSection03Part2AnimDone?: () => void
  onSection03Part2OverlaySettled?: (scrollY: number) => void
  onSection03Part2AnimReset?: () => void
  onToggleModeAndScrollTop?: () => void
  // Fires once Conclusion's own dot condense-then-explode reveal has
  // actually finished — see Conclusion.tsx's own onRevealed prop for the
  // full reasoning. Forwarded straight through to it; drives NavBar's
  // one-time auto-reveal in App.tsx.
  onRevealed?: () => void
  // No longer wired to anything (see App.tsx's toggleRevealed comment) —
  // GraphSectionElementary itself still calls this on exit, but App.tsx
  // doesn't act on it anymore. onRaceIntroReached below is the real
  // trigger now.
  onElementaryExited?: () => void
  // Fires once, the first time GraphSection68's race-toggle-intro pause
  // (its step 1) is reached — permanently reveals App.tsx's persistent
  // SES/race toggle.
  onRaceIntroReached?: () => void
  // Fallback for the same reveal: fires once GraphSection68 has been
  // fully scrolled past regardless of whether onRaceIntroReached ever
  // fired — covers a user scrolling/jumping past that whole section
  // without reaching step 1, which would otherwise leave the toggle
  // permanently hidden. App.tsx reveals on whichever of these two fires
  // first.
  onGraph68Exited?: () => void
  // Same callback App.tsx already passes to NavBar (skipAnimationsUpTo) —
  // reused here for Section01's own new "Click to go forward" button
  // (see PHASE 1 of the click-based-navigation conversion below), so
  // jumping straight to GraphSectionElementary properly marks Section01
  // as done first, exactly like a NavBar click already does.
  onNavigate?: (id: string) => void
  // Resets curtainDone (and everything downstream of it via Hero's own
  // existing reset effect — sequenceComplete, typingDone) back to false,
  // restoring Hero's collapsed (height:0) container back to its full
  // landing-page height. Needed specifically because scrolling to
  // window.scrollY=0 alone does NOT bring the landing page back once
  // curtainDone is true — Hero's own wrapper collapses to height:0 at
  // that point, so "the top of the page" is just empty space where Hero
  // used to be, not Hero itself.
  onGoToLanding?: () => void
  // Needed now that Section01 is a position:fixed sliding overlay rather
  // than living in normal document flow — its own visibility has to
  // respect whether the landing sequence has actually finished, not just
  // which screen (section01/elementary) is currently active.
  curtainDone?: boolean
  graphResetSignal?: number
  // Each bumped independently by App.tsx's skipAnimationsUpTo, only for
  // sections before whichever nav destination was actually clicked — see
  // that function's comment. skipSection01Signal drives this component's
  // own inline Section 01 paragraph; the rest are forwarded as-is to
  // their respective child below.
  skipSection01Signal?: number
  skipSection02Signal?: number
  skipSection03IntroSignal?: number
  skipSection03Part2Signal?: number
  mode: Mode
  forceStart?: number
  // Passed straight through to each graph section with click-driven
  // navigation (GraphSectionElementary, GraphSection68,
  // GraphSectionRepelAttract, GraphSection912 — all four now), so each
  // can bump its own "Click to go forward"/"Click to go back" buttons
  // down when NavBar is showing — see App.tsx's own toggle-position
  // comment for the full picture of why this needs to happen at both
  // levels.
  navBarVisible?: boolean
}

// Single adjustable knob for the intro block's mobile vertical centering —
// padding-based tweaks kept overshooting in both directions without being
// able to see the actual render live. Negative = nudge up, positive = nudge
// down. Adjust this one value directly if it's still off.
const MOBILE_VERTICAL_NUDGE = '0vh'

export default function ArticleSection({
  onToggleModeAndScrollTop = () => {},
  onRevealed = () => {},
  onElementaryExited = () => {},
  onRaceIntroReached = () => {},
  onGraph68Exited = () => {},
  graphResetSignal = 0,
  skipSection02Signal,
  skipSection03IntroSignal,
  skipSection03Part2Signal,
  mode,
  onSection03Part2AnimDone = () => {},
  onSection03Part2OverlaySettled = () => {},
  onSection03Part2AnimReset = () => {},
  navBarVisible = false,
  onNavigate,
  onGoToLanding,
  curtainDone = false,
}: Props) {
  const isMobile = useIsMobile()

  // --- PHASE 1 of converting the whole site from scroll-driven to
  // click/tap-driven navigation (per Alvin Chang's feedback) — this
  // covers just Landing <-> Section01 <-> GraphSectionElementary for
  // now, matching the graph sections' own established button
  // convention. NOT yet done, deliberately, as a separate follow-up:
  // the full scroll LOCK (blocking manual wheel/touch/keyboard-scroll
  // entirely) — getting that right cross-platform has proven to need
  // real live-tested iteration all session, so this ships the
  // navigation itself first, working alongside normal scroll still
  // being possible, rather than risk both being wrong at once.
  //
  // Section01 is now a position:fixed sliding overlay (screen tracks
  // which "page" is showing) rather than living in normal document
  // flow — per feedback, the goal is eventually a fully horizontal-
  // slide site, piece by piece, starting with this one transition.
  // GraphSectionElementary itself is DELIBERATELY left untouched here —
  // it still lives in normal document flow below, with its own
  // internal step navigation still relying on the page's actual scroll
  // position (a tall, sticky-positioned container). Converting THAT
  // part is a separate, later piece of this same ongoing effort; for
  // now, entering it just means jumping the page's scroll to its
  // position instantly, hidden behind this still-covering overlay,
  // then sliding the overlay away to reveal it already sitting there.
  const section01Ref = useRef<HTMLDivElement>(null)
  type Screen = 'section01' | 'elementary' | 'explainer' | 'repel-attract' | 'section02' | 'graph68' | 'section03intro' | 'coursecluster' | 'section03part2' | 'graph912' | 'conclusion'
  const [screen, setScreen] = useState<Screen>('section01')
  const SCREEN_ORDER: Record<Screen, number> = {
    section01: 0, elementary: 1, explainer: 2, 'repel-attract': 3, section02: 4, graph68: 5, section03intro: 6, coursecluster: 7, section03part2: 8, graph912: 9, conclusion: 10,
  }
  // "Has screen advanced to or past X" — generic ordinal comparison,
  // rather than each overlay's own hasPassed needing every later screen
  // name listed explicitly (which has already caused this exact bug
  // twice: an overlay's hasPassed only checked a couple of specific
  // screen values, so it went false again — snapping back to visible —
  // the moment screen advanced one step further than that hardcoded
  // list expected).
  const hasPassedScreen = (s: Screen): boolean => SCREEN_ORDER[screen as Screen] > SCREEN_ORDER[s]

  // Per-section remount counters — bumping a section's own entry here
  // forces React to fully unmount+remount it (via the key prop each is
  // given below), wiping every piece of its internal state back to
  // initial values in one guaranteed step. Used specifically for a
  // NavBar jump landing BEFORE a section: that section (and everything
  // else ahead of the jump target) should look completely untouched,
  // not just visually repositioned — resetting dozens of individual
  // state pieces (dialogue progress, wall/converge state, typing,
  // render caches) by hand across many files would be far more
  // error-prone than just remounting outright.
  const [sectionResetKeys, setSectionResetKeys] = useState<Record<Screen, number>>({
    section01: 0, elementary: 0, explainer: 0, 'repel-attract': 0, section02: 0,
    graph68: 0, section03intro: 0, coursecluster: 0, section03part2: 0, graph912: 0, conclusion: 0,
  })

  // NavBar jump — App.tsx's skipAnimationsUpTo dispatches this with the
  // screen value matching whichever of NavBar's three targets the user
  // clicked. Setting screen directly here is what makes every earlier
  // fixed overlay correctly resolve as "passed" (via the ordinal-based
  // hasPassedScreen checks above) instead of staying stuck wherever it
  // was — without this, a NavBar jump moved the page but left screen
  // unchanged, which could leave something like Section01 still sitting
  // at full visibility over whatever the user just scrolled to.
  useEffect(() => {
    // Matches each section's own established mobile-entry offset (see
    // their own normal click-through "enter" handlers elsewhere in this
    // file) — a plain scrollIntoView() from NavBar.tsx itself doesn't
    // apply any of these, hence the mismatch.
    const NAV_TARGET_ELEMENT: Record<string, { id: string; mobileOffset: number }> = {
      elementary: { id: 'graph-elementary', mobileOffset: 66 },
      graph68: { id: 'graph-68', mobileOffset: 65 },
      graph912: { id: 'graph-912', mobileOffset: 65 },
    }
    const handler = (e: Event) => {
      const target = (e as CustomEvent<{ screen: string }>).detail?.screen
      if (!target || !(target in SCREEN_ORDER)) return
      const targetOrder = SCREEN_ORDER[target as Screen]
      overlaySlideProgress.set(targetOrder > SCREEN_ORDER['repel-attract'] ? 1 : 0)
      waveProgress.set(targetOrder > SCREEN_ORDER.section02 ? 1 : 0)
      setScreen(target as Screen)
      setSectionResetKeys(prev => {
        const next = { ...prev }
        ;(Object.keys(SCREEN_ORDER) as Screen[]).forEach(s => {
          if (SCREEN_ORDER[s] > targetOrder) next[s] = prev[s] + 1
        })
        return next
      })
      const entry = NAV_TARGET_ELEMENT[target]
      if (entry) {
        const el = document.getElementById(entry.id)
        if (el) {
          const scrollTarget = window.scrollY + el.getBoundingClientRect().top + (isMobile ? entry.mobileOffset : 0)
          window.scrollTo({ top: scrollTarget, behavior: 'auto' })
        }
      }
    }
    window.addEventListener('navBarJumpToScreen', handler)
    return () => window.removeEventListener('navBarJumpToScreen', handler)
  }, [])
  // Shared between GraphExplainerIntro and GraphSectionRepelAttract (both
  // read this same instance directly, via props) for the pass-into-
  // Section02 overlay slide, and between here and Section02 for the wave
  // progress. Previously each had its own separate motion value, synced
  // via dispatched CustomEvents — even with both ends using motion
  // values, that event round-trip still had enough latency to be
  // visible as the two overlays swiping away one after another instead
  // of together ("blank screen" in between). Lifting a single shared
  // value up here and having everything read it directly removes that
  // round-trip entirely.
  const overlaySlideProgress = useMotionValue(0)
  const waveProgress = useMotionValue(0)
  // Per feedback, Section01 should just BE there instantly once the
  // curtain falls, not visibly slide in — sliding is only for the
  // section01<->elementary transition afterward. Tracks whether
  // curtainDone has ever been true yet; the CSS transition below is
  // skipped entirely until it has, so the very first landing->section01
  // reveal is instant, and every screen change after that animates.
  //
  // Explicitly reset back to false whenever curtainDone goes false again
  // (the user went back to the landing page) — without this, going back
  // to landing and forward into Section01 a SECOND time showed it
  // sliding in instead of the instant reveal the first time correctly
  // had, since this stayed true from that first visit and was never
  // reset.
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false)
  useEffect(() => {
    setHasEnteredOnce(curtainDone)
  }, [curtainDone])
  const [section01BackHovered, setSection01BackHovered] = useState(false)
  const [section01ForwardHovered, setSection01ForwardHovered] = useState(false)

  const section01GoBack = () => {
    onGoToLanding?.()
    setScreen('section01')
  }
  const section01GoForward = () => {
    onNavigate?.('graph-elementary')
    const el = document.getElementById('graph-elementary')
    if (!el) return
    // Instant (not smooth) now, on both platforms — this jump happens
    // hidden behind the still-covering Section01 overlay, which is what
    // actually animates (sliding away) to reveal it; the page's own
    // scroll position doesn't need to visibly animate anymore. Mobile
    // still gets its own +76px overshoot on top (accidentally dropped
    // when this function was rewritten for the slide-overlay approach —
    // that value was tuned/confirmed correct earlier this same session
    // and is unrelated to smooth vs instant scrolling).
    const target = window.scrollY + el.getBoundingClientRect().top + (isMobile ? 66 : 0)
    window.scrollTo({ top: target, behavior: 'auto' })
    // Directly triggers GraphSectionElementary's dialogue on both
    // platforms now — an instant jump (rather than the smooth scroll
    // this used to be) can't be relied on to naturally satisfy either
    // platform's own scroll-position-based entry detection, so this
    // bypasses that inference entirely: this button knows for certain
    // the user is intentionally entering this section.
    window.dispatchEvent(new CustomEvent('triggerElementaryDialogue'))
    setScreen('elementary')
  }

  // Left/right arrow keys mirror the two new buttons below, same
  // convention as every graph section's own arrow-key handling —
  // desktop only, and only while Section01 is actually the screen
  // showing (screen==='section01' AND the landing sequence has
  // actually finished — curtainDone).
  useEffect(() => {
    if (isMobile || screen !== 'section01' || !curtainDone) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') section01GoBack()
      else if (e.key === 'ArrowRight') section01GoForward()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, screen, curtainDone])

  // GraphSectionElementary's own step-0 "go back" (button, tap, or arrow
  // key) dispatches this instead of scrollIntoView-ing to section01
  // directly — that stopped making sense once Section01 became
  // position:fixed (a fixed element has no meaningful scroll position to
  // scroll TO). This just slides the overlay back in instead.
  useEffect(() => {
    const handler = () => setScreen('section01')
    window.addEventListener('exitElementaryToSection01', handler)
    return () => window.removeEventListener('exitElementaryToSection01', handler)
  }, [])

  // GraphSectionElementary's own LAST step "go forward" dispatches this
  // to bring in GraphExplainerIntro's own new sliding overlay — the
  // reverse (GraphExplainerIntro's own "go back" button) dispatches
  // 'exitExplainerToElementary' to slide it back out. Unlike Section01's
  // own overlay, there's no scroll-jump needed here at all: Elementary
  // itself is never touched (still normal document flow, still wherever
  // it already was), this new overlay just slides in to cover it and
  // back out to reveal it again — simpler than Section01's case, which
  // needed to jump to a DIFFERENT scroll position first.
  useEffect(() => {
    const enter = () => setScreen('explainer')
    const exit = () => setScreen('elementary')
    window.addEventListener('enterExplainerFromElementary', enter)
    window.addEventListener('exitExplainerToElementary', exit)
    return () => {
      window.removeEventListener('enterExplainerFromElementary', enter)
      window.removeEventListener('exitExplainerToElementary', exit)
    }
  }, [])

  // Same pattern for GraphSectionRepelAttract's own new overlay — slides
  // in over GraphExplainerIntro (which stays in place underneath, same
  // as Elementary staying in place underneath Explainer), and back out
  // to reveal it again.
  useEffect(() => {
    const enter = () => setScreen('repel-attract')
    const exit = () => setScreen('explainer')
    window.addEventListener('enterRepelAttractFromExplainer', enter)
    window.addEventListener('exitRepelAttractToExplainer', exit)
    return () => {
      window.removeEventListener('enterRepelAttractFromExplainer', enter)
      window.removeEventListener('exitRepelAttractToExplainer', exit)
    }
  }, [])

  // GraphSectionRepelAttract's own "go forward" at the attract phase
  // dispatches this to move into Section02 — which, unlike Explainer/
  // RepelAttract, stays in normal document flow rather than being its
  // own overlay. Needed because just scrolling the page (RepelAttract's
  // OLD behavior here) did nothing: RepelAttract is position:fixed now,
  // so it stays covering the whole viewport regardless of scroll
  // position, and isActive never becomes false just because the page
  // scrolled underneath it — the "attract phase just stays on screen,
  // scrolling forever" bug. Same fix as Section01's own forward button:
  // jump the scroll instantly (hidden behind RepelAttract, which is
  // still fully covering the screen at that moment), then update screen
  // so RepelAttract (and Explainer, which stays passed alongside it) can
  // actually tell they've been passed and slide away to reveal Section02
  // already sitting in position underneath.
  useEffect(() => {
    const handler = () => {
      // Section02's own "node wave" animation is driven directly by the
      // shared waveProgress motion value above (see Section02's own
      // applyProgress) — per feedback, keeping the horizontal slide but
      // having the wave play IN STEP with it, rather than the wave
      // playing via a separate scroll animation alongside (or instead
      // of) the slide. Both animations (overlay slide, wave) are
      // triggered directly from here now, rather than from within
      // GraphSectionRepelAttract itself — since both consuming
      // components read these same shared motion value instances
      // directly (passed as props), there's no longer any need for that
      // component to own or dispatch anything itself.
      //
      // Section02 became a position:fixed overlay in the last round and
      // no longer participates in page scroll at all (fully driven by
      // waveProgress/isActive/hasPassed instead) — so unlike before,
      // there's no scroll jump needed here anymore. Keeping one around
      // was actively harmful: measuring el.firstElementChild's own
      // height now measures Section02's OWN fixed wrapper (~100vh), not
      // its inner 300vh container, making the computed target land very
      // close to wherever GraphSection68 also begins in the page's
      // layout (everything between them has collapsed to zero height as
      // fixed overlays) — which is exactly what caused GraphSection68 to
      // become visible behind the wave.
      setScreen('section02')
      // Both animations start at the exact same moment now — the
      // previous 220ms delay before the wave meant the overlay (0.3s)
      // finished completely BEFORE the wave even began, revealing a
      // static, dot-less Section02 first and only then starting the
      // wave on top of that already-blank screen. Per feedback that
      // read as two separate, sequential swipes rather than one
      // continuous motion. Starting together means the wave's own dots
      // are already sweeping in while the overlay is still sliding away,
      // so there's no blank gap between the two.
      animate(overlaySlideProgress, 1, { duration: 0.42, ease: [0.65, 0, 0.35, 1] })
      waveProgress.set(0)
      animate(waveProgress, 1, { duration: 1.8, ease: 'easeInOut' })
    }
    window.addEventListener('enterSection02FromRepelAttract', handler)
    return () => window.removeEventListener('enterSection02FromRepelAttract', handler)
  }, [])

  // Section02's own back button — goes back to GraphSectionRepelAttract
  // (a proper reverse of the wave animation itself is separate, further
  // scope; this just sets screen back, which naturally reverses both
  // overlays' own transforms). Also resets overlaySlideProgress and
  // waveProgress back to 0 — these were never reset going backward
  // before, only ever animated forward once when first entering
  // Section02. Left at 1 (their "done" value), a SECOND forward trip
  // through this same transition later wouldn't actually animate at all
  // (animate() has nothing to do if the value's already at its target),
  // which is very likely what was behind the instant/broken-feeling
  // transitions reported specifically after having gone all the way to
  // GraphSection68 once already and then navigating back.
  useEffect(() => {
    const handler = () => {
      overlaySlideProgress.set(0)
      waveProgress.set(0)
      // Explicitly moves the actual page scroll position back toward the
      // top too — none of section01/elementary/explainer/repel-attract
      // need real scroll position for their own visuals (all
      // position:fixed), but GraphSection68 still does for some of its
      // own internal detection. Leaving scroll position stuck near
      // GraphSection68 (wherever it was last jumped to) while screen
      // says the user is on an earlier section could leave that
      // detection thinking it's still active when it shouldn't be.
      window.scrollTo({ top: 0, behavior: 'auto' })
      setScreen('repel-attract')
    }
    window.addEventListener('exitSection02ToRepelAttract', handler)
    return () => window.removeEventListener('exitSection02ToRepelAttract', handler)
  }, [])

  // Section02 <-> GraphSection68 — same overlay-slide pattern as
  // Section01<->GraphSectionElementary: Section02 is the overlay (it
  // slides away to reveal GraphSection68, which stays in normal document
  // flow, completely untouched, same as GraphSectionElementary was).
  // Jump the scroll instantly (hidden behind Section02, which is still
  // fully covering the screen at that moment), then update screen so
  // Section02 can slide away.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('graph-68')
      if (el) {
        // Mobile-specific negative offset — per feedback this was
        // landing too low (needed scrolling up to bring fully into
        // view) compared to GraphSectionElementary's own entry, same
        // class of overshoot tuning as Section01->Elementary earlier
        // this session. Starting estimate, not a measurement.
        const target = window.scrollY + el.getBoundingClientRect().top + (isMobile ? 65 : 0)
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('graph68')
    }
    const exit = () => {
      const el = document.getElementById('section02')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('section02')
    }
    window.addEventListener('enterGraph68FromSection02', enter)
    window.addEventListener('exitGraph68ToSection02', exit)
    return () => {
      window.removeEventListener('enterGraph68FromSection02', enter)
      window.removeEventListener('exitGraph68ToSection02', exit)
    }
  }, [])

  // GraphSection68 <-> Section03Intro — same instant-scroll-jump pattern.
  // Entering also directly triggers Section03Intro's own wall-opening
  // animation (triggerSection03Wall), same reasoning as the dialogue/
  // wave triggers elsewhere: this button knows for certain the user is
  // entering, so it doesn't need to wait on scroll-based inference (or a
  // tap) to start playing.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('section03-intro')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('section03intro')
      window.dispatchEvent(new CustomEvent('triggerSection03Wall'))
    }
    const exit = () => {
      const el = document.getElementById('graph-68')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top + (isMobile ? 65 : 0)
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('graph68')
    }
    window.addEventListener('enterSection03FromGraph68', enter)
    window.addEventListener('exitSection03ToGraph68', exit)
    return () => {
      window.removeEventListener('enterSection03FromGraph68', enter)
      window.removeEventListener('exitSection03ToGraph68', exit)
    }
  }, [])

  // Section03Intro <-> CourseClusterSection — same instant-scroll-jump
  // pattern. Entering also directly triggers CourseClusterSection's own
  // bar-reveal animation (triggerCourseClusterReveal), same reasoning as
  // every other direct-trigger used elsewhere in this conversion.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('course-cluster')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('coursecluster')
      window.dispatchEvent(new CustomEvent('triggerCourseClusterReveal'))
    }
    const exit = () => {
      const el = document.getElementById('section03-intro')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('section03intro')
    }
    window.addEventListener('enterCourseClusterFromSection03', enter)
    window.addEventListener('exitCourseClusterToSection03', exit)
    return () => {
      window.removeEventListener('enterCourseClusterFromSection03', enter)
      window.removeEventListener('exitCourseClusterToSection03', exit)
    }
  }, [])

  // CourseClusterSection <-> Section03Part2 — same instant-scroll-jump
  // pattern, with the text-reveal triggered directly on entry.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('section03-part2')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('section03part2')
      window.dispatchEvent(new CustomEvent('triggerSection03Part2Reveal'))
    }
    const exit = () => {
      const el = document.getElementById('course-cluster')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('coursecluster')
    }
    window.addEventListener('enterSection03Part2FromCourseCluster', enter)
    window.addEventListener('exitSection03Part2ToCourseCluster', exit)
    return () => {
      window.removeEventListener('enterSection03Part2FromCourseCluster', enter)
      window.removeEventListener('exitSection03Part2ToCourseCluster', exit)
    }
  }, [])

  // Section03Part2 <-> GraphSection912 — same instant-scroll-jump
  // pattern, with entry detection triggered directly.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('graph-912')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top + (isMobile ? 65 : 0)
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('graph912')
      window.dispatchEvent(new CustomEvent('triggerGraph912Entry'))
    }
    const exit = () => {
      const el = document.getElementById('section03-part2')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('section03part2')
    }
    window.addEventListener('enterGraph912FromSection03Part2', enter)
    window.addEventListener('exitGraph912ToSection03Part2', exit)
    return () => {
      window.removeEventListener('enterGraph912FromSection03Part2', enter)
      window.removeEventListener('exitGraph912ToSection03Part2', exit)
    }
  }, [])

  // GraphSection912 <-> Conclusion — entering jumps to the top of the
  // conclusion container and triggers the programmatic converge
  // animation directly. Exiting just needs to land back on
  // GraphSection912 — Conclusion's own goBackPart already handles
  // scrolling back to its own top and resetting its content before
  // dispatching this exit event.
  useEffect(() => {
    const enter = () => {
      const el = document.getElementById('conclusion')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('conclusion')
      window.dispatchEvent(new CustomEvent('triggerConclusionConverge'))
    }
    const exit = () => {
      const el = document.getElementById('graph-912')
      if (el) {
        const target = window.scrollY + el.getBoundingClientRect().top
        window.scrollTo({ top: target, behavior: 'auto' })
      }
      setScreen('graph912')
    }
    window.addEventListener('enterConclusionFromGraph912', enter)
    window.addEventListener('exitConclusionToGraph912', exit)
    return () => {
      window.removeEventListener('enterConclusionFromGraph912', enter)
      window.removeEventListener('exitConclusionToGraph912', exit)
    }
  }, [])


  return (
    <div data-section="01" style={{ position: 'relative' }}>
      {/* spark.svg removed — it was positioned next to the toggle, which
          isn't shown yet at this point in the article. Bring it back
          alongside the toggle's own reintroduction later. */}

      {/* Now position:fixed (a sliding overlay) rather than normal flow —
          three transform states: off-screen right (landing sequence
          hasn't finished yet, curtainDone false), visible/centered
          (screen==='section01'), or slid away left (screen===
          'elementary', revealing GraphSectionElementary — which stays in
          normal document flow below, already scrolled into position
          underneath by the time this slides away — see
          section01GoForward's own comment for why). */}
      <div ref={section01Ref} id="section01" style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        backgroundColor: 'var(--color-bg, #faf9f6)',
        transform: !curtainDone ? 'translateX(100%)' : screen !== 'section01' ? 'translateX(-100%)' : 'translateX(0)',
        transition: hasEnteredOnce ? 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isMobile ? 'center' : 'flex-start',
        gap: isMobile ? '0.75rem' : '3rem',
        paddingTop: isMobile ? 0 : '16vh',
        paddingBottom: isMobile ? 0 : '1.5rem',
        overflowY: 'auto',
      }}>
        {/* New click-based nav buttons (Phase 1) — same exact styling
            convention as every graph section's own bottom-corner
            buttons, so the transition into GraphSectionElementary's own
            matching buttons below reads as continuous. Gated on the
            landing sequence having finished (curtainDone) — this whole
            block is fixed/always mounted now, so without this gate these
            buttons would show even while still on the landing page. */}
        {!isMobile && curtainDone && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); section01GoBack() }}
            onMouseEnter={() => setSection01BackHovered(true)}
            onMouseLeave={() => setSection01BackHovered(false)}
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed', bottom: '1.5rem', left: '1rem', zIndex: 5,
              fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
              backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            ← Click to go back
            {section01BackHovered && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: '0.45rem', backgroundColor: '#111', color: '#fff',
                padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem',
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9500,
              }}>
                Or use the left arrow key
              </div>
            )}
          </motion.div>
        )}
        {!isMobile && curtainDone && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); section01GoForward() }}
            onMouseEnter={() => setSection01ForwardHovered(true)}
            onMouseLeave={() => setSection01ForwardHovered(false)}
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed', bottom: '1.5rem', right: '1rem', zIndex: 5,
              fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
              backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            Click to go forward →
            {section01ForwardHovered && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: '0.45rem', backgroundColor: '#111', color: '#fff',
                padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem',
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9500,
              }}>
                Or use the right arrow key
              </div>
            )}
          </motion.div>
        )}
        {/* Mobile: matches GraphSectionElementary's own exact convention
            instead of separate clickable buttons — a full-section tap
            handler (left half = back, right half = forward) with
            non-interactive hint pills at the top corners, rather than
            two small buttons the user has to aim for specifically. Also
            gated on curtainDone, same reasoning as the desktop
            buttons above. Hero is explicitly excluded from this
            tap-anywhere behavior — its own circular button is the only
            way to advance from there, unchanged. */}
        {isMobile && curtainDone && (
          <div
            onClick={(e) => {
              const rect = section01Ref.current?.getBoundingClientRect()
              if (!rect) return
              const isRightHalf = e.clientX - rect.left > rect.width / 2
              if (isRightHalf) section01GoForward()
              else section01GoBack()
            }}
            style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'pointer' }}
          >
            <div style={{
              position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
              backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
            }}>
              ← Tap to go back
            </div>
            <div style={{
              position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
              backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
            }}>
              Tap to go forward →
            </div>
          </div>
        )}
        {/* Citation paragraph + toggle-instruction row removed for now per
            feedback — the intro should lead with "Take these two..."
            first. Both the Plural Connections Group citation and the
            toggle-instruction line come back later, once the toggle
            itself is reintroduced (see App.tsx's toggleRevealed). Not
            deleted, just cut from render — CITATION_BEFORE/LINK/AFTER
            constants above are temporarily unused as a result. */}

        {/* Static SES/race intro line — same wording/coloring convention as
            the rest of the site (higher-SES/lower-SES, white/asian/student
            of color), just a plain paragraph now rather than typed.
            min-height reserves room for whichever mode's text is longer
            (mobile specifically — race mode wraps to one fewer line than
            SES mode there) so switching modes doesn't change this block's
            own height, which otherwise shifted GraphSectionRepelAttract's
            overlap position below it, and with it the node SVGs. */}
        {/* Paragraph + dots grouped together so mobile vertical centering
            can be nudged with one transform instead of fighting over
            padding (padding-based tweaks kept overshooting in both
            directions without being able to see the actual render).
            MOBILE_VERTICAL_NUDGE below is the one knob to adjust —
            negative moves the group up, positive moves it down. */}
        <div style={{ transform: isMobile ? `translateY(${MOBILE_VERTICAL_NUDGE})` : undefined }}>
        <div style={{
          padding: '0 1.5rem',
          maxWidth: isMobile ? '100%' : '940px',
          margin: isMobile ? '0.5rem auto 0 auto' : '0 auto 0 auto',
          textAlign: 'center',
          minHeight: isMobile ? '9.5em' : undefined,
        }}>
          {/* Title — same styling convention as Section01Part2's own
              title (before that file was taken out of the flow), just
              living here now instead. Margin-bottom matches Section02's
              own title-to-body gap (2.5rem), per feedback to keep this
              section's spacing consistent with that one. */}
          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: isMobile ? 'clamp(1.8rem, 7vw, 2.8rem)' : 'clamp(2rem, 5vw, 4rem)',
            color: '#111', fontWeight: 400, textAlign: 'center', margin: '0 0 2.5rem 0',
          }}>
            Section 01: Elementary School
          </h2>
          {/* Font size and maxWidth now match Section02's own body
              paragraph exactly, per feedback. */}
          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
            color: '#111', lineHeight: 1.9, maxWidth: '940px', margin: '0 auto',
          }}>
            {mode === 'ses' ? (
              <>
                Take these two students entering kindergarten. One of them comes from a{' '}
                <span style={{ color: 'var(--color-high-ses)' }}>higher-socioeconomic status (SES)</span> family, and the other from a{' '}
                <span style={{ color: 'var(--color-low-ses)' }}>lower-SES</span> family. Right now, they're just two little kindergarteners about to enter the world. Let's observe how societal systems influence their classes and shape their interactions throughout their lives, starting with <strong>elementary school</strong>.
              </>
            ) : (
              <>
                Take these two students entering kindergarten. One of them is a{' '}
                <span style={{ color: 'var(--color-race-1)' }}>white/asian student</span>, and the other is a{' '}
                <span style={{ color: 'var(--color-race-2)' }}>student of color</span>. Right now, they're just two little kindergarteners about to enter the world. Let's observe how societal systems influence their classes and shape their interactions throughout their lives, starting with <strong>elementary school</strong>.
              </>
            )}
          </p>
        </div>

        {/* The two protagonist face SVGs, static below the paragraph —
            same K3-size assets used by GraphSectionElementary's own
            single-kindergarten-class step, just a plain bobbing pair
            here, centered across the full width. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: isMobile ? '3rem' : '6rem',
          width: '100%', maxWidth: '940px', margin: isMobile ? '3rem auto 0 auto' : '5.5rem auto 0 auto',
        }}>
          <img src={mode === 'race' ? '/assets/whiteasian-dot-K3.svg' : '/assets/high-SES-dot-K3.svg'} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 12vw, 160px)',
            height: 'auto', animation: 'bob 2s ease-in-out infinite',
          }} />
          <img src={mode === 'race' ? '/assets/poc-dot-K3.svg' : '/assets/low-SES-dot-K3.svg'} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 12vw, 160px)',
            height: 'auto', animation: 'bob 2s ease-in-out infinite', animationDelay: '0.4s',
          }} />
        </div>
        </div>

        {/* bigarrow removed per feedback — not needed here. */}
      </div>

      {/* Section01Part2 removed for now — its "Section 01: Elementary
          School" title/intro text block comes back later. */}
      {/* <Section01Part2 mode={mode} /> */}

      <GraphSectionElementary key={`elementary-${sectionResetKeys.elementary}`} mode={mode} resetSignal={graphResetSignal} onExited={onElementaryExited} isActiveScreen={screen === 'elementary'} />

      {/* Simple title-only breather, then back into GraphSectionRepelAttract. */}
      <GraphExplainerIntro
        isActive={screen === 'explainer' || screen === 'repel-attract'}
        hasPassed={hasPassedScreen('repel-attract')}
        overlaySlideProgress={overlaySlideProgress}
        isActiveScreen={screen === 'explainer'}
      />
      <GraphSectionRepelAttract
        key={`repel-attract-${sectionResetKeys['repel-attract']}`}
        mode={mode}
        isActive={screen === 'repel-attract'}
        hasPassed={hasPassedScreen('repel-attract')}
        overlaySlideProgress={overlaySlideProgress}
      />

      <div id="section02">
        <Section02
          mode={mode}
          skipSignal={skipSection02Signal}
          waveProgress={waveProgress}
          hasPassed={hasPassedScreen('section02')}
          notYetRelevant={screen === 'section01' || screen === 'elementary' || screen === 'explainer'}
          isActive={screen === 'section02'}
        />
      </div>
      <GraphSection68 key={`graph68-${sectionResetKeys.graph68}`} mode={mode} resetSignal={graphResetSignal} onRaceIntroReached={onRaceIntroReached} navBarVisible={navBarVisible} onExited={onGraph68Exited} isActiveScreen={screen === 'graph68'} />
      <Section03Intro key={`section03intro-${sectionResetKeys.section03intro}`} mode={mode} skipSignal={skipSection03IntroSignal} isActiveScreen={screen === 'section03intro'} passedForward={hasPassedScreen('section03intro')} />
      <CourseClusterSection key={`coursecluster-${sectionResetKeys.coursecluster}`} mode={mode} isActiveScreen={screen === 'coursecluster'} passedForward={hasPassedScreen('coursecluster')} />
      <Section03Part2
        key={`section03part2-${sectionResetKeys.section03part2}`}
        onAnimDone={onSection03Part2AnimDone}
        onOverlaySettled={onSection03Part2OverlaySettled}
        onAnimReset={onSection03Part2AnimReset}
        skipSignal={skipSection03Part2Signal}
        mode={mode}
        isActiveScreen={screen === 'section03part2'}
        passedForward={hasPassedScreen('section03part2')}
      />
      <GraphSection912 key={`graph912-${sectionResetKeys.graph912}`} mode={mode} resetSignal={graphResetSignal} isActiveScreen={screen === 'graph912'} passedForward={hasPassedScreen('graph912')} />
      <Conclusion
        key={`conclusion-${sectionResetKeys.conclusion}`}
        mode={mode}
        onToggleModeAndScrollTop={onToggleModeAndScrollTop}
        onRevealed={onRevealed}
        isActiveScreen={screen === 'conclusion'}
      />
    </div>
  )
}