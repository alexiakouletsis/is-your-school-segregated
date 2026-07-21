import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import NodeStats from './NodeStats'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import { applyHoverHighlight, getTooltipHtml } from './graphUtils'

const FACE_SIZE = 25

const STEPS = [
  { label: 'All students in grade 9.' },
  { label: 'All students in grade 10.' },
  { label: 'All students in grade 11.' },
  { label: 'All students in grade 12.' },
]

// Only two of the four steps get a persistent explanatory sentence; the
// other two show just the graph + title. Typed once on arriving at a step
// that has one, cleared when moving to a step that doesn't — same
// mechanism as GraphSection68's step-1 "notice text", generalized to any
// step with a defined sentence instead of hardcoding step 1 specifically.
const STEP_NOTICES: Record<number, string> = {
  0: "This is what a high school with high levels of course tracking/segregation looks like.",
  2: "Notice how as students progress through their course pipelines, the graphs become increasingly spread apart.",
}
const getNoticeTarget = (step: number) => STEP_NOTICES[step] ?? ''

// Real per-grade course-sharing data at this school doesn't preserve a
// single student id across all four years the way the original K-8 dataset
// does — each grade's export re-indexes students 0..N-1 independently
// (checked: of the ids numerically common to all four files, only a small
// handful have matching ses+race in every grade — consistent with random
// coincidence, not real continuity). So, same as GraphSection68's
// comparison-school steps, these are representative composite
// protagonists: a real specific student picked PER GRADE (not the same
// physical person year to year), chosen so (a) their ses/race attributes
// genuinely match "high"/"low" in both mode dimensions simultaneously, and
// (b) they share zero classes with their counterpart that year — so the
// "two dots never share a class again" throughline from Section03Part2
// holds every year by construction, even though which real student sits in
// the "high"/"low" seat changes yearly.
const PROTAGONIST_IDS: Record<number, { high: number; low: number }> = {
  0: { high: 244, low: 16 },  // grade 9
  1: { high: 87, low: 224 },  // grade 10
  2: { high: 197, low: 227 }, // grade 11
  3: { high: 43, low: 25 },   // grade 12
}

const isProtagonist912 = (id: number, highId: number, lowId: number) =>
  id === highId || id === lowId

const getNodeColor912 = (d: Node, mode: Mode, highId: number, lowId: number): string => {
  if (d.id === highId) return mode === 'race' ? '#FF954D' : '#F17091'
  if (d.id === lowId) return mode === 'race' ? '#6897FF' : '#00B178'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return d.ses === 'higher' ? '#F17091' : '#00B178'
}

const getFaceSrc912 = (d: Node, mode: Mode, highId: number): string => {
  if (mode === 'race') {
    return d.id === highId ? '/assets/whiteasian-dot-912.svg' : '/assets/poc-dot-912.svg'
  }
  return d.id === highId ? '/assets/high-SES-dot-912.svg' : '/assets/low-SES-dot-912.svg'
}

// Same reasoning as GraphSection68's getAltEdgeColor: colors each edge by
// its source node's group so the pink/green (or orange/blue) boundary
// reads clearly, rather than a flat grey.
const getEdgeColor912 = (d: Edge, mode: Mode): string => {
  const src = d.source as unknown as Node
  if (mode === 'race') return src.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return src.ses === 'higher' ? '#F17091' : '#00B178'
}

// Node counts here (249-327 per grade) sit in the same range that made
// grade 6's comparison-school graph glitchy in GraphSection68 (343 nodes
// uncapped was the problem there). Grade 9 uses a >=2 weight threshold with
// a moderate cap; grades 10-12 use >=1 (see MIN_EDGE_WEIGHT below) to bring
// their density up toward grade 9's level, which needs smaller node caps to
// keep total edge count in the same safe ballpark (~2000-2500 edges) rather
// than ballooning from the lower threshold.
const NODE_SAMPLE_CAP: Record<number, number> = {
  0: 240, // grade 9
  1: 160, // grade 10
  2: 160, // grade 11
  3: 180, // grade 12
}

// Grade 9 keeps the >=2 threshold (already dense enough there); grades
// 10-12 naturally thin out with fewer students sharing 2+ classes as course
// pathways diverge further each year, so >=1 is used instead to keep visual
// density comparable across all four rather than tapering off.
const MIN_EDGE_WEIGHT: Record<number, number> = {
  0: 2,
  1: 1,
  2: 1,
  3: 1,
}

