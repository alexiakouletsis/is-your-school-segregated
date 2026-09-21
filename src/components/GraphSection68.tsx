import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence, useScroll, useMotionValue } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import NodeStats from './NodeStats'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import {
  PROTAGONIST_HIGH, getProtagonistLow, getEdgeColor,
  isProtagonist, getNodeColor, getFaceSrc, applyHoverHighlight, getTooltipHtml,
} from './graphUtils'

// White faux-border behind protagonist face svgs, matching
// GraphSectionElementary's convention — a solid circle rendered behind
// each protagonist's face image, since <image> elements can't take a
// stroke directly. Face sizes themselves are untouched.
const BORDER_RATIO = 0.51

const DIALOGUE = [
  { node: 'high', text: "I hope we'll still have the same teachers!", delay: 0 },
  { node: 'low', text: "Promise we'll still be friends even if we don't?", delay: 1150 },
  { node: 'high', text: "Promise!", delay: 2300 },
]

// Step 0 is the dialogue phase. Step 1 is the new race-toggle-intro pause
// (text-only, formatted like GraphSectionElementary's own pause phase —
// no graph data needed, same as step 0). Step 2 is the existing generic/
// district-wide 6th grade data (continues the original two protagonists).
// Steps 3-5 are the de-identified comparison school's 6th/7th/8th grade
// data. Every numeric currentStep comparison below that used to reference
// old step 1 (tracking) or 2-4 (alt-school) is shifted up by one to make
// room for this new step 1.
const STEPS = [
  { label: '' },
  { label: '' },
  { label: 'All students in grade 6.' },
  { label: 'All students in an alternative 6th grade.' },
  { label: 'All students in an alternative 7th grade.' },
  { label: 'All students in an alternative 8th grade.' },
]

// Race-toggle-intro pause (step 1) — two paragraphs, same visual
// convention as GraphSectionElementary's own text-only step (blurred
// backdrop, centered text, no bolding/coloring requested for this one).
const RACE_INTRO_PARA1_BEFORE = "Before jumping into the middle school graphs, let's talk about "
const RACE_INTRO_PARA1_AFTER = " — the original and most persistent driver of school segregation in America, and one that's deeply intertwined with the socioeconomic patterns we've traced so far."
const RACE_INTRO_PARA2_MID = " and "
const RACE_INTRO_PARA2_AFTER = " rarely move independently of each other; the two forms of segregation tend to follow strikingly similar patterns. From here on, use the toggle above to see these same patterns through the lens of race."

// The persistent explanatory sentence shown once entering step 2.
const TRACKING_LOW_TEXT = "This is what a middle school with minimal course tracking/segregation looks like."

// Steps 3-5 share a common prefix ("And this is what ") that's typed once
// and then stays on screen unchanged. Only the suffix differs per grade —
// when moving between steps 3/4/5, the suffix crossfades (fades out/in)
// instead of retyping, since the prefix is already sitting there.
const ALT_TEXT_PREFIX = "And this is what "
const ALT_TEXT_SUFFIX_DESKTOP: Record<number, string> = {
  3: "6th grade looks like at a school with high course tracking/ segregation rates.",
  4: "7th grade looks like at that middle school.",
  5: "8th grade looks like at that middle school.",
}
const ALT_TEXT_SUFFIX_MOBILE: Record<number, string> = {
  3: "6th grade looks like at a school with high course tracking/segregation rates.",
  4: "7th grade looks like at that middle school.",
  5: "8th grade looks like at that middle school.",
}

const getNoticeTarget = (step: number) => {
  if (step === 2) return TRACKING_LOW_TEXT
  return ''
}

// Representative composite students for the comparison school — NOT the
// same real individuals tracked across all three grades. Checked the raw
// data: the 6th/7th/8th grade files are three separate real cohorts at this
// school (no student ids overlap across the three files at all), so unlike
// the original two-dot story, there's no single real student to literally
// follow through 6th-8th here. These ids (0 = higher-SES/white-asian,
// 1 = lower-SES/student-of-color) were deliberately picked and remapped to
// the same fixed numbers in each of alt-6/7/8.json specifically so the
// component can keep highlighting "the same two dots" visually across
// steps, understanding they represent a different real student in each
// grade's cohort.
const ALT_PROTAGONIST_HIGH = 0
const ALT_PROTAGONIST_LOW = 1

// Deliberately NOT reusing graphUtils' isProtagonist/getNodeColor/getFaceSrc
// for the alt-school steps — those are hardcoded to the original dataset's
// PROTAGONIST_HIGH/getProtagonistLow constants, and if the alt-school
// dataset happens to reuse those same numeric ids for unrelated students
// (plausible if ids are re-indexed per file), reusing the shared helpers
// would highlight the wrong students as protagonists there. These local
// versions only ever check against the ALT_PROTAGONIST_* constants above.
const isAltProtagonist = (id: number) => id === ALT_PROTAGONIST_HIGH || id === ALT_PROTAGONIST_LOW
const getAltNodeColor = (d: Node, mode: Mode): string => {
  if (d.id === ALT_PROTAGONIST_HIGH) return mode === 'race' ? '#FF9260' : '#FF8BDE'
  if (d.id === ALT_PROTAGONIST_LOW) return mode === 'race' ? '#8BA4FF' : '#22D880'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF9260' : '#8BA4FF'
  return d.ses === 'higher' ? '#FF8BDE' : '#22D880'
}
// Sadder face variants for the alt-school steps, to visually underscore
// the "this is what it looks like when tracking is bad" framing.
const getAltFaceSrc = (d: Node, mode: Mode): string => {
  if (mode === 'race') {
    return d.id === ALT_PROTAGONIST_HIGH ? '/assets/whiteasian-dot-68-sad.svg' : '/assets/poc-dot-68-sad.svg'
  }
  return d.id === ALT_PROTAGONIST_HIGH ? '/assets/high-SES-dot-68-sad.svg' : '/assets/low-SES-dot-68-sad.svg'
}

// Gephi's rendering colors each edge by its source node's group, which is
// most of why the pink/green boundary reads so clearly there — a flat grey
// edge color (used elsewhere in this app) throws that signal away entirely.
// Alt-school-only; step 1's edges stay grey/unchanged.
const getAltEdgeColor = (d: Edge, mode: Mode): string => {
  const src = d.source as unknown as Node
  if (mode === 'race') return src.race_ethnicity === 'white_asian' ? '#FF9260' : '#8BA4FF'
  return src.ses === 'higher' ? '#FF8BDE' : '#22D880'
}

