import { useEffect, useState, useRef } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence, useScroll, useMotionValue } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import {
  PROTAGONIST_HIGH, getProtagonistLow, getEdgeColor,
  isProtagonist, getNodeColor, getFaceSrc, applyHoverHighlight, getTooltipHtml,
} from './graphUtils'

// Merged from the former GraphSection.tsx (K-3) and GraphSection45.tsx
// (grades 4-5) into one combined elementary-school section.
//
// The old opening step ("Two students entering kindergarten" — just the
// two protagonist dots, no edges, fixed position) is removed entirely;
// this now starts directly on what used to be the second step, retitled
// "Our two students in their kindergarten class." Only one grade-3 step
// exists now (it used to appear twice: once as GraphSection's own last
// step, and again as GraphSection45's own first "picking up from grade
// 3" step, which existed purely to hand off continuation positions
// across two separate components). Now that both grades share one
// component and one activeNodesRef, that whole cross-component handoff
// (initialNodes/grade3Version props) is gone entirely.
//
// A text-only step sits between grade 3 and grade 4 (no graph — the old
// Section01Part2 course-tracking/SES-race paragraph, reformatted into
// the graph panel's own space) — this still counts as "being in the
// graph section": the graph-paper background stays on, the left panel's
// background rectangle stays, and the step dots still show during it.
//
// IMPORTANT: the <svg ref={svgRef}> element is NEVER conditionally
// unmounted, even during the text-only step — useGraphSection's own
// one-time SVG setup effect (which creates the <g class="root">/
// <g class="links">/<g class="nodes"> structure D3 selections depend on)
// has an empty dependency array, so it only runs once on this
// component's first mount. If the <svg> DOM node were ever destroyed and
// recreated (which conditionally rendering it in/out of the JSX would
// do), that setup would never re-run for the new node, leaving it
// permanently empty and every subsequent D3 selection silently finding
// nothing. The text step instead overlays an opaque div on TOP of an
// always-present (but hidden) svg.
//
// Stats (NodeStats) are removed for now — not relevant until middle
// school — and the info hint-bar only shows for the K-3 range, matching
// GraphSection45's own original left panel (which never had one).
//
// FLAGGING FOR LIVE VERIFICATION: this merge combines two previously
// separate D3 force-simulation configurations (different link
// distance/strength/charge per grade range) into one step-indexed effect.
// The simulation parameters themselves are carried over unchanged from
// each original file, just re-indexed — but the step-transition logic
// (existingById continuation, autoZoom timing, hover-highlight reset)
// couldn't be exercised against real rendering here, so this remains the
// single highest-risk piece of this whole change and warrants an actual
// scroll-through before trusting it. The grade-K padding bump below is
// also an estimate, not a measured fix — I can't inspect that dataset's
// actual clustering characteristics.

// Step 0 (the individual kindergarten class closeup) keeps its own size —
// feedback was that it's fine as-is. Every other step (grade K through
// grade 5) shares ONE size now — grade 4/5 was confirmed smaller than the
// K-3 full-grade steps, and per feedback they should all match, so this is
// a single constant rather than two that can drift apart again.
const FACE_SIZE_SINGLE_CLASS = 25
const FACE_SIZE_FULL_GRADE = 18
// Single source of truth for "what face size applies to this step" — both
// the hover-highlight effect and the main draw effect call this, so they
// can no longer disagree about the protagonist-border radius (they
// previously used two different formulas, which is why the border would
// intermittently jump to the wrong size on hover — whichever effect ran
// last, using its own formula, won).
const faceSizeForStep = (step: number) => (step === 0 ? FACE_SIZE_SINGLE_CLASS : FACE_SIZE_FULL_GRADE)
// Radius of the white faux-border circle, as a fraction of faceSize.
// Went too thin at 0.48 per feedback — sized back up.
const BORDER_RATIO = 0.51

// Comic-strip dialogue for the single-class step (0) — copied from
// GraphSection68's format per feedback. GraphSection68's own visual style
// hasn't been brought in line with this file's newer conventions yet
// (that's a separate pass coming later), so this is a direct structural
// port for now, not yet restyled.
const DIALOGUE = [
  { node: 'high', text: "Nice to meet you!", delay: 0 },
  { node: 'low', text: "Wanna be best friends?", delay: 1150 },
  { node: 'high', text: "Yes!", delay: 2300 },
]

const PARA1 = "In some schools around the 4th grade, students transition from being in one fixed room to sharing multiple classes with peers. This causes networks to go from looking like pods to integrated webs."

// A handful of nodes across grades K-5 have "Speech" as their ONLY listed
// class — outliers that aren't representative of a real shared-class
// network, so they're excluded from the full-grade views (steps 1-4 and
// 6-7). Not applied to the single-class closeup (step 0), per feedback.
const isSpeechOnly = (n: Node): boolean => {
  const courses = n.courses.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  return courses.length === 1 && courses[0] === 'speech'
}