function sampleNodes(nodes: Node[], cap: number, highId: number, lowId: number): Node[] {
  if (nodes.length <= cap) return nodes
  const protagonists = nodes.filter(n => n.id === highId || n.id === lowId)
  const rest = nodes.filter(n => n.id !== highId && n.id !== lowId)
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

// Removes not just fully-isolated nodes but also single-edge "stray" nodes
// — a lone student whose only connection is one classmate reads as visual
// noise, not a real cluster. Iterative because dropping a stray node can
// knock its one neighbor down to degree 1 too, so this repeats until
// nothing left has degree < 2. Protagonists are always exempt.
function pruneLowDegree(
  nodes: Node[], edges: Edge[], highId: number, lowId: number, minDegree = 2
): { nodes: Node[]; edges: Edge[] } {
  let ids = new Set(nodes.map(n => n.id))
  let remaining = edges
  let changed = true
  while (changed) {
    changed = false
    const degree = new Map<number, number>()
    remaining.forEach(e => {
      const s = e.source as number, t = e.target as number
      degree.set(s, (degree.get(s) ?? 0) + 1)
      degree.set(t, (degree.get(t) ?? 0) + 1)
    })
    const toRemove = new Set<number>()
    ids.forEach(id => {
      if (id === highId || id === lowId) return
      if ((degree.get(id) ?? 0) < minDegree) toRemove.add(id)
    })
    if (toRemove.size > 0) {
      changed = true
      toRemove.forEach(id => ids.delete(id))
      remaining = remaining.filter(e => ids.has(e.source as number) && ids.has(e.target as number))
    }
  }
  return {
    nodes: nodes.filter(n => ids.has(n.id)),
    edges: remaining,
  }
}

export default function GraphSection912({ mode }: { mode: Mode }) {
  // [9th, 10th, 11th, 12th] — converted from the real GML course-sharing
  // data via scripts/convert_gml_to_json.py, dropped into public/data/graphs/
  // alongside the existing per-grade files.
  const [allGraphData, setAllGraphData] = useState<(GraphData | null)[]>([null, null, null, null])
  const [noticeText, setNoticeText] = useState('')
  const noticeTargetRef = useRef('')
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // The TRUE full-population node list per step (pre-sampling) — NodeStats
  // always reports real percentages regardless of how many nodes actually
  // got rendered/simulated.
  const fullPopulationRef = useRef<Node[]>([])

  // Guards against scrolling straight past a step before its render has
  // actually painted, same purpose as GraphSection68's altStepEnteredAtRef
  // — every step here is comparably heavy (real per-grade data), so the
  // buffer applies to all of them rather than just specific ones.
  const stepEnteredAtRef = useRef(0)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({
    steps: STEPS,
    blockScrollForward: () => Date.now() - stepEnteredAtRef.current < 900,
  })

  useEffect(() => { stepEnteredAtRef.current = Date.now() }, [currentStep])

  // load data
  useEffect(() => {
    Promise.all([
      fetch('/data/graphs/9.json').then(r => r.json()),
      fetch('/data/graphs/10.json').then(r => r.json()),
      fetch('/data/graphs/11.json').then(r => r.json()),
      fetch('/data/graphs/12.json').then(r => r.json()),
    ]).then(setAllGraphData)
      .catch(err => console.error('data load error:', err))
  }, [])

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current)
  }, [hoveredNode])

  // notice text
  useEffect(() => {
    const target = getNoticeTarget(currentStep)
    if (target === '') {
      // No sentence defined for this step — leave whatever's currently
      // displayed alone (per feedback, the previous step's sentence should
      // persist through steps that don't have their own) instead of
      // clearing it.
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

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (!allGraphData[currentStep]) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const { high: highId, low: lowId } = PROTAGONIST_IDS[currentStep]

    const data = allGraphData[currentStep]!
    const filteredFullNodes = data.nodes
      .filter(n => n.courses && !n.courses.toLowerCase().includes('non-reporting'))
      // Students with only a single listed course (e.g. just "Seminar" —
      // common among some grade 12 students on reduced schedules) only
      // ever tie to others through that one class, which is exactly the
      // kind of thin, single-course connection that reads as noise rather
      // than a real course-pathway relationship.
      .filter(n => n.courses.split(',').map(c => c.trim()).filter(Boolean).length > 1)

    // Sample down for the simulation/render, but keep the FULL filtered
    // list around for NodeStats — the % breakdown should reflect the true
    // population, not just whichever subset got rendered.
    const nodesToUse = sampleNodes(filteredFullNodes, NODE_SAMPLE_CAP[currentStep] ?? 300, highId, lowId)
    fullPopulationRef.current = filteredFullNodes.map(n => ({ ...n }))

    let newNodes: Node[] = nodesToUse.map(n => {
      const existing = existingById.get(n.id)
      return existing
        ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
        : { ...n, x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80 }
    })
    const filteredNodeIds = new Set(newNodes.map(n => n.id))
    const minWeight = MIN_EDGE_WEIGHT[currentStep] ?? 2
    const rawEdges: Edge[] = data.edges
      .filter(e => e.weight >= minWeight)
      .filter(e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number))
      .map(e => ({ ...e }))

    // Prune stray low-degree nodes (isolated or single-edge) — common for
    // students whose only shared classes are a single large elective
    // (JROTC, PE, etc.), leaving them floating with barely any real
    // connections. Protagonists are always kept regardless of their own
    // degree.
    const pruned = pruneLowDegree(newNodes, rawEdges, highId, lowId, 3)
    newNodes = pruned.nodes
    let newEdges: Edge[] = pruned.edges

    activeNodesRef.current = newNodes
    activeEdgesRef.current = newEdges

    const nodeById = new Map(newNodes.map(n => [n.id, n]))
    newEdges = newEdges.map(e => ({
      ...e,
      source: nodeById.get(typeof e.source === 'number' ? e.source : (e.source as Node).id) ?? e.source,
      target: nodeById.get(typeof e.target === 'number' ? e.target : (e.target as Node).id) ?? e.target,
    }))

    if (simulationRef.current) simulationRef.current.stop()

    // Same physics as GraphSection68's real-network (alt-school) steps —
    // softened charge with a distanceMax cap so segregated clusters don't
    // fly apart further than comfortable to view together.
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
    const zoomTimer = autoZoom(g, width, height, padding, 800)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - FACE_SIZE / 2).attr('y', d => (d.y ?? 0) - FACE_SIZE / 2)
    })

    linkG.selectAll<SVGLineElement, Edge>('line').data(newEdges)
      .join(
        enter => enter.append('line')
          .attr('stroke', d => getEdgeColor912(d, mode))
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0)
          .transition().duration(600).attr('stroke-opacity', 0.2),
        update => update
          .transition().duration(300).attr('stroke', d => getEdgeColor912(d, mode)),
        exit => exit.transition().duration(300).attr('stroke-opacity', 0).remove()
      )

    const nonProtags = newNodes.filter(n => !isProtagonist912(n.id, highId, lowId))
    const protags = newNodes.filter(n => isProtagonist912(n.id, highId, lowId))

    nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
      .join(
        enter => enter.append('circle')
          .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
          .attr('fill', d => getNodeColor912(d, mode, highId, lowId))
          .attr('stroke', 'white').attr('stroke-width', 0.8)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('fill', d => getNodeColor912(d, mode, highId, lowId)),
        exit => exit.transition().duration(300).attr('opacity', 0).remove()
      )

    nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
      .join(
        enter => enter.append('image')
          .attr('href', d => getFaceSrc912(d, mode, highId))
          .attr('width', FACE_SIZE).attr('height', FACE_SIZE)
          .attr('x', d => (d.x ?? cx) - FACE_SIZE / 2)
          .attr('y', d => (d.y ?? cy) - FACE_SIZE / 2)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('href', d => getFaceSrc912(d, mode, highId)),
        exit => exit.remove()
      )

    setupNodeInteractions(nodeG, simulation, mode)
    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, allGraphData, graphSize, mode, isMobile])

  const renderNoticeContent = () => {
    const target = getNoticeTarget(currentStep)
    if (!noticeText) return null
    return (
      <>
        {noticeText}
        {noticeText.length < target.length && (
          <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
        )}
      </>
    )
  }

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
          ...(isMobile ? { overflowAnchor: 'none' as const } : {}),
        }}
      >

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: isMobile ? '2.75rem 1.5rem 0.5rem 1.5rem' : '7.5rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem', position: 'relative' }}>
          {!isMobile && (
            <div style={{ height: '9rem', display: 'flex', alignItems: 'flex-start', position: 'absolute', top: '7.5rem', left: '3rem', right: '2rem', overflow: 'visible' }}>
              {noticeText && (
                <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 1.8vw, 1.4rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                  {renderNoticeContent()}
                </p>
              )}
            </div>
          )}
          {/* Label + dots + NodeStats: bottom-anchored as their own group,
              fully decoupled from the notice text above. */}
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
              <NodeStats nodes={fullPopulationRef.current} mode={mode} visible={true} mobile={false} />
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
            if (!isMobile) return
            const target = e.target as Element
            if (target.tagName === 'circle' || target.tagName === 'image') {
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
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: isMobile ? 'pointer' : 'default' }}
        >
          {isMobile && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '10%', right: '10%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {renderNoticeContent()}
              </p>
            </div>
          )}

          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }} />

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
              {currentStep < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  Tap to go forward →
                </div>
              )}
              <NodeStats nodes={fullPopulationRef.current} mode={mode} visible={true} mobile={true} />
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