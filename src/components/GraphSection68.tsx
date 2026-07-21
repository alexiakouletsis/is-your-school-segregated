import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import NodeStats from './NodeStats'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import {
  PROTAGONIST_HIGH, getProtagonistLow, getEdgeColor,
  isProtagonist, getNodeColor, getFaceSrc, applyHoverHighlight, getTooltipHtml,
} from './graphUtils'

const DIALOGUE = [
  { node: 'high', text: "I hope we'll still have the same teachers!", delay: 0 },
  { node: 'low', text: "Promise we'll still be friends even if we don't?", delay: 2200 },
  { node: 'high', text: "Promise!", delay: 4400 },
]

// Step 0 is the dialogue phase. Step 1 is the existing generic/district-wide
// 6th grade data (continues the original two protagonists). Steps 2-4 are
// the new de-identified comparison school's 6th/7th/8th grade data.
const STEPS = [
  { label: '' },
  { label: 'All students in grade 6.' },
  { label: 'All students in an alternative 6th grade.' },
  { label: 'All students in an alternative 7th grade.' },
  { label: 'All students in an alternative 8th grade.' },
]

// The persistent explanatory sentence shown once entering step 1.
const TRACKING_LOW_TEXT = "This is what a middle school with minimal course tracking/segregation looks like."

// Steps 2-4 share a common prefix ("And this is what ") that's typed once
// and then stays on screen unchanged. Only the suffix differs per grade —
// when moving between steps 2/3/4, the suffix crossfades (fades out/in)
// instead of retyping, since the prefix is already sitting there.
const ALT_TEXT_PREFIX = "And this is what "
const ALT_TEXT_SUFFIX: Record<number, string> = {
  2: "6th grade looks like at a different public middle school. Students are funneled into specific pathways as young as 11 or 12 years old.",
  3: "7th grade looks like at that public middle school.",
  4: "8th grade looks like at that public middle school.",
}