// Segmented (not one flat string) so "pink"/"green" or "orange"/"blue"
// can be colored, matching the site's established convention for these
// words elsewhere.
const SES_PARA2_SEGMENTS: { text: string, color: string | null }[] = [
  { text: "Now that students are manually placed into shared classes rather than being randomly grouped, affluency gaps begin to take form. For this story, let's say that because our ", color: null },
  { text: "pink", color: 'var(--color-high-ses)' },
  { text: " friend has access to more resources, ", color: null },
  { text: "pink", color: 'var(--color-high-ses)' },
  { text: " was filtered into an advanced math class, while our ", color: null },
  { text: "green", color: 'var(--color-low-ses)' },
  { text: " friend stayed in a \"regular\" one. They still share a home room, but systems begin to pull them apart.", color: null },
]
const RACE_PARA2_SEGMENTS: { text: string, color: string | null }[] = [
  { text: "Now that students are manually placed into shared classes rather than being randomly grouped, gaps begin to take form. For this story, let's say that because our ", color: null },
  { text: "orange", color: 'var(--color-race-1)' },
  { text: " friend has access to more resources, ", color: null },
  { text: "orange", color: 'var(--color-race-1)' },
  { text: " was filtered into an advanced math class, while our ", color: null },
  { text: "blue", color: 'var(--color-race-2)' },
  { text: " friend stayed in a \"regular\" one. They still share a home room, but systems begin to pull them apart.", color: null },
]

type StepType = 'graph' | 'text'
const STEPS: { label: string, type: StepType }[] = [
  { label: 'Our two students in their kindergarten class.', type: 'graph' }, // 0
  { label: 'All students in grade K.', type: 'graph' },                     // 1
  { label: 'All students in grade 1.', type: 'graph' },                     // 2
  { label: 'All students in grade 2.', type: 'graph' },                     // 3
  { label: 'All students in grade 3.', type: 'graph' },                     // 4
  { label: '', type: 'text' },                                             // 5
  { label: 'All students in grade 4.', type: 'graph' },                    // 6
  { label: 'All students in grade 5.', type: 'graph' },                    // 7
]
const K3_LAST_STEP = 4
const GRADE45_START = 6