// Alt-school steps now use the same full link+charge+collision physics as
// the non-alt sections (see the main effect below) rather than a lighter
// "pull toward baked position" model — the tradeoff for the same
// responsive, jostling feel is sampling down the node/edge count instead,
// since the full 300+ node / thousands-of-edge dataset is too heavy for
// real structural physics (that combination is what caused the original
// freeze). Stratified by SES so the sampled subset's visual proportions
// still roughly match reality — NodeStats itself always reports the TRUE
// full-population percentages regardless (see activeNodesRef.current
// below), only the rendered/simulated nodes are capped, not what's
// reported in the stats.
// Per-grade cap — alt-6 (343 real students, the most of the three) was the
// one that got slightly glitchy with no cap at all; alt-7 (296) and alt-8
// (310) were fine fully uncapped, so only alt-6 gets pulled back down.
// Keyed by currentStep (3 = alt-6, 4 = alt-7, 5 = alt-8).
const ALT_NODE_SAMPLE_CAP: Record<number, number> = {
  3: 300,
  4: 400,
  5: 400,
}
function sampleAltNodes(nodes: Node[], cap: number): Node[] {
  if (nodes.length <= cap) return nodes
  const protagonists = nodes.filter(n => isAltProtagonist(n.id))
  const rest = nodes.filter(n => !isAltProtagonist(n.id))
  const groups = new Map<string, Node[]>()
  rest.forEach(n => {
    const key = n.ses
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  })
  const remainingCap = Math.max(0, cap - protagonists.length)
  const ratio = rest.length > 0 ? remainingCap / rest.length : 0
  const sampled: Node[] = [...protagonists]
  groups.forEach(group => {
    const shuffled = [...group].sort(() => Math.random() - 0.5)
    const take = Math.round(group.length * ratio)
    sampled.push(...shuffled.slice(0, take))
  })
  return sampled
}