const getNoticeTarget = (step: number) => {
  if (step === 1) return TRACKING_LOW_TEXT
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
  if (d.id === ALT_PROTAGONIST_HIGH) return mode === 'race' ? '#FF954D' : '#F17091'
  if (d.id === ALT_PROTAGONIST_LOW) return mode === 'race' ? '#6897FF' : '#00B178'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return d.ses === 'higher' ? '#F17091' : '#00B178'
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
  if (mode === 'race') return src.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return src.ses === 'higher' ? '#F17091' : '#00B178'
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
// Keyed by currentStep (2 = alt-6, 3 = alt-7, 4 = alt-8).
const ALT_NODE_SAMPLE_CAP: Record<number, number> = {
  2: 300,
  3: 400,
  4: 400,
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

export default function GraphSection68({ mode }: { mode: Mode }) {
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
  const dialogueDoneRef = useRef(false)
  const bubbleIntervals = useRef<ReturnType<typeof setInterval>[]>([])
  const dialogueTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasPlayedDialogue = useRef(false)

  const altFullPopulationRef = useRef<Node[]>([])

  useEffect(() => { dialogueDoneRef.current = dialogueDone }, [dialogueDone])

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
      (currentStep === 0 && !dialogueDoneRef.current) ||
      (currentStep >= 2 && Date.now() - altStepEnteredAtRef.current < 900),
  })

  useEffect(() => {
    if (currentStep >= 2) altStepEnteredAtRef.current = Date.now()
  }, [currentStep])

  const getFaceSize = () => currentStep === 0 ? 40 : 25

  // dialogue
  useEffect(() => {
    if (currentStep !== 0) {
      hasPlayedDialogue.current = false
      setVisibleBubbles([false, false, false])
      setBubbleTexts(['', '', ''])
      setDialogueDone(false)
      bubbleIntervals.current.forEach(t => clearInterval(t))
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
          let charIndex = 0
          const interval = setInterval(() => {
            charIndex++
            setBubbleTexts(prev => { const next = [...prev]; next[i] = d.text.slice(0, charIndex); return next })
            if (charIndex >= d.text.length) {
              clearInterval(interval)
              if (i === DIALOGUE.length - 1) setDialogueDone(true)
            }
          }, 22)
          bubbleIntervals.current[i] = interval
        }, d.delay + 600)
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
        bubbleIntervals.current.forEach(t => clearInterval(t))
      }
    } else {
      // Desktop stays pinned via position:sticky for a long scroll range
      // once stuck, so the narrow band check has plenty of time to catch a
      // scroll event and works fine as-is.
      const tryPlay = () => {
        if (hasPlayedDialogue.current) return
        if (!sectionRef.current) return
        const rect = sectionRef.current.getBoundingClientRect()
        if (rect.top <= 10 && rect.top >= -10) {
          window.removeEventListener('scroll', tryPlay)
          play()
        }
      }
      tryPlay()
      window.addEventListener('scroll', tryPlay, { passive: true })
      return () => {
        window.removeEventListener('scroll', tryPlay)
        dialogueTimers.current.forEach(t => clearTimeout(t))
        bubbleIntervals.current.forEach(t => clearInterval(t))
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
    }, 22)
  }, [currentStep])

  // alt-group text — types the full "And this is what 6th grade..." sentence
  // once on first arriving at step 2, then hands off to static rendering
  // (see JSX below): the "And this is what " prefix stays put as plain text,
  // and only the suffix crossfades via AnimatePresence as currentStep moves
  // between 2/3/4, rather than retyping the whole sentence each time.
  useEffect(() => {
    const inAltGroup = currentStep >= 2
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
    const fullText = ALT_TEXT_PREFIX + ALT_TEXT_SUFFIX[2]
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
    }, 22)
  }, [currentStep])

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
  }, [hoveredNode])

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (currentStep > 0 && !allGraphData[currentStep - 1]) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const protagonistLow = getProtagonistLow(mode)
    const faceSize = getFaceSize()
    const isAltStep = currentStep >= 2

    let newNodes: Node[] = [], newEdges: Edge[] = []

    if (currentStep === 0) {
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
      const data = allGraphData[currentStep - 1]!
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
      if (isAltStep) altFullPopulationRef.current = filteredFullNodes.map(n => ({ ...n }))

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
      const zoomTimer = autoZoom(g, width, height, padding, 800)

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

      nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
        .join(
          enter => enter.append('circle')
            .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
            .attr('fill', d => getAltNodeColor(d, mode))
            .attr('stroke', 'white').attr('stroke-width', 0.8)
            .attr('cursor', 'pointer').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 1),
          update => update.attr('fill', d => getAltNodeColor(d, mode)),
          exit => exit.transition().duration(300).attr('opacity', 0).remove()
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

    // Non-alt steps (dialogue + step 1) continue with the normal live
    // physics simulation below.
    const isSmall = currentStep === 0

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
    const zoomTimer = autoZoom(g, width, height, padding, currentStep === 1 ? 1600 : 800)

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

    const circles = nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
    circles.exit().transition().duration(300).attr('opacity', 0).remove()
    circles.enter().append('circle')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
      .attr('fill', d => nodeColorFn(d, mode)).attr('stroke', 'white').attr('stroke-width', 0.8)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)
    circles.transition().duration(300).attr('fill', d => nodeColorFn(d, mode))

    const faceImages = nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
    faceImages.exit().remove()
    faceImages.attr('href', d => faceSrcFn(d)).attr('width', faceSize).attr('height', faceSize)
    faceImages.enter().append('image')
      .attr('href', d => faceSrcFn(d)).attr('width', faceSize).attr('height', faceSize)
      .attr('x', d => (d.x ?? cx) - faceSize / 2).attr('y', d => (d.y ?? cy) - faceSize / 2)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)

    setupNodeInteractions(nodeG, simulation, mode)

    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, allGraphData, graphSize, mode, isMobile])

  const renderNoticeContent = () => {
    if (currentStep === 1) {
      if (!noticeText) return null
      return (
        <>
          {noticeText}
          {noticeText.length < TRACKING_LOW_TEXT.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
        </>
      )
    }
    if (currentStep >= 2) {
      if (!altTypingDone) {
        if (!altTypedText) return null
        return (
          <>
            {altTypedText}
            {altTypedText.length < (ALT_TEXT_PREFIX + ALT_TEXT_SUFFIX[2]).length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
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
              {ALT_TEXT_SUFFIX[currentStep]}
            </motion.span>
          </AnimatePresence>
        </>
      )
    }
    return null
  }

  const skipDialogue = () => {
    if (currentStep !== 0 || dialogueDone) return
    bubbleIntervals.current.forEach(t => clearInterval(t))
    dialogueTimers.current.forEach(t => clearTimeout(t))
    setVisibleBubbles([true, true, true])
    setBubbleTexts(DIALOGUE.map(d => d.text))
    setDialogueDone(true)
  }

  const bubbleColorHigh = mode === 'race' ? '#FF954D' : '#F17091'
  const bubbleColorLow = mode === 'race' ? '#6897FF' : '#00B178'

  const bubbleStyle = (isRight: boolean, color: string) => ({
    backgroundColor: 'white',
    border: `2px solid ${color}`,
    borderRadius: '12px',
    padding: '0.5rem 0.75rem',
    fontFamily: "'Kiwi Maru', serif",
    fontSize: isMobile ? 'clamp(0.65rem, 2.8vw, 0.85rem)' : 'clamp(0.8rem, 1.2vw, 1rem)',
    color: '#111',
    lineHeight: 1.4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    position: 'relative' as const,
    textAlign: isRight ? 'right' as const : 'left' as const,
  })

  return (
    <div style={{ height: isMobile ? '100svh' : `${STEPS.length * 100}vh`, position: 'relative', flexShrink: 0, width: '100%', marginTop: isMobile ? '-3vh' : 0 }}>
      <div
        ref={sectionRef}
        style={{
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          width: '100%',
          height: isMobile ? '100svh' : '100vh',
          backgroundColor: 'var(--color-bg)',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
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

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: isMobile ? '2.75rem 1.5rem 0.5rem 1.5rem' : '7.5rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem', position: 'relative' }}>
          {!isMobile && (
            <div style={{ height: '9rem', display: 'flex', alignItems: 'flex-start', position: 'absolute', top: '7.5rem', left: '3rem', right: '2rem', overflow: 'visible' }}>
              {(currentStep === 1 ? noticeText : altTypedText || altTypingDone) && (
                <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 1.8vw, 1.4rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                  {renderNoticeContent()}
                </p>
              )}
            </div>
          )}
          {/* Label + dots + NodeStats: bottom-anchored as their own group,
              fully decoupled from the notice text above — this is a fixed
              position regardless of how long that text is, rather than
              flowing after it. */}
          {!isMobile && (
            <div style={{ position: 'absolute', top: '28rem', left: '3rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <AnimatePresence mode="wait">
                <motion.p key={currentStep}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}
                >
                  {STEPS[currentStep].label}
                </motion.p>
              </AnimatePresence>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
              <NodeStats nodes={currentStep >= 2 ? altFullPopulationRef.current : activeNodesRef.current} mode={mode} visible={currentStep >= 1} mobile={false} />
            </div>
          )}
          {isMobile && (
            <AnimatePresence mode="wait">
              <motion.p key={currentStep}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: 'center' }}
              >
                {STEPS[currentStep].label}
              </motion.p>
            </AnimatePresence>
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
            if (!isMobile) return
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
              return
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
          {isMobile && (currentStep === 1 ? noticeText : altTypedText || altTypingDone) && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '10%', right: '10%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {renderNoticeContent()}
              </p>
            </div>
          )}

          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }} />

          {/* comic strip dialogue bubbles */}
          {currentStep === 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
              <div style={{ position: 'absolute', left: isMobile ? '3%' : '10%', top: isMobile ? '12%' : '15%', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: isMobile ? '160px' : '240px' }}>
                {[0, 2].map(i => visibleBubbles[i] && (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(false, bubbleColorHigh)}
                  >
                    {bubbleTexts[i]}
                    {bubbleTexts[i].length > 0 && bubbleTexts[i].length < DIALOGUE[i].text.length && (
                      <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
                    )}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorHigh}` }} />
                  </motion.div>
                ))}
              </div>
              <div style={{ position: 'absolute', right: isMobile ? '3%' : '10%', top: isMobile ? '12%' : '15%', maxWidth: isMobile ? '160px' : '240px' }}>
                {visibleBubbles[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(true, bubbleColorLow)}
                  >
                    {bubbleTexts[1]}
                    {bubbleTexts[1].length > 0 && bubbleTexts[1].length < DIALOGUE[1].text.length && (
                      <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
                    )}
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorLow}` }} />
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
              <NodeStats nodes={currentStep >= 2 ? altFullPopulationRef.current : activeNodesRef.current} mode={mode} visible={currentStep >= 1} mobile={true} />
              <div style={{ position: 'absolute', bottom: '0.8rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}