export default function GraphSectionElementary({ mode, onGrade3Complete, resetSignal, onExited }: {
  mode: Mode
  onGrade3Complete?: (nodes: Node[]) => void
  resetSignal?: number
  // Fires once when this section has been fully scrolled past (exitProgress
  // reaching 1) — forwarded up through ArticleSection to App.tsx to drive
  // the persistent toggle's reveal timing. See App.tsx's toggleRevealed
  // comment: the exact point the toggle should appear is still TBD, so this
  // is a placeholder trigger, easy to move to a later section once decided.
  onExited?: () => void
}) {
  const [k3GraphData, setK3GraphData] = useState<(GraphData | null)[]>([null, null, null, null])
  const [grade45Data, setGrade45Data] = useState<(GraphData | null)[]>([null, null])

  // Single-class step (0) dialogue state — see DIALOGUE above.
  const [visibleBubbles, setVisibleBubbles] = useState<boolean[]>([false, false, false])
  const [bubbleTexts, setBubbleTexts] = useState<string[]>(['', '', ''])
  const [dialogueDone, setDialogueDone] = useState(false)
  const dialogueTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasPlayedDialogue = useRef(false)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom, zoomRef,
  } = useGraphSection({
    steps: STEPS,
    // Carried over from GraphSection45 — the exit from grade 5 into
    // Section02 was too easy to blow past with a normal scroll flick.
    endBufferMs: 1400,
    // Desktop step navigation moved to explicit forward/back buttons (see
    // their render further down) instead of scroll — mobile is unaffected
    // either way, since it already only navigates via tap. Only this
    // section for now; GraphSection68/912 keep scroll-driven stepping.
    disableScrollNav: true,
  })

  // Mobile-only: the main graph effect below waits for this to catch up
  // to currentStep before actually building anything. A step change here
  // can trigger a real rebuild (new grade's data, or tearing down the
  // previous one) that runs synchronously in one block — on mobile's much
  // weaker CPUs that can block the main thread long enough to also block
  // touch/scroll input processing entirely. Originally added to
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

  // Graph-paper background — fades in as the user approaches (entry),
  // fades out as they approach the end of this whole section (exit,
  // ahead of the node-wave transition into middle school). Two separate
  // useScroll targets, each only relevant during its own end of the
  // section, so they don't fight each other in the middle.
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

  // Tells App.tsx's toggle-shadow logic this section is active. True
  // once faded in, false again once faded out near the end — mirrors
  // GraphSectionRepelAttract's own isVisuallyActive fix (a plain
  // "entered" flag that never reverts on forward scroll doesn't work,
  // since entryProgress clamps at 1 and stays there for the rest of this
  // very tall section).
  const [isVisuallyActive, setIsVisuallyActive] = useState(false)

  useEffect(() => {
    return entryProgress.on('change', (v) => {
      // Continuous, scroll-linked fade (not a fixed-duration timer) — this
      // guarantees full opacity is reached at exactly v=1, the same scroll
      // position where this section's own position:sticky freeze engages
      // (both are defined off the same useScroll target/offset). A
      // timer-based fade could still be mid-fade when the freeze hit if the
      // user scrolled through this range faster than the timer's duration —
      // that's what was causing the freeze to land before the graph looked
      // "settled," and made the fade itself feel like an abrupt cutoff
      // rather than a smooth, scroll-tracking transition.
      const amt = Math.min(1, Math.max(0, (v - 0.15) / 0.85))
      bgOpacity.set(amt)
      setIsVisuallyActive(amt > 0.3)
    })
  }, [entryProgress])

  const hasFiredOnExitedRef = useRef(false)
  useEffect(() => {
    return exitProgress.on('change', (v) => {
      if (v <= 0) return // not yet in the exit zone — don't interfere with entry-fade logic above
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
    window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'elementary', active: isVisuallyActive } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'elementary', active: false } }))
    }
  }, [isVisuallyActive])

  const [noticeText, setNoticeText] = useState('')
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      if (id === 'graph-elementary') setCurrentStep(0)
    }
    window.addEventListener('navResetGraphStep', handler)
    return () => window.removeEventListener('navResetGraphStep', handler)
  }, [setCurrentStep])

  useEffect(() => {
    Promise.all([0, 1, 2, 3].map(i => fetch(`/data/graphs/${i}.json`).then(r => r.json())))
      .then(results => setK3GraphData(results))
    Promise.all([4, 5].map(i => fetch(`/data/graphs/${i}.json`).then(r => r.json())))
      .then(results => setGrade45Data(results))
  }, [])

  // Two persistent notice texts, sharing one noticeText state (only one
  // is ever relevant at a time, depending on step range): the K-3 one
  // types in at grade K and stays through grade 3; the grade 4-5 one
  // types in at grade 4 and now stays through grade 5 too (previously it
  // cleared immediately on reaching grade 5).
  const K3_NOTICE_TEXT = "At this age, students typically share all of their classes with a single group of peers."
  const GRADE45_NOTICE_TEXT = "Notice how students transition into sharing classes, rather than being isolated in individual pods."
  const k3NoticeDoneRef = useRef(false)
  const grade45NoticeDoneRef = useRef(false)
  const [activeNoticeSource, setActiveNoticeSource] = useState<'k3' | 'grade45' | null>(null)

  useEffect(() => {
    if (currentStep >= 1 && currentStep <= K3_LAST_STEP) {
      if (!k3NoticeDoneRef.current) {
        k3NoticeDoneRef.current = true
        setActiveNoticeSource('k3')
        setNoticeText('')
        let i = 0
        clearInterval(noticeIntervalRef.current!)
        noticeIntervalRef.current = setInterval(() => {
          i++
          setNoticeText(K3_NOTICE_TEXT.slice(0, i))
          if (i >= K3_NOTICE_TEXT.length) clearInterval(noticeIntervalRef.current!)
        }, 22)
      }
    } else {
      k3NoticeDoneRef.current = false
    }

    if (currentStep >= GRADE45_START) {
      if (!grade45NoticeDoneRef.current) {
        grade45NoticeDoneRef.current = true
        setActiveNoticeSource('grade45')
        setNoticeText('')
        let i = 0
        clearInterval(noticeIntervalRef.current!)
        noticeIntervalRef.current = setInterval(() => {
          i++
          setNoticeText(GRADE45_NOTICE_TEXT.slice(0, i))
          if (i >= GRADE45_NOTICE_TEXT.length) clearInterval(noticeIntervalRef.current!)
        }, 22)
      }
    } else {
      grade45NoticeDoneRef.current = false
    }

    // Neither range active (step 0, or the text step) — clear whichever
    // was showing.
    if (!(currentStep >= 1 && currentStep <= K3_LAST_STEP) && currentStep < GRADE45_START) {
      clearInterval(noticeIntervalRef.current!)
      setNoticeText('')
      setActiveNoticeSource(null)
    }
  }, [currentStep])

  const activeNoticeFullText = activeNoticeSource === 'k3' ? K3_NOTICE_TEXT : activeNoticeSource === 'grade45' ? GRADE45_NOTICE_TEXT : ''

  // Single-class step (0) dialogue — copied from GraphSection68's own
  // trigger pattern: mobile uses an IntersectionObserver (this section is
  // plain in-flow, not sticky, on mobile, so it only briefly crosses a
  // narrow "about to be visible" band while scrolling — a scroll event not
  // happening to land in that band could miss the trigger entirely, where
  // IntersectionObserver tracks visibility continuously regardless of
  // scroll speed). Desktop stays pinned via position:sticky for a long
  // scroll range once stuck, so a plain scroll-listener checking a narrow
  // rect.top band works fine there.
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
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect()
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

  const skipDialogue = () => {
    if (currentStep !== 0 || dialogueDone) return
    dialogueTimers.current.forEach(t => clearTimeout(t))
    setVisibleBubbles([true, true, true])
    setBubbleTexts(DIALOGUE.map(d => d.text))
    setDialogueDone(true)
  }

  const bubbleColorHigh = mode === 'race' ? '#FF9260' : '#FF8BDE'
  const bubbleColorLow = mode === 'race' ? '#8BA4FF' : '#22D880'

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

  const justEnteredRef = useRef(0)
  useEffect(() => {
    setHoveredNode(null)
    tooltipRef.current?.style('opacity', 0)
    justEnteredRef.current = Date.now()
  }, [currentStep])

  // hover highlighting — the single-class step (0) wants bigger regular-node
  // circles (see applyHoverHighlight's useLargeRadius param); every other
  // step here uses the normal radius.
  useEffect(() => {
    if (!svgRef.current) return
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current, currentStep === 0)
    d3.select(svgRef.current).selectAll<SVGCircleElement, Node>('circle.protagonist-border')
      .attr('r', faceSizeForStep(currentStep) * BORDER_RATIO)
  }, [hoveredNode, currentStep])

  // main graph effect — skips entirely on the text-only step (the <svg>
  // itself stays mounted the whole time regardless — see the file-level
  // comment on why it must never conditionally unmount).
    useEffect(() => {
    if (STEPS[currentStep].type === 'text') return
    if (!svgRef.current || graphSize.width === 0) return
    // Mobile-only: wait for the one-frame defer above to catch up before
    // doing any real work — see deferredStep's own comment for why. This
    // effect will naturally re-run once setDeferredStep fires.
    if (isMobile && deferredStep !== currentStep) return

    const isK3Range = currentStep <= K3_LAST_STEP
    if (isK3Range && !k3GraphData[0]) return
    if (!isK3Range && !grade45Data[currentStep - GRADE45_START]) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const protagonistLow = getProtagonistLow(mode)

    let newNodes: Node[] = [], newEdges: Edge[] = []
    const faceSize = faceSizeForStep(currentStep)

    if (currentStep === 0) {
      // Neighbors of the two protagonists, in their shared kindergarten
      // class — this is what used to be step 1 (the old step 0, just the
      // two isolated dots with no edges, is gone).
      const gradeData = k3GraphData[0]!
      const neighborIds = new Set<number>([PROTAGONIST_HIGH, protagonistLow])
      gradeData.edges.forEach(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        if (src === PROTAGONIST_HIGH || tgt === PROTAGONIST_HIGH || src === protagonistLow || tgt === protagonistLow) {
          neighborIds.add(src); neighborIds.add(tgt)
        }
      })
      newNodes = gradeData.nodes.filter(n => neighborIds.has(n.id)).map(n => {
        const existing = existingById.get(n.id)
        // The two protagonists' face SVGs are angled to face each other,
        // so this step needs them to consistently stay on the same sides —
        // high-SES/white-or-Asian protagonist on the left, low-SES/POC
        // protagonist on the right. Just seeding their starting x (fx:
        // null, released once the sim starts) wasn't enough — the charge
        // force and neighbor-node collisions could still push one past the
        // other during settling, which is what "sometimes" the wrong side
        // was. Pinning fx (not releasing it) removes that possibility
        // entirely; y stays free so they still settle naturally with the
        // group vertically. No entrance animation — nodes are simply at
        // their resting position from frame one.
        if (n.id === PROTAGONIST_HIGH) {
          return { ...(existing ?? n), x: cx - 25, y: existing?.y ?? cy, fx: cx - 25, fy: null }
        }
        if (n.id === protagonistLow) {
          return { ...(existing ?? n), x: cx + 25, y: existing?.y ?? cy, fx: cx + 25, fy: null }
        }
        return existing ? { ...existing, fx: null, fy: null } : { ...n, x: cx + (Math.random() - 0.5) * 90, y: cy + (Math.random() - 0.5) * 90 }
      })
      newEdges = gradeData.edges.filter(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        return neighborIds.has(src) && neighborIds.has(tgt)
      }).map(e => ({ ...e }))
    } else if (isK3Range) {
      // steps 1-4: grade K/1/2/3
      const data = k3GraphData[currentStep - 1]
      if (!data) return
      const filteredNodes = data.nodes.filter(n => !isSpeechOnly(n))
      const filteredIds = new Set(filteredNodes.map(n => n.id))
      newNodes = filteredNodes.map(n => {
        const existing = existingById.get(n.id)
        // Cold-started (no continuation) nodes spread across the actual
        // panel dimensions, same convention as the grade4/5 branch below —
        // NOT the old fixed ±40px clump. autoZoom fits to whatever the
        // outer bounding box happens to be the moment its snapshot is
        // taken; a tight clump gives it a tiny, wrong box regardless of
        // how long you wait before snapshotting, since this range's charge
        // (-2) is far too weak to visibly expand ~300 cold-started nodes
        // out to their real spread within any delay that doesn't feel
        // broken to sit through. Starting already spread across the panel
        // means the outer extent is roughly right from frame one; internal
        // clustering (via link/collision forces) still refines from there,
        // it just no longer has to also do the job of expanding the whole
        // cluster outward first.
        return existing
          ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
          : { ...n, x: cx + (Math.random() - 0.5) * width * 0.7, y: cy + (Math.random() - 0.5) * height * 0.7 }
      })
      newEdges = data.edges.filter(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        return filteredIds.has(src) && filteredIds.has(tgt)
      }).map(e => ({ ...e }))
    } else {
      // steps 6-7: grade 4/5
      const data = grade45Data[currentStep - GRADE45_START]!
      const filteredNodes = data.nodes.filter(n => !isSpeechOnly(n))
      const filteredIds = new Set(filteredNodes.map(n => n.id))
      newNodes = filteredNodes.map(n => {
        const existing = existingById.get(n.id)
        return existing
          ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
          : { ...n, x: cx + (Math.random() - 0.5) * width * 0.7, y: cy + (Math.random() - 0.5) * height * 0.7 }
      })
      newEdges = data.edges.filter(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        return filteredIds.has(src) && filteredIds.has(tgt)
      }).map(e => ({ ...e }))
    }

    activeNodesRef.current = newNodes
    activeEdgesRef.current = newEdges

    if (currentStep === K3_LAST_STEP) onGrade3Complete?.(newNodes.map(n => ({ ...n })))

    const isSmall = newNodes.length <= 2
    const isGrade45 = currentStep >= GRADE45_START
    const displayEdges = currentStep === 0
      ? newEdges.filter(e => {
          const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
          const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
          return src === PROTAGONIST_HIGH || src === protagonistLow || tgt === PROTAGONIST_HIGH || tgt === protagonistLow
        })
      : newEdges

    if (simulationRef.current) simulationRef.current.stop()

    const simulation = isGrade45
      ? d3.forceSimulation<Node>(newNodes)
          .force('link', d3.forceLink<Node, Edge>(displayEdges).id(d => d.id)
            .distance(d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5)))
            .strength(d => Math.min(1, (d as unknown as Edge).weight * 0.06)))
          .force('charge', d3.forceManyBody().strength(-80))
          .force('center', d3.forceCenter(cx, cy))
          .force('collision', d3.forceCollide().radius(8))
          // Gentle synthetic constraint, not a real data edge — nudges
          // the two protagonists toward a moderate distance from each
          // other (close, but visibly apart) rather than leaving their
          // proximity purely to wherever the real data happens to place
          // them. Modest strength so real connections still dominate the
          // overall layout; this just biases the pair specifically,
          // matching the "affluency gaps taking form" story beat.
          .force('protagonistProximity', d3.forceLink<Node, Edge>([
            { source: PROTAGONIST_HIGH, target: protagonistLow, weight: 1 },
          ]).id(d => d.id).distance(110).strength(0.5))
          .alphaDecay(isMobile ? 0.05 : 0.0228)
      : d3.forceSimulation<Node>(newNodes)
          .force('link', d3.forceLink<Node, Edge>(displayEdges).id(d => d.id)
            .distance(isSmall ? 80 : 40).strength(isSmall ? 0.1 : 0.3))
          .force('charge', d3.forceManyBody().strength(isSmall ? -500 : currentStep === 0 ? -60 : -2))
          .force('center', d3.forceCenter(cx, cy))
          .force('collision', d3.forceCollide().radius(isSmall ? faceSize + 5 : 10))
          .alphaDecay(isMobile ? 0.05 : 0.0228)

    simulationRef.current = simulation

    // padding bumped up a bit for step 0 specifically (from 40/15 to
    // 55/20) — the zoom fit below now happens almost immediately, based
    // on the neighbors' INITIAL scattered positions rather than waiting
    // for physics to settle first, so there needs to be enough slack for
    // them to still visibly move into their final spots without drifting
    // outside the already-fixed frame.
    const padding = isGrade45 ? (isMobile ? 30 : 80) : (isSmall ? (isMobile ? 60 : 150) : (currentStep === 0 ? (isMobile ? 20 : 55) : (isMobile ? 30 : 80)))
    // Reordered per feedback: this used to wait 1400ms, measuring the
    // bounding box AFTER physics had already settled the neighbors into
    // place — meaning nodes visibly moved first (at whatever default,
    // unfit zoom), then the view snapped/zoomed to catch up once they'd
    // already stopped. Now the fit is computed almost immediately (0ms —
    // still deferred one tick so the enter-selection's initial attrs
    // exist first), using the neighbors' INITIAL scattered position
    // instead of their settled one.
    //
    // The zoom itself is also no longer animated (no .transition()) —
    // applying it instantly, rather than over 400ms, means there's no
    // window where the zoom is still moving AND the neighbor nodes are
    // also moving at the same time. That overlap was especially visible
    // revisiting step 0 after being on a later step (zooming from that
    // step's wider fit back down to this one while nodes were also
    // repositioning read as chaotic). Now it's two clean, sequential
    // phases: the frame snaps to the correct fit first, then whatever
    // physics-driven settling happens is the only motion on screen.
    const zoomTimer = currentStep === 0
      ? setTimeout(() => {
          if (!svgRef.current || !zoomRef.current) return
          try {
            const panel = graphPanelRef.current
            const fitWidth = panel?.clientWidth || width
            const fitHeight = panel?.clientHeight || height
            const bounds = (g.node() as SVGGElement).getBBox()
            if (bounds.width === 0) return
            const scale = Math.min((fitWidth - padding * 2) / bounds.width, (fitHeight - padding * 2) / bounds.height)
            const tx = fitWidth / 2 - cx * scale
            const ty = fitHeight / 2 - cy * scale
            d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
          } catch (_) {}
        }, 0)
      : autoZoom(g, width, height, padding, 800)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - faceSize / 2).attr('y', d => (d.y ?? 0) - faceSize / 2)
      nodeG.selectAll<SVGCircleElement, Node>('circle.protagonist-border')
        .attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
    })

    const linkLines = linkG.selectAll<SVGLineElement, Edge>('line').data(displayEdges)
    linkLines.exit().transition().duration(300).attr('stroke-opacity', 0).remove()
    linkLines.enter().append('line')
      .attr('stroke', d => getEdgeColor(d, mode)).attr('stroke-width', 1).attr('stroke-opacity', 0)
      .transition().duration(600).attr('stroke-opacity', 0.2)
    linkLines.transition().duration(300).attr('stroke', d => getEdgeColor(d, mode))

    const nonProtags = newNodes.filter(n => !isProtagonist(n.id, mode))
    const protags = newNodes.filter(n => isProtagonist(n.id, mode))

    const circles = nodeG.selectAll<SVGCircleElement, Node>('circle.regular-node').data(nonProtags, d => d.id)
    circles.exit().transition().duration(300).attr('opacity', 0).remove()
    circles.enter().append('circle')
      .attr('class', 'regular-node')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy)
      .attr('r', currentStep === 0 ? 10 : 6).attr('fill', d => getNodeColor(d, mode))
      .attr('stroke', 'white').attr('stroke-width', 0.8).attr('cursor', currentStep === 0 ? 'default' : 'pointer').attr('opacity', 0)
      .transition().duration(500).attr('opacity', 1)
    circles.transition().duration(300).attr('r', currentStep === 0 ? 10 : 6).attr('fill', d => getNodeColor(d, mode))

    // Solid white circle behind each protagonist face — <image> elements
    // can't take a stroke directly (that only applies to shapes), and an
    // outline stroke would trace the image's own square bounding box
    // rather than its actual (non-circular) visible artwork anyway. A
    // solid filled circle, slightly larger than the face and rendered
    // behind it, creates a border illusion regardless of the SVG's real
    // silhouette.
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
    faceImages.attr('href', d => getFaceSrc(d, mode, isGrade45 ? '45' : 'K3')).attr('width', faceSize).attr('height', faceSize)
    faceImages.enter().append('image')
      .attr('href', d => getFaceSrc(d, mode, isGrade45 ? '45' : 'K3')).attr('width', faceSize).attr('height', faceSize)
      .attr('x', d => (d.x ?? cx) - faceSize / 2).attr('y', d => (d.y ?? cy) - faceSize / 2)
      .attr('cursor', currentStep === 0 ? 'default' : 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)

    // Hover/tap highlighting and drag are unnecessary during the dialogue
    // step — its two nodes are placeholder dummies, not real data, so
    // there's nothing meaningful to highlight/dim toward or show stats
    // about.
    if (currentStep !== 0) setupNodeInteractions(nodeG, simulation, mode)

    nodeG.selectAll<SVGCircleElement, Node>('circle.regular-node').attr('opacity', 1)
    linkG.selectAll<SVGLineElement, Edge>('line').attr('stroke', d => getEdgeColor(d, mode)).attr('stroke-opacity', 0.2)

    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, deferredStep, k3GraphData, grade45Data, graphSize.width, graphSize.height, mode, isMobile])

  const isTextStep = STEPS[currentStep].type === 'text'
  const para2Segments = mode === 'race' ? RACE_PARA2_SEGMENTS : SES_PARA2_SEGMENTS

  return (
    <div ref={outerRef} id="graph-elementary" style={{ height: isMobile ? '100vh' : `${STEPS.length * 45}vh`, position: 'relative' }}>
      <div ref={sectionRef} style={{ position: isMobile ? 'relative' : 'sticky', top: 0, width: '100%', height: '100vh', overflow: 'hidden', willChange: isMobile ? undefined : 'transform' }}>

        {/* Solid backdrop — was a hardcoded opaque backgroundColor directly
            on sectionRef above, which (now that this section overlaps the
            intro text via marginTop) painted over that text immediately on
            load instead of fading in with everything else. Pulled out into
            its own motion layer sharing bgOpacity with the wallpaper right
            below, so the intro text stays visible through the hold phase
            and both fade in together exactly on the same schedule they did
            before this section overlapped anything. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundColor: 'var(--color-bg)',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Graph-paper background — fades in smoothly as the user
            approaches (see entryProgress above), always on afterward
            including during the text-only step (per feedback: this
            should still read as "being in the graph section", just with
            text instead of a graph). Same visual convention as
            GraphSectionRepelAttract. A direct child of sectionRef (not the
            content wrapper below) so it always spans the section's full
            height regardless of how much shorter the actual content is on
            mobile — otherwise the wallpaper stopped short of the bottom
            of the screen right along with the content. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/assets/graph-paper-bg.png)',
          backgroundRepeat: 'repeat',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Content wrapper — capped at the mobile graph screen's actual
            height (shorter than the section's own 100vh, to leave edge
            padding at the bottom) so none of the content shifts position;
            only the wallpaper above extends into that extra space. */}
        <div style={{ height: isMobile ? '94vh' : '100%', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', position: 'relative' }}>

        {/* left panel — semi-opaque block background always present
            (including during the text step); only the label/hint-
            bar/dots content differs by step type. Stats removed for now
            (not relevant until middle school). Hint bar only shows for
            K-3 range steps — GraphSection45's own left panel never had
            one, and that's preserved here for grades 4-5. Notice text
            positioned to match GraphSectionRepelAttract's own convention
            (absolute, relative to this outer panel directly, not an
            inner wrapper) so grades 4-5's layout doesn't overlap. */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'center', padding: isMobile ? '4.5rem 1.5rem 0.5rem 1.5rem' : '3rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem', zIndex: 1 }}>
          {!isMobile && (
            <div style={{ position: 'absolute', top: '3%', bottom: '3%', left: '1rem', right: '1rem', backgroundColor: 'rgba(250, 249, 246, 0.82)', borderRadius: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 0 }} />
          )}
          {!isMobile && noticeText && (
            <p style={{ position: 'absolute', top: '6rem', left: '3rem', right: '2rem', zIndex: 1, fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
              {noticeText}
              {noticeText.length < activeNoticeFullText.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
            </p>
          )}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: isMobile ? 'center' : 'flex-start', width: '100%' }}>
            <div style={{
              // Mobile wraps just the title text in a translucent pill
              // background, matching RepelAttract's own mobile title
              // treatment (and the toggle's backdrop style) — this had no
              // background at all before, unlike every other mobile title
              // on the site.
              backgroundColor: isMobile ? 'rgba(250, 249, 246, 0.82)' : 'transparent',
              borderRadius: isMobile ? '18px' : 0,
              padding: isMobile ? '1rem 1.5rem' : 0,
            }}>
              <AnimatePresence mode="wait">
                <motion.p key={currentStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: isMobile ? 'center' : 'left' }}>
                  {/* Text step has no graph, so no real title exists for this
                      slot — a pause glyph sits there instead. \uFE0E (text
                      presentation selector) keeps it a plain monochrome
                      glyph rather than rendering as a colorful emoji, which
                      some mobile browsers otherwise default to for this
                      character. Placeholder for now — easy to swap for a
                      custom SVG later if this doesn't read well. */}
                  {isTextStep ? '\u23F8\uFE0E' : STEPS[currentStep].label}
                </motion.p>
              </AnimatePresence>
            </div>
            {!isMobile && (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            )}
          </div>
          {/* Desktop-only "skip ahead" affordance on K/1st/2nd grade —
              mobile already has fast tap-through navigation, so this is
              purely to save scrolling for a desktop visitor who's already
              seen these grades before. Not shown on grade 3 itself
              (K3_LAST_STEP) since that's already the destination. Moved
              here (bottom-right of the left panel) from the graph panel's
              own bottom-right corner. */}
          {!isMobile && currentStep >= 1 && currentStep < K3_LAST_STEP && (
            <motion.div
              onClick={(e) => { e.stopPropagation(); setCurrentStep(K3_LAST_STEP) }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', bottom: '3rem', right: '2.5rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.15rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.6rem 1.1rem', borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              Skip to grade 3
            </motion.div>
          )}
        </div>

        {/* graph panel — the <svg> stays mounted at all times (see the
            file-level comment on why); the text-only step overlays an
            opaque div on top of it instead of replacing it. */}
        <div
          ref={graphPanelRef}
          onClick={(e) => {
            // Skip the dialogue on tap/click, same on every platform.
            if (currentStep === 0 && !dialogueDone) {
              skipDialogue()
              return
            }
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
            if (!isTextStep) {
              const target = e.target as Element
              if (target.tagName === 'circle' || target.tagName === 'image') {
                if (Date.now() - justEnteredRef.current < 500) return
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
              // Was `return`ing here — inconsistent with the identical
              // branch in GraphSection68/GraphSection912, which both fall
              // through instead. With the return, ANY tap after a node
              // had been tapped once (setting hoveredNode) only ever
              // closed the tooltip and consumed the tap — never reaching
              // the advance-step logic below — so on a graph dense enough
              // that an "advance" tap easily lands on/near a node instead
              // of empty space, forward navigation could get stuck
              // needing repeated taps just to clear hoveredNode each time.
              if (hoveredNode !== null) {
                setHoveredNode(null)
                tooltipRef.current?.style('opacity', 0)
              }
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
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', zIndex: 1, cursor: isMobile ? 'pointer' : 'default' }}
        >
          {/* Desktop-only "Click to go back" — genuinely positioned to the
              right of the left panel (i.e. inside the graph panel itself,
              at its top-left corner), not floating within the left panel
              — per feedback, it needs to sit past that boundary, not just
              near it. Hidden entirely on step 0, since there's nowhere to
              go back to. No cursor override — the site has its own custom
              cursor SVG that the browser's default pointer/hand icon
              would otherwise cover up on hover. */}
          {!isMobile && currentStep > 0 && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                setCurrentStep(prev => Math.max(0, prev - 1))
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', top: '1.5rem', left: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              ← Click to go back
            </motion.div>
          )}
          {/* Desktop-only "Click to go forward" — see the matching "Click
              to go back" comment just above. Mirrors the same dialogue-
              skip-then-advance behavior mobile's own tap-to-advance
              already has on step 0. Hidden entirely on the last step, full
              stop — no longer conditioned on dialogueDone too, since that
              left a loophole where it could still show up if that flag
              wasn't true yet for some reason. No cursor override, same
              reasoning as the back button. */}
          {!isMobile && currentStep !== STEPS.length - 1 && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                if (currentStep === 0 && !dialogueDone) { skipDialogue(); return }
                setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', top: '1.5rem', right: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              Click to go forward →
            </motion.div>
          )}
          {isMobile && !isTextStep && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '16%', right: '16%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {noticeText}
                {noticeText.length < activeNoticeFullText.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
              </p>
            </div>
          )}

          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{
            display: 'block', width: '100%', height: '100%', touchAction: 'pan-y',
            opacity: isTextStep ? 0 : 1, pointerEvents: isTextStep ? 'none' : 'auto',
          }} />

          {/* comic strip dialogue bubbles — single-class step only. Ported
              directly from GraphSection68's format per feedback; that
              file's own visual style hasn't been brought in line with
              this file's newer conventions yet, so this isn't restyled. */}
          {currentStep === 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
              <div style={{ position: 'absolute', left: isMobile ? '23%' : '32%', top: isMobile ? '22%' : '23%', maxWidth: isMobile ? '160px' : '240px' }}>
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
              <div style={{ position: 'absolute', right: isMobile ? '23%' : '32%', top: isMobile ? '30%' : '28%', maxWidth: isMobile ? '160px' : '240px' }}>
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
              {/* "Yes!" replies to "Wanna be best friends?", so it sits
                  below that bubble rather than stacking directly under
                  "Nice to meet you!" in the same column. */}
              <div style={{ position: 'absolute', left: isMobile ? '23%' : '32%', top: isMobile ? '35%' : '33%', maxWidth: isMobile ? '160px' : '240px' }}>
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

          {isTextStep && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: 'easeInOut' }}
              style={{
                position: 'absolute', inset: 0, backgroundColor: 'transparent',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
                padding: isMobile ? '2.5rem 1.5rem' : '3rem 4rem',
              }}>
              {/* Blurred oval sitting behind the text, independent of it
                  (not a blurred parent, which would blur the text too) —
                  semi-opaque bg color, heavily blurred edges so it fades
                  into the graph-paper background rather than reading as
                  a hard-edged card. */}
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
                {PARA1}
              </p>
              <p style={{
                position: 'relative', zIndex: 1,
                fontFamily: "'Kiwi Maru', serif",
                fontSize: isMobile ? 'clamp(0.85rem, 3.5vw, 1.05rem)' : 'clamp(1rem, 1.7vw, 1.35rem)',
                color: '#111', lineHeight: 1.8, textAlign: 'center', margin: 0, maxWidth: '760px',
              }}>
                {para2Segments.map((seg, i) => seg.color
                  ? <span key={i} style={{ color: seg.color }}>{seg.text}</span>
                  : <span key={i}>{seg.text}</span>
                )}
              </p>
            </motion.div>
          )}

          {isMobile && (
            <>
              {currentStep > 0 && (
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
              <div style={{ position: 'absolute', bottom: '2.6rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            </>
          )}
          {/* "Skip to grade 3" button now lives in the left panel — see
              above. */}
        </div>
        </div>
      </div>
    </div>
  )
}