export default function GraphSection68({ mode, resetSignal, onRaceIntroReached, navBarVisible, onExited }: {
  mode: Mode
  resetSignal?: number
  onRaceIntroReached?: () => void
  // Reported by NavBar itself, threaded down through App.tsx ->
  // ArticleSection. Bumps this section's own "Click to go back"/"Click to
  // go forward" buttons down to clear NavBar, matching the persistent
  // toggle's own equivalent bump — see App.tsx's toggle-position comment.
  navBarVisible?: boolean
  // Fallback for the persistent toggle's reveal: fires once this section
  // has been fully scrolled past (exitProgress reaching 1), regardless of
  // whether the race-intro pause (step 1) was actually reached — a user
  // scrolling fast enough, or jumping via NavBar, could otherwise blow
  // past this whole section without ever triggering onRaceIntroReached,
  // leaving the toggle permanently hidden. App.tsx reveals the toggle on
  // EITHER this or onRaceIntroReached, whichever fires first.
  onExited?: () => void
}) {
  // [generic 6th grade, alt-school 6th, alt-school 7th, alt-school 8th]
  // alt-6/7/8.json generated from the comparison school's real course-
  // sharing data (converted from the .gml files, protagonist ids remapped
  // to match ALT_PROTAGONIST_HIGH/LOW above). Drop them into
  // public/data/graphs/ alongside your existing per-grade files. Named
  // generically (not the real school name) since these paths are visible
  // in the browser's Network tab.
  const [allGraphData, setAllGraphData] = useState<(GraphData | null)[]>([null, null, null, null])
  const [noticeText, setNoticeText] = useState('')
  const noticeTargetRef = useRef('') // which target sentence is currently typed/typing
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Steps 2-4's text: types the prefix+first suffix once on entering the alt
  // group, then switches to "static prefix + crossfading suffix" mode.
  const [altTypedText, setAltTypedText] = useState('')
  const [altTypingDone, setAltTypingDone] = useState(false)
  const altIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasInAltGroupRef = useRef(false)
  const [visibleBubbles, setVisibleBubbles] = useState<boolean[]>([false, false, false])
  const [bubbleTexts, setBubbleTexts] = useState<string[]>(['', '', ''])
  const [dialogueDone, setDialogueDone] = useState(false)
  const dialogueTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasPlayedDialogue = useRef(false)

  const altFullPopulationRef = useRef<Node[]>([])
  // The alt-school full population's own real edges (weight-filtered, but
  // never restricted by sampling) — separate from activeEdgesRef, which
  // only ever reflects whichever subset actually got sampled/rendered.
  // Fixes the same isolation-percentage inflation bug GraphSection912 had:
  // pairing the full population with only the sampled subset's edges made
  // any full-population node not included in the sample read as having
  // zero connections, even when it has real ones in the actual data.
  const altFullEdgesRef = useRef<Edge[]>([])

  // Bumped on click to skip whatever typing animation is currently running
  // — the step-1/alt notice text (handled directly in the click handler
  // below) and NodeStats' own entrance sequence (which watches this via its
  // skipSignal prop). Harmless to bump even when nothing is typing.
  const [skipTypingSignal, setSkipTypingSignal] = useState(0)

  // Guards against scrolling straight past an alt-school step before its
  // render has actually painted. alt-6 in particular (the densest of the
  // three, ~8,200 edges) can take long enough to build/join that by the
  // time the main thread frees up, enough scroll has queued to cross the
  // step-advance threshold twice in the same tick — React then jumps
  // straight from step 1 to step 3, never painting step 2 at all. Holding
  // forward scroll for a short buffer right after landing on any alt step
  // gives it a chance to actually render and be seen first.
  const altStepEnteredAtRef = useRef(0)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({
    steps: STEPS,
    blockScrollForward: () =>
      currentStep >= 3 && Date.now() - altStepEnteredAtRef.current < 900,
    // Desktop step navigation moved to explicit forward/back buttons (see
    // their render further down) instead of scroll — mobile is unaffected
    // either way, since it already only navigates via tap.
    disableScrollNav: true,
  })

  // Fires once, the first time the user reaches the race-toggle-intro
  // pause (step 1) — tells App.tsx to permanently reveal the persistent
  // SES/race toggle. Deliberately one-way: unlike the section's own
  // graphSectionActive visibility events (which toggle on scroll-back),
  // this never reverts even if the user scrolls back up past this point
  // afterward, per feedback that the toggle should just stay once
  // revealed.
  const hasReachedRaceIntroRef = useRef(false)
  useEffect(() => {
    if (currentStep >= 1 && !hasReachedRaceIntroRef.current) {
      hasReachedRaceIntroRef.current = true
      onRaceIntroReached?.()
    }
  }, [currentStep, onRaceIntroReached])

  // Mobile-only: the main graph effect below waits for this to catch up
  // to currentStep before actually building anything. A step change here
  // can trigger a real rebuild (a new alt-school step, or tearing down
  // the previous one) that runs synchronously in one block — on mobile's
  // much weaker CPUs that can block the main thread long enough to also
  // block touch/scroll input processing entirely. Originally added to
  // GraphSection912 specifically for grade 9's cold-start build, but this
  // section needs it too now that NavBar's navResetGraphStep can force an
  // immediate currentStep change here as well (nav-jumping to this
  // section always resets it to step 0) — without this defer, that reset
  // and whatever rebuild follows would run in the very same tick as the
  // nav's own scroll-into-view and scroll-wiggle, which is exactly the
  // kind of "can't scroll away" freeze reported after adding nav-bar
  // navigation. Desktop skips this — its own pipeline is fast enough that
  // it hasn't been a problem there.
  const [deferredStep, setDeferredStep] = useState(currentStep)
  useEffect(() => {
    if (!isMobile) {
      setDeferredStep(currentStep)
      return
    }
    const rafId = requestAnimationFrame(() => setDeferredStep(currentStep))
    return () => cancelAnimationFrame(rafId)
  }, [currentStep, isMobile])

  // Graph-paper background — same convention as GraphSectionElementary and
  // GraphSectionRepelAttract: fades in as the user approaches (entry),
  // fades out approaching the end of the section (exit). This section
  // didn't have this background at all before this pass.
  const outerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: entryProgress } = useScroll({
    target: outerRef,
    offset: ["start end", "start start"],
  })
  const { scrollYProgress: exitProgress } = useScroll({
    target: outerRef,
    offset: ["end end", "end start"],
  })
  const bgOpacity = useMotionValue(0)
  const [isVisuallyActive, setIsVisuallyActive] = useState(false)

  useEffect(() => {
    return entryProgress.on('change', (v) => {
      const amt = Math.min(1, Math.max(0, (v - 0.15) / 0.85))
      bgOpacity.set(amt)
      setIsVisuallyActive(amt > 0.3)
    })
  }, [entryProgress])

  const hasFiredOnExitedRef = useRef(false)
  useEffect(() => {
    return exitProgress.on('change', (v) => {
      if (v <= 0) return
      const fadeOutAmount = Math.min(1, v / 0.5)
      bgOpacity.set(1 - fadeOutAmount)
      setIsVisuallyActive(fadeOutAmount < 0.3)
      if (v >= 1 && !hasFiredOnExitedRef.current) {
        hasFiredOnExitedRef.current = true
        onExited?.()
      }
    })
  }, [exitProgress, onExited])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'graph-68', active: isVisuallyActive } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'graph-68', active: false } }))
    }
  }, [isVisuallyActive])

  // Tells App.tsx's persistent toggle to bump down and clear this
  // section's own "Click to go forward" button — see that file's own
  // comment, and GraphSectionElementary's matching effect for why this is
  // gated on isVisuallyActive too (not just the button's own render
  // condition, currentStep !== STEPS.length - 1), rather than just the
  // latter alone.
  useEffect(() => {
    const isForwardButtonShown = isVisuallyActive && !isMobile && currentStep !== STEPS.length - 1
    window.dispatchEvent(new CustomEvent('graphForwardButtonActive', { detail: { id: 'graph-68', active: isForwardButtonShown } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphForwardButtonActive', { detail: { id: 'graph-68', active: false } }))
    }
  }, [isVisuallyActive, isMobile, currentStep])

  // Only bumped by Conclusion's bottom-of-page toggle (a deliberate full
  // restart), never by a plain mode change — see the comment on
  // graphResetSignal in App.tsx.
  const isFirstResetRender = useRef(true)
  useEffect(() => {
    if (isFirstResetRender.current) { isFirstResetRender.current = false; return }
    setCurrentStep(0)
  }, [resetSignal, setCurrentStep])

  // Nav-jumping here should always start at step 0, not resume wherever
  // this section was last left off — see App.tsx's skipAnimationsUpTo,
  // which dispatches this scoped to whichever section id was actually
  // clicked (not graphResetSignal, which would reset every graph section
  // at once regardless of destination).
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      if (id === 'graph-68') setCurrentStep(0)
    }
    window.addEventListener('navResetGraphStep', handler)
    return () => window.removeEventListener('navResetGraphStep', handler)
  }, [setCurrentStep])

  useEffect(() => {
    if (currentStep >= 3) altStepEnteredAtRef.current = Date.now()
  }, [currentStep])

  // Covers both no-data steps (dialogue=0, race-intro pause=1) — both use
  // the same 2-dummy-node placeholder rendering, see the main effect below.
  const getFaceSize = () => currentStep <= 1 ? 40 : 25

  // dialogue
  useEffect(() => {
    if (currentStep !== 0) {
      hasPlayedDialogue.current = false
      setVisibleBubbles([false, false, false])
      setBubbleTexts(['', '', ''])
      setDialogueDone(false)
      dialogueTimers.current.forEach(t => clearTimeout(t))
      return
    }
    if (hasPlayedDialogue.current) return
    if (!sectionRef.current) return

    const play = () => {
      if (hasPlayedDialogue.current) return
      hasPlayedDialogue.current = true
      DIALOGUE.forEach((d, i) => {
        const t = setTimeout(() => {
          setVisibleBubbles(prev => { const next = [...prev]; next[i] = true; return next })
          setBubbleTexts(prev => { const next = [...prev]; next[i] = d.text; return next })
          if (i === DIALOGUE.length - 1) setDialogueDone(true)
        }, d.delay + 300)
        dialogueTimers.current.push(t)
      })
    }

    if (isMobile) {
      // This section is a plain single-screen block in normal flow on
      // mobile (not position:sticky), so it only briefly crosses the old
      // narrow "rect.top near 0" band while scrolling — a scroll event not
      // happening to sample within a few pixels of that moment meant the
      // trigger could be missed entirely. IntersectionObserver tracks
      // visibility continuously regardless of scroll speed/event sampling.
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect()
          // Mounting the dialogue (3 timer chains, AnimatePresence/motion.div
          // speech bubbles with box-shadow/border CSS) is real render cost.
          // requestIdleCallback waits for the main thread to actually report
          // itself free rather than guessing at a fixed delay. Falls back to
          // immediate on browsers without support (e.g. Safari).
          const schedule = () => {
            const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
            if (typeof w.requestIdleCallback === 'function') {
              w.requestIdleCallback(play, { timeout: 600 })
            } else {
              play()
            }
          }
          const t = setTimeout(schedule, 250)
          dialogueTimers.current.push(t)
        }
      }, { threshold: 0.9 })
      observer.observe(sectionRef.current)
      return () => {
        observer.disconnect()
        dialogueTimers.current.forEach(t => clearTimeout(t))
        }
    } else {
      // Desktop stays pinned via position:sticky for a long scroll range
      // once stuck, so this band check has plenty of time to catch a
      // scroll event and works fine as-is. (This used to also need to
      // stay >= useGraphSection's own wheel-block band to avoid a
      // scroll-lock deadlock — that's no longer a concern now that
      // forward scroll is never blocked for the dialogue, but the same
      // band still reliably detects "this section has settled into
      // view.")
      const tryPlay = () => {
        if (hasPlayedDialogue.current) return
        if (!sectionRef.current) return
        const rect = sectionRef.current.getBoundingClientRect()
        if (rect.top <= 50 && rect.top >= -50) {
          window.removeEventListener('scroll', tryPlay)
          play()
        }
      }
      tryPlay()
      window.addEventListener('scroll', tryPlay, { passive: true })
      return () => {
        window.removeEventListener('scroll', tryPlay)
        dialogueTimers.current.forEach(t => clearTimeout(t))
      }
    }
  }, [currentStep, isMobile])

  // notice text — step 1's standalone sentence only. Types once on
  // arriving at step 1, clears when leaving back to step 0.
  useEffect(() => {
    const target = getNoticeTarget(currentStep)
    if (target === '') {
      noticeTargetRef.current = ''
      clearInterval(noticeIntervalRef.current!)
      setNoticeText('')
      return
    }
    if (target === noticeTargetRef.current) return
    noticeTargetRef.current = target
    clearInterval(noticeIntervalRef.current!)
    setNoticeText('')
    let i = 0
    noticeIntervalRef.current = setInterval(() => {
      i++
      setNoticeText(target.slice(0, i))
      if (i >= target.length) clearInterval(noticeIntervalRef.current!)
    }, 10)
  }, [currentStep])

  // alt-group text — types the full "And this is what 6th grade..." sentence
  // once on first arriving at step 2, then hands off to static rendering
  // (see JSX below): the "And this is what " prefix stays put as plain text,
  // and only the suffix crossfades via AnimatePresence as currentStep moves
  // between 2/3/4, rather than retyping the whole sentence each time.
  useEffect(() => {
    const inAltGroup = currentStep >= 3
    if (!inAltGroup) {
      if (wasInAltGroupRef.current) {
        clearInterval(altIntervalRef.current!)
        setAltTypedText('')
        setAltTypingDone(false)
      }
      wasInAltGroupRef.current = false
      return
    }
    if (wasInAltGroupRef.current) return // already in the group — crossfade handles step changes, no retyping
    wasInAltGroupRef.current = true
    const fullText = ALT_TEXT_PREFIX + (isMobile ? ALT_TEXT_SUFFIX_MOBILE : ALT_TEXT_SUFFIX_DESKTOP)[3]
    clearInterval(altIntervalRef.current!)
    setAltTypedText('')
    setAltTypingDone(false)
    let i = 0
    altIntervalRef.current = setInterval(() => {
      i++
      setAltTypedText(fullText.slice(0, i))
      if (i >= fullText.length) {
        clearInterval(altIntervalRef.current!)
        setAltTypingDone(true)
      }
    }, 10)
  }, [currentStep, isMobile])

  // load data
  useEffect(() => {
    Promise.all([
      fetch('/data/graphs/6.json').then(r => r.json()),
      fetch('/data/graphs/alt-6.json').then(r => r.json()),
      fetch('/data/graphs/alt-7.json').then(r => r.json()),
      fetch('/data/graphs/alt-8.json').then(r => r.json()),
    ]).then(([g6, altG6, altG7, altG8]) => setAllGraphData([g6, altG6, altG7, altG8]))
    .catch(err => console.error('data load error:', err))
  }, [])

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current)
    // applyHoverHighlight's broad 'circle' selector also matches the
    // protagonist-border circles (added below) — reset their radius back
    // to the correct border-ratio value right after, same fix as
    // GraphSectionElementary needed for the same shared-selector issue.
    d3.select(svgRef.current).selectAll<SVGCircleElement, Node>('circle.protagonist-border')
      .attr('r', getFaceSize() * BORDER_RATIO)
  }, [hoveredNode, currentStep])

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (currentStep > 1 && !allGraphData[currentStep - 2]) return
    // Mobile-only: wait for the one-frame defer above to catch up before
    // doing any real work — see deferredStep's own comment for why. This
    // effect will naturally re-run once setDeferredStep fires.
    if (isMobile && deferredStep !== currentStep) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const protagonistLow = getProtagonistLow(mode)
    const faceSize = getFaceSize()
    const isAltStep = currentStep >= 3

    let newNodes: Node[] = [], newEdges: Edge[] = []

    if (currentStep <= 1) {
      const dummyNode = (id: number, xOffset: number): Node => ({
        id,
        ses: id === PROTAGONIST_HIGH ? 'higher' : 'lower',
        race_ethnicity: id === PROTAGONIST_HIGH ? 'white_asian' : 'student_of_color',
        courses: '',
        grade_level: 6,
        x: cx + xOffset, y: cy,
        fx: cx + xOffset, fy: cy,
      })
      newNodes = [dummyNode(PROTAGONIST_HIGH, -70), dummyNode(protagonistLow, 70)]
      newEdges = []
    } else {
      const data = allGraphData[currentStep - 2]!
      const filteredFullNodes = data.nodes
        .filter(n => n.courses && !n.courses.toLowerCase().includes('non-reporting'))

      // Alt steps: sample down for the simulation/render, but keep the
      // FULL filtered list around for NodeStats — the % breakdown should
      // reflect the true population, not just whichever subset got
      // rendered.
      const nodesToUse = isAltStep ? sampleAltNodes(filteredFullNodes, ALT_NODE_SAMPLE_CAP[currentStep] ?? 400) : filteredFullNodes
      // Stored separately from activeNodesRef — that ref must stay the
      // actual rendered/simulated (sampled) set, since it's what the next
      // step's "existing position" lookup uses for continuity (e.g. the
      // two protagonists sliding from their real on-screen spot rather
      // than snapping to a raw baked coordinate that was never actually
      // rendered at that scale).
      if (isAltStep) {
        altFullPopulationRef.current = filteredFullNodes.map(n => ({ ...n }))
        const fullIds = new Set(filteredFullNodes.map(n => n.id))
        altFullEdgesRef.current = data.edges.filter(e =>
          e.weight >= 3 && fullIds.has(e.source as number) && fullIds.has(e.target as number)
        )
      }

      newNodes = nodesToUse.map(n => {
        const existing = existingById.get(n.id)
        return existing
          ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
          : { ...n, x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80 }
      })
      const filteredNodeIds = new Set(newNodes.map(n => n.id))
      newEdges = data.edges
        .filter(e => e.weight >= 3)
        .filter(e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number))
        .map(e => ({ ...e }))
    }

    activeNodesRef.current = newNodes
    activeEdgesRef.current = newEdges

    // Resolve every displayed edge's source/target to the actual Node
    // object up front (rather than leaving them as raw ids). Needed both
    // for the alt-step direct-draw path below and for the normal physics
    // path further down.
    const nodeById = new Map(newNodes.map(n => [n.id, n]))
    newEdges = newEdges.map(e => ({
      ...e,
      source: nodeById.get(typeof e.source === 'number' ? e.source : (e.source as Node).id) ?? e.source,
      target: nodeById.get(typeof e.target === 'number' ? e.target : (e.target as Node).id) ?? e.target,
    }))

    if (simulationRef.current) simulationRef.current.stop()

    if (isAltStep) {
      // Reverted to the same full physics as the non-alt sections (link +
      // charge + center + collision) instead of the lighter "pull toward a
      // pre-baked position" model tried in an earlier round — that felt
      // noticeably less responsive/alive than the other graphs, and
      // dragging didn't propagate through the network the way it does
      // elsewhere. The tradeoff for affording real structural physics
      // again is sampling down the node/edge count (see sampleAltNodes
      // above and ALT_NODE_SAMPLE_CAP) instead of using a cheaper force
      // model — full physics on the full ~300+ node / thousands-of-edge
      // dataset is what caused the original freeze.
      //
      // Charge is softened from the non-alt sections' -80 to -50, with a
      // distanceMax cap — the real comparison-school data is segregated
      // enough that at -80 with no cap, the two clusters were flying apart
      // too far to view comfortably together.
      const simulation = d3.forceSimulation<Node>(newNodes)
        .force('link', d3.forceLink<Node, Edge>(newEdges).id(d => d.id)
          .distance(d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5)))
          .strength(d => Math.min(1, (d as unknown as Edge).weight * 0.06)))
        .force('charge', d3.forceManyBody().strength(-50).distanceMax(300))
        .force('center', d3.forceCenter(cx, cy))
        .force('collision', d3.forceCollide().radius(8))
        .alphaDecay(isMobile ? 0.05 : 0.0228)

      simulationRef.current = simulation

      const padding = isMobile ? 30 : 80
      // Same autoZoom helper, same call shape as the non-alt sections —
      // for the same default zoom-to-fit feel when moving between steps,
      // instead of the custom scale/identity-reset logic used previously.
      const zoomTimer = autoZoom(g, width, height, padding, currentStep >= 4 ? 1400 : 800)

      simulation.on('tick', () => {
        linkG.selectAll<SVGLineElement, Edge>('line')
          .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
          .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
        nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
        nodeG.selectAll<SVGImageElement, Node>('image')
          .attr('x', d => (d.x ?? 0) - faceSize / 2).attr('y', d => (d.y ?? 0) - faceSize / 2)
      })

      linkG.selectAll<SVGLineElement, Edge>('line').data(newEdges)
        .join(
          enter => enter.append('line')
            .attr('stroke', d => getAltEdgeColor(d, mode))
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0)
            .transition().duration(600).attr('stroke-opacity', 0.2),
          update => update
            .transition().duration(300).attr('stroke', d => getAltEdgeColor(d, mode)),
          exit => exit.transition().duration(300).attr('stroke-opacity', 0).remove()
        )

      const nonProtags = newNodes.filter(n => !isAltProtagonist(n.id))
      const protags = newNodes.filter(n => isAltProtagonist(n.id))

      nodeG.selectAll<SVGCircleElement, Node>('circle.regular-node').data(nonProtags, d => d.id)
        .join(
          enter => enter.append('circle')
            .attr('class', 'regular-node')
            .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
            .attr('fill', d => getAltNodeColor(d, mode))
            .attr('stroke', 'white').attr('stroke-width', 0.8)
            .attr('cursor', 'pointer').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 1),
          update => update.attr('fill', d => getAltNodeColor(d, mode)),
          exit => exit.transition().duration(300).attr('opacity', 0).remove()
        )

      nodeG.selectAll<SVGCircleElement, Node>('circle.protagonist-border').data(protags, d => d.id)
        .join(
          enter => enter.insert('circle', ':first-child')
            .attr('class', 'protagonist-border')
            .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy)
            .attr('r', faceSize * BORDER_RATIO).attr('fill', 'white')
            .attr('pointer-events', 'none'),
          update => update.attr('r', faceSize * BORDER_RATIO),
          exit => exit.remove()
        )

      nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
        .join(
          enter => enter.append('image')
            .attr('href', d => getAltFaceSrc(d, mode))
            .attr('width', faceSize).attr('height', faceSize)
            .attr('x', d => (d.x ?? cx) - faceSize / 2)
            .attr('y', d => (d.y ?? cy) - faceSize / 2)
            .attr('cursor', 'pointer').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 1),
          update => update.attr('href', d => getAltFaceSrc(d, mode)),
          exit => exit.remove()
        )

      setupNodeInteractions(nodeG, simulation, mode)
      return () => {
        simulation.stop()
        clearTimeout(zoomTimer)
        tooltipRef.current?.style('opacity', 0)
      }
    }

    // Non-alt steps (dialogue + race-intro pause + tracking) continue with
    // the normal live physics simulation below.
    const isSmall = currentStep <= 1

    const simulation = d3.forceSimulation<Node>(newNodes)
      .force('link', d3.forceLink<Node, Edge>(newEdges).id(d => d.id)
        .distance(isSmall ? 120 : (d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5))))
        .strength(isSmall ? 0.1 : (d => Math.min(1, (d as unknown as Edge).weight * 0.06))))
      .force('charge', d3.forceManyBody().strength(isSmall ? -600 : -80))
      .force('center', d3.forceCenter(cx, cy))
      .force('collision', d3.forceCollide().radius(isSmall ? faceSize + 5 : 8))
      .alphaDecay(isMobile ? 0.05 : 0.0228)

    simulationRef.current = simulation

    const padding = isSmall ? (isMobile ? 60 : 150) : (isMobile ? 30 : 80)
    const zoomTimer = autoZoom(g, width, height, padding, currentStep === 2 ? 1600 : 800)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - faceSize / 2).attr('y', d => (d.y ?? 0) - faceSize / 2)
    })

    const linkLines = linkG.selectAll<SVGLineElement, Edge>('line').data(newEdges)
    linkLines.exit().transition().duration(300).attr('stroke-opacity', 0).remove()
    linkLines.enter().append('line')
      // Experimenting with coloring edges by their source node's group
      // instead of flat grey — via the shared graphUtils.getEdgeColor
      // helper, so this stays consistent with GraphSection/GraphSection45.
      // Easy to revert: swap back to .attr('stroke', EDGE_COLOR).
      .attr('stroke', d => getEdgeColor(d, mode))
      .attr('stroke-width', 1).attr('stroke-opacity', 0)
      .transition().duration(600).attr('stroke-opacity', 0.2)
    linkLines.transition().duration(300)
      .attr('stroke', d => getEdgeColor(d, mode))

    // Non-alt steps use the original shared graphUtils protagonist helpers.
    const nonProtags = newNodes.filter(n => !isProtagonist(n.id, mode))
    const protags = newNodes.filter(n => isProtagonist(n.id, mode))
    const nodeColorFn = getNodeColor
    const faceSrcFn = (d: Node) => getFaceSrc(d, mode, '68')

    const circles = nodeG.selectAll<SVGCircleElement, Node>('circle.regular-node').data(nonProtags, d => d.id)
    circles.exit().transition().duration(300).attr('opacity', 0).remove()
    circles.enter().append('circle')
      .attr('class', 'regular-node')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
      .attr('fill', d => nodeColorFn(d, mode)).attr('stroke', 'white').attr('stroke-width', 0.8)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)
    circles.transition().duration(300).attr('fill', d => nodeColorFn(d, mode))

    const protagBorders = nodeG.selectAll<SVGCircleElement, Node>('circle.protagonist-border').data(protags, d => d.id)
    protagBorders.exit().remove()
    protagBorders.attr('r', faceSize * BORDER_RATIO)
    protagBorders.enter().insert('circle', ':first-child')
      .attr('class', 'protagonist-border')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy)
      .attr('r', faceSize * BORDER_RATIO).attr('fill', 'white')
      .attr('pointer-events', 'none')

    const faceImages = nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
    faceImages.exit().remove()
    faceImages.attr('href', d => faceSrcFn(d)).attr('width', faceSize).attr('height', faceSize)
    faceImages.enter().append('image')
      .attr('href', d => faceSrcFn(d)).attr('width', faceSize).attr('height', faceSize)
      .attr('x', d => (d.x ?? cx) - faceSize / 2).attr('y', d => (d.y ?? cy) - faceSize / 2)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)

    // Hover/tap highlighting and drag are unnecessary during the dialogue
    // and race-intro pause steps — their two nodes are placeholder
    // dummies, not real data, so there's nothing meaningful to highlight/
    // dim toward or show stats about.
    if (currentStep > 1) setupNodeInteractions(nodeG, simulation, mode)

    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, deferredStep, allGraphData, graphSize, mode, isMobile])

  const renderNoticeContent = () => {
    if (currentStep === 2) {
      if (!noticeText) return null
      return (
        <>
          {noticeText}
          {noticeText.length < TRACKING_LOW_TEXT.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
        </>
      )
    }
    if (currentStep >= 3) {
      if (!altTypingDone) {
        if (!altTypedText) return null
        return (
          <>
            {altTypedText}
            {altTypedText.length < (ALT_TEXT_PREFIX + (isMobile ? ALT_TEXT_SUFFIX_MOBILE : ALT_TEXT_SUFFIX_DESKTOP)[3]).length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
          </>
        )
      }
      return (
        <>
          {ALT_TEXT_PREFIX}
          <AnimatePresence mode="wait">
            <motion.span key={currentStep}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              style={{ display: 'inline' }}
            >
              {(isMobile ? ALT_TEXT_SUFFIX_MOBILE : ALT_TEXT_SUFFIX_DESKTOP)[currentStep]}
            </motion.span>
          </AnimatePresence>
        </>
      )
    }
    return null
  }

  const skipDialogue = () => {
    if (currentStep !== 0 || dialogueDone) return
    dialogueTimers.current.forEach(t => clearTimeout(t))
    setVisibleBubbles([true, true, true])
    setBubbleTexts(DIALOGUE.map(d => d.text))
    setDialogueDone(true)
  }

  // Click-to-skip for whatever's currently typing: step 1's standalone
  // notice, steps 2-4's alt-school sentence (only actually typing the
  // first time that group is entered), and NodeStats' own entrance
  // sequence (via skipTypingSignal, consumed as its skipSignal prop).
  // Safe to call even when nothing is actively typing.
  const skipTyping = () => {
    if (currentStep === 2 && noticeText.length < TRACKING_LOW_TEXT.length) {
      clearInterval(noticeIntervalRef.current!)
      setNoticeText(TRACKING_LOW_TEXT)
    }
    if (currentStep >= 3 && !altTypingDone) {
      clearInterval(altIntervalRef.current!)
      setAltTypedText(ALT_TEXT_PREFIX + (isMobile ? ALT_TEXT_SUFFIX_MOBILE : ALT_TEXT_SUFFIX_DESKTOP)[3])
      setAltTypingDone(true)
    }
    setSkipTypingSignal(s => s + 1)
  }

  const bubbleColorHigh = mode === 'race' ? '#FF9260' : '#FF8BDE'
  const bubbleColorLow = mode === 'race' ? '#8BA4FF' : '#22D880'

  // altFullPopulationRef is only populated inside the main graph-building
  // effect, which runs AFTER the render that first flips currentStep to 2
  // — so on that very first entry into the alt group, this ref is still
  // empty for one render. Without this fallback, NodeStats would briefly
  // see zero nodes and return null (the "flash" of stats vanishing then
  // reappearing) until some later state update forces a re-render with the
  // now-populated ref. Falling back to the previous step's data for that
  // one render keeps something coherent on screen instead of blanking.
  const statsNodes = currentStep >= 3
    ? (altFullPopulationRef.current.length > 0 ? altFullPopulationRef.current : activeNodesRef.current)
    : activeNodesRef.current
  // Mirrors statsNodes' own fallback exactly, so nodes and edges always
  // come from the same (full or sampled) set rather than pairing a full
  // population with only the sampled subset's edges.
  const statsEdges = currentStep >= 3
    ? (altFullPopulationRef.current.length > 0 ? altFullEdgesRef.current : activeEdgesRef.current)
    : activeEdgesRef.current

  const bubbleStyle = (isRight: boolean, color: string) => ({
    backgroundColor: 'white',
    border: `2px solid ${color}`,
    borderRadius: '12px',
    padding: '0.5rem 0.75rem',
    fontFamily: "'Kiwi Maru', serif",
    fontSize: isMobile ? 'clamp(0.65rem, 2.8vw, 0.85rem)' : 'clamp(0.8rem, 1.2vw, 1rem)',
    color: '#111',
    lineHeight: 1.4,
    boxShadow: '0 9px 22px rgba(0,0,0,0.3)',
    position: 'relative' as const,
    textAlign: isRight ? 'right' as const : 'left' as const,
  })

  return (
    <div ref={outerRef} id="graph-68" style={{ height: isMobile ? '100vh' : `${STEPS.length * 100}vh`, position: 'relative', flexShrink: 0, width: '100%' }}>
      <div
        ref={sectionRef}
        style={{
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          width: '100%',
          height: '100vh',
          backgroundColor: 'var(--color-bg)',
          overflow: 'hidden',
          // Mobile-only experiment: this panel's IntersectionObserver-
          // triggered dialogue mount (typing bubbles, changing box heights)
          // fires right around when this panel enters/settles in the
          // viewport. That's a layout mutation happening at the same time
          // the browser's scroll-anchoring machinery may be trying to keep
          // scroll position stable — a plausible trigger for the "have to
          // scroll up then down" freeze. Disabling anchoring here removes
          // that as a possible cause.
          ...(isMobile ? { overflowAnchor: 'none' as const } : {}),
        }}
      >

        {/* Graph-paper background — direct child of sectionRef (not the
            content wrapper below) so it always spans the section's full
            height regardless of how much shorter the actual content is
            on mobile. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/assets/graph-paper-bg.png)',
          backgroundRepeat: 'repeat',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Content wrapper — capped shorter than the section's own 100vh
            on mobile (matching GraphSectionElementary/GraphSectionRepel-
            Attract's convention) so there's edge padding at the bottom;
            only the wallpaper above extends into that extra space. */}
        <div style={{ height: isMobile ? '94vh' : '100%', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', position: 'relative' }}>

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: isMobile ? '4.5rem 1.5rem 0.5rem 1.5rem' : '6rem 2rem 6rem 3rem', flexShrink: 0, gap: isMobile ? '1.5rem' : 0, position: 'relative' }}>
          {/* Semi-opaque rounded panel behind the left column's content —
              same convention as GraphSectionElementary/GraphSectionRepel-
              Attract. Didn't exist here before this pass. */}
          {!isMobile && (
            <div style={{ position: 'absolute', top: '3%', bottom: '3%', left: '1rem', right: '1rem', backgroundColor: 'rgba(250, 249, 246, 0.82)', borderRadius: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 0 }} />
          )}
          {/* Desktop: full 1in top margin (the wrapper's own 6rem padding
              above). Notice text and the title keep the same (flexible,
              equal) gaps between them as before; the three stat pieces
              (breakdown, baseline, isolation) are now grouped tightly
              together right under the title instead of also being spread
              out. */}
          {!isMobile && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
              {/* Fixed, uniform height across every step — NOT
                  per-step-measured. See GraphSection912's identical
                  comment for the full reasoning: ghost-text sizing let
                  this box's height vary step to step, which shifted the
                  title's vertical position along with it (visible as the
                  title drifting up/down between steps). Locking to one
                  height keeps the title's position identical on every
                  step regardless of how long any given step's sentence
                  runs. */}
              <div style={{ height: '11.5rem', display: 'flex', alignItems: 'flex-start', overflow: 'visible' }}>
                {(currentStep === 2 ? noticeText : altTypedText || altTypingDone) && (
                  <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 1.8vw, 1.4rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                    {renderNoticeContent()}
                  </p>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <div>
                <AnimatePresence mode="wait">
                  <motion.p key={currentStep}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}
                  >
                    {currentStep === 1 ? '\u23F8\uFE0E' : STEPS[currentStep].label}
                  </motion.p>
                </AnimatePresence>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                  {STEPS.map((_, i) => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
                <NodeStats nodes={statsNodes} edges={statsEdges} mode={mode} visible={currentStep >= 2} mobile={false} startTyping={currentStep >= 2} skipSignal={skipTypingSignal} />
              </div>
            </div>
          )}
          {isMobile && (
            <div style={{
              backgroundColor: 'rgba(250, 249, 246, 0.82)',
              borderRadius: '18px',
              padding: '1rem 1.5rem',
            }}>
              <AnimatePresence mode="wait">
                <motion.p key={currentStep}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: 'center' }}
                >
                  {currentStep === 1 ? '\u23F8\uFE0E' : STEPS[currentStep].label}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* graph panel */}
        <div
          ref={graphPanelRef}
          onClick={(e) => {
            // Skip the dialogue on tap/click, same on every platform.
            if (currentStep === 0 && !dialogueDone) {
              skipDialogue()
              return
            }
            // Skip whichever notice/stats typing is currently running —
            // also works on desktop, where clicks otherwise fall through
            // to nothing until the isMobile check below.
            // Finish whatever typing is running (the tracking notice on
            // step 1, or the alt-school comparison text on steps >= 2),
            // WITHOUT blocking the rest of this tap — was
            // `if (isNoticeTyping || isAltTyping) { skipTyping(); return }`,
            // which meant any tap landing before that typing had finished
            // was swallowed entirely rather than just finishing the text,
            // never reaching the advance-step logic below. That's the
            // same underlying bug fixed in GraphSection912's identical
            // pattern — skipTyping() is already safe to call
            // unconditionally (see setSkipTypingSignal just below it).
            skipTyping()
            // Notice/alt text (if any) is already done, but NodeStats'
            // own entrance sequence might still be typing — bump its skip
            // signal too (a harmless no-op if it's already finished)
            // without consuming the click, so normal tap/navigation below
            // still runs in the same gesture.
            if (currentStep >= 1) setSkipTypingSignal(s => s + 1)
            if (!isMobile) return
            // By this point dialogueDone is guaranteed true (the check
            // above already returned for the not-done case) — this used
            // to just `return` unconditionally, which on mobile was a
            // dead end: the wheel/touch-swipe handlers that would
            // normally advance currentStep are skipped entirely on
            // mobile (see useGraphSection.ts), so tap is the ONLY
            // mechanism mobile has to move forward at all, and this line
            // blocked the very first tap needed to leave the dialogue.
            if (currentStep === 0) { setCurrentStep(1); return }
            const target = e.target as Element
            if (target.tagName === 'circle' || target.tagName === 'image') {
              // Tapped an actual node — show/toggle its tooltip instead of
              // navigating. Reuses the same hoveredNode state the existing
              // highlight effect already reacts to.
              const datum = d3.select(target as SVGCircleElement | SVGImageElement).datum() as Node | undefined
              if (datum) {
                setHoveredNode(prev => {
                  const next = prev === datum.id ? null : datum.id
                  if (next === null) {
                    tooltipRef.current?.style('opacity', 0)
                  } else {
                    const nodeRect = target.getBoundingClientRect()
                    tooltipRef.current?.style('opacity', 1)
                      .style('left', (nodeRect.left + nodeRect.width / 2 + 12) + 'px')
                      .style('top', (nodeRect.top - 28) + 'px')
                      .html(getTooltipHtml(datum, mode))
                  }
                  return next
                })
              }
              return
            }
            // A background tap while a node is highlighted just dismisses it.
            if (hoveredNode !== null) {
              setHoveredNode(null)
              tooltipRef.current?.style('opacity', 0)
            }
            const rect = graphPanelRef.current?.getBoundingClientRect()
            if (!rect) return
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) {
              if (currentStep < STEPS.length - 1) setCurrentStep(s => Math.min(STEPS.length - 1, s + 1))
            } else {
              if (currentStep > 0) setCurrentStep(s => Math.max(0, s - 1))
            }
          }}
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: (isMobile || (currentStep === 0 && !dialogueDone)) ? 'pointer' : 'default' }}
        >
          {/* Desktop-only "Click to go back"/"Click to go forward" —
              replaces scroll-driven step navigation (see disableScrollNav
              in the useGraphSection call above), matching
              GraphSectionElementary's own buttons exactly (size,
              rounding, position, no cursor override for the site's
              custom cursor SVG). Mirrors the same dialogue-skip-then-
              advance behavior mobile's tap-to-advance already has on
              step 0. */}
          {!isMobile && currentStep > 0 && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                setCurrentStep(s => Math.max(0, s - 1))
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', top: navBarVisible ? '5.05rem' : '1.5rem', left: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              ← Click to go back
            </motion.div>
          )}
          {!isMobile && currentStep !== STEPS.length - 1 && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                if (currentStep === 0 && !dialogueDone) { skipDialogue(); return }
                skipTyping()
                if (currentStep >= 1) setSkipTypingSignal(s => s + 1)
                setCurrentStep(s => Math.min(STEPS.length - 1, s + 1))
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', top: navBarVisible ? '5.05rem' : '1.5rem', right: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              Click to go forward →
            </motion.div>
          )}
          {isMobile && (currentStep === 2 ? noticeText : altTypedText || altTypingDone) && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '10%', right: '10%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {renderNoticeContent()}
              </p>
            </div>
          )}

          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', opacity: currentStep === 1 ? 0 : 1, pointerEvents: currentStep === 1 ? 'none' : 'auto' }} />

          {/* Race-toggle-intro pause (step 1) — same visual convention as
              GraphSectionElementary's own text-only step: blurred oval
              backdrop, centered text, transparent otherwise. The (hidden)
              dummy nodes from the dialogue step continue existing
              underneath, same as that file's own text step. */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: 'easeInOut' }}
              style={{
                position: 'absolute', inset: 0, backgroundColor: 'transparent',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
                padding: isMobile ? '2.5rem 1.5rem' : '3rem 4rem',
              }}>
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: isMobile ? '92%' : '78%', height: isMobile ? '62%' : '68%',
                backgroundColor: 'rgba(250, 249, 246, 0.75)',
                borderRadius: '50%',
                filter: 'blur(45px)',
                zIndex: 0,
              }} />
              <p style={{
                position: 'relative', zIndex: 1,
                fontFamily: "'Kiwi Maru', serif",
                fontSize: isMobile ? 'clamp(0.85rem, 3.5vw, 1.05rem)' : 'clamp(1rem, 1.7vw, 1.35rem)',
                color: '#111', lineHeight: 1.8, textAlign: 'center', margin: 0, maxWidth: '760px',
              }}>
                {RACE_INTRO_PARA1_BEFORE}<strong><span style={{ color: 'var(--color-race-1)' }}>ra</span><span style={{ color: 'var(--color-race-2)' }}>ce</span></strong>{RACE_INTRO_PARA1_AFTER}
              </p>
              <p style={{
                position: 'relative', zIndex: 1,
                fontFamily: "'Kiwi Maru', serif",
                fontSize: isMobile ? 'clamp(0.85rem, 3.5vw, 1.05rem)' : 'clamp(1rem, 1.7vw, 1.35rem)',
                color: '#111', lineHeight: 1.8, textAlign: 'center', margin: 0, maxWidth: '760px',
              }}>
                <span style={{ color: 'var(--color-race-1)' }}>Ra</span><span style={{ color: 'var(--color-race-2)' }}>ce</span>{RACE_INTRO_PARA2_MID}<span style={{ color: 'var(--color-high-ses)' }}>socioecono</span><span style={{ color: 'var(--color-low-ses)' }}>mic status</span>{RACE_INTRO_PARA2_AFTER}
              </p>
            </motion.div>
          )}

          {/* comic strip dialogue bubbles — alternating heights matching
              GraphSectionElementary's dialogue pattern: each message gets
              its own independently-positioned bubble instead of stacking
              two of them in one shared column, since "Promise!" (a reply)
              needs to sit below "Promise we'll...?" rather than directly
              under "I hope..." in the same left-side stack. */}
          {currentStep === 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
              {/* "I hope we'll still have the same teachers!" — highest */}
              <div style={{ position: 'absolute', left: isMobile ? '15%' : '19%', top: isMobile ? '21%' : '13%', maxWidth: isMobile ? '160px' : '240px' }}>
                {visibleBubbles[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(false, bubbleColorHigh)}
                  >
                    {bubbleTexts[0]}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorHigh}` }} />
                  </motion.div>
                )}
              </div>
              {/* "Promise we'll still be friends even if we don't?" — middle */}
              <div style={{ position: 'absolute', right: isMobile ? '15%' : '19%', top: isMobile ? '29%' : '22%', maxWidth: isMobile ? '172px' : '240px' }}>
                {visibleBubbles[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(true, bubbleColorLow)}
                  >
                    {bubbleTexts[1]}
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorLow}` }} />
                  </motion.div>
                )}
              </div>
              {/* "Promise!" — stays at the position the whole group used to sit at */}
              <div style={{ position: 'absolute', left: isMobile ? '15%' : '19%', top: isMobile ? '37%' : '31%', maxWidth: isMobile ? '160px' : '240px' }}>
                {visibleBubbles[2] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(false, bubbleColorHigh)}
                  >
                    {bubbleTexts[2]}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorHigh}` }} />
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <>
              {!(currentStep === 0 && !dialogueDone) && currentStep > 0 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  ← Tap to go back
                </div>
              )}
              {!(currentStep === 0 && !dialogueDone) && currentStep < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  Tap to go forward →
                </div>
              )}
              {currentStep >= 2 && (
                <NodeStats nodes={statsNodes} edges={statsEdges} mode={mode} visible={currentStep >= 2} mobile={true} startTyping={currentStep >= 2} skipSignal={skipTypingSignal} mobileBottomOffset="2.1rem" />
              )}
              <div style={{ position: 'absolute', bottom: '2.6rